// Papillon - GPS. Pick a place on the map and a route along the roads is drawn on the big map and the small map.
import { G, STRIPS } from './world.js';

let graph = null;
function build() {
  // every road strip is a straight line; cut it wherever another strip crosses it and join the pieces
  const nodes = [], key = new Map(), adj = [];
  const node = (x, z) => { const k = Math.round(x) + ',' + Math.round(z); let i = key.get(k); if (i === undefined) { i = nodes.length; nodes.push({ x, z }); key.set(k, i); adj.push([]); } return i; };
  const link = (a, b) => { if (a === b) return; const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z); adj[a].push([b, d]); adj[b].push([a, d]); };
  for (const q of STRIPS) {
    const pts = [[q.x0, q.z0], [q.x1, q.z1]], horiz = q.z0 === q.z1;
    for (const r of STRIPS) {
      if (r === q) continue; const rh = r.z0 === r.z1; if (rh === horiz) continue;
      if (horiz) { if (r.x0 >= q.x0 && r.x0 <= q.x1 && q.z0 >= r.z0 && q.z0 <= r.z1) pts.push([r.x0, q.z0]); }
      else if (r.z0 >= q.z0 && r.z0 <= q.z1 && q.x0 >= r.x0 && q.x0 <= r.x1) pts.push([q.x0, r.z0]);
    }
    pts.sort((a, b) => horiz ? a[0] - b[0] : a[1] - b[1]);
    let prev = -1; for (const p of pts) { const i = node(p[0], p[1]); if (prev >= 0) link(prev, i); prev = i; }
  }
  graph = { nodes, adj };
}
// the nearest point on any road to (x, z), as [px, pz]
function snap(x, z) {
  let best = null, bd = 1e12;
  for (const q of STRIPS) { const px = Math.min(Math.max(x, q.x0), q.x1), pz = Math.min(Math.max(z, q.z0), q.z1), d = (px - x) ** 2 + (pz - z) ** 2; if (d < bd) { bd = d; best = [px, pz, q]; } }
  return best;
}
// a list of [x, z] points from (sx, sz) to (tx, tz) that follows the roads, or null if there is no road
export function route(sx, sz, tx, tz) {
  if (!graph) build(); const { nodes, adj } = graph;
  const a = snap(sx, sz), b = snap(tx, tz); if (!a || !b) return null;
  // add the two snapped points to the graph for this search only: they sit on a strip, so they join that strip's neighbours
  const extra = [], eadj = new Map();
  const attach = (p, tag) => {
    const q = p[2], horiz = q.z0 === q.z1, on = []; for (let i = 0; i < nodes.length; i++) { const n = nodes[i]; if (horiz ? (n.z === q.z0 && n.x >= q.x0 && n.x <= q.x1) : (n.x === q.x0 && n.z >= q.z0 && n.z <= q.z1)) on.push(i); }
    on.sort((i, j) => horiz ? nodes[i].x - nodes[j].x : nodes[i].z - nodes[j].z);
    const v = horiz ? p[0] : p[1], lo = on.filter(i => (horiz ? nodes[i].x : nodes[i].z) <= v).pop(), hi = on.find(i => (horiz ? nodes[i].x : nodes[i].z) >= v);
    const out = []; for (const i of [lo, hi]) if (i !== undefined) out.push([i, Math.hypot(nodes[i].x - p[0], nodes[i].z - p[1])]);
    eadj.set(tag, out); extra.push({ x: p[0], z: p[1], tag }); return out;
  };
  const ea = attach(a, 'S'), eb = attach(b, 'T');
  const N = nodes.length, dist = new Float64Array(N + 2).fill(1e12), prev = new Int32Array(N + 2).fill(-1), done = new Uint8Array(N + 2), S = N, T = N + 1;
  const nbr = i => i === S ? ea : i === T ? eb.map(e => e) : adj[i].concat(((i2) => { const r = []; for (const [n, d] of ea) if (n === i2) r.push([S, d]); for (const [n, d] of eb) if (n === i2) r.push([T, d]); return r; })(i));
  if (a[2] === b[2]) { /* same strip: just the direct stretch */ }
  dist[S] = 0;
  for (;;) { let u = -1, m = 1e12; for (let i = 0; i < N + 2; i++) if (!done[i] && dist[i] < m) { m = dist[i]; u = i; } if (u < 0 || u === T) break; done[u] = 1; for (const [v, d] of nbr(u)) if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; } }
  if (a[2] === b[2]) { const direct = Math.hypot(a[0] - b[0], a[1] - b[1]); if (direct < dist[T]) { return [[sx, sz], [a[0], a[1]], [b[0], b[1]], [tx, tz]]; } }
  if (prev[T] < 0) return null;
  const path = []; for (let i = T; i >= 0; i = prev[i]) path.push(i === S ? [a[0], a[1]] : i === T ? [b[0], b[1]] : [nodes[i].x, nodes[i].z]);
  path.reverse(); return [[sx, sz], ...path, [tx, tz]];
}
export function routeLength(r) { let L = 0; for (let i = 1; i < r.length; i++) L += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]); return L; }

// G.gps = { x, z, name, route, len, ox, oz, t }: the chosen destination; setGps(null) clears it
export function setGps(x, z, name) { if (x === null) { G.gps = null; return; } G.gps = { x, z, name: name || 'Pin', route: null, len: 0, ox: 1e9, oz: 1e9, t: 0 }; }
// call every frame: re-plans now and then while you drive, and clears the pin when you arrive
export function updateGps(dt) {
  const g = G.gps; if (!g) return; const p = G.player, hx = p.car ? p.car.x : p.ride ? p.ride.x : p.x, hz = p.car ? p.car.z : p.ride ? p.ride.z : p.z;
  if (G.inside) return;
  if (Math.hypot(hx - g.x, hz - g.z) < 14) { if (G.say) G.say('You have arrived: ' + g.name, 3); G.gps = null; return; }
  g.t -= dt; if (g.t > 0 && Math.hypot(hx - g.ox, hz - g.oz) < 25) return;
  g.t = 1.5; g.ox = hx; g.oz = hz; g.route = route(hx, hz, g.x, g.z); g.len = g.route ? routeLength(g.route) : Math.hypot(hx - g.x, hz - g.z);
}
