// Papillon - world: layout, city generation, sea, sky, day and night
import * as T from 'three';
import { natAdd, scatter, buildNature, setDensity } from './nature.js';

export const MOBILE = matchMedia('(pointer:coarse)').matches;
export const G = {}; G.cells = []; G.targets = [];   // targets: other things that can be shot, punched or run into (prison guards, police boats): { x, z, y, top, r, car, alive(), hit(dmg, dx, dz) }                       // shared game state

/* ---------- random ---------- */
let seed = 7131977;
export function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
export const rr = (a, b) => a + rnd() * (b - a);
export const pick = a => a[Math.floor(rnd() * a.length)];
export const col = h => { const c = new T.Color(h); return [c.r, c.g, c.b]; };
const mul = (c, f) => [Math.min(1, c[0] * f), Math.min(1, c[1] * f), Math.min(1, c[2] * f)];

/* ---------- layout ---------- */
export const RH = 6, PV = 4, INSET = RH + PV, NODE_R = 10, LANE = 2.1, PARK_LAT = 4.9;
// The street grid. The first six columns and the middle thirteen rows are the old city; the rest is the big city around it.
export const XS = [-180, -100, -20, 80, 150, 220, 310, 400, 480, 570, 650, 740, 830, 910, 1000, 1090, 1170, 1260, 1350, 1430, 1520];
export const ZS = [-980, -890, -810, -720, -640, -550, -470, -390, -325, -260, -195, -130, -65, 0, 65, 130, 195, 260, 325, 390, 470, 550, 640, 720, 810, 890, 980];
export const ZMIN = -390, ZMAX = 390, XOLD = 220;   // the edges of the old city
export const TOWNS = [{ x: 1430, z: -890, name: 'Les Pins' }, { x: 1430, z: 640, name: 'Vallon' }, { x: 650, z: 890, name: 'Port Sud' }, { x: 1430, z: -130, name: 'La Roche' }];
// what kind of place a spot is: old city, big city, one of the small towns, or the countryside between them
export function zoneAt(x, z) {
  if (x <= XOLD && z >= ZMIN && z <= ZMAX) return 'old';
  for (const t of TOWNS) if (Math.abs(x - t.x) < 135 && Math.abs(z - t.z) < 135) return 'town';
  return x > 1220 || Math.abs(z) > 770 ? 'country' : 'city';
}
export const hulls = [];                    // big ships in the sea: boats and swimmers go around them
export const HARB = { x0: -189.5, x1: 60, z0: -45, z1: 45 };
export const COAST = -189.5;
export const hash2 = (a, b) => { let h = Math.imul(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663), 0x9E3779B1); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
// no streets here: the airport, the sea, and the two hills that stand inside the city
const inHole = (x, z) => (x < 300 && z < -400) || x < -185 || Math.hypot(x - 372, z) < 150 || Math.hypot(x - 470, z + 270) < 172;
const oldEW = (z, a, b) => { const r = z === 0 ? [80, 220] : z < -195 ? [-100, 220] : [-180, 220]; return a >= r[0] && b <= r[1]; };
const oldNS = (x, a, b) => (x === -180 ? [[-195, -65], [65, ZMAX]] : x < 80 ? [[ZMIN, -65], [65, ZMAX]] : [[ZMIN, ZMAX]]).some(p => a >= p[0] && b <= p[1]);
// is there a street between two neighbouring crossings? The old city keeps its layout. Outside it most streets exist, a few
// are left out so the grid is not regular, and in the countryside only the main roads and the streets of the towns remain.
// The ring road: a fast road round the outside of the city, from the north (by the airport) down the east side and back along the south.
export const RING = { zn: -980, zs: 980, xe: 1520, xn: 310, xs: 150 };
export const onRing = (x, z, tol = 1) => (Math.abs(z - RING.zn) < tol && x > RING.xn - tol && x < RING.xe + tol) || (Math.abs(x - RING.xe) < tol && Math.abs(z) < 980 + tol) || (Math.abs(z - RING.zs) < tol && x > RING.xs - tol && x < RING.xe + tol);
const ringSeg = (ax, az, bx, bz) => (onRing(ax, az) && onRing(bx, bz)) || (ax === RING.xn && bx === RING.xn && az >= -980 && bz <= -890) || (ax === RING.xs && bx === RING.xs && az >= 810 && bz <= 980);
function streetWanted(ax, az, bx, bz) {
  const old = (x, z) => x <= XOLD && z >= ZMIN && z <= ZMAX, ew = az === bz;
  if (ringSeg(ax, az, bx, bz)) return true;
  if (old(ax, az) && old(bx, bz)) return ew ? oldEW(az, ax, bx) : oldNS(ax, az, bz);
  const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (inHole(ax, az) || inHole(bx, bz) || inHole(mx, mz)) return false;
  if (az === -195 && bz === -195 && ax === XOLD) return false;   // the dirt road to the army base starts here instead
  const zn = zoneAt(mx, mz);
  if (zn === 'town') return true;
  if (zn === 'country') return ew ? [-890, -130, 640, 890].includes(az) : [650, 1000, 1430].includes(ax);
  return (ew ? [-640, 0, 390, 640].includes(az) : [310, 650, 1000].includes(ax)) || hash2(mx, mz) > .12;
}
const segKey = (ax, az, bx, bz) => ax + ',' + az + '>' + bx + ',' + bz;
const SEGS = new Set();
for (let i = 0; i < XS.length; i++) for (let j = 0; j < ZS.length; j++) {
  if (i + 1 < XS.length && streetWanted(XS[i], ZS[j], XS[i + 1], ZS[j])) SEGS.add(segKey(XS[i], ZS[j], XS[i + 1], ZS[j]));
  if (j + 1 < ZS.length && streetWanted(XS[i], ZS[j], XS[i], ZS[j + 1])) SEGS.add(segKey(XS[i], ZS[j], XS[i], ZS[j + 1]));
}
export const hasEW = (i, j) => i >= 0 && i + 1 < XS.length && j >= 0 && j < ZS.length && SEGS.has(segKey(XS[i], ZS[j], XS[i + 1], ZS[j]));   // street from column i to i+1 along row j
export const hasNS = (i, j) => j >= 0 && j + 1 < ZS.length && i >= 0 && i < XS.length && SEGS.has(segKey(XS[i], ZS[j], XS[i], ZS[j + 1]));   // street from row j to j+1 along column i
{ // drop every street that cannot be reached from the old harbour crossing
  const at = (i, j) => i + j * 100, seen = new Set(), q = [at(XS.indexOf(80), ZS.indexOf(0))]; seen.add(q[0]);
  while (q.length) { const c = q.pop(), i = c % 100, j = (c - i) / 100; for (const [ok, ni, nj] of [[hasEW(i, j), i + 1, j], [hasEW(i - 1, j), i - 1, j], [hasNS(i, j), i, j + 1], [hasNS(i, j - 1), i, j - 1]]) if (ok && !seen.has(at(ni, nj))) { seen.add(at(ni, nj)); q.push(at(ni, nj)); } }
  for (let i = 0; i < XS.length; i++) for (let j = 0; j < ZS.length; j++) if (!seen.has(at(i, j))) { SEGS.delete(segKey(XS[i], ZS[j], XS[i + 1], ZS[j])); SEGS.delete(segKey(XS[i], ZS[j], XS[i], ZS[j + 1])); if (i > 0) SEGS.delete(segKey(XS[i - 1], ZS[j], XS[i], ZS[j])); if (j > 0) SEGS.delete(segKey(XS[i], ZS[j - 1], XS[i], ZS[j])); }
}
// every straight run of street as one strip: {x0,z0,x1,z1}
export const STRIPS = [];
for (let j = 0; j < ZS.length; j++) { let a = -1; for (let i = 0; i <= XS.length; i++) { if (hasEW(i, j)) { if (a < 0) a = i; } else if (a >= 0) { STRIPS.push({ x0: XS[a], z0: ZS[j], x1: XS[i], z1: ZS[j] }); a = -1; } } }
for (let i = 0; i < XS.length; i++) { let a = -1; for (let j = 0; j <= ZS.length; j++) { if (hasNS(i, j)) { if (a < 0) a = j; } else if (a >= 0) { STRIPS.push({ x0: XS[i], z0: ZS[a], x1: XS[i], z1: ZS[j] }); a = -1; } } }
export function onRoad(x, z) {
  for (const s of STRIPS) if (x > s.x0 - RH && x < s.x1 + RH && z > s.z0 - RH && z < s.z1 + RH) return true;
  return false;
}

/* ---------- road graph ---------- */
export const nodes = [];
{
  const id = {};
  for (let i = 0; i < XS.length; i++) for (let j = 0; j < ZS.length; j++) if (hasEW(i, j) || hasEW(i - 1, j) || hasNS(i, j) || hasNS(i, j - 1)) { id[i + ',' + j] = nodes.length; nodes.push({ x: XS[i], z: ZS[j], nb: [], busy: null }); }
  for (let i = 0; i < XS.length; i++) for (let j = 0; j < ZS.length; j++) {
    const a = id[i + ',' + j]; if (a === undefined) continue;
    if (hasEW(i, j)) { const b = id[(i + 1) + ',' + j]; nodes[a].nb.push(b); nodes[b].nb.push(a); }
    if (hasNS(i, j)) { const b = id[i + ',' + (j + 1)]; nodes[a].nb.push(b); nodes[b].nb.push(a); }
  }
}
export function nearestNode(x, z) { let best = 0, bd = 1e9; nodes.forEach((n, i) => { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } }); return best; }

/* ---------- colliders ---------- */
const CG = 24, grid = new Map(), big = [];
export const COLS = [], BIGS = big;   // every collider in one list, for the physics engine
const gk = (ix, iz) => (ix + 512) * 2048 + (iz + 512);
function gridAdd(it, x0, z0, x1, z1) {
  for (let ix = Math.floor(x0 / CG); ix <= Math.floor(x1 / CG); ix++) for (let iz = Math.floor(z0 / CG); iz <= Math.floor(z1 / CG); iz++) {
    const k = gk(ix, iz); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(it);
  }
}
export function addBox(x0, z0, x1, z1, h) { const it = { b: 1, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h: h || 14 }; gridAdd(it, it.x0, it.z0, it.x1, it.z1); COLS.push(it); return it; }
// height of the building standing at a point (0 when there is none) - used by things that fly
export function solidHeight(x, z) {
  const a = grid.get(gk(Math.floor(x / CG), Math.floor(z / CG))); let h = 0;
  if (a) for (const it of a) if (it.b && !it.off && x > it.x0 && x < it.x1 && z > it.z0 && z < it.z1 && it.h > h) h = it.h;
  return h;
}
// the building (a big solid box, not a fence or a post) that stands at a point, or null: what a tank shell can bring down
export function buildingAt(x, z) {
  const a = grid.get(gk(Math.floor(x / CG), Math.floor(z / CG))); let best = null;
  if (a) for (const it of a) if (it.b && !it.off && !it.keep && x > it.x0 && x < it.x1 && z > it.z0 && z < it.z1 && it.h >= 3.4 && (it.x1 - it.x0) >= 4 && (it.z1 - it.z0) >= 4 && (!best || it.h > best.h)) best = it;
  return best;
}
export function addBig(x0, z0, x1, z1) { big.push({ b: 1, x0, z0, x1, z1 }); }
export function addCircle(x, z, r) { const it = { b: 0, x, z, r }; gridAdd(it, x - r, z - r, x + r, z + r); COLS.push(it); return it; }
function pushOut(p, r, it, out) {
  if (it.off) return;
  const was = out.hit || out.nx !== 0 || out.nz !== 0, wx = p.x, wz = p.z;
  pushOut2(p, r, it, out); if (it.prop && (p.x !== wx || p.z !== wz)) out.prop = it.prop;
}
function pushOut2(p, r, it, out) {
  if (it.b) {
    const cx = Math.max(it.x0, Math.min(p.x, it.x1)), cz = Math.max(it.z0, Math.min(p.z, it.z1));
    let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; out.nx += dx / d; out.nz += dz / d; }
    else {
      const l = p.x - it.x0, rr2 = it.x1 - p.x, t = p.z - it.z0, b = it.z1 - p.z, m = Math.min(l, rr2, t, b);
      if (m === l) { p.x = it.x0 - r; out.nx -= 1; } else if (m === rr2) { p.x = it.x1 + r; out.nx += 1; } else if (m === t) { p.z = it.z0 - r; out.nz -= 1; } else { p.z = it.z1 + r; out.nz += 1; }
    }
    out.hit = true;
  } else {
    const dx = p.x - it.x, dz = p.z - it.z, d2 = dx * dx + dz * dz, R = r + it.r;
    if (d2 >= R * R || d2 < 1e-8) return;
    const d = Math.sqrt(d2), k = (R - d) / d; p.x += dx * k; p.z += dz * k; out.nx += dx / d; out.nz += dz / d; out.hit = true;
  }
}
const cres = { hit: false, nx: 0, nz: 0, prop: null };
// push the circle (p.x,p.z,r) out of everything solid; returns {hit,nx,nz}
export function collide(p, r) {
  cres.hit = false; cres.nx = 0; cres.nz = 0; cres.prop = null;
  for (const it of big) { if (it.sea && landHeight(p.x, p.z) > .3) continue; pushOut(p, r, it, cres); }   // islands stand in the sea: no wall there
  const ix0 = Math.floor((p.x - r) / CG), ix1 = Math.floor((p.x + r) / CG), iz0 = Math.floor((p.z - r) / CG), iz1 = Math.floor((p.z + r) / CG);
  for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) { const a = grid.get(gk(ix, iz)); if (a) for (const it of a) pushOut(p, r, it, cres); }
  if (cres.hit) { const l = Math.hypot(cres.nx, cres.nz) || 1; cres.nx /= l; cres.nz /= l; }
  return cres;
}
// the same, but the sea and the harbour basin do not count: for bullets and rockets, which fly over water and across the islands
export function wallAt(x, z) {
  for (const it of big) if (!it.sea && x > it.x0 && x < it.x1 && z > it.z0 && z < it.z1) return true;
  const a = grid.get(gk(Math.floor(x / CG), Math.floor(z / CG)));
  if (a) for (const it of a) if (it.b && !it.off && x > it.x0 && x < it.x1 && z > it.z0 && z < it.z1) return true;
  return false;
}
export function solidAt(x, z) {
  for (const it of big) if (x > it.x0 && x < it.x1 && z > it.z0 && z < it.z1) return true;
  const a = grid.get(gk(Math.floor(x / CG), Math.floor(z / CG)));
  if (a) for (const it of a) if (it.b && !it.off && x > it.x0 && x < it.x1 && z > it.z0 && z < it.z1) return true;
  return false;
}

/* ---------- traffic lights ---------- */
// Every light in the city runs on one clock: east-west traffic goes, everything stops for a moment, north-south traffic goes.
const TLC = 20, TLG = 7, TLA = 1.5;   // one round, the green part, the amber part
const tlPhase = ew => { const t = (G.time + (ew ? 0 : TLC / 2)) % TLC; return t < TLG ? 2 : t < TLG + TLA ? 1 : 0; };   // 2 green, 1 amber, 0 red
export const lightGreen = ew => tlPhase(ew) === 2;
const TLM = { ewR: new T.MeshBasicMaterial({ color: 0x400808 }), ewG: new T.MeshBasicMaterial({ color: 0x083a14 }), nsR: new T.MeshBasicMaterial({ color: 0x400808 }), nsG: new T.MeshBasicMaterial({ color: 0x083a14 }), ewA: new T.MeshBasicMaterial({ color: 0x3a2a06 }), nsA: new T.MeshBasicMaterial({ color: 0x3a2a06 }) };
let tlState = -1;
export function updateLights() {
  const ew = tlPhase(true), ns = tlPhase(false), st = ew + ns * 3; if (st === tlState) return; tlState = st;
  TLM.ewG.color.setHex(ew === 2 ? 0x35ff6a : 0x083a14); TLM.ewA.color.setHex(ew === 1 ? 0xffb81f : 0x3a2a06); TLM.ewR.color.setHex(ew === 0 ? 0xff3024 : 0x400808);
  TLM.nsG.color.setHex(ns === 2 ? 0x35ff6a : 0x083a14); TLM.nsA.color.setHex(ns === 1 ? 0xffb81f : 0x3a2a06); TLM.nsR.color.setHex(ns === 0 ? 0xff3024 : 0x400808);
}
function trafficLights() {
  const POLE = col(0x2b2e33), BLK = col(0x15161a), WHT = col(0xffffff);
  nodes.forEach(A => {
    if (A.nb.length < 3 || onRing(A.x, A.z) || zoneAt(A.x, A.z) === 'country') return; A.tl = true;
    for (const bi of A.nb) {   // one light for each street coming in, on the right-hand kerb at the stop line, facing the cars that arrive
      const Bn = nodes[bi], len = Math.hypot(A.x - Bn.x, A.z - Bn.z), dx = (A.x - Bn.x) / len, dz = (A.z - Bn.z) / len, rx = -dz, rz = dx, ew = Math.abs(dx) > .5;
      const x = A.x - dx * (NODE_R - .6) + rx * (RH + .55), z = A.z - dz * (NODE_R - .6) + rz * (RH + .55);
      prop('sign', x, z, 3, [[x, z, .14]], () => { PB.setT(x, 0, z, 0);
        PB.box(POLE, .12, 3.5, .12, 0, 1.75, 0); PB.box(BLK, .34, .95, .34, 0, 3.75, 0);
        PB.box(WHT, .2, .2, .2, -dx * .13, 4.03, -dz * .13, ew ? TLM.ewR : TLM.nsR); PB.box(WHT, .2, .2, .2, -dx * .13, 3.75, -dz * .13, ew ? TLM.ewA : TLM.nsA); PB.box(WHT, .2, .2, .2, -dx * .13, 3.47, -dz * .13, ew ? TLM.ewG : TLM.nsG); });
    }
  });
}

/* ---------- things that break ---------- */
// Street furniture a car can knock down. Each one remembers which part of the drawn city is its own, so that part can be wiped
// when it breaks, and its collider is switched off. The flying bits and the fallen pole are drawn by fx.js.
export function removeProp(pr) {
  if (pr.gone) return false; pr.gone = true; for (const it of pr.its) it.off = true;
  for (const q of pr.ranges) if (q.b.attr) { q.b.attr.array.fill(0, q.s, q.e); q.b.attr.needsUpdate = true; }
  return true;
}
// breakable things within r of a point (for explosions)
export function propsNear(x, z, r) {
  const out = []; for (let ix = Math.floor((x - r) / CG); ix <= Math.floor((x + r) / CG); ix++) for (let iz = Math.floor((z - r) / CG); iz <= Math.floor((z + r) / CG); iz++) { const a = grid.get(gk(ix, iz)); if (a) for (const it of a) if (it.prop && !it.prop.gone && !out.includes(it.prop) && Math.hypot(it.prop.x - x, it.prop.z - z) < r) out.push(it.prop); }
  return out;
}
// build one: kind, where, how hard a hit it takes (m/s), its collider circles [[x, z, r], ...], and a function that draws it into PB
function prop(kind, x, z, need, circles, draw, extra) {
  PB.begin(); draw(); const pr = Object.assign({ kind, x, z, need, ranges: PB.end(), its: circles.map(c => addCircle(c[0], c[1], c[2])), gone: false }, extra || {});
  for (const it of pr.its) it.prop = pr; return pr;
}

/* ---------- materials ---------- */
export const MAT = {
  matte: new T.MeshStandardMaterial({ vertexColors: true, roughness: .9 }),
  glass: new T.MeshStandardMaterial({ vertexColors: true, roughness: .15, metalness: .3 }),
  lit: new T.MeshStandardMaterial({ vertexColors: true, roughness: .4, emissive: 0xffc777, emissiveIntensity: 0 }),
  mark: new T.MeshStandardMaterial({ vertexColors: true, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  bulb: new T.MeshStandardMaterial({ vertexColors: true, roughness: .5, emissive: 0xffd28a, emissiveIntensity: 0 }),
  gold: new T.MeshStandardMaterial({ vertexColors: true, roughness: .35, metalness: .2, emissive: 0xc08a20, emissiveIntensity: .1 }),
  glow: new T.MeshBasicMaterial({ color: 0xffc070, vertexColors: true, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  rock: new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
  water: new T.MeshStandardMaterial({ color: 0x2f8fb0, roughness: .3, metalness: .05, flatShading: true }),
  leaf: new T.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true })
};

/* ---------- surface detail ---------- */
// The city is built from plain coloured boxes. This adds texture to every surface without changing how it is built:
// the shader looks at where a point is in the world and which way the surface faces, and lays grain, stains, paving joints,
// asphalt speckle and a darker band at the foot of walls over the plain colour.
function detailTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N), d = im.data;
  let seed = 1234567; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const grid = (n) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = rnd(); return g; };
  const sample = (g, n, u, v) => { const fx = u * n, fy = v * n, x0 = Math.floor(fx) % n, y0 = Math.floor(fy) % n, x1 = (x0 + 1) % n, y1 = (y0 + 1) % n, tx = fx - Math.floor(fx), ty = fy - Math.floor(fy), sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (g[x0 + y0 * n] * (1 - sx) + g[x1 + y0 * n] * sx) * (1 - sy) + (g[x0 + y1 * n] * (1 - sx) + g[x1 + y1 * n] * sx) * sy; };
  const g1 = grid(8), g2 = grid(16), g3 = grid(32), g4 = grid(64), g5 = grid(128);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const u = i / N, v = j / N, k = (i + j * N) * 4;
    const big = sample(g1, 8, u, v) * .5 + sample(g2, 16, u, v) * .3 + sample(g3, 32, u, v) * .2, fine = sample(g4, 64, u, v) * .45 + sample(g5, 128, u, v) * .35 + rnd() * .2;
    d[k] = big * 255; d[k + 1] = fine * 255; d[k + 2] = rnd() < .012 ? 255 : rnd() < .04 ? 40 : 128; d[k + 3] = 255; }   // red: broad stains, green: fine grain, blue: speckle (light and dark flecks)
  x.putImageData(im, 0, 0); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; return t;
}
let DETAIL = null;
// The old-town houses are copies of a few models, and their walls looked flat and all the same. This gives each wall some life:
// every house a slightly different tone, weathering in broad soft patches, dirt creeping up from the pavement, rain streaks from the top, and a fine grain close up.
function kitDetail(mat) {
  if (typeof document === 'undefined') return; if (!DETAIL) DETAIL = detailTexture();
  mat.onBeforeCompile = sh => {
    sh.uniforms.uDetail = { value: DETAIL };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <fog_vertex>', `#include <fog_vertex>
      #ifdef USE_INSTANCING
        vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform sampler2D uDetail;').replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 wn = abs(normalize(cross(dFdx(vWP), dFdy(vWP)))); float wall = 1. - step(.7, wn.y);
        vec2 uvW = mix(vec2(vWP.z, vWP.y), vec2(vWP.x, vWP.y), step(wn.x, wn.z));
        vec2 cell = floor(vWP.xz / 9.); float tone = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);          // one tone for each house-sized patch of town
        vec3 big = texture2D(uDetail, uvW * .035 + cell * .37).rgb, mid = texture2D(uDetail, uvW * .16).rgb, fine = texture2D(uDetail, uvW * .9).rgb;
        float dist = length(vWP - cameraPosition), nearK = 1. - smoothstep(25., 80., dist);
        float k = 1.; k *= mix(.9, 1.08, tone); k *= mix(.86, 1.1, big.r);                                                  // tone and broad weathering
        k *= 1. - wall * smoothstep(1.6, 0., vWP.y) * (.16 + .2 * mid.g);                                                   // dirt at the foot of the wall
        float streak = texture2D(uDetail, vec2(uvW.x * .7, uvW.y * .05)).b; k *= 1. - wall * smoothstep(.55, .9, streak) * .13;   // streaks running down
        k *= 1. + (fine.r - .5) * .16 * nearK;                                                                             // grain, close up
        diffuseColor.rgb *= k; diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.04, 1., .93), (tone - .5) * .5 + .25 * big.g); }`);
  };
  mat.customProgramCacheKey = () => 'kit-detail';
}
function addDetail(mat, rock) {
  if (typeof document === 'undefined') return; if (!DETAIL) DETAIL = detailTexture();
  mat.onBeforeCompile = sh => {
    sh.uniforms.uDetail = { value: DETAIL }; sh.uniforms.uWet = WETU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <fog_vertex>', '#include <fog_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform sampler2D uDetail; uniform float uWet;').replace('#include <color_fragment>', `#include <color_fragment>
      float wetShine = 0.;
      { vec3 wn = abs(normalize(cross(dFdx(vWP), dFdy(vWP)))); float up = step(.7, wn.y);
        vec2 uvG = vWP.xz, uvW = mix(vec2(vWP.z, vWP.y), vec2(vWP.x, vWP.y), step(wn.x, wn.z)), uv = mix(uvW, uvG, up);
        float lum = dot(diffuseColor.rgb, vec3(.3, .59, .11)), dist = length(vWP - cameraPosition), nearK = 1. - smoothstep(30., 90., dist);
        vec3 t1 = texture2D(uDetail, uv * .045).rgb, t2 = texture2D(uDetail, uv * .37).rgb, t3 = texture2D(uDetail, uv * 1.9).rgb;
        float shade = mix(.78, 1.16, t1.r) * mix(.86, 1.1, t2.r) * mix(1., mix(.86, 1.12, t3.g), nearK);
        ${rock ? `shade *= mix(.8, 1.15, t2.g);` : `
        float green = step(max(diffuseColor.r, diffuseColor.b) * 1.06, diffuseColor.g);
        float asph = up * (1. - step(.2, lum)), pave = up * step(.36, lum) * (1. - green), wall = (1. - up) * step(.2, lum);
        shade *= 1. + asph * ((t3.b - .5) * .9 * nearK + (t2.g - .5) * .5 + (t1.g - .5) * .3);                                   // asphalt: flecks of stone, patches
        vec2 gq = abs(fract(uvG / 1.25 + .5) - .5); float joint = smoothstep(.465, .5, max(gq.x, gq.y)) * (1. - smoothstep(22., 60., dist));
        shade *= 1. - pave * joint * .3;                                                                       // paving: joints between the slabs
        shade *= 1. + green * up * (t3.g - .5) * .5 * nearK;                                                   // grass: blades
        shade *= mix(1., mix(.78, 1., smoothstep(0., 1.3, vWP.y)), wall * step(vWP.y, 3.));                    // walls: grime at the foot
        shade *= 1. + wall * (texture2D(uDetail, vec2(uvW.x * .3, uvW.y * .02)).r - .5) * .16;                 // walls: faint streaks running down
        `}
        diffuseColor.rgb *= shade;
        ${rock ? '' : `float wetK = uWet * up * (1. - green); diffuseColor.rgb *= 1. - wetK * .22;
        wetShine = wetK * (asph + pave * .7) * mix(.45, 1., smoothstep(.3, .7, t1.g));`} }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, .1, wetShine);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      #ifdef USE_FOG
        { float fres = pow(1. - clamp(dot(normalize(vViewPosition), normal), 0., 1.), 4.); totalEmissiveRadiance += wetShine * fres * fogColor * .55; }   // the sky mirrored in the wet road, towards the horizon
      #endif`);
  };
  mat.customProgramCacheKey = () => (rock ? 'detail-rock2' : 'detail2');
}
export const WETU = { value: 0 };
addDetail(MAT.matte, false); addDetail(MAT.rock, true);

/* ---------- knocked-down buildings ---------- */
// A building that is shot down is not removed from the big merged meshes: every corner that lies inside its footprint is squashed down
// towards the ground by the GPU (more as it falls), so one building can sink into a heap of rubble without any of the city being rebuilt.
// demo.n rectangles at most; demo.rect[i] = x0, z0, x1, z1 and demo.k[i] = how far gone it is (0 standing, 1 flat).
export const demo = { n: 0, rect: new Array(24).fill(0).map(() => new T.Vector4(0, 0, 0, 0)), k: new Float32Array(24), tint: new Float32Array(24) };
const DEMO_U = { uDemN: { value: 0 }, uDem: { value: demo.rect }, uDemK: { value: demo.k } };
demo.sync = () => { DEMO_U.uDemN.value = demo.n; };
const DEMO_VD = 'uniform int uDemN; uniform vec4 uDem[24]; uniform float uDemK[24]; varying float vDemK;';
const DEMO_VB = `float demK = 0.;
  { vec4 q = vec4(transformed, 1.);
    #ifdef USE_INSTANCING
      q = instanceMatrix * q;
    #endif
    q = modelMatrix * q;
    for (int i = 0; i < 24; i++) { if (i >= uDemN) break; vec4 r = uDem[i];
      if (q.x > r.x && q.x < r.z && q.z > r.y && q.z < r.w) { float k = uDemK[i]; demK = max(demK, k);
        float j = .9 + .08 * sin(q.x * 2.3 + q.z * 1.7) * sin(q.z * 3.1 + q.x * .7);
        transformed.y *= 1. - k * j;
        transformed.x += k * sin(q.y * 1.3 + q.z) * .45; transformed.z += k * sin(q.y * 1.1 + q.x) * .45; } } }
  vDemK = demK;`;
export function addDemo(mat) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(mat, sh, r);
    sh.uniforms.uDemN = DEMO_U.uDemN; sh.uniforms.uDem = DEMO_U.uDem; sh.uniforms.uDemK = DEMO_U.uDemK;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DEMO_VD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + DEMO_VB);
    if (sh.fragmentShader.includes('#include <color_fragment>')) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDemK;').replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 1. - vDemK * .72;');   // soot and dust
  };
  mat.customProgramCacheKey = () => key + '|demo';
}
// the shadow of a building has to sink with it
const DEMO_DEPTH = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking });
DEMO_DEPTH.onBeforeCompile = sh => {
  sh.uniforms.uDemN = DEMO_U.uDemN; sh.uniforms.uDem = DEMO_U.uDem; sh.uniforms.uDemK = DEMO_U.uDemK;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DEMO_VD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + DEMO_VB);
};
DEMO_DEPTH.customProgramCacheKey = () => 'demo-depth';
for (const k of ['matte', 'glass', 'lit', 'mark', 'bulb', 'gold', 'glow']) addDemo(MAT[k]);

/* ---------- batcher: merges thousands of pieces into a few meshes ---------- */
const CELL = 150;
const KEEPGEO = typeof location !== 'undefined' && /keepgeo/.test(location.search);   // testing only: keep the drawn shapes in memory so the ground can be measured
function freeArray() { if (!KEEPGEO) this.array = null; }
const UB = new T.BoxGeometry(1, 1, 1).toNonIndexed(), UP = UB.attributes.position.array, UNr = UB.attributes.normal.array;
const _v = new T.Vector3(), _n = new T.Vector3(), _nm = new T.Matrix3();
// growing typed buffers: the big city has millions of corners, and plain arrays of them would not fit in a phone's memory
class Buf3 {
  constructor(Type, scale) { this.T = Type; this.k = scale || 1; this.a = new Type(3 * 1024); this.n = 0; }
  push(x, y, z) { if (this.n + 3 > this.a.length) { const b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; } const a = this.a, k = this.k; a[this.n++] = x * k; a[this.n++] = y * k; a[this.n++] = z * k; }
  done() { return this.a.slice(0, this.n); }
}
class Batch {
  constructor(cast, keep) { this.cast = cast; this.keep = keep; this.rec = null; this.m = new Map(); this.setT(0, 0, 0, 0); }
  begin() { this.rec = new Map(); }
  end() { const out = []; for (const [b, s] of this.rec) out.push({ b, s, e: b.p.n }); this.rec = null; return out; }
  setT(x, y, z, ry) { this.tx = x; this.ty = y; this.tz = z; this.c = Math.cos(ry); this.s = Math.sin(ry); this.ck = '|' + Math.floor(x / CELL) + ',' + Math.floor(z / CELL); }
  buf(mat) { const k = mat.uuid + this.ck; let b = this.m.get(k); if (!b) { b = { mat, p: new Buf3(Float32Array), n: new Buf3(Int8Array, 127), c: new Buf3(Uint16Array, 65535) }; this.m.set(k, b); } if (this.rec && !this.rec.has(b)) this.rec.set(b, b.p.n); return b; }
  wp(lx, lz) { return [lx * this.c + lz * this.s + this.tx, -lx * this.s + lz * this.c + this.tz]; }
  box(cl, w, h, d, x, y, z, mat) {
    // everything solid that stands high up (stair huts, tanks, pillars and upper storeys on roofs) is noted, so that somebody walking on a roof cannot pass through it
    if (h >= .8 && w >= .25 && d >= .25 && !this.keep && this.ty + y - h / 2 > 2.5 && (Math.abs(this.c) > .99 || Math.abs(this.s) > .99)) { const ax = Math.abs(this.c) > .99, wx = x * this.c + z * this.s + this.tx, wz = -x * this.s + z * this.c + this.tz, hw = (ax ? w : d) / 2, hd = (ax ? d : w) / 2; roofAdd(wx - hw, wz - hd, wx + hw, wz + hd, this.ty + y - h / 2, this.ty + y + h / 2); }
    // every wide, flat slab near ground level (pavement, grass, a square, a quay deck) is noted, so that people stand on top of it and not in it
    if (h <= .3 && w >= 1.6 && d >= 1.6 && !this.keep && mat !== MAT.glow && mat !== MAT.mark) { const top = this.ty + y + h / 2, ax = Math.abs(this.c) > .99, az = Math.abs(this.s) > .99;
      if (top > .03 && top < .45 && this.ty < .2 && (ax || az)) { const wx = x * this.c + z * this.s + this.tx, wz = -x * this.s + z * this.c + this.tz, hw = (ax ? w : d) / 2, hd = (ax ? d : w) / 2; slabAdd(wx - hw, wz - hd, wx + hw, wz + hd, top); } }
    const b = this.buf(mat || MAT.matte), c = this.c, s = this.s, tx = this.tx, ty = this.ty, tz = this.tz, p = b.p, n = b.n, cc = b.c;
    for (let i = 0; i < 108; i += 3) {
      const lx = UP[i] * w + x, lz = UP[i + 2] * d + z;
      p.push(lx * c + lz * s + tx, UP[i + 1] * h + y + ty, -lx * s + lz * c + tz);
      const nx = UNr[i], nz = UNr[i + 2]; n.push(nx * c + nz * s, UNr[i + 1], -nx * s + nz * c);
      cc.push(cl[0], cl[1], cl[2]);
    }
  }
  geo(cl, g, m4, mat) {
    const gg = g.index ? g.toNonIndexed() : g; if (!gg.attributes.normal) gg.computeVertexNormals();
    const P = gg.attributes.position, N = gg.attributes.normal, VC = gg.attributes.color, b = this.buf(mat || MAT.matte), c = this.c, s = this.s;
    _nm.getNormalMatrix(m4);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(m4); _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
      b.p.push(_v.x * c + _v.z * s + this.tx, _v.y + this.ty, -_v.x * s + _v.z * c + this.tz);
      b.n.push(_n.x * c + _n.z * s, _n.y, -_n.x * s + _n.z * c);
      if (VC) { const k = VC.getX(i); b.c.push(cl[0] * k, cl[1] * k, cl[2] * k); } else b.c.push(cl[0], cl[1], cl[2]);   // a shape may bring its own shading (the soft edge of a pool of light)
    }
  }
  build(scene) {
    for (const b of this.m.values()) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(b.p.done(), 3));
      g.setAttribute('normal', new T.BufferAttribute(b.n.done(), 3, true));
      g.setAttribute('color', new T.BufferAttribute(b.c.done(), 3, true));
      const m = new T.Mesh(g, b.mat); m.castShadow = this.cast && b.mat !== MAT.glow; m.receiveShadow = b.mat !== MAT.glow; m.matrixAutoUpdate = false; if (m.castShadow) m.customDepthMaterial = DEMO_DEPTH; scene.add(m);
      if (this.keep) b.attr = g.attributes.position;   // breakable things: the positions stay in memory so a broken one can be wiped
      for (const k of (this.keep ? ['normal', 'color'] : ['position', 'normal', 'color'])) g.attributes[k].onUpload(freeArray);   // once it is on the graphics card the copy in memory is not needed
      g.computeBoundingSphere(); G.cells.push({ m, x: g.boundingSphere.center.x, z: g.boundingSphere.center.z, r: g.boundingSphere.radius });
    }
    if (!this.keep) this.m.clear();
  }
}
const SB = new Batch(true), FB = new Batch(false), PB = new Batch(true, true);   // PB holds the things that can break
const M4 = (x, y, z, ry, sx, sy, sz, rx, rz) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), new T.Vector3(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz));

/* ---------- colours ---------- */
const WALLS = [0xe8c98a, 0xf0dcb0, 0xe3a878, 0xf2c4a0, 0xd9b382, 0xf3e3c3, 0xe6b89c, 0xcfa36a, 0xead7a4, 0xdc9c7c].map(col);
const SHUT = [0x3f6f8f, 0x4f7f5f, 0x7a4b32, 0x8f8f86, 0x2f5f6f, 0xa33b2f, 0x54708f].map(col);
const DOORC = [0x7a2f25, 0x2f4f6a, 0x35523c, 0x5a3b25, 0x3a3a40].map(col);
const AWN = [0xb3261e, 0x1f6f8f, 0x2f7a4f, 0xd98a1f, 0x7a3f8f, 0xc9463c].map(col);
const TILE = col(0xb8623a), TILE2 = col(0xa1522c), TRIM = col(0xf3ead6), STONE = col(0xcfc4ab), IRON = col(0x23252a);
const GLASSC = col(0x2c4459), LITC = col(0x4b5c70), PAVEC = col(0xcdc3ae), ASPH = col(0x55575d), PROMC = col(0xe4d8bd), GRASSC = col(0x6f9a4a);
const WHITE = col(0xf2f0e8), YELLOW = col(0xe2bd2a), DARK = col(0x2a2c30), WOOD = col(0x8a6238), BULBC = col(0xfff2cf);

/* ---------- world data used by the game ---------- */
export const doors = [];     // {x,z,nx,nz,shop,loop,u}
export const loops = [];     // pavement loops {x0,z0,x1,z1,P}
export const slots = [];     // parking slots {a,b,s,x,z,h,car,loop,u}
export const signs = [];     // sign meshes to create
export const lampPos = [];
const D = 12;                // building depth

export function loopPoint(L, u, out) {
  const w = L.x1 - L.x0, h = L.z1 - L.z0; u = ((u % L.P) + L.P) % L.P;
  if (u < w) { out.x = L.x0 + u; out.z = L.z1; out.dx = 1; out.dz = 0; }
  else if (u < w + h) { out.x = L.x1; out.z = L.z1 - (u - w); out.dx = 0; out.dz = -1; }
  else if (u < 2 * w + h) { out.x = L.x1 - (u - w - h); out.z = L.z0; out.dx = -1; out.dz = 0; }
  else { out.x = L.x0; out.z = L.z0 + (u - 2 * w - h); out.dx = 0; out.dz = 1; }
  return out;
}
export function loopParam(L, x, z) {
  const w = L.x1 - L.x0, h = L.z1 - L.z0, cx = Math.max(L.x0, Math.min(x, L.x1)), cz = Math.max(L.z0, Math.min(z, L.z1));
  const ds = Math.abs(z - L.z1), de = Math.abs(x - L.x1), dn = Math.abs(z - L.z0), dw = Math.abs(x - L.x0), m = Math.min(ds, de, dn, dw);
  if (m === ds) return { u: cx - L.x0, d: Math.hypot(x - cx, z - L.z1) };
  if (m === de) return { u: w + (L.z1 - cz), d: Math.hypot(x - L.x1, z - cz) };
  if (m === dn) return { u: w + h + (L.x1 - cx), d: Math.hypot(x - cx, z - L.z0) };
  return { u: 2 * w + h + (cz - L.z0), d: Math.hypot(x - L.x0, z - cz) };
}
function nearestLoop(x, z) { let best = null, bd = 1e9, bu = 0; for (const L of loops) { const r = loopParam(L, x, z); if (r.d < bd) { bd = r.d; best = L; bu = r.u; } } return { loop: best, u: bu, d: bd }; }

/* ---------- hand-built house ---------- */
const SHOPNAMES = ['BAKERY', 'HARBOUR CAFE', 'FISH & GRILL', 'BOOKS', 'PHARMACY', 'MARKET', 'BARBER', 'SURF SHOP', 'ICE CREAM', 'PIZZA', 'HOTEL MARINA', 'BANK', 'FLOWERS', 'BIKES', 'TAILOR', 'RECORDS', 'BUTTERFLY BAR', 'OLIVE & VINE', 'SEA VIEW HOTEL', 'POST OFFICE', 'ANTIQUES', 'GROCER', 'TOYS', 'CAMERAS'];
let shopN = 0;
// someone seen through a window: head, hair and shoulders, as a thin cut-out just inside the glass
const WINC = [0xb3261e, 0x2f5f9f, 0xe0b23a, 0x2f7a5a, 0xf2f2ee, 0x7a3f8f, 0xd98a1f, 0x30343f].map(h => col(h)), WSKIN = [0xf1c9a5, 0xc68642, 0x8d5524, 0xe0ac7e].map(h => col(h)), WHAIR = [0x1c1410, 0x7a2f1a, 0x101010, 0xc9a35a].map(h => col(h));
function winFigure(B, x, y, z, v, sc) {
  const sk = WSKIN[Math.floor(v * 4) % 4], hr = WHAIR[Math.floor(v * 16) % 4], sh = WINC[Math.floor(v * 64) % WINC.length];
  B.box(sh, .46 * sc, .62 * sc, .04, x, y + .31 * sc, z); B.box(sk, .22 * sc, .26 * sc, .04, x, y + .76 * sc, z + .005); B.box(hr, .25 * sc, .1 * sc, .045, x, y + .9 * sc, z + .006);
}
function house(B, w, fl, o) {
  const fh = 3.1, h = fl * fh + .6, d = D, zs = o.shop ? .2 : 0;
  B.box(o.wall, w, h, d, w / 2, h / 2, -d / 2);
  B.box(TRIM, w + .3, .28, .5, w / 2, h - .1, .1);
  B.box(TILE, w + .6, .3, d + 1, w / 2, h + .15, -d / 2 + .2);
  B.box(TILE2, w - 1.4, .45, d - 3.2, w / 2, h + .5, -d / 2);
  if (w > 7) B.box(TILE, w - 4.5, .4, d - 6.8, w / 2, h + .9, -d / 2);
  if (o.shop) B.box(o.base, w + .06, 3.25, .2, w / 2, 1.62, .08);
  const bays = Math.max(2, Math.round(w / 3)), bw = w / bays, door = Math.floor(rnd() * bays);
  for (let f = 0; f < fl; f++) for (let b = 0; b < bays; b++) {
    const cx = bw * (b + .5), cy = f * fh + 1.9;
    if (f === 0 && b === door) {
      B.box(TRIM, 1.5, 2.7, .1, cx, 1.35, .06 + zs); B.box(o.door, 1.1, 2.3, .1, cx, 1.15, .1 + zs);
      const p = B.wp(cx, 1.6), q = B.wp(cx, 0);
      doors.push({ x: p[0], z: p[1], nx: q[0] - p[0], nz: q[1] - p[1], shop: !!o.shop });
      continue;
    }
    const wq = B.wp(cx, 0), hv = hash2(wq[0] * 3.7 + f * 11.3, wq[1] * 2.9 - b * 5.1), hv2 = hash2(wq[1] * 1.3 + b * 7.7, wq[0] * 4.1 + f * 3.3);   // steady "dice" for this window
    if (f === 0 && o.shop) { B.box(TRIM, bw - .5, 2.3, .08, cx, 1.6, zs + .04); B.box(LITC, bw - .9, 1.95, .1, cx, 1.6, zs + .07, MAT.lit);
      // the shop window: shelves with goods on them, and now and then someone standing inside
      const sw = bw - 1.1; for (const sy of [1.05, 1.75]) { B.box(WOOD, sw, .05, .05, cx, sy, zs + .13); for (let k = 0; k < 4; k++) B.box(WINC[Math.floor(hash2(wq[0] + k * 3.1, sy * 9 + wq[1]) * WINC.length)], .22, .2 + (k % 2) * .12, .05, cx - sw / 2 + .3 + k * (sw - .6) / 3, sy + .14 + (k % 2) * .06, zs + .13); }
      if (hv < .4) winFigure(B, cx + (hv2 - .5) * (sw - .8), .62, zs + .135, hv2, 1.25);
      continue; }
    const lit = rnd() < .38;
    B.box(lit ? LITC : GLASSC, 1.0, 1.65, .1, cx, cy, .03, lit ? MAT.lit : MAT.glass);
    B.box(o.shut, .4, 1.75, .07, cx - .72, cy, .05); B.box(o.shut, .4, 1.75, .07, cx + .72, cy, .05);
    B.box(TRIM, 1.9, .1, .22, cx, cy - .93, .08);
    if (hv < .34) { const cc = WINC[Math.floor(hv2 * WINC.length)]; B.box(cc, .2, 1.6, .03, cx - .39, cy, .085); B.box(cc, .2, 1.6, .03, cx + .39, cy, .085); }   // curtains
    if (hv > .88) winFigure(B, cx + (hv2 - .5) * .3, cy - .82, .09, hv2, .8);                                                          // someone at the window
    else if (hv > .76) { B.box(col(0x7a4a2e), 1.5, .22, .26, cx, cy - .8, .2); for (let k = 0; k < 4; k++) B.box(col(k % 2 ? 0xd9463c : 0x4f9a4a), .3, .22, .2, cx - .52 + k * .35, cy - .6, .2); }   // a flower box
    if (f > 0 && rnd() < .28) { B.box(TRIM, 2.1, .1, .75, cx, cy - .98, .38); B.box(IRON, 2.1, .8, .05, cx, cy - .53, .73); B.box(IRON, .05, .8, .7, cx - 1.03, cy - .53, .38); B.box(IRON, .05, .8, .7, cx + 1.03, cy - .53, .38); }
  }
  if (o.shop) {
    B.box(o.awn, w - .6, .1, 1.5, w / 2, 2.95, .95); B.box(o.awn, w - .6, .3, .06, w / 2, 2.8, 1.7);
    B.box(DARK, w - 1, .6, .08, w / 2, 3.55, .14);
    const p = B.wp(w / 2, .2);
    signs.push({ x: p[0], y: 3.55 + B.ty, z: p[1], ry: Math.atan2(B.s, B.c), w: Math.min(w - 1.4, 6), name: SHOPNAMES[shopN++ % SHOPNAMES.length] });
  }
}

/* ---------- ready-made building (Quaternius, CC0), recoloured ---------- */
let RM = [];
// Downtown City MegaKit buildings (Quaternius, CC0): textured brick blocks, drawn as instances so many copies stay cheap
let KIT = null;
function prepKit(models) {
  if (!models.d1 || !models.dtex) return;
  const tex = {}, loader = new T.TextureLoader(), mats = {}, TINT = { MI_Trim_Dark: 0x5c6068, MI_Trim_Green: 0x86ab90, MI_RedBrick_Pale: 0xe9d6c0, MI_InteriorWall: 0xc8c8c8 };
  const getTex = n => tex[n] || (tex[n] = (() => { const t = loader.load(models.dtex[n]); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.flipY = false; t.anisotropy = 4; return t; })());
  const matFor = name => mats[name] || (mats[name] = (() => {
    const [mn, tn] = name.split('|'); if (mn === 'MI_Glass') { const g = new T.MeshStandardMaterial({ color: 0x223445, roughness: .12, metalness: .35, transparent: true, opacity: .55 }); addDemo(g); return g; }
    const m = new T.MeshStandardMaterial({ map: tn ? getTex(tn) : null, color: TINT[mn] || 0xffffff, roughness: .88, metalness: 0 }); kitDetail(m); addDemo(m); return m;
  })());
  KIT = ['d1', 'd2', 'd3'].map(k => {
    const root = models[k]; root.updateMatrixWorld(true); const box = new T.Box3().setFromObject(root), parts = [];
    root.traverse(o => { if (o.isMesh) parts.push({ g: o.geometry, m: o.matrixWorld.clone(), mat: matFor(o.material.name), glass: o.material.name.startsWith('MI_Glass') }); });
    return { parts, box, list: [], w: box.max.x - box.min.x };
  });
}
function finishKit(scene) {
  if (!KIT) return; const M = new T.Matrix4();
  for (const k of KIT) { if (!k.list.length) continue; for (const p of k.parts) {
    const im = new T.InstancedMesh(p.g, p.mat, k.list.length); k.list.forEach((m, i) => im.setMatrixAt(i, M.multiplyMatrices(m, p.m)));
    im.castShadow = !p.glass; im.receiveShadow = !p.glass; if (im.castShadow) im.customDepthMaterial = DEMO_DEPTH; im.frustumCulled = false; im.instanceMatrix.needsUpdate = true; scene.add(im);
  } }
}
// a block of the brick quarter: kit buildings shoulder to shoulder along both streets, back to back
function brickBlock(X0, X1, Z0, Z1) {
  const x0 = X0 + INSET + 1, x1 = X1 - INSET - 1, zs = Z1 - INSET - 1.4, zn = Z0 + INSET + 1.4;
  FB.setT(0, 0, 0, 0); FB.box(col(0xb9b6ae), x1 - x0 + 2, .08, Z1 - Z0 - 2 * INSET, (x0 + x1) / 2, .04, (Z0 + Z1) / 2);
  for (const south of [true, false]) {
    let x = x0;
    for (let guard = 0; guard < 12; guard++) {
      const fit = KIT.map((k, i) => i).filter(i => x + KIT[i].w <= x1 + .5); if (!fit.length) break;
      const i = pick(fit), k = KIT[i], b = k.box, m = new T.Matrix4();
      if (south) { m.makeTranslation(x - b.min.x, 0, zs - .3); addBox(x, zs - .3 + b.min.z, x + k.w, zs, b.max.y); }
      else { m.makeRotationY(Math.PI).setPosition(x + b.max.x, 0, zn + .3); addBox(x, zn, x + k.w, zn + .3 - b.min.z, b.max.y); }
      k.list.push(m); x += k.w;
    }
    if (x1 - x > 3) tree((x + x1) / 2, south ? zs - 4 : zn + 4, 1.2);
  }
  for (const [lx, lz, dx, dz] of [[X0 + INSET - 1.4, (Z0 + Z1) / 2, 1, 0], [X1 - INSET + 1.4, (Z0 + Z1) / 2, -1, 0], [(x0 + x1) / 2, Z0 + INSET - 1.4, 0, 1], [(x0 + x1) / 2, Z1 - INSET + 1.4, 0, -1]]) lamp(lx, lz, dx, dz);
}
function prepModels(models) {
  prepKit(models);
  const floors = { b1: 4, b2: 3, b3: 2, b4: 4, b5: 3 };
  RM = Object.keys(floors).map(k => {
    const root = models[k]; root.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(root), size = box.getSize(new T.Vector3()), parts = [];
    root.traverse(o => { if (o.isMesh) parts.push({ g: o.geometry, m: o.matrixWorld.clone(), name: o.material.name, c: [o.material.color.r, o.material.color.g, o.material.color.b] }); });
    const sc = (floors[k] * 3.1 + 1) / size.y;
    return { parts, box, sc, w: size.x * sc, d: size.z * sc, h: size.y * sc };
  });
}
function readyMade(B, t, wall) {
  const pre = new T.Matrix4().makeScale(t.sc, t.sc, t.sc).premultiply(new T.Matrix4().makeTranslation(-t.box.min.x * t.sc, -t.box.min.y * t.sc, -t.box.max.z * t.sc));
  const lit = rnd() < .5;
  for (const p of t.parts) {
    const m = pre.clone().multiply(p.m);
    let c = p.c, mat = MAT.matte;
    if (p.name === 'Main') c = wall; else if (p.name === 'Bricks') c = mul(wall, 1.15); else if (p.name === 'Dark') c = mul(wall, .55);
    else if (p.name === 'Glass') { mat = lit ? MAT.lit : MAT.glass; c = lit ? LITC : GLASSC; }
    else if (p.name === 'White') c = TRIM;
    B.geo(c, p.g, m, mat);
  }
  const p = B.wp(t.w / 2, 1.6), q = B.wp(t.w / 2, 0);
  doors.push({ x: p[0], z: p[1], nx: q[0] - p[0], nz: q[1] - p[1], shop: false });
}

/* ---------- a row of buildings along a street ---------- */
function row(ox, oz, ry, L, shopP) {
  const c = Math.cos(ry), s = Math.sin(ry); let u = 0;
  while (u < L - .01) {
    const rem = L - u; let w, d = D, hh;
    const X = ox + u * c, Z = oz - u * s;
    SB.setT(X, 0, Z, ry);
    if (RM.length && rnd() < .3 && rem > 17) { const t = pick(RM); readyMade(SB, t, pick(WALLS)); w = t.w; d = t.d; hh = t.h; }
    else {
      w = rr(9, 15); if (rem - w < 8) w = rem;
      const shop = rnd() < shopP, fl = 2 + Math.floor(rnd() * 3.4); hh = fl * 3.1 + 1.9;
      house(SB, w, fl, { wall: pick(WALLS), shut: pick(SHUT), door: pick(DOORC), shop, base: mul(pick(WALLS), .8), awn: pick(AWN) });
    }
    const a = SB.wp(0, 0), b = SB.wp(w, -d); addBox(a[0], a[1], b[0], b[1], hh);
    u += w;
  }
}
function block(X0, X1, Z0, Z1, shopSides) {
  const x0 = X0 + INSET, x1 = X1 - INSET, z0 = Z0 + INSET, z1 = Z1 - INSET, sp = shopSides || {};
  row(x0, z1, 0, x1 - x0, sp.s === undefined ? .35 : sp.s);
  row(x1, z0, Math.PI, x1 - x0, sp.n === undefined ? .35 : sp.n);
  row(x1, z1 - D, Math.PI / 2, z1 - z0 - 2 * D, sp.e === undefined ? .35 : sp.e);
  row(x0, z0 + D, -Math.PI / 2, z1 - z0 - 2 * D, sp.w === undefined ? .35 : sp.w);
  FB.setT(0, 0, 0, 0); FB.box(GRASSC, x1 - x0 - 2 * D - 2, .04, z1 - z0 - 2 * D - 2, (x0 + x1) / 2, .02, (z0 + z1) / 2);
}

/* ---------- small things ---------- */
const gCyl = (a, b, h, s) => new T.CylinderGeometry(a, b, h, s || 8);
const gIco = new T.IcosahedronGeometry(1, 1), gCone4 = new T.ConeGeometry(1, 1, 4), gFrond = new T.ConeGeometry(.5, 1, 4);
const LEAF = [0x4f8f3a, 0x5fa244, 0x417a33, 0x6bab4d].map(col), PALMC = [0x3f8f4a, 0x4a9a50, 0x357a40].map(col), TRUNK = col(0x6a5540), PTRUNK = col(0x8a7558);
// a pool of lamp light: bright in the middle, fading to nothing at the rim (it is added to the street, so black means no light)
const glowGeo = (() => { const g = new T.CircleGeometry(1, 28).rotateX(-Math.PI / 2).toNonIndexed(), P = g.attributes.position, col = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const r = Math.hypot(P.getX(i), P.getZ(i)), k = Math.pow(Math.max(0, 1 - r), 1.2); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; } g.setAttribute('color', new T.BufferAttribute(col, 3)); return g; })();
let NATOK = false;
function tree(x, z, sc) {
  sc = sc || 1;
  if (NATOK) { const q = hash2(x * 1.7, z * 2.3); natAdd(q < .4 ? 'CommonTree_1' : q < .75 ? 'CommonTree_4' : q < .9 ? 'Pine_1' : 'TwistedTree_1', x, z, sc * (.85 + q * .3), q * 40); return; }   // the real trees (nature.js) stand in for these blobs
  SB.setT(x, 0, z, 0);
  SB.geo(TRUNK, gCyl(.16, .24, 3.2, 6), M4(0, 1.6, 0));
  for (let i = 0; i < 4; i++) SB.geo(pick(LEAF), gIco, M4((rnd() - .5) * 1.8 * sc, 3.7 + rnd() * 1.7, (rnd() - .5) * 1.8 * sc, rnd() * 3, (1.1 + rnd() * .7) * sc), MAT.leaf);
  addCircle(x, z, .3);
}
function palm(x, z, h, y) {
  h = h || rr(6, 8.5); SB.setT(x, y || 0, z, 0);
  const lean = rr(-.06, .06);
  SB.geo(PTRUNK, gCyl(.17, .27, h, 6), M4(lean * h * .5, h / 2, 0, 0, 1, 1, 1, 0, -lean));
  const tx = lean * h, n = 9;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + rnd() * .3; SB.geo(pick(PALMC), gFrond, new T.Matrix4().compose(new T.Vector3(tx + Math.cos(a) * 1.5, h - .25, Math.sin(a) * 1.5), new T.Quaternion().setFromEuler(new T.Euler(0, -a, -1.95, 'YXZ')), new T.Vector3(1.1, 3.6, .22)), MAT.leaf); }
  addCircle(x, z, .32);
}
function lamp(x, z, dx, dz) {
  prop('lamp', x, z, 6, [[x, z, .22]], () => {
    PB.setT(x, 0, z, 0);
    PB.box(DARK, .16, 5.6, .16, 0, 2.8, 0); PB.box(DARK, .34, .5, .34, 0, .25, 0);
    PB.box(DARK, Math.abs(dx) * 1.3 + .1, .1, Math.abs(dz) * 1.3 + .1, dx * .65, 5.55, dz * .65);
    PB.box(BULBC, .5, .14, .5, dx * 1.3, 5.45, dz * 1.3, MAT.bulb);
    PB.geo(WHITE, glowGeo, M4(dx * 1.3, .07, dz * 1.3, 0, 9), MAT.glow);
  });
  lampPos.push([x + dx * 1.3, z + dz * 1.3]);
}
export const benches = [];
function bench(x, z, ry) { benches.push({ x, z, ry, used: null, pr: null }); benches[benches.length - 1].pr = prop('bench', x, z, 3, [[x, z, .7]], () => { PB.setT(x, 0, z, ry); PB.box(WOOD, 1.9, .07, .5, 0, .46, 0); PB.box(WOOD, 1.9, .42, .07, 0, .85, -.24); PB.box(DARK, .07, .46, .5, -.8, .23, 0); PB.box(DARK, .07, .46, .5, .8, .23, 0); }); }
// small things on the pavement: a fire hydrant, a litter bin, a post box, a newspaper box, a road sign. All of them break
const HYD = col(0xc8352b), BINC = col(0x3d5a48), POSTC = col(0xe0b21c), NEWSC = col(0x2f62b5), SIGNP = col(0x8d9299);
function hydrant(x, z) { prop('hydrant', x, z, 4, [[x, z, .28]], () => { PB.setT(x, 0, z, 0); PB.box(HYD, .3, .7, .3, 0, .47, 0); PB.box(HYD, .4, .12, .4, 0, .86, 0); PB.box(HYD, .56, .16, .16, 0, .58, 0); PB.box(DARK, .36, .12, .36, 0, .18, 0); }); }
/* ---------- everyday street dressing: litter, rubbish bags, planters, cafe tables, dumpsters, scooters, boxes (all fixed; nothing here uses the random numbers, so the rest of the city stays the same) ---------- */
const LTR = [col(0xf4f1e6), col(0xc9c4b0), col(0xb33a2e), col(0xd8d8d8), col(0x7a5a3a), col(0x2d6a9f)], BAGC = col(0x1b1c20), BAGB = col(0x2c3b52), CARD = col(0xb08a5a), POT = col(0xb8623a), LEAFQ = col(0x4f8a3f), LEAFQQ2 = col(0x6aa84a), DUMP = col(0x2f6a4a), LID = col(0x23252a), TABC = col(0xe9e3d3), CHAIRC = col(0x7a4b32), SCOOT = [col(0xc9463c), col(0x2f6a9f), col(0xe2bd2a), col(0xd8d8d8)], BOLL = col(0x9a9d9f);
const hr = (a, b) => hash2(a * 12.9898 + b * 78.233, a * 3.17 - b * 1.91);
function litter(x, z) { for (let k = 0; k < 7; k++) { const a = hr(x + k, z), b = hr(z, x - k * 2); FB.setT(x + (a - .5) * 3, 0, z + (b - .5) * 1.4, a * 6.28); const t = (a * 10 | 0) % 4;
  if (t === 0) FB.box(LTR[0], .2, .012, .15, 0, .03, 0); else if (t === 1) FB.box(LTR[(b * 6 | 0) % 6], .065, .12, .065, 0, .08, 0); else if (t === 2) FB.box(LTR[4], .28, .08, .2, 0, .06, 0); else FB.box(BAGB, .22, .05, .17, 0, .04, 0); } }
function trashBags(x, z, ry) { FB.setT(x, 0, z, ry); FB.box(BAGC, .42, .38, .36, 0, .22, 0); FB.box(BAGB, .38, .34, .34, .46, .2, .06); FB.box(BAGC, .36, .3, .3, .18, .55, -.04); FB.box(BAGC, .3, .22, .28, -.3, .15, .3); }
function planter(x, z) { FB.setT(x, 0, z, 0); FB.box(POT, .56, .46, .56, 0, .25, 0); FB.box(LEAFQ, .5, .38, .5, 0, .62, 0); FB.box(LEAFQQ2, .36, .3, .36, .04, .88, -.03); }
function cafeTable(x, z, ry) { FB.setT(x, 0, z, ry); FB.box(IRON, .08, .72, .08, 0, .38, 0); FB.box(TABC, .7, .05, .7, 0, .76, 0); for (const sx of [-1, 1]) { FB.box(CHAIRC, .42, .05, .42, sx * .78, .46, 0); FB.box(CHAIRC, .06, .42, .42, sx * .78 + sx * .19, .68, 0); for (const lx of [-1, 1]) for (const lz of [-1, 1]) FB.box(IRON, .04, .44, .04, sx * .78 + lx * .17, .22, lz * .17); }
  FB.box(IRON, .05, 2.1, .05, 0, 1.4, 0); FB.box(AWN[(Math.abs(Math.round(x * 7 + z * 3))) % AWN.length], 2.0, .06, 2.0, 0, 2.42, 0); FB.box(TRIM, 1.2, .1, 1.2, 0, 2.5, 0); addCircle(x, z, .75); }
function dumpster(x, z, ry) { FB.setT(x, 0, z, ry); FB.box(DUMP, 1.9, 1.05, .95, 0, .72, 0); FB.box(LID, 1.96, .1, 1.0, 0, 1.3, 0); FB.box(IRON, .1, .2, .1, -.8, .12, .4); FB.box(IRON, .1, .2, .1, .8, .12, .4); FB.box(IRON, .1, .2, .1, -.8, .12, -.4); FB.box(IRON, .1, .2, .1, .8, .12, -.4); addCircle(x, z, 1.0); }
function scooter(x, z, ry, c) { FB.setT(x, 0, z, ry); FB.box(IRON, .16, .38, .16, .62, .22, 0); FB.box(IRON, .16, .38, .16, -.62, .22, 0); FB.box(c, .9, .22, .22, -.1, .36, 0); FB.box(IRON, .34, .08, .24, -.3, .56, 0); FB.box(c, .1, .6, .1, .5, .62, 0); FB.box(IRON, .08, .08, .5, .52, .96, 0); addCircle(x, z, .5); }
function boxes(x, z, ry) { FB.setT(x, 0, z, ry); FB.box(CARD, .6, .45, .5, 0, .24, 0); FB.box(CARD, .5, .4, .45, .05, .67, .02); FB.box(CARD, .55, .38, .45, .7, .21, .1); }
function bollards(x, z, ry) { FB.setT(x, 0, z, ry); for (let k = -1; k <= 1; k++) { FB.box(BOLL, .16, .75, .16, k * 1.1, .4, 0); FB.box(YELLOW, .17, .08, .17, k * 1.1, .62, 0); } }
function bin(x, z) { prop('bin', x, z, 2.5, [[x, z, .32]], () => { PB.setT(x, 0, z, 0); PB.box(BINC, .5, .8, .5, 0, .52, 0); PB.box(DARK, .56, .1, .56, 0, .97, 0); PB.box(DARK, .3, .1, .06, 0, .78, .26); }); }
function postbox(x, z, ry) { prop('postbox', x, z, 4, [[x, z, .34]], () => { PB.setT(x, 0, z, ry); PB.box(POSTC, .5, 1.15, .42, 0, .7, 0); PB.box(POSTC, .56, .1, .48, 0, 1.32, 0); PB.box(DARK, .3, .05, .04, 0, 1.05, .22); PB.box(WHITE, .22, .16, .03, 0, .75, .22); }); }
function newsbox(x, z, ry) { prop('newsbox', x, z, 3, [[x, z, .32]], () => { PB.setT(x, 0, z, ry); PB.box(NEWSC, .46, .9, .4, 0, .57, 0); PB.box(GLASSC, .36, .34, .03, 0, .78, .21); PB.box(DARK, .1, .12, .1, 0, .06, 0); }); }
function roadSign(x, z, ry, c) { prop('sign', x, z, 3, [[x, z, .14]], () => { PB.setT(x, 0, z, ry); PB.box(SIGNP, .07, 2.6, .07, 0, 1.42, 0); PB.box(c, .6, .6, .05, 0, 2.5, .04); PB.box(WHITE, .36, .12, .03, 0, 2.5, .08); }); }

/* ---------- roads ---------- */
function roads() {
  FB.setT(0, 0, 0, 0);
  for (const q of STRIPS) { FB.setT((q.x0 + q.x1) / 2, 0, (q.z0 + q.z1) / 2, 0); FB.box(ASPH, q.x1 - q.x0 + 2 * RH, .1, q.z1 - q.z0 + 2 * RH, 0, -.01, 0); }   // the slab reaches down into the ground, so its edge never shows a gap
  FB.setT(0, 0, 0, 0);
  // markings, lamps, trees, parking slots per directed leg
  nodes.forEach((A, ai) => A.nb.forEach(bi => {
    const Bn = nodes[bi], len = Math.hypot(Bn.x - A.x, Bn.z - A.z), dx = (Bn.x - A.x) / len, dz = (Bn.z - A.z) / len, rx = -dz, rz = dx, Lg = len - 2 * NODE_R;
    const px = A.x + dx * NODE_R, pz = A.z + dz * NODE_R;
    const lite = !(A.x <= XOLD && Bn.x <= XOLD && A.z >= ZMIN && A.z <= ZMAX && Bn.z >= ZMIN && Bn.z <= ZMAX), country = lite && zoneAt((A.x + Bn.x) / 2, (A.z + Bn.z) / 2) === 'country';   // outside the old city streets carry less furniture
    const ring = onRing(A.x, A.z) && onRing(Bn.x, Bn.z);
    if (ring) {   // the ring road: a double yellow line down the middle, a crash rail and tall lamps on the outside, nothing parked
      if (ai < bi) { for (const o of [-.22, .22]) { FB.setT((A.x + Bn.x) / 2 + rx * o, 0, (A.z + Bn.z) / 2 + rz * o, 0); FB.box(col(0xe2bd2a), Math.abs(dx) * len + .16, .02, Math.abs(dz) * len + .16, 0, .05, 0, MAT.mark); }
        for (const o of [-3, 3]) for (let s = 2; s < Lg - 3; s += 12) { FB.setT(px + dx * (s + 2) + rx * o, 0, pz + dz * (s + 2) + rz * o, 0); FB.box(WHITE, Math.abs(dx) * 4 + .14, .02, Math.abs(dz) * 4 + .14, 0, .05, 0, MAT.mark); } }
      SB.setT(px + dx * Lg / 2 + rx * (RH + .5), 0, pz + dz * Lg / 2 + rz * (RH + .5), 0); SB.box(col(0xb9bec4), Math.abs(dx) * Lg + .12, .3, Math.abs(dz) * Lg + .12, 0, .62, 0);
      for (let s = 4; s < Lg; s += 8) { SB.setT(px + dx * s + rx * (RH + .5), 0, pz + dz * s + rz * (RH + .5), 0); SB.box(col(0x6e7379), .12, .6, .12, 0, .3, 0); }
      for (let s = 20; s < Lg - 10; s += 60) lamp(px + dx * s + rx * (RH + 1.2), pz + dz * s + rz * (RH + 1.2), -rx, -rz);
      return;
    }
    if (ai < bi) {
      for (let s = 2; s < Lg - 3; s += (lite ? 16 : 8)) { FB.setT(px + dx * (s + 1.5), 0, pz + dz * (s + 1.5), 0); FB.box(WHITE, Math.abs(dx) * 3 + .16, .02, Math.abs(dz) * 3 + .16, 0, .05, 0, MAT.mark); }
      if (!country) for (const e of [0, Lg]) for (let k = -5; k <= 5; k += (lite ? 2 : 1)) { FB.setT(px + dx * e + rx * k * 1.05, 0, pz + dz * e + rz * k * 1.05, 0); FB.box(WHITE, Math.abs(dx) * 3 + Math.abs(rx) * .55, .02, Math.abs(dz) * 3 + Math.abs(rz) * .55, dx * (e ? 1.6 : -1.6), .05, dz * (e ? 1.6 : -1.6), MAT.mark); }
    }
    // right-hand side furniture
    const boulevard = (A.z === 0 && Bn.z === 0) || (A.x === 150 && Bn.x === 150);
    for (let s = 6, i = 0; s < Lg - 4; s += (lite ? 30 : 15), i++) {
      const x = px + dx * s + rx * (RH + .7), z = pz + dz * s + rz * (RH + .7);
      if (country) { if (i % 2) tree(x + rx * 2, z + rz * 2, .9); } else if (i % 2 === 0) lamp(x, z, -rx, -rz); else if (boulevard) tree(x, z); else if (rnd() < .35) tree(x, z, .8);
    }
    if (!country) for (let s = 13, i = 0; s < Lg - 6; s += 19, i++) {   // small things on the pavement edge
      const hh = hash2(px * 1.7 + s * 3.3, pz * 2.9 - s), x = px + dx * s + rx * (RH + .75), z = pz + dz * s + rz * (RH + .75), ry = Math.atan2(-rx, -rz);
      if (hh < .16) hydrant(x, z); else if (hh < .42) bin(x, z); else if (hh < .52) postbox(x, z, ry); else if (hh < .62) newsbox(x, z, ry); else if (hh < .78) roadSign(x, z, ry, [HYD, NEWSC, col(0x2f9a57)][i % 3]);
    }
    if (!country) for (let s = 3, i = 0; s < Lg - 3; s += 3.9, i++) {   // everyday clutter along the pavements
      const q = hr(px * 1.3 + s * 2.1, pz * .7 - s * 1.7), off = RH + 1.0 + hr(s, px + pz) * .9, x = px + dx * s + rx * off, z = pz + dz * s + rz * off, ry = Math.atan2(-rx, -rz);
      if (q < .16) litter(x, z); else if (q < .21) trashBags(x, z, ry); else if (q < .26) planter(x, z); else if (q < .295 && !lite) cafeTable(px + dx * s + rx * (RH + 2.2), pz + dz * s + rz * (RH + 2.2), ry); else if (q < .32) dumpster(x, z, ry + Math.PI / 2); else if (q < .36) scooter(x, z, ry + Math.PI / 2, SCOOT[(q * 100 | 0) % 4]); else if (q < .39) boxes(x, z, ry); else if (q < .41) bollards(x, z, ry + Math.PI / 2);
    }
    if (!country) for (let s = 9; s < Lg - 8; s += 7.2) {
      const x = px + dx * s + rx * PARK_LAT, z = pz + dz * s + rz * PARK_LAT;
      slots.push({ a: ai, b: bi, s, x, z, h: Math.atan2(-dz, dx), car: null, px: x + rx * 3.4, pz: z + rz * 3.4 });
    }
  }));
}

/* ---------- harbour ---------- */
const hullShape = (() => { const s = new T.Shape(); s.moveTo(-1, -.36); s.lineTo(.25, -.4); s.quadraticCurveTo(.85, -.3, 1, 0); s.quadraticCurveTo(.85, .3, .25, .4); s.lineTo(-1, .36); s.closePath(); return s; })();
const hullGeo = new T.ExtrudeGeometry(hullShape, { depth: 1, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2);
const BOATC = [0xf4f1e8, 0xe8eef2, 0x2f6f9f, 0xb3362e, 0xf0d9a0, 0x2f7f6f].map(col);
// The wooden pontoons and the decks of the moored boats in the harbour are places you can stand: this gives the height of the deck
// under a point, or null where there is only water.
const MOORED = [];
export function harbourDeck(x, z) {
  if (!(x > HARB.x0 && x < HARB.x1 && z > HARB.z0 && z < HARB.z1)) return null;
  for (let px = -165; px <= 35; px += 40) if (Math.abs(x - px) < 1.25 && Math.abs(z) > HARB.z1 - 27) return -.9;
  for (const m of MOORED) { const dx = x - m.x, dz = z - m.z; if (Math.abs(dx) > m.hl || Math.abs(dz) > m.hl) continue; const lx = dx * m.c - dz * m.s, lz = dx * m.s + dz * m.c; if (lx > -m.hl && lx < m.hl * .8 && Math.abs(lz) < m.hw * (lx > m.hl * .3 ? .65 : 1)) return -.69; }
  return null;
}
// somebody standing on a moored boat is kept out of its cabin and off its mast
export function deckPush(p, r) {
  for (const m of MOORED) { const dx = p.x - m.x, dz = p.z - m.z; if (Math.abs(dx) > m.hl + 1 || Math.abs(dz) > m.hl + 1) continue; let lx = dx * m.c - dz * m.s, lz = dx * m.s + dz * m.c, hit = false;
    if (m.cab) { const qx = Math.max(m.cab.x - m.cab.hx, Math.min(m.cab.x + m.cab.hx, lx)), qz = Math.max(-m.cab.hz, Math.min(m.cab.hz, lz)), ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
      if (d2 < r * r) { hit = true; if (d2 > 1e-6) { const d = Math.sqrt(d2); lx += ex / d * (r - d); lz += ez / d * (r - d); } else if (Math.abs(lz) / m.cab.hz > Math.abs(lx - m.cab.x) / m.cab.hx) lz = Math.sign(lz || 1) * (m.cab.hz + r); else lx = m.cab.x + Math.sign(lx - m.cab.x || 1) * (m.cab.hx + r); } }
    if (m.mast !== null) { const ex = lx - m.mast, d = Math.hypot(ex, lz); if (d < r + .1) { hit = true; const k = (r + .1) / (d || 1); lx = m.mast + (d ? ex * k : r + .1); lz = lz * k; } }
    if (hit) { p.x = m.x + lx * m.c + lz * m.s; p.z = m.z - lx * m.s + lz * m.c; } }
}
function boat(x, z, ry, L) {
  const moor = { x, z, c: Math.cos(ry), s: Math.sin(ry), hl: L / 2, hw: L * .21, cab: null, mast: null }; MOORED.push(moor);
  SB.setT(x, 0, z, ry);
  const c = pick(BOATC);
  SB.geo(c, hullGeo, M4(0, -1.75, 0, 0, L / 2, 1.0, L / 2 * 1.1));
  SB.box(WOOD, L * .62, .06, L * .3, -L * .08, -.72, 0);
  if (rnd() < .55) { moor.cab = { x: -L * .12, hx: L * .14, hz: L * .13 }; SB.box(WHITE, L * .28, .7, L * .26, -L * .12, -.35, 0); SB.box(GLASSC, L * .29, .25, L * .2, -L * .12, -.2, 0, MAT.glass); }
  else { moor.mast = L * .08; SB.box(STONE, .09, L * 1.25, .09, L * .08, L * .62 - .7, 0); SB.box(WHITE, L * .5, .12, .12, -L * .17, .1, 0); }
}
function harbour() {
  const H = HARB;
  FB.setT(0, 0, 0, 0);
  FB.box(PROMC, H.x1 - H.x0, .04, 10, (H.x0 + H.x1) / 2, .025, H.z0 - 5); FB.box(PROMC, H.x1 - H.x0, .04, 10, (H.x0 + H.x1) / 2, .025, H.z1 + 5);
  FB.box(PROMC, 10, .04, H.z1 - H.z0 + 20, H.x1 + 5, .025, 0);
  SB.setT(0, 0, 0, 0);
  SB.box(STONE, H.x1 - H.x0, .35, .6, (H.x0 + H.x1) / 2, .17, H.z0 - .3); SB.box(STONE, H.x1 - H.x0, .35, .6, (H.x0 + H.x1) / 2, .17, H.z1 + .3); SB.box(STONE, .6, .35, H.z1 - H.z0 + 1.2, H.x1 + .3, .17, 0);
  for (let x = H.x0 + 6; x < H.x1; x += 9) { SB.box(DARK, .35, .6, .35, x, .65, H.z0 - .3); SB.box(DARK, .35, .6, .35, x, .65, H.z1 + .3); }
  for (let z = H.z0 + 5; z < H.z1; z += 9) SB.box(DARK, .35, .6, .35, H.x1 + .3, .65, z);
  // pontoons and moored boats
  for (let x = -165; x <= 35; x += 40) for (const sgn of [-1, 1]) {
    const zq = sgn * H.z1;
    SB.setT(0, 0, 0, 0); SB.box(WOOD, 2.4, .3, 27, x, -1.05, zq - sgn * 13.5);
    for (let i = 0; i < 4; i++) for (const side of [-1, 1]) if (rnd() < .85) boat(x + side * 4.4 + rr(-.3, .3), zq - sgn * (4 + i * 6.2), side > 0 ? 0 : Math.PI, rr(5.5, 8));
  }
  for (let z = -30; z <= 30; z += 7.5) if (rnd() < .8) boat(H.x1 - 5, z, 0, rr(5, 7));
  // promenade palms, lamps, benches
  for (let x = H.x0 + 10, i = 0; x < H.x1 + 8; x += 13, i++) for (const sgn of [-1, 1]) {
    const z = sgn * (H.z1 + 7.6);
    if (i % 3 === 1) lamp(x, z, 0, -sgn); else palm(x, z);
    if (i % 3 === 2) bench(x + 6, sgn * (H.z1 + 2.6), sgn > 0 ? 0 : Math.PI);
  }
  for (let z = -40, i = 0; z <= 40; z += 13, i++) { if (i % 3 === 1) lamp(H.x1 + 7.6, z, -1, 0); else palm(H.x1 + 7.6, z); }
  // canopy on the east quay
  SB.setT(H.x1 + 5, 0, 24, 0);
  for (const a of [[-3.6, -9], [3.6, -9], [-3.6, 9], [3.6, 9]]) SB.box(col(0xc9ccd0), .22, 5.5, .22, a[0], 2.75, a[1]);
  SB.box(col(0xb9c4cc), 8.6, .22, 21, 0, 5.6, 0, MAT.glass);
  for (const a of [[-3.6, -9], [3.6, -9], [-3.6, 9], [3.6, 9]]) addCircle(H.x1 + 5 + a[0], 24 + a[1], .25);
  // fort at the north side of the harbour mouth
  const FS = col(0xcdb894), FS2 = col(0xb7a07a);
  SB.setT(-216, 0, -62, 0);
  SB.box(FS2, 50, 5, 44, 0, -.5, 0); SB.box(FS, 44, 11, 38, 0, 6.5, 0);
  for (let i = -5; i <= 5; i++) { SB.box(FS, 2.2, 1.4, 1, i * 4, 12.7, 18.5); SB.box(FS, 2.2, 1.4, 1, i * 4, 12.7, -18.5); }
  for (let i = -4; i <= 4; i++) { SB.box(FS, 1, 1.4, 2.2, -21.5, 12.7, i * 4); SB.box(FS, 1, 1.4, 2.2, 21.5, 12.7, i * 4); }
  SB.geo(FS2, gCyl(9, 10, 21, 14), M4(-20, 9.5, 17)); SB.geo(FS, gCyl(10, 9, 1.6, 14), M4(-20, 20.6, 17));
  SB.box(col(0xe8e2d2), .2, 9, .2, -20, 25.8, 17); SB.box(col(0x2f6f9f), 3.2, 1.8, .06, -18.3, 29.2, 17);
  // lighthouse on the south side
  SB.setT(-214, 0, 62, 0);
  SB.box(FS2, 44, 5, 12, 2, -1.4, 0);
  SB.geo(WHITE, gCyl(2.4, 3.4, 18, 12), M4(-14, 10, 0)); SB.geo(col(0xb3362e), gCyl(2.75, 2.95, 4, 12), M4(-14, 9, 0));
  SB.geo(DARK, gCyl(3, 3, .4, 12), M4(-14, 19.2, 0)); SB.geo(BULBC, gCyl(1.5, 1.5, 2.4, 10), M4(-14, 20.6, 0), MAT.bulb); SB.geo(col(0xb3362e), new T.ConeGeometry(2.2, 2, 10), M4(-14, 22.8, 0));
}

/* ---------- park: Butterfly Square ---------- */
function park(X0, X1, Z0, Z1) {
  const x0 = X0 + INSET, x1 = X1 - INSET, z0 = Z0 + INSET, z1 = Z1 - INSET, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  FB.setT(0, 0, 0, 0); FB.box(GRASSC, x1 - x0, .04, z1 - z0, cx, .02, cz);
  FB.box(PROMC, x1 - x0, .04, 4, cx, .03, cz); FB.box(PROMC, 4, .04, z1 - z0, cx, .03, cz);
  FB.geo(PROMC, new T.CylinderGeometry(8, 8, .04, 20), M4(cx, .035, cz));
  SB.setT(cx, 0, cz, 0);
  SB.geo(STONE, gCyl(3.6, 3.8, .7, 18), M4(0, .35, 0)); SB.geo(col(0x4fa8c8), gCyl(3.2, 3.2, .1, 18), M4(0, .68, 0), MAT.glass);
  SB.geo(STONE, gCyl(.5, .7, 2.2, 10), M4(0, 1.3, 0)); SB.geo(STONE, gCyl(1.5, .4, .3, 12), M4(0, 2.4, 0));
  addCircle(cx, cz, 3.9);
  for (let i = 0; i < 26; i++) { const x = rr(x0 + 2, x1 - 2), z = rr(z0 + 2, z1 - 2); if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4 || Math.hypot(x - cx, z - cz) < 10) continue; if (rnd() < .3) palm(x, z); else tree(x, z, 1.1); }
  for (const a of [[-10, 3.2, Math.PI], [10, 3.2, Math.PI], [-10, -3.2, 0], [10, -3.2, 0], [3.2, 14, -Math.PI / 2], [-3.2, -14, Math.PI / 2]]) bench(cx + a[0], cz + a[1], a[2]);
  for (const a of [[-20, 0, 1, 0], [20, 0, -1, 0], [0, -17, 0, 1], [0, 17, 0, -1]]) lamp(cx + a[0], cz + a[1] + (a[0] ? 2.6 : 0), 0, 0);
  signs.push({ x: cx, y: 2.2, z: z1 + .05, ry: 0, w: 7, name: 'BUTTERFLY SQUARE', post: true });
}

/* ---------- hills, landmark, island ---------- */
function hillH(x, z, R, H, sd, smooth) {   // smooth = no flat top with a step at its rim (islands)
  const d = Math.hypot(x, z) / R; if (d >= 1) return -1;
  const n = .5 + .5 * Math.sin(x * .031 + sd) * Math.cos(z * .027 + sd * 1.7) + .18 * Math.sin((x + z) * .09 + sd * 2.3);
  const f = d < .2 ? 1 : Math.pow(1 - (d - .2) / .8, 1.35);
  return H * f * (d < .2 && !smooth ? 1 : (.78 + .22 * n));
}
export const HILLS = [];
// height of the land at a point: 0 in the city, higher on the hills
// The height of the ground. A hill is drawn as a grid of flat triangles, so the height is read off those same triangles:
// what you stand on is then exactly what you see, with no sinking in or floating where the smooth formula and the drawn shape differ.
// The big road bridge (see lair.js): its two ramps are solid ground; the deck counts only for something that is already up there (y given),
// so the hide-out under it stays at ground level.
export const BRG = { on: false, x: 0, z: 0, L: 0, W: 0, TOP: 0, BL: 0, phys: [] };
export function bridgeH(x, z, y) {
  const B = BRG; if (!B.on) return 0; const dx = Math.abs(x - B.x); if (dx > B.L / 2 + B.BL || Math.abs(z - B.z) > B.W / 2) return 0;
  if (dx <= B.L / 2) return y !== undefined && y > B.TOP - 2.4 ? B.TOP + .06 : 0;
  return B.TOP * (1 - (dx - B.L / 2) / B.BL) + .06;
}
export function landHeight(x, z, y) {
  let h = 0;
  for (const q of HILLS) {
    const lx = x - q.cx, lz = z - q.cz; if (Math.abs(lx) > q.R * 1.1 || Math.abs(lz) > q.R * 1.1) continue;
    let v;
    if (q.hs) { const n = q.seg, s = q.R * 2.2 / n, gx = (lx + q.R * 1.1) / s, gz = (lz + q.R * 1.1) / s, ix = Math.min(n - 1, Math.max(0, Math.floor(gx))), iz = Math.min(n - 1, Math.max(0, Math.floor(gz))), u = gx - ix, w = gz - iz, n1 = n + 1;
      const a = q.hs[ix + n1 * iz], b = q.hs[ix + n1 * (iz + 1)], c = q.hs[ix + 1 + n1 * (iz + 1)], d = q.hs[ix + 1 + n1 * iz];
      v = (u + w <= 1 ? a + (d - a) * u + (b - a) * w : c + (b - c) * (1 - u) + (d - c) * (1 - w)) - .3; }
    else v = hillH(lx, lz, q.R, q.H, q.sd, q.smooth) - .3;
    if (v > h) h = v;
  }
  if (BRG.on) { const b = bridgeH(x, z, y); if (b > h) h = b; }
  return h;
}
// Solid things up on roofs. roofPush moves a person standing at height y out of any of them (r = how wide the person is).
const ROOFS = new Map();
function roofAdd(x0, z0, x1, z1, y0, y1) { const it = { x0, z0, x1, z1, y0, y1 }; for (let ix = Math.floor(x0 / 24); ix <= Math.floor(x1 / 24); ix++) for (let iz = Math.floor(z0 / 24); iz <= Math.floor(z1 / 24); iz++) { const k = ix * 4096 + iz; let a = ROOFS.get(k); if (!a) ROOFS.set(k, a = []); a.push(it); } }
export function roofPush(p, y, r) {
  let hit = false;
  for (let ix = Math.floor((p.x - r) / 24); ix <= Math.floor((p.x + r) / 24); ix++) for (let iz = Math.floor((p.z - r) / 24); iz <= Math.floor((p.z + r) / 24); iz++) { const a = ROOFS.get(ix * 4096 + iz); if (!a) continue;
    for (const it of a) { if (y > it.y1 - .35 || y + 1.5 < it.y0) continue;   // standing on top of it, or it is overhead
      const qx = Math.max(it.x0, Math.min(it.x1, p.x)), qz = Math.max(it.z0, Math.min(it.z1, p.z)), dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz; if (d2 >= r * r) continue; hit = true;
      if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
      else { const l = p.x - it.x0, rr_ = it.x1 - p.x, n = p.z - it.z0, f = it.z1 - p.z, m = Math.min(l, rr_, n, f); if (m > 3) continue;   /* deep inside something big: leave him be */ if (m === l) p.x = it.x0 - r; else if (m === rr_) p.x = it.x1 + r; else if (m === n) p.z = it.z0 - r; else p.z = it.z1 + r; } } }
  return hit;
}
// Hedges and bushes: not walls and not thin air. A car pushes through and loses speed, a person wades through slowly.
const HEDGES = new Map();
function hedgeBox(w, h, d, x, y, z) { SB.box(HEDGE, w, h, d, x, y, z); const it = { x0: x - w / 2 - .15, x1: x + w / 2 + .15, z0: z - d / 2 - .15, z1: z + d / 2 + .15 }; for (let ix = Math.floor(it.x0 / 24); ix <= Math.floor(it.x1 / 24); ix++) for (let iz = Math.floor(it.z0 / 24); iz <= Math.floor(it.z1 / 24); iz++) { const k = ix * 4096 + iz; let a = HEDGES.get(k); if (!a) HEDGES.set(k, a = []); a.push(it); } }
export function inHedge(x, z) { const a = HEDGES.get(Math.floor(x / 24) * 4096 + Math.floor(z / 24)); if (a) for (const it of a) if (x > it.x0 && x < it.x1 && z > it.z0 && z < it.z1) return true; return false; }
// How high the walking surface stands above ground level at a point: the top of the highest flat slab drawn there (0 where there is none).
const SLABS = new Map(), SG = 24;
export const SLABL = [];   // every flat slab (road, pavement, square), for the physics engine
function slabAdd(x0, z0, x1, z1, top) { const it = { x0, z0, x1, z1, top }; SLABL.push(it); for (let ix = Math.floor(x0 / SG); ix <= Math.floor(x1 / SG); ix++) for (let iz = Math.floor(z0 / SG); iz <= Math.floor(z1 / SG); iz++) { const k = ix * 4096 + iz; let a = SLABS.get(k); if (!a) SLABS.set(k, a = []); a.push(it); } }
export function kerbH(x, z) { const a = SLABS.get(Math.floor(x / SG) * 4096 + Math.floor(z / SG)); let h = 0; if (a) for (const it of a) if (it.top > h && x >= it.x0 && x <= it.x1 && z >= it.z0 && z <= it.z1) h = it.top; return h; }
export function inWater(x, z) { return x < COAST || (x < HARB.x1 && z > HARB.z0 && z < HARB.z1); }
function rockHill(scene, cx, cz, R, H, sd, green, smooth) {
  const hill = { cx, cz, R, H, sd, smooth }; HILLS.push(hill);
  const seg = MOBILE ? 20 : 40, g = new T.PlaneGeometry(R * 2.2, R * 2.2, seg, seg).rotateX(-Math.PI / 2), P = g.attributes.position, cs = [], hs = new Float32Array(P.count);
  const lime = new T.Color(0xd9d3c3), scrub = new T.Color(green || 0x7f8c58), tmp = new T.Color();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), h = hillH(x, z, R, H, sd, smooth); P.setY(i, h < 0 ? -4 : h); hs[i] = h < 0 ? -4 : h;
    const k = Math.max(0, Math.min(1, .5 + .5 * Math.sin(x * .05 + sd * 3) * Math.cos(z * .06 + sd) + (h / H - .5) * .5));
    tmp.copy(scrub).lerp(lime, k); cs.push(tmp.r, tmp.g, tmp.b);
  }
  g.setAttribute('color', new T.Float32BufferAttribute(cs, 3)); g.computeVertexNormals();
  hill.hs = hs; hill.seg = seg;   // from here on the height of this hill is read off the drawn triangles
  const m = new T.Mesh(g, MAT.rock); m.position.set(cx, -.3, cz); m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m);
}
function landmark(cx, cz, y) {
  const A = col(0xefe6d2), Bc = col(0xb98a5e), GOLD = col(0xe6b84a), COP = col(0x5f9f8a);
  SB.setT(cx, y, cz, 0);
  SB.geo(col(0xcfc6b0), gCyl(22, 23, 1.2, 20), M4(0, -.2, 0));
  addBox(cx - 19, cz - 7.6, cx + 11, cz + 7.6, y + 14); addBox(cx + 7.5, cz - 4.6, cx + 16.5, cz + 4.6, y + 62);
  SB.box(A, 30, 13, 15, -4, 6.5, 0);
  for (let i = 0; i < 5; i++) SB.box(Bc, 30.3, .9, 15.3, -4, 1.6 + i * 2.6, 0);
  SB.box(TILE, 31, .6, 16, -4, 13.3, 0);
  for (let i = -3; i <= 3; i++) { SB.box(LITC, 1.4, 4.5, .2, -4 + i * 3.8, 7, 7.6, MAT.lit); SB.box(LITC, 1.4, 4.5, .2, -4 + i * 3.8, 7, -7.6, MAT.lit); }
  SB.geo(A, gCyl(6.5, 6.5, 5, 16), M4(-12, 16, 0)); SB.geo(COP, new T.SphereGeometry(6.8, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M4(-12, 18.5, 0));
  SB.geo(GOLD, new T.SphereGeometry(.9, 10, 8), M4(-12, 26, 0), MAT.gold);
  // tower
  SB.box(A, 9, 40, 9, 12, 20, 0);
  for (let i = 0; i < 13; i++) SB.box(Bc, 9.25, 1, 9.25, 12, 2 + i * 3, 0);
  for (const a of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) SB.box(A, 1.6, 7, 1.6, 12 + a[0], 43.5, a[1]);
  SB.box(LITC, 5, 5, 5, 12, 43, 0, MAT.lit);
  SB.box(Bc, 10, 1, 10, 12, 47.5, 0);
  SB.geo(A, gCyl(3.6, 4.4, 5, 12), M4(12, 50.5, 0)); SB.geo(GOLD, new T.SphereGeometry(3.7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M4(12, 53, 0), MAT.gold);
  SB.geo(GOLD, gCyl(.35, .6, 5, 8), M4(12, 58.5, 0), MAT.gold); SB.geo(GOLD, new T.SphereGeometry(1.5, 12, 10), M4(12, 62, 0), MAT.gold);
}

/* ---------- sign textures ---------- */
const signTex = {};
function makeSigns(scene) {
  for (const s of signs) {
    if (!signTex[s.name]) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 64; const x = c.getContext('2d');
      x.fillStyle = s.bg || (s.post ? '#1f4f3a' : '#22242a'); x.fillRect(0, 0, 512, 64); x.fillStyle = s.fg || (s.post ? '#f4efe2' : '#f0d28a');
      x.font = 'bold 40px Georgia,serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s.name, 256, 34, 490);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; signTex[s.name] = new T.MeshBasicMaterial({ map: t });
    }
    const m = new T.Mesh(new T.PlaneGeometry(s.w, s.w / 8), signTex[s.name]);
    m.position.set(s.x, s.y, s.z); m.rotation.y = s.ry; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); G.cells.push({ m, x: s.x, z: s.z, r: 6, v: s.w > 8 ? 0 : 260 });   // small signs far away are not drawn
    if (s.post) { SB.setT(s.x, 0, s.z, 0); SB.box(DARK, .14, 2.8, .14, -s.w / 2 + .2, 1.4, -.1); SB.box(DARK, .14, 2.8, .14, s.w / 2 - .2, 1.4, -.1); }
  }
}

/* ---------- build everything ---------- */
export function buildWorld(scene, models) {
  prepModels(models); NATOK = !!models.nat; setDensity(MOBILE ? .5 : 1);
  // land
  FB.setT(0, 0, 0, 0);
  const LX1 = 241, LZ = 21 - ZMIN, LZS = ZMAX + 21;
  FB.box(PAVEC, LX1 - COAST, 6, LZ - 45, (COAST + LX1) / 2, -3, -(45 + LZ) / 2);
  FB.box(PAVEC, LX1 - COAST, 6, LZS - 45, (COAST + LX1) / 2, -3, (45 + LZS) / 2);
  FB.box(PAVEC, LX1 - HARB.x1, 6, 90, (HARB.x1 + LX1) / 2, -3, 0);
  const SCRUB = col(0xa39a72);
  // the open land round the old city: three pieces that meet the city's own ground edge to edge at the same height, so roads and fields lie flat on it with no gap underneath
  FB.box(SCRUB, 1620, 6, 3400, LX1 + 810, -3, 0); FB.box(SCRUB, LX1 - COAST - .5, 6, 1340, (COAST + .5 + LX1) / 2, -3, -LZ - 670); FB.box(SCRUB, LX1 - COAST - .5, 6, 1340, (COAST + .5 + LX1) / 2, -3, LZS + 670);
  // pavement loops, blocks
  for (let i = 0; i + 1 < XS.length; i++) for (let j = 0; j + 1 < ZS.length; j++) {
    const X0 = XS[i], X1 = XS[i + 1], Z0 = ZS[j], Z1 = ZS[j + 1];
    if (!(X1 <= XOLD && Z0 >= ZMIN && Z1 <= ZMAX)) { bigCityBlock(i, j, X0, X1, Z0, Z1); continue; }   // everything outside the old city
    if (Z0 >= -65 && Z1 <= 65 && X0 < 80) continue;
    if (Z1 <= -195 && X0 === -180) { if (Z0 === ZMIN) beach(); continue; }
    loops.push({ x0: X0 + RH + 2.2, x1: X1 - RH - 2.2, z0: Z0 + RH + 2.2, z1: Z1 - RH - 2.2, P: 2 * (X1 - X0 + Z1 - Z0 - 4 * (RH + 2.2)) });
    // kerbs
    SB.setT(0, 0, 0, 0);
    const kx0 = X0 + RH, kx1 = X1 - RH, kz0 = Z0 + RH, kz1 = Z1 - RH, KC = col(0xb9b1a0);
    SB.box(KC, kx1 - kx0, .13, .3, (kx0 + kx1) / 2, .065, kz0 + .15); SB.box(KC, kx1 - kx0, .13, .3, (kx0 + kx1) / 2, .065, kz1 - .15);
    SB.box(KC, .3, .13, kz1 - kz0, kx0 + .15, .065, (kz0 + kz1) / 2); SB.box(KC, .3, .13, kz1 - kz0, kx1 - .15, .065, (kz0 + kz1) / 2);
    if (X0 === 150 && Z0 === -65) { park(X0, X1, Z0, Z1); continue; }
    if (Z0 >= 195 && X1 <= -20) { docks(X0, X1, Z0, Z1); continue; }
    if (Z1 <= -195 && X0 === -100) { villas(X0, X1, Z0, Z1); continue; }
    if (Z1 <= -195) { if (KIT && Z1 === -195) brickBlock(X0, X1, Z0, Z1); else downtown(X0, X1, Z0, Z1); continue; }
    block(X0, X1, Z0, Z1, { n: Z0 === 65 ? .9 : (Z0 === 0 ? .8 : undefined), s: Z1 === -65 ? .9 : (Z1 === 0 ? .8 : undefined), w: X0 === 80 && Z0 >= -65 && Z1 <= 65 ? .9 : undefined });
  }
  // outer rows that close the city
  airport();
  addBig(1640, -3000, 2900, 3000); addBig(-600, -3000, 300, -612); addBig(-600, -3000, 3000, -1100); addBig(-600, 1100, 3000, 3000);   // the edges of the world
  big.push({ b: 1, x0: -2000, z0: -2000, x1: COAST, z1: 2000, sea: true }); big.push({ b: 1, x0: -400, z0: HARB.z0, x1: HARB.x1, z1: HARB.z1, sea: true });
  // sea wall on the west coast
  SB.setT(0, 0, 0, 0);
  SB.box(STONE, .6, 1, 160, COAST + .3, .5, -125); SB.box(STONE, .6, 1, 210, COAST + .3, .5, -507); SB.setT(COAST + .3, 0, 705, 0); SB.box(STONE, .6, 1, 590, 0, .5, 0); SB.setT(0, 0, 0, 0); SB.box(STONE, .6, 1, LZS - 45, COAST + .3, .5, (45 + LZS) / 2);
  for (let z = 60; z < 200; z += 14) { palm(COAST + 2.6, z); palm(COAST + 2.6, -z); }
  cargoShip(-214, 262);
  roads();
  trafficLights();
  harbour();
  monorail();
  busStops();
  // pavement loops for doors and parking slots
  for (const d of doors) { const r = nearestLoop(d.x, d.z); d.loop = r.loop; d.u = r.u; d.ok = r.d < 4; }
  for (const s of slots) { const r = nearestLoop(s.px, s.pz); s.loop = r.loop; s.u = r.u; }
  // landmark hill and far hills
  const HX = 372, HZc = 0, HR = 128, HH = 80;
  rockHill(scene, HX, HZc, HR, HH, 1.3);
  landmark(HX, HZc, HH - .3);
  const far = [[2050, -950, 380, 210, 2.1], [2120, -150, 420, 240, 4.4], [2060, 620, 400, 220, 6.2], [1750, 1480, 380, 200, 8.8], [-60, -1080, 270, 120, 3.3], [900, 1560, 420, 190, 5.7], [150, 1500, 340, 150, 7.1], [1000, -1560, 420, 220, 9.9], [1800, -1500, 360, 180, 1.9]];
  for (const f of far) rockHill(scene, f[0], f[1], f[2], f[3], f[4]);
  rockHill(scene, -560, 70, 80, 20, 5.1, 0xa59a7a);
  SB.setT(-560, 19, 70, .5); SB.box(col(0xcdb894), 26, 9, 20, 0, 4, 0); SB.geo(col(0xb7a07a), gCyl(5, 5.5, 14, 12), M4(11, 6.5, 8));
  // two islands off the coast: one with a lighthouse, one with palms and a hut. Reach them by boat (then swim ashore) or helicopter
  rockHill(scene, -330, 330, 60, 13, 2.7, 0x8a9a5e, true); lighthouse(-330, 330);
  rockHill(scene, -400, -250, 75, 16, 6.3, 0x93a060, true);
  for (let i = 0; i < 9; i++) { const a = i * 2.4, d = 14 + (i % 3) * 9, x = -400 + Math.cos(a) * d, z = -250 + Math.sin(a) * d, y = landHeight(x, z); if (y > 1) palm(x, z, 5 + (i % 3), y - .4); }
  if (NATOK) { scatter(-425, -275, -375, -225, 77, 'park'); }
  { const y = landHeight(-400, -250); SB.setT(-400, y - .3, -250, .6); SB.box(WOOD, 5, 2.6, 4, 0, 1.3, 0); SB.box(TILE, 5.8, .3, 4.8, 0, 2.75, 0); SB.box(DARK, 1, 1.9, .1, 0, .95, 2.03); }
  armyBase(scene);
  jail(scene);
  signs.push({ x: 95, y: 5.4, z: -74.7, ry: 0, w: 7, name: 'POLICE STATION', bg: '#17409a', fg: '#ffffff' });
  signs.push({ x: 115, y: 5.4, z: -139.7, ry: 0, w: 6, name: 'HOSPITAL', bg: '#f4f4f0', fg: '#c8102e' });
  makeSigns(scene);
  finishKit(scene);
  SB.build(scene); FB.build(scene); PB.build(scene);
  if (NATOK) buildNature(scene, models.nat, (x, z) => landHeight(x, z), addCircle);
}

function lighthouse(x, z) {
  const y = landHeight(x, z) - .4, RED = col(0xc8102e);
  SB.setT(0, 0, 0, 0);
  SB.geo(STONE, gCyl(4.2, 4.6, 1.6, 14), M4(x, y + .8, z));
  for (let k = 0; k < 5; k++) SB.geo(k % 2 ? RED : WHITE, gCyl(2.6 - k * .25, 2.85 - k * .25, 3.6, 14), M4(x, y + 3.4 + k * 3.6, z));
  SB.geo(DARK, gCyl(2.3, 2.3, .3, 14), M4(x, y + 19.75, z)); SB.geo(BULBC, gCyl(1.1, 1.1, 1.8, 10), M4(x, y + 20.8, z)); SB.geo(RED, gCyl(.2, 1.7, 1.3, 12), M4(x, y + 22.3, z));
  addCircle(x, z, 3);
}
/* ---------- the north: beach, villas, downtown, airport ---------- */
const SAND = col(0xe9dcae), PARA = [0xd9463c, 0x2f8fbf, 0xe8b21f, 0x3fa56a, 0xf2f0e8, 0xe0703a].map(col), POOL = col(0x3fb6d8), HEDGE = col(0x3f7a3a);
// one long beach from the old town up to the airport: sand down to the water, parasols, sunbeds, palms, two beach bars
function beach() {
  const x0 = COAST, x1 = -110, z0 = ZMIN - 11, z1 = -205;
  FB.setT(0, 0, 0, 0); FB.box(SAND, x1 - x0, .1, z1 - z0, (x0 + x1) / 2, .05, (z0 + z1) / 2);
  for (let z = z0 + 8; z < z1 - 4; z += 9) for (let x = x0 + 7; x < x1 - 14; x += 10) {
    if (rnd() < .3) continue; const px = x + rr(-2, 2), pz = z + rr(-2, 2), c = pick(PARA);
    SB.setT(px, 0, pz, rr(0, 3)); SB.box(WHITE, .08, 2.2, .08, 0, 1.1, 0); SB.geo(c, gCyl(.1, 1.7, .55, 10), M4(0, 2.35, 0));
    SB.box(WHITE, 1.9, .12, .6, 1.3, .3, .5); SB.box(c, 1.9, .05, .6, 1.3, .38, .5); if (rnd() < .6) { SB.box(WHITE, 1.9, .12, .6, 1.3, .3, -.5); SB.box(c, 1.9, .05, .6, 1.3, .38, -.5); }
    addCircle(px, pz, .2);
  }
  for (let z = z0 + 14; z < z1; z += 22) { palm(x1 - 5, z + rr(-3, 3)); palm(x1 - 12 + rr(-2, 2), z + 11); }
  for (const bz of [-255, -345]) {   // beach bars
    SB.setT(x1 - 9, 0, bz, 0); SB.box(WOOD, 7, 1.1, 4, 0, .55, 0); SB.box(WHITE, 7.4, .12, 4.4, 0, 1.16, 0); for (const sx of [-3.3, 3.3]) for (const sz of [-1.8, 1.8]) SB.box(WOOD, .16, 2.9, .16, sx, 1.45, sz);
    SB.geo(col(0xc9a35a), gCyl(.4, 5.4, 1.5, 4), M4(0, 3.6, 0, Math.PI / 4)); addBox(x1 - 12.5, bz - 2, x1 - 5.5, bz + 2, 3);
    signs.push({ x: x1 - 5.4, y: 2.2, z: bz, ry: Math.PI / 2, w: 3.6, name: bz === -255 ? 'BEACH BAR' : 'COCKTAILS', bg: '#1f8a8a', fg: '#ffffff' });
  }
  SB.setT(x0 + 9, 0, -300, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) SB.box(WHITE, .14, 3, .14, sx, 1.5, sz); SB.box(col(0xd9463c), 2.6, 1.2, 2.6, 0, 3.6, 0); SB.box(WHITE, 3, .12, 3, 0, 4.26, 0); addBox(x0 + 8, -301, x0 + 10, -299, 4);
}
// big white houses with pools and hedges
function villas(X0, X1, Z0, Z1) {
  const x0 = X0 + INSET + 1, x1 = X1 - INSET - 1, z0 = Z0 + INSET + 1, z1 = Z1 - INSET - 1, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  FB.setT(0, 0, 0, 0); FB.box(GRASSC, x1 - x0, .08, z1 - z0, mx, .04, mz);
  SB.setT(0, 0, 0, 0); hedgeBox(x1 - x0, 1.2, .6, mx, .6, mz); hedgeBox(.6, 1.2, z1 - z0, mx, .6, mz);
  for (const [cx, cz] of [[(x0 + mx) / 2, (z0 + mz) / 2], [(mx + x1) / 2, (z0 + mz) / 2], [(x0 + mx) / 2, (mz + z1) / 2], [(mx + x1) / 2, (mz + z1) / 2]]) {
    const w = rr(11, 14), d = rr(8, 10), two = rnd() < .6, wall = pick([WHITE, col(0xf3e6cf), col(0xf0d9c0)]), hx = cx - 4, hz = cz + (cz < mz ? -2 : 2);
    SB.setT(hx, 0, hz, 0); SB.box(wall, w, two ? 6.4 : 3.4, d, 0, two ? 3.2 : 1.7, 0); SB.box(TILE, w + .8, .35, d + .8, 0, (two ? 6.4 : 3.4) + .18, 0);
    SB.box(GLASSC, w * .5, 1.6, .12, 0, 1.5, d / 2 + .04); SB.box(GLASSC, w * .5, 1.6, .12, 0, 1.5, -d / 2 - .04); if (two) { SB.box(GLASSC, w * .7, 1.3, .12, 0, 4.7, d / 2 + .04); SB.box(GLASSC, w * .7, 1.3, .12, 0, 4.7, -d / 2 - .04); }
    SB.box(pick(DOORC), 1.1, 2.1, .14, w * .38, 1.05, (cz < mz ? d / 2 + .05 : -d / 2 - .05));
    addBox(hx - w / 2, hz - d / 2, hx + w / 2, hz + d / 2, two ? 6.8 : 3.8);
    const px = cx + 8, pz = cz + (cz < mz ? 4 : -4); FB.setT(0, 0, 0, 0); FB.box(WHITE, 7.6, .14, 4.6, px, .07, pz); FB.box(POOL, 6.6, .16, 3.6, px, .09, pz);
    palm(cx + 10, cz + (cz < mz ? -5 : 5), rr(5, 7));
  }
}
// glass towers
const TOWER = [0x3d5f78, 0x4f7186, 0x2f4a5f, 0x6a8799, 0x55707a, 0x39505f].map(col), BAND = col(0xd9dee2);
function tower(cx, cz, w, d, h, c) {
  SB.setT(cx, 0, cz, 0); SB.box(STONE, w + 1.4, 4.4, d + 1.4, 0, 2.2, 0); SB.box(DARK, w * .5, 3.2, d + 1.5, 0, 1.6, 0); SB.box(c, w, h, d, 0, h / 2 + 4.4, 0);
  for (let y = 8; y < h + 4; y += 3.6) SB.box(BAND, w + .16, .32, d + .16, 0, y, 0);
  SB.box(DARK, w * .6, 2.2, d * .6, 0, h + 5.5, 0); if (h > 60) SB.box(DARK, .3, 12, .3, 0, h + 12, 0);
  addBox(cx - w / 2 - .7, cz - d / 2 - .7, cx + w / 2 + .7, cz + d / 2 + .7, h + 4.4);
}
function downtown(X0, X1, Z0, Z1) {
  const x0 = X0 + INSET + 3, x1 = X1 - INSET - 3, z0 = Z0 + INSET + 3, z1 = Z1 - INSET - 3, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, W = x1 - x0, Dp = z1 - z0;
  FB.setT(0, 0, 0, 0); FB.box(col(0xc4c6c4), W + 6, .08, Dp + 6, mx, .04, mz);
  if (W > 60) { tower(x0 + W * .22, mz, W * .36, Dp * .7, rr(40, 95), pick(TOWER)); tower(x1 - W * .22, mz, W * .36, Dp * .7, rr(30, 75), pick(TOWER)); tree(mx, z0 + 4, 1.2); tree(mx, z1 - 4, 1.2); bench(mx, mz, Math.PI / 2); }
  else { tower(mx, mz - Dp * .08, W * .72, Dp * .62, rr(45, 110), pick(TOWER)); tree(x0 + 3, z1 - 3, 1.1); tree(x1 - 3, z1 - 3, 1.1); bench(mx, z1 - 2.5, 0); }
  for (const [lx, lz, dx, dz] of [[X0 + INSET - 1.4, mz, 1, 0], [X1 - INSET + 1.4, mz, -1, 0], [mx, Z0 + INSET - 1.4, 0, 1], [mx, Z1 - INSET + 1.4, 0, -1]]) lamp(lx, lz, dx, dz);
}
// the airport north of the city: one runway, a terminal, a control tower and a hangar
export const AIRPORT = { rx0: -150, rx1: 225, rz: -545, plane: { x: -70, z: -470 } };
function airport() {
  const A = AIRPORT; FB.setT(0, 0, 0, 0);
  FB.box(CONC, 241 - COAST, .06, 200, (241 + COAST) / 2, .03, -511);
  FB.box(ASPH, A.rx1 - A.rx0, .08, 24, (A.rx0 + A.rx1) / 2, .06, A.rz);
  for (let x = A.rx0 + 14; x < A.rx1 - 10; x += 16) FB.box(WHITE, 8, .1, .5, x, .08, A.rz);
  for (const ex of [A.rx0 + 4, A.rx1 - 4]) for (let k = -4; k <= 4; k++) FB.box(WHITE, 5, .1, 1.1, ex, .08, A.rz + k * 2.3);
  FB.box(YELLOW, .4, .1, 60, A.plane.x, .08, -500);
  SB.setT(140, 0, -440, 0); SB.box(WHITE, 70, 9, 18, 0, 4.5, 0); SB.box(GLASSC, 66, 5, .2, 0, 4.2, -9.1); SB.box(GLASSC, 66, 5, .2, 0, 4.2, 9.1); SB.box(col(0x6a7178), 72, .6, 20, 0, 9.3, 0); addBox(105, -449, 175, -431, 10);
  signs.push({ x: 140, y: 11, z: -430.8, ry: Math.PI, w: 16, name: 'PAPILLON AIRPORT', bg: '#17409a', fg: '#ffffff' });
  SB.setT(70, 0, -440, 0); SB.geo(WHITE, gCyl(2.6, 3.2, 22, 12), M4(0, 11, 0)); SB.geo(GLASSC, gCyl(4.6, 3.6, 3, 12), M4(0, 23.5, 0)); SB.geo(DARK, gCyl(4.9, 4.9, .4, 12), M4(0, 25.2, 0)); SB.box(DARK, .2, 5, .2, 0, 28, 0); addCircle(70, -440, 3.4);
  SB.setT(-10, 0, -450, 0); SB.box(SHED[0], 34, 11, 1, 0, 5.5, 12); SB.box(SHED[0], 1, 11, 25, -16.5, 5.5, 0); SB.box(SHED[0], 1, 11, 25, 16.5, 5.5, 0); SB.box(col(0x6a7178), 36, .7, 27, 0, 11.3, 0);
  addBox(-27, -438.5, 7, -437.5, 12); addBox(-27, -462.5, -26, -437.5, 12); addBox(6, -462.5, 7, -437.5, 12);
  for (let x = -150; x <= 225; x += 25) { SB.setT(x, 0, A.rz - 14, 0); SB.box(DARK, .15, .5, .15, 0, .25, 0); SB.box(BULBC, .22, .12, .22, 0, .56, 0); SB.setT(x, 0, A.rz + 14, 0); SB.box(DARK, .15, .5, .15, 0, .25, 0); SB.box(BULBC, .22, .12, .22, 0, .56, 0); }
}

/* ---------- the abandoned army base ---------- */
// Out of the north-east gate a dirt road climbs a hill to an old military base. Crates there hold weapons and ammo (see shops.js).
export const GATE_Z = -195;
export const BASE = { x: 470, z: -270, crates: [] };
// Prison Island: a walled prison on a rock out in the bay. Get busted with three stars or more and you wake up in its yard.
// The gate in the east wall stands open; from the jetty below it a boat (or a long swim) takes you back to the city.
export const JAIL = { x: -360, z: 640, yard: { x: -360, z: 646 }, boat: { x: -259, z: 640 } };
// the wooden jetty of Prison Island: how high its deck is at a point (0 when you are not on it). It reaches from the shore out to the boat.
export function jettyH(x, z) { return x > JAIL.x + 60 && x < JAIL.x + 103.2 && Math.abs(z - JAIL.z) < 1.6 && landHeight(x, z) < .48 ? .48 : 0; }
// On a smooth island (Prison Island) the beach runs out flat and low to the water's edge. This gives the height of that ground
// (it can be a little below zero), or null when the point is not on such an island - so you can walk right down to the sea.
export function isleY(x, z) {
  for (const q of HILLS) { if (!q.smooth || !q.hs || q.cx > COAST) continue; const lx = x - q.cx, lz = z - q.cz; if (lx * lx + lz * lz > q.R * q.R * .955) continue;
    const n = q.seg, s = q.R * 2.2 / n, gx = (lx + q.R * 1.1) / s, gz = (lz + q.R * 1.1) / s, ix = Math.min(n - 1, Math.max(0, Math.floor(gx))), iz = Math.min(n - 1, Math.max(0, Math.floor(gz))), u = gx - ix, w = gz - iz, n1 = n + 1;
    const a = q.hs[ix + n1 * iz], b = q.hs[ix + n1 * (iz + 1)], c = q.hs[ix + 1 + n1 * (iz + 1)], d = q.hs[ix + 1 + n1 * iz], v = (u + w <= 1 ? a + (d - a) * u + (b - a) * w : c + (b - c) * (1 - u) + (d - c) * (1 - w)) - .3;
    return v > -.45 ? v : null; }
  return null;
}
function jail(scene) {
  const J = JAIL, STONE = col(0xb9b1a0), STONE2 = col(0x9d9686), ROOF = col(0x5a5f66), BAR = col(0x23262b), LIT = col(0xe9e2c8);
  rockHill(scene, J.x, J.z, 90, 7, 3.4, 0x99a070, true);
  const low = (x0, z0, x1, z1) => Math.min(landHeight(x0, z0), landHeight(x1, z1), landHeight((x0 + x1) / 2, (z0 + z1) / 2)) - .6;
  const wall = (x0, z0, x1, z1, h) => { const y = low(x0, z0, x1, z1), top = Math.max(landHeight(x0, z0), landHeight(x1, z1), landHeight((x0 + x1) / 2, (z0 + z1) / 2)) + h, w = Math.abs(x1 - x0) + .9, d = Math.abs(z1 - z0) + .9;
    SB.setT((x0 + x1) / 2, y, (z0 + z1) / 2, 0); SB.box(STONE, w, top - y, d, 0, (top - y) / 2, 0); SB.box(STONE2, w + .3, .35, d + .3, 0, top - y + .17, 0); SB.box(BAR, w > d ? w : .12, .5, w > d ? .12 : d, 0, top - y + .6, 0);   // stone, a cap, and wire on top
    addBox(Math.min(x0, x1) - .45, Math.min(z0, z1) - .45, Math.max(x0, x1) + .45, Math.max(z0, z1) + .45, 9); };
  const W = 24, D = 20;   // half the size of the yard
  wall(J.x - W, J.z - D, J.x + W, J.z - D, 5.5); wall(J.x - W, J.z + D, J.x + W, J.z + D, 5.5); wall(J.x - W, J.z - D, J.x - W, J.z + D, 5.5);
  wall(J.x + W, J.z - D, J.x + W, J.z - 3.2, 5.5); wall(J.x + W, J.z + 3.2, J.x + W, J.z + D, 5.5);   // the east wall, with the gate gap in the middle
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const x = J.x + sx * W, z = J.z + sz * D, y = landHeight(x, z) - .6;   // a watchtower on every corner
    SB.setT(x, y, z, 0); SB.box(STONE2, 3.4, 10.5, 3.4, 0, 5.25, 0); SB.box(BAR, 3.9, 1.3, 3.9, 0, 10.2, 0); SB.box(ROOF, 4.6, .4, 4.6, 0, 11.6, 0); SB.box(LIT, 1, .5, 1, 0, 11, 0); addBox(x - 1.7, z - 1.7, x + 1.7, z + 1.7, 11); }
  { const x = J.x + W, y = landHeight(x, J.z) - .4; SB.setT(x, y, J.z, 0); SB.box(STONE2, 1.2, .8, 8.2, 0, 6.6, 0); SB.box(BAR, .25, 5.6, 2.9, .4, 3, -4.6); }   // the lintel over the gate and the gate leaf swung open
  { const x = J.x - 4, z = J.z - 11, y = landHeight(x, z) - .8;   // the cell block
    SB.setT(x, y, z, 0); SB.box(STONE, 30, 8.5, 9, 0, 4.25, 0); SB.box(ROOF, 30.8, .5, 9.8, 0, 8.7, 0);
    for (const yy of [2.6, 5.9]) for (let k = -6; k <= 6; k++) { if (yy < 3 && k === 0) continue; SB.box(BAR, 1.1, 1.3, .12, k * 2.2, yy, 4.52); for (const o of [-.3, 0, .3]) SB.box(STONE2, .07, 1.3, .16, k * 2.2 + o, yy, 4.56); }
    SB.box(BAR, 1.6, 2.6, .14, 0, 1.5, 4.53); addBox(x - 15, z - 4.5, x + 15, z + 4.5, 9); }
  { const x = J.x + 14, z = J.z + 12, y = landHeight(x, z) - .5;   // the warders' office, a bench, a weights rack and a basketball hoop in the yard
    SB.setT(x, y, z, 0); SB.box(STONE2, 9, 4, 7, 0, 2, 0); SB.box(ROOF, 9.6, .35, 7.6, 0, 4.15, 0); SB.box(BAR, 1.2, 2.2, .12, -2, 1.3, -3.52); SB.box(GLASSC, 3, 1.1, .1, 1.8, 2.3, -3.52); addBox(x - 4.5, z - 3.5, x + 4.5, z + 3.5, 5); }
  { const x = J.x - 16, z = J.z + 13, y = landHeight(x, z) - .1; SB.setT(x, y, z, 0); SB.box(BAR, .2, 3.6, .2, 0, 1.8, 0); SB.box(LIT, 1.9, 1.2, .1, 0, 3.6, .3); SB.box(col(0xd2552a), .9, .08, .9, 0, 3.15, .8); addCircle(x, z, .3);
    SB.setT(x + 9, landHeight(x + 9, z + 2) - .1, z + 2, 0); SB.box(WOOD, 2.2, .1, .5, 0, .5, 0); SB.box(BAR, .1, .5, .5, -.9, .25, 0); SB.box(BAR, .1, .5, .5, .9, .25, 0); addCircle(x + 9, z + 2, .8); }
  // the path from the gate down to the jetty, and the jetty itself
  for (let x = J.x + W + 2; x < J.x + 80; x += 3) { const y = landHeight(x, J.z); if (y < .2) break; SB.setT(x, y - .25, J.z, 0); SB.box(STONE2, 3.1, .4, 2.6, 0, .2, 0); }
  SB.setT(J.x + 87, 0, J.z, 0); SB.box(WOOD, 32, .25, 3, 0, .35, 0); for (const k of [-14, -7, 0, 7, 14]) for (const o of [-1.3, 1.3]) SB.box(DARK, .3, 2.6, .3, k, -.8, o);   // out over the beach and well into the water, where the boat lies
  SB.setT(J.x + 68, 0, J.z, 0); SB.box(WOOD, 14, .25, 3, 0, .35, 0);   // the deck runs back over the beach, so you walk straight from the path onto it
  for (const k of [76, 102]) { SB.setT(J.x + k, 0, J.z + 1.35, 0); SB.box(DARK, .14, 3.2, .14, 0, 2, 0); SB.box(BULBC, .3, .3, .3, 0, 3.6, 0, MAT.bulb); }   // two lamps on the jetty
  SB.setT(J.x + 101.5, 0, J.z + 1.1, 0); SB.box(col(0xd9d2c0), .5, .5, .5, 0, .72, 0); SB.box(DARK, .12, .5, .12, 0, .72, .9);   // a coil of rope and a bollard at the end
  // in the yard: two canteen tables, a pull-up bar, a weights bench
  for (const [ox, oz] of [[-15, 1.5], [-9, 1.5]]) { const x = J.x + ox, z = J.z + oz, y = landHeight(x, z) - .05; SB.setT(x, y, z, 0); SB.box(STONE2, 2.4, .1, .9, 0, .74, 0); SB.box(BAR, .12, .74, .7, -.9, .37, 0); SB.box(BAR, .12, .74, .7, .9, .37, 0);
    for (const s of [-1, 1]) { SB.box(WOOD, 2.4, .08, .35, 0, .4, s * .85); SB.box(BAR, .1, .4, .3, -.9, .2, s * .85); SB.box(BAR, .1, .4, .3, .9, .2, s * .85); } addBox(x - 1.2, z - .45, x + 1.2, z + .45, 1); }
  { const x = J.x + 3, z = J.z + 15, y = landHeight(x, z) - .05; SB.setT(x, y, z, 0); SB.box(BAR, .12, 2.5, .12, -1, 1.25, 0); SB.box(BAR, .12, 2.5, .12, 1, 1.25, 0); SB.box(BAR, 2.2, .08, .08, 0, 2.45, 0); addCircle(x - 1, z, .2); addCircle(x + 1, z, .2); }
  { const x = J.x - 1.5, z = J.z + 16, y = landHeight(x, z) - .05; SB.setT(x, y, z, 0); SB.box(DARK, .5, .12, 1.5, 0, .45, 0); SB.box(BAR, .1, .45, .1, 0, .22, -.6); SB.box(BAR, .1, .45, .1, 0, .22, .6); SB.box(BAR, .08, .9, .08, -.45, .45, -.6); SB.box(BAR, .08, .9, .08, .45, .45, -.6); SB.box(BAR, 1.7, .06, .06, 0, .92, -.6); for (const s of [-1, 1]) SB.box(DARK, .08, .44, .44, s * .78, .92, -.6); addCircle(x, z, .6); }
  // outside the gate: the guard booth with its barrier, a flagpole, and down by the jetty a boathouse with crates and fuel drums
  { const x = J.x + W + 4.5, z = J.z - 5.5, y = landHeight(x, z) - .4; SB.setT(x, y, z, 0); SB.box(STONE2, 2.4, 2.9, 2.4, 0, 1.45, 0); SB.box(ROOF, 3, .25, 3, 0, 3, 0); SB.box(GLASSC, 1.5, .9, .08, 0, 1.9, 1.22); SB.box(GLASSC, .08, .9, 1.5, 1.22, 1.9, 0); addBox(x - 1.2, z - 1.2, x + 1.2, z + 1.2, 3);
    SB.box(col(0xc8352b), .16, .16, 5, 1.6, 1.35, 3.9); SB.box(WHITE, .17, .17, 1, 1.6, 1.35, 3); SB.box(WHITE, .17, .17, 1, 1.6, 1.35, 5.2); SB.box(BAR, .25, 1.4, .25, 1.6, .7, 1.5); }   // the barrier, lifted out of the way
  { const x = J.x + W + 4, z = J.z + 7, y = landHeight(x, z) - .3; SB.setT(x, y, z, 0); SB.box(DARK, .14, 9, .14, 0, 4.5, 0); SB.box(col(0x2f62b5), 1.9, 1.1, .06, 1, 8.3, 0); SB.box(YELLOW, .5, .5, .07, 1, 8.3, 0); addCircle(x, z, .2); }
  { let hx = J.x + 60; while (hx > J.x + 40 && landHeight(hx, J.z + 6.5) < .9) hx -= 2; const x = hx, z = J.z + 6.5, y = landHeight(x, z) - .6;
    SB.setT(x, y, z, 0); SB.box(WOOD, 5, 3.2, 4, 0, 1.6, 0); SB.box(ROOF, 5.6, .3, 4.8, 0, 3.3, 0); SB.box(BAR, 1.1, 2.1, .1, -1, 1.4, -2.02); SB.box(GLASSC, 1.2, .8, .1, 1.2, 2.1, -2.02); addBox(x - 2.5, z - 2, x + 2.5, z + 2, 3.5);
    const cx = hx + 1, cz = J.z - 5, cy = landHeight(cx, cz) - .3; SB.setT(cx, cy, cz, 0); SB.box(col(0xa77a45), 1.1, 1.1, 1.1, 0, .55, 0); SB.box(col(0x9a6f3c), 1.1, 1.1, 1.1, 1.3, .55, .2); SB.box(col(0xb58a52), 1, 1, 1, .6, 1.6, .1);
    for (const [dx, dz, c] of [[-1.6, 0, 0xc8352b], [-1.6, 1, 0x2f62b5], [-2.5, .5, 0xc8352b]]) SB.box(col(c), .62, .95, .62, dx, .47, dz); addBox(cx - 2.9, cz - .7, cx + 2, cz + 1.4, 2); }
  signs.push({ x: J.x + W + .7, y: landHeight(J.x + W, J.z) + 7.3, z: J.z, ry: Math.PI / 2, w: 7.5, name: 'PAPILLON ISLAND PRISON', bg: '#2b2f36', fg: '#e9e2c8' });
}
function armyBase(scene) {
  rockHill(scene, BASE.x, BASE.z, 150, 26, 4.1, 0x8f8a62, true);
  // the dirt road: a ribbon laid on the ground from the gate to the top
  const path = [[224, GATE_Z], [262, GATE_Z - 2], [305, -207], [352, -226], [400, -247], [440, -262], [462, -268]], pos = [], W = 3.6, DIRT = new T.Color(0x8c7b5a);
  BASE.path = path; let prev = null;
  for (let i = 0; i + 1 < path.length; i++) { const a = path[i], b = path[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 1.5), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
    for (let k = (i ? 1 : 0); k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n, l = [x + dz * W, 0, z - dx * W], r = [x - dz * W, 0, z + dx * W], c = [x, landHeight(x, z) + .08, z]; l[1] = landHeight(l[0], l[2]) + .08; r[1] = landHeight(r[0], r[2]) + .08;
      if (prev) pos.push(...prev.l, ...prev.c, ...l, ...prev.c, ...c, ...l, ...prev.c, ...prev.r, ...c, ...prev.r, ...r, ...c); prev = { l, r, c }; } }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const road = new T.Mesh(g, new T.MeshStandardMaterial({ color: DIRT, roughness: 1, side: T.DoubleSide })); road.receiveShadow = true; scene.add(road);
  for (let i = 1; i < path.length - 1; i++) { const q = path[i]; SB.setT(q[0] + 5, landHeight(q[0] + 5, q[1] - 5) - .2, q[1] - 5, 0); SB.box(WOOD, .18, 1.4, .18, 0, .7, 0); SB.box(WHITE, .5, .3, .06, 0, 1.25, 0); }
  const OLIVE = col(0x5c6647), RUST = col(0x7a4a2e), CONCB = col(0x9a978c), at = (x, z, ry) => { SB.setT(x, landHeight(x, z) - .35, z, ry || 0); return landHeight(x, z); };
  // barracks, a watchtower, a hangar shell, a wrecked truck, fence posts and a radar dish
  for (const [bx, bz, ry] of [[BASE.x - 12, BASE.z - 16, 0], [BASE.x + 12, BASE.z - 18, 0], [BASE.x + 22, BASE.z + 6, Math.PI / 2]]) { at(bx, bz, ry); SB.box(OLIVE, 16, 3.6, 6, 0, 1.8, 0); SB.box(RUST, 16.6, .3, 6.6, 0, 3.75, 0); SB.box(DARK, 1.2, 2.2, .2, -4, 1.1, 3.05); SB.box(DARK, 1.6, 1, .15, 3, 2, 3.05); const w = ry ? 3.2 : 8.2, d = ry ? 8.2 : 3.2; addBox(bx - w, bz - d, bx + w, bz + d, 4); }
  at(BASE.x - 26, BASE.z + 14); for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) SB.box(RUST, .25, 9, .25, sx, 4.5, sz); SB.box(OLIVE, 3.6, 2, 3.6, 0, 10, 0); SB.box(RUST, 4.2, .25, 4.2, 0, 11.1, 0); addBox(BASE.x - 27.6, BASE.z + 12.4, BASE.x - 24.4, BASE.z + 15.6, 9);
  at(BASE.x - 2, BASE.z + 22); SB.box(CONCB, 20, 7, 1, 0, 3.5, 6); SB.box(CONCB, 1, 7, 12, -10, 3.5, 0); SB.box(CONCB, 1, 7, 12, 10, 3.5, 0); SB.box(RUST, 21, .5, 13, 0, 7.2, 0); addBox(BASE.x - 12.5, BASE.z + 27.5, BASE.x + 8.5, BASE.z + 28.5, 7); addBox(BASE.x - 12.5, BASE.z + 16, BASE.x - 11.5, BASE.z + 28, 7); addBox(BASE.x + 7.5, BASE.z + 16, BASE.x + 8.5, BASE.z + 28, 7);
  at(BASE.x + 2, BASE.z - 2, .5); SB.box(OLIVE, 6, 1.4, 2.4, 0, 1.3, 0); SB.box(OLIVE, 1.8, 1.3, 2.3, 2.3, 2.5, 0); SB.box(DARK, .9, .9, .5, -2, .45, 1.1); SB.box(DARK, .9, .9, .5, -2, .45, -1.1); SB.box(DARK, .9, .9, .5, 2, .45, 1.1); addCircle(BASE.x + 2, BASE.z - 2, 3);
  at(BASE.x + 30, BASE.z - 24); SB.geo(CONCB, gCyl(1.2, 1.6, 4, 8), M4(0, 2, 0)); SB.geo(col(0xc9cdd2), gCyl(3.2, .4, 1, 12), M4(0, 5, 0, 0, 1, 1, 1, .8)); addCircle(BASE.x + 30, BASE.z - 24, 1.8);
  for (let a = 0; a < 6.28; a += .26) { if (Math.abs(a - 3.25) < .3) continue; const fx = BASE.x + Math.cos(a) * 42, fz = BASE.z + Math.sin(a) * 42; at(fx, fz, -a); SB.box(RUST, .14, 2.4, .14, 0, 1.2, 0); SB.box(DARK, .05, .05, 10.5, 0, 2.2, 0); SB.box(DARK, .05, .05, 10.5, 0, 1.3, 0); }
  signs.push({ x: 438, y: landHeight(438, -256) + 2.4, z: -256, ry: -Math.PI / 2, w: 7, name: 'MILITARY AREA - KEEP OUT', bg: '#c9b040', fg: '#1b1d22' });
  // where the loot crates stand (the game adds the rings and what is in them)
  for (const [cx, cz, kind] of [[BASE.x - 12, BASE.z - 10, 'ammo'], [BASE.x + 12, BASE.z - 12, 'rifle'], [BASE.x + 16, BASE.z + 6, 'grenades'], [BASE.x - 2, BASE.z + 20, 'rockets'], [BASE.x - 26, BASE.z + 9, 'armour']]) {
    const y = at(cx + 1.6, cz); SB.box(OLIVE, 1.5, .9, 1, 0, .8, 0); SB.box(DARK, 1.54, .08, 1.04, 0, 1.0, 0); addBox(cx + .85, cz - .5, cx + 2.35, cz + .5, 1.2); BASE.crates.push({ x: cx, z: cz, y: landHeight(cx, cz), kind });
  }
}

/* ---------- the big city around the old one ---------- */
// Simple, cheap buildings: a box with a roof, a band of windows per floor and a door that people use.
const CITYSHOPS = ['LAUNDRY', 'KEBAB', 'PHONE REPAIR', 'BAKERY', 'NAILS', 'TATTOO', 'DINER', 'GYM', 'PAWN SHOP', 'LIQUOR', 'HARDWARE', 'CAFE NOIR', 'SUSHI', 'TACOS', 'VINTAGE', 'OPTICIAN', 'DENTIST', 'CINEMA', 'CLUB 44', 'PETS', 'BOXING GYM', 'PHARMACY', 'GROCER', 'BARBER', 'PIZZA', 'BOOKS', 'FLOWERS', 'BANK', 'NOODLES', 'SHOES', 'BIKES', 'RECORDS']; let cityShopN = 0;
function bldg(x, z, w, d, h, wall, face, roofC) {
  SB.setT(x, 0, z, 0); SB.box(wall, w, h, d, 0, h / 2, 0); SB.box(roofC || DARK, w + .5, .35, d + .5, 0, h + .17, 0);
  for (let y = 1.9; y < h - .8; y += 3.1) { SB.box(GLASSC, w + .1, 1.25, d - 2.2, 0, y, 0); SB.box(GLASSC, w - 2.2, 1.25, d + .1, 0, y, 0); }
  if (h > 9) {   // taller blocks: piers that break up the window bands, a stone ground floor, and a stair hut on the roof
    const v = hash2(x * 1.3, z * 2.1), nx = Math.max(2, Math.round(w / 6)), nz = Math.max(2, Math.round(d / 6));
    for (let k = 1; k < nx; k++) SB.box(wall, .7, h - 3.4, d + .24, -w / 2 + w * k / nx, h / 2 + 1.7, 0);
    for (let k = 1; k < nz; k++) SB.box(wall, w + .24, h - 3.4, .7, 0, h / 2 + 1.7, -d / 2 + d * k / nz);
    SB.box(col(v < .5 ? 0x8d877c : 0x6e5a4c), w + .3, .5, d + .3, 0, 3.25, 0);
    SB.box(wall, 3, 2.2, 3, (v - .5) * (w - 5), h + 1.4, 0);
    if (v > .6) for (let y = 5; y < h - 1; y += 3.1) SB.box(DARK, w * .5, .12, 1.1, 0, y - 1.1, (face === 'n' ? -1 : 1) * (d / 2 + .55));   // balconies
    // on the roof: air-conditioning boxes, sometimes a water tank or an aerial
    const AC = col(0xa9adb3); SB.box(AC, 1.6, .9, 1.2, -w * .25, h + .8, d * .22); SB.box(AC, 1.6, .9, 1.2, -w * .25 + 2.1, h + .8, d * .22);
    if (v < .35) { SB.box(col(0x7a5a3c), 2.2, 2.4, 2.2, w * .28, h + 2.3, -d * .2); for (const [ox, oz] of [[-.9, -.9], [.9, -.9], [-.9, .9], [.9, .9]]) SB.box(DARK, .14, 1.1, .14, w * .28 + ox, h + .9, -d * .2 + oz); }
    else if (v < .6) { SB.box(DARK, .08, 4.5, .08, w * .3, h + 2.6, -d * .25); SB.box(DARK, 1.4, .06, .06, w * .3, h + 4.2, -d * .25); SB.box(DARK, 1, .06, .06, w * .3, h + 3.6, -d * .25); }
  }
  if (h > 5) for (let y = 1.9; y < h - .8; y += 3.1) for (const [sx, sz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {   // life in the windows, on all four sides
    const L = (sz ? w : d) - 3, n = Math.max(1, Math.round(L / 3.4));
    for (let k = 0; k < n; k++) { const t = -L / 2 + L * (k + .5) / n, hv = hash2(x * 1.9 + t * 3.3 + y * 7.1, z * 2.3 + sx * 13 + sz * 29), px = sz ? t : sx * (w / 2 + .07), pz = sz ? sz * (d / 2 + .07) : t;
      if (hv < .22) SB.box(LITC, sz ? 1.5 : .04, 1.1, sz ? .04 : 1.5, px, y, pz, MAT.lit);                                               // a lit room
      else if (hv < .4) { const cc = WINC[Math.floor(hv * 40) % WINC.length]; for (const o of [-.6, .6]) SB.box(cc, sz ? .3 : .04, 1.15, sz ? .04 : .3, px + (sz ? o : 0), y, pz + (sz ? 0 : o)); }   // curtains
      if (hv > .9) { const v = (hv - .9) * 10, sk = WSKIN[Math.floor(v * 4) % 4], hr = WHAIR[Math.floor(v * 16) % 4], sh = WINC[Math.floor(v * 64) % WINC.length], ex = sx * .03, ez = sz * .03;   // someone at the window
        SB.box(sh, sz ? .4 : .05, .5, sz ? .05 : .4, px + ex, y - .35, pz + ez); SB.box(sk, sz ? .2 : .05, .22, sz ? .05 : .2, px + ex, y + .02, pz + ez); SB.box(hr, sz ? .23 : .055, .09, sz ? .055 : .23, px + ex, y + .15, pz + ez); }
    }
  }
  const fx = face === 'e' ? 1 : face === 'w' ? -1 : 0, fz = face === 's' ? 1 : face === 'n' ? -1 : 0, dxp = x + fx * w / 2, dzp = z + fz * d / 2;
  let shop = false;
  if (h > 9 && h < 40 && (fx || fz) && hash2(x * .7 + 3, z * 1.9) < .55) {   // a shop on the ground floor: a big window, an awning and a name board
    shop = true; const fw = (fx ? d : w), ww = Math.min(fw * .72, 11), aw = pick([0xb3261e, 0x1f6f8a, 0x2f7a4a, 0xd98a1f, 0x5a3f8a, 0x30343f]);
    SB.box(LITC, fx ? .14 : ww, 1.9, fz ? .14 : ww, fx * (w / 2 + .1), 1.45, fz * (d / 2 + .1), MAT.lit);
    { const o = (w2 => fx ? w / 2 + w2 : d / 2 + w2), n = Math.max(2, Math.round(ww / 1.6));   // shelves of goods and a shopkeeper, just behind the glass
      for (const sy of [.95, 1.7]) { SB.box(WOOD, fx ? .05 : ww - .5, .05, fz ? .05 : ww - .5, fx * o(.19), sy, fz * o(.19)); for (let k = 0; k < n; k++) { const t = -(ww - 1) / 2 + (ww - 1) * k / (n - 1), cc = WINC[Math.floor(hash2(x + t * 3.1, sy * 9 + z) * WINC.length)]; SB.box(cc, fx ? .05 : .26, .22 + (k % 2) * .1, fz ? .05 : .26, fx ? fx * o(.19) : t, sy + .14 + (k % 2) * .05, fz ? fz * o(.19) : t); } }
      const v = hash2(x * 2.7, z * 3.9), t = (v - .5) * (ww - 1.4), sk = WSKIN[Math.floor(v * 4) % 4], hr = WHAIR[Math.floor(v * 16) % 4], sh = WINC[Math.floor(v * 64) % WINC.length];
      SB.box(sh, fx ? .05 : .5, .75, fz ? .05 : .5, fx ? fx * o(.2) : t, .95, fz ? fz * o(.2) : t); SB.box(sk, fx ? .05 : .26, .3, fz ? .05 : .26, fx ? fx * o(.205) : t, 1.5, fz ? fz * o(.205) : t); SB.box(hr, fx ? .055 : .29, .11, fz ? .055 : .29, fx ? fx * o(.206) : t, 1.68, fz ? fz * o(.206) : t); }
    SB.box(col(aw), fx ? 1.3 : ww + .6, .14, fz ? 1.3 : ww + .6, fx * (w / 2 + .75), 2.85, fz * (d / 2 + .75)); SB.box(col(aw), fx ? .08 : ww + .6, .3, fz ? .08 : ww + .6, fx * (w / 2 + 1.38), 2.72, fz * (d / 2 + 1.38));
    signs.push({ x: x + fx * (w / 2 + .24), y: 3.72, z: z + fz * (d / 2 + .24), ry: Math.atan2(fx, fz), w: Math.min(ww * .8, 6), name: CITYSHOPS[cityShopN++ % CITYSHOPS.length] });
  }
  SB.box(pick(DOORC), fx ? .2 : 1.3, 2.2, fz ? .2 : 1.3, fx * (w / 2 + (shop ? .16 : .03)), 1.1, fz * (d / 2 + (shop ? .16 : .03)));
  addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h + .4); doors.push({ x: dxp, z: dzp, nx: -fx, nz: -fz, shop });
}
export const KINDS = {}; globalThis.PAP_KINDS = KINDS;
function bigCityBlock(i, j, X0, X1, Z0, Z1) {
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2; if (inHole(cx, cz) || (X0 < 300 && Z0 < -400)) return;
  const N = hasEW(i, j), S = hasEW(i, j + 1), W = hasNS(i, j), E = hasNS(i + 1, j);
  if (!(N || S || W || E)) {   // no street touches this piece of land: a field, or a small wood
    const hh = hash2(cx * 3.1, cz * 1.7), wood = hh < .35;
    FB.setT(0, 0, 0, 0); FB.box(col(wood ? 0x6f9550 : [0xcdbb6a, 0x9aa060, 0xb7b27a][Math.floor(hh * 3)]), X1 - X0, .05, Z1 - Z0, cx, .025, cz);
    if (!wood) for (let k = 1; k < 6; k++) FB.box(col(0xa89a52), X1 - X0 - 8, .06, 1.4, cx, .03, Z0 + (Z1 - Z0) * k / 6);
    for (let k = 0, n = wood ? 12 : 3; k < n; k++) tree(X0 + 5 + hash2(cx + k * 3, k) * (X1 - X0 - 10), Z0 + 5 + hash2(k * 7, cz - k) * (Z1 - Z0 - 10), .9 + hash2(k, cx) * .5);
    return;
  }
  const zn = zoneAt(cx, cz), x0 = X0 + INSET, x1 = X1 - INSET, z0 = Z0 + INSET, z1 = Z1 - INSET, w = x1 - x0, d = z1 - z0, h = hash2(cx * 3.1, cz * 1.7);
  const town = TOWNS.find(t => Math.abs(cx - t.x) < 90 && Math.abs(cz - t.z) < 90);
  if (zn === 'country') {   // fields with a few trees, now and then a farm
    FB.setT(0, 0, 0, 0); FB.box(col([0xcdbb6a, 0x86a55a, 0x9aa060, 0xb7b27a][Math.floor(h * 4)]), X1 - X0 - 2 * RH - 1, .05, Z1 - Z0 - 2 * RH - 1, cx, .025, cz);
    if (h > .45) for (let k = 1; k < 6; k++) FB.box(col(0xa89a52), w - 6, .06, 1.4, cx, .03, z0 + d * k / 6);   // crop rows
    for (let k = 0; k < 6; k++) if (hash2(cx + k * 7, cz - k * 5) < .6) tree(x0 + 4 + hash2(cx, k) * (w - 8), z0 + 4 + hash2(k, cz) * (d - 8), .9 + hash2(k, cz) * .5);
    if (NATOK) scatter(x0 + 2, z0 + 2, x1 - 2, z1 - 2, cx * 7 + cz * 13, 'country', (px, pz) => h < .3 && Math.abs(px - cx - 1) < 22 && Math.abs(pz - cz) < 14);   // woods, bushes, grass, flowers and rocks
    SB.setT(0, 0, 0, 0); if (h > .3 && h < .7) { hedgeBox(w, 1, .5, cx, .5, S ? z1 : z0); }   // a hedge along the road
    if (h < .3) { bldg(cx - 6, cz, 11, 8, 4.2, pick(WALLS), S ? 's' : N ? 'n' : E ? 'e' : 'w', TILE); SB.setT(cx + 9, 0, cz + 2, 0); SB.box(col(0x8a3a2e), 9, 5, 12, 0, 2.5, 0); SB.box(DARK, 9.6, .4, 12.6, 0, 5.2, 0); addBox(cx + 4.5, cz - 4, cx + 13.5, cz + 8, 5); }
    return;
  }
  loops.push({ x0: X0 + RH + 2.2, x1: X1 - RH - 2.2, z0: Z0 + RH + 2.2, z1: Z1 - RH - 2.2, P: 2 * (X1 - X0 + Z1 - Z0 - 4 * (RH + 2.2)) });
  if (town) { block(X0, X1, Z0, Z1, {}); return; }                                   // the middle of a small town: proper streets of shops
  FB.setT(0, 0, 0, 0); FB.box(PAVEC, X1 - X0 - 2 * RH, .12, Z1 - Z0 - 2 * RH, cx, .06, cz);
  const far2 = Math.hypot(cx - 20, cz) > 820, kind = Math.hypot(cx - 910, cz + 300) < 210 ? 'towers' : (cz > 400 && cx < 520) ? 'industry' : h < .07 ? 'park' : (zn === 'town' || far2 || h < .32) ? 'suburb' : h < .40 ? 'pitch' : h < .48 ? 'market' : h < .56 ? 'square' : h < .70 ? 'court' : 'mid';
  const fz = S ? 's' : N ? 'n' : E ? 'e' : 'w', fn = N ? 'n' : S ? 's' : W ? 'w' : 'e';
  if (!KINDS[kind]) KINDS[kind] = [X0, Z0, X1, Z1];   /* one example of each kind of block, for the test pictures */
  if (kind === 'towers') { tower(x0 + w * .26, cz, w * .42, d * .72, 40 + h * 70, pick(TOWER)); tower(x1 - w * .26, cz, w * .42, d * .72, 30 + hash2(cz, cx) * 60, pick(TOWER)); }
  else if (kind === 'park') { FB.box(GRASSC, w, .14, d, cx, .07, cz); if (NATOK) scatter(x0 + 3, z0 + 3, x1 - 3, z1 - 3, cx * 3 + cz, 'park', (px, pz) => Math.abs(px - cx) < 5 && Math.abs(pz - cz) < 8); for (let k = 0; k < 9; k++) tree(x0 + 3 + hash2(cx, k * 3) * (w - 6), z0 + 3 + hash2(k * 5, cz) * (d - 6), 1.1); bench(cx, cz, 0); bench(cx + 6, cz + 5, Math.PI / 2); }
  else if (kind === 'pitch') {   // a football pitch with a fence, and a clubhouse
    const FENCE = col(0x5c6670), LINE = col(0xf2f2ee), pw = Math.min(w - 16, 44), pd = Math.min(d - 6, 30), px = cx + 5;
    FB.box(col(0x4f9a4a), pw, .14, pd, px, .07, cz); FB.box(LINE, .3, .16, pd, px, .08, cz); FB.box(LINE, pw, .16, .3, px, .08, cz - pd / 2 + .3); FB.box(LINE, pw, .16, .3, px, .08, cz + pd / 2 - .3); FB.box(LINE, .3, .16, pd, px - pw / 2 + .3, .08, cz); FB.box(LINE, .3, .16, pd, px + pw / 2 - .3, .08, cz);
    SB.setT(0, 0, 0, 0); for (const sx of [-1, 1]) { const gx = px + sx * (pw / 2 - .4); SB.box(LINE, .15, 2.2, .15, gx, 1.1, cz - 3); SB.box(LINE, .15, 2.2, .15, gx, 1.1, cz + 3); SB.box(LINE, .15, .15, 6.15, gx, 2.2, cz); }
    SB.box(FENCE, pw + 3, 1.6, .12, px, .8, cz - pd / 2 - 1.5); SB.box(FENCE, pw + 3, 1.6, .12, px, .8, cz + pd / 2 + 1.5); addBox(px - pw / 2 - 1.5, cz - pd / 2 - 1.7, px + pw / 2 + 1.5, cz - pd / 2 - 1.3, 1.6); addBox(px - pw / 2 - 1.5, cz + pd / 2 + 1.3, px + pw / 2 + 1.5, cz + pd / 2 + 1.7, 1.6);
    bldg(x0 + 5, cz, 8, Math.min(d - 6, 14), 3.6, pick(WALLS), W ? 'w' : fz, DARK);
  }
  else if (kind === 'market') {   // a supermarket with a car park in front
    const mw = w * .5, LINE = col(0xe8e8e2);
    bldg(x0 + mw / 2 + 1, cz, mw, d - 4, 6, col(0xe9e4d8), E ? 'e' : fz, DARK);
    SB.setT(0, 0, 0, 0); SB.box(col([0xc2372e, 0x2f6fb5, 0x2f9a57][Math.floor(h * 97) % 3]), .5, 1.6, d - 8, x0 + mw + 1.3, 5, cz);   // the sign band
    FB.box(col(0x3d4046), x1 - (x0 + mw + 3), .14, d - 2, (x0 + mw + 3 + x1) / 2, .07, cz);
    for (let k = 0; k * 3 < d - 8; k++) { FB.box(LINE, 5, .16, .14, x0 + mw + 7, .08, z0 + 3 + k * 3); FB.box(LINE, 5, .16, .14, x1 - 4, .08, z0 + 3 + k * 3); }
    tree(x1 - 1.5, z0 + 1.5, 1); tree(x1 - 1.5, z1 - 1.5, 1);
  }
  else if (kind === 'square') {   // an open square with a fountain, trees, and two buildings at the ends
    const STONE = col(0xd9d2c2), WATER = col(0x4aa3c7);
    bldg(x0 + w * .14, cz, w * .24, d - 4, 12.5, pick(WALLS), 'e', TILE); bldg(x1 - w * .14, cz, w * .24, d - 4, 9.4 + Math.floor(h * 40 % 3) * 3.1, pick(WALLS), 'w', TILE);
    FB.box(STONE, w * .42, .15, d - 4, cx, .075, cz);
    SB.setT(0, 0, 0, 0); SB.box(STONE, 5, .6, 5, cx, .3, cz); SB.box(WATER, 4.2, .1, 4.2, cx, .62, cz); SB.box(STONE, .7, 1.8, .7, cx, .9, cz); addBox(cx - 2.5, cz - 2.5, cx + 2.5, cz + 2.5, .6);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tree(cx + sx * w * .15, cz + sz * (d / 2 - 5), 1.1);
    bench(cx - 5, cz, Math.PI / 2); bench(cx + 5, cz, Math.PI / 2);
  }
  else if (kind === 'court') {   // two long apartment slabs with a green courtyard between them
    const bh = 12.6 + Math.floor(h * 50 % 3) * 3.1, bd = Math.min(12, d * .28);
    bldg(cx, z0 + bd / 2 + 1, w - 4, bd, bh, pick(WALLS), N ? 'n' : 's', h < .63 ? TILE : DARK); bldg(cx, z1 - bd / 2 - 1, w - 4, bd, bh - 3.1, pick(WALLS), S ? 's' : 'n', TILE);
    FB.box(GRASSC, w - 8, .14, d - 2 * bd - 8, cx, .07, cz);
    for (let k = 0; k < 4; k++) tree(x0 + 6 + (w - 12) * k / 3, cz + (k % 2 ? 2 : -2), 1); bench(cx, cz, 0);
  }
  else if (kind === 'industry') { warehouse(cx, z0 + d * .26, w * .8, d * .4, 8 + h * 4, pick(SHED)); containers(x0 + 2, cz + 5, x1 - 2, z1 - 2); }
  else if (kind === 'suburb') {   // houses with gardens
    FB.box(GRASSC, w, .14, d, cx, .07, cz);
    for (let k = 0; k < 3; k++) { const hx = x0 + w * (k + .5) / 3;
      bldg(hx, z0 + 4.2, 9.5, 7.4, hash2(hx, z0) < .5 ? 3.4 : 6.5, pick(WALLS), fn === 'n' || fn === 's' ? 'n' : fn, TILE); bldg(hx, z1 - 4.2, 9.5, 7.4, hash2(hx, z1) < .5 ? 3.4 : 6.5, pick(WALLS), fz === 's' || fz === 'n' ? 's' : fz, TILE);
      if (k < 2) tree(x0 + w * (k + 1) / 3, cz + (k ? 3 : -3), 1); }
    if (NATOK) scatter(x0 + 2, z0 + 11, x1 - 2, z1 - 11, cx * 5 + cz * 3, 'garden', (px, pz) => Math.abs(pz - cz) < 2);   // trees, shrubs and flowers in the gardens between the house rows
    SB.setT(0, 0, 0, 0); hedgeBox(w - 2, 1.1, .5, cx, .55, cz);
  } else {   // apartment blocks, four to a block
    const bw = (w - 5) / 2, bd = (d - 5) / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bldg(cx + sx * (bw / 2 + 2.5), cz + sz * (bd / 2 + 2.5), bw, bd, 9.5 + Math.floor(hash2(cx + sx * 9, cz + sz * 5) * 5) * 3.1, pick(WALLS), sz < 0 ? (N ? 'n' : sx < 0 ? 'w' : 'e') : (S ? 's' : sx < 0 ? 'w' : 'e'), h < .6 ? TILE : DARK);
  }
}

/* ---------- bus lines ---------- */
// Five bus lines, each a loop through these crossroads. Buses pull in at a shelter on every second block.
export const ROUTES = [[[80, -260], [220, -260], [220, 260], [80, 260]], [[-100, -325], [80, -325], [80, -130], [-100, -130]],
  [[220, 260], [830, 260], [830, 640], [220, 640]], [[650, -640], [1000, -640], [1000, 390], [650, 390]], [[650, 640], [1430, 640], [1430, -890], [650, -890]]];   // line 3 links the old city to the south, line 4 circles the middle, line 5 goes round by the towns
export const BUS_LEGS = new Set();   // "ax,az>bx,bz" for every block of road that has a bus stop
function busStops() {
  const TEAL = col(0x1f8a8a), POST = col(0x4a5058);
  for (const R of ROUTES) for (let i = 0, n = 0; i < R.length; i++) {
    const a = R[i], b = R[(i + 1) % R.length], alongX = a[1] === b[1], grid = (alongX ? XS : ZS).filter(v => v >= Math.min(alongX ? a[0] : a[1], alongX ? b[0] : b[1]) && v <= Math.max(alongX ? a[0] : a[1], alongX ? b[0] : b[1]));
    if ((alongX ? b[0] - a[0] : b[1] - a[1]) < 0) grid.reverse();
    for (let k = 0; k + 1 < grid.length; k++, n++) {
      if (n % 2) continue;
      const ax = alongX ? grid[k] : a[0], az = alongX ? a[1] : grid[k], bx = alongX ? grid[k + 1] : a[0], bz = alongX ? a[1] : grid[k + 1], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      BUS_LEGS.add(ax + ',' + az + '>' + bx + ',' + bz);
      const x = (ax + bx) / 2 - dz * (RH + 2.5), z = (az + bz) / 2 + dx * (RH + 2.5);
      prop('shelter', x, z, 7, [[x - (alongX ? 2 : 0), z - (alongX ? 0 : 2), .2], [x + (alongX ? 2 : 0), z + (alongX ? 0 : 2), .2]], () => {
        PB.setT(x, 0, z, alongX ? 0 : Math.PI / 2); PB.box(TEAL, 4.4, .14, 1.7, 0, 2.6, 0); PB.box(POST, .1, 2.6, .1, -2, 1.3, 0); PB.box(POST, .1, 2.6, .1, 2, 1.3, 0); PB.box(WOOD, 2.6, .08, .45, 0, .5, 0); PB.box(POST, .08, .5, .08, -1.1, .25, 0); PB.box(POST, .08, .5, .08, 1.1, .25, 0);
        PB.box(POST, .08, 3, .08, 2.8, 1.5, 0); PB.box(col(0xe2bd2a), .7, .7, .08, 2.8, 2.8, 0);
      });
    }
  }
}

/* ---------- monorail ---------- */
// An elevated loop above four streets (and across the harbour) with four stations. The train itself lives in train.js.
export const RAIL = { y: 9, x0: -100, x1: 220, z0: -130, z1: 260, stations: [
  { name: 'Old Town', u: 160, mx: 57, mz: -122, tx: 61.5, tz: -122.3 }, { name: 'East Side', u: 547, mx: 212, mz: 94, tx: 212.3, tz: 98.5 },
  { name: 'South Gate', u: 870, mx: 57, mz: 252, tx: 61.5, tz: 252.3 }, { name: 'Harbour West', u: 1130, mx: -92, mz: 157, tx: -92.3, tz: 161.5 }] };
RAIL.len = 2 * (RAIL.x1 - RAIL.x0) + 2 * (RAIL.z1 - RAIL.z0);
// where the track is after u metres from the north-west corner, going clockwise on the map: {x, z, h}
export function railAt(u, out) {
  const R = RAIL, a = R.x1 - R.x0, b = R.z1 - R.z0; u = ((u % R.len) + R.len) % R.len;
  if (u < a) { out.x = R.x0 + u; out.z = R.z0; out.h = 0; }
  else if (u < a + b) { out.x = R.x1; out.z = R.z0 + (u - a); out.h = -Math.PI / 2; }
  else if (u < 2 * a + b) { out.x = R.x1 - (u - a - b); out.z = R.z1; out.h = Math.PI; }
  else { out.x = R.x0; out.z = R.z1 - (u - 2 * a - b); out.h = Math.PI / 2; }
  return out;
}
function monorail() {
  const R = RAIL, STEEL = col(0xb9bec4), POST = col(0x8f959c), TEAL = col(0x1f8a8a); SB.setT(0, 0, 0, 0);
  for (const z of [R.z0, R.z1]) {
    SB.box(STEEL, R.x1 - R.x0 + 1, .7, .9, (R.x0 + R.x1) / 2, R.y, z);
    for (let x = R.x0 + 20; x < R.x1; x += 40) { if (XS.some(v => Math.abs(v - x) < 11)) continue; for (const s of [-7.4, 7.4]) { SB.box(POST, .6, R.y, .6, x, R.y / 2, z + s); addCircle(x, z + s, .4); } SB.box(POST, .6, .6, 15.4, x, R.y - .6, z); }
  }
  for (const x of [R.x0, R.x1]) {
    SB.box(STEEL, .9, .7, R.z1 - R.z0 + 1, x, R.y, (R.z0 + R.z1) / 2);
    for (let z = R.z0 + 20; z < R.z1; z += 40) {
      if (ZS.some(v => Math.abs(v - z) < 11)) continue;
      if (x < 80 && Math.abs(z) < 60) { if (Math.abs(z) < 45) SB.box(POST, 1.1, R.y + 2.5, 1.1, x, (R.y - 2.5) / 2, z); continue; }   // across the harbour: single pillars standing in the water
      for (const s of [-7.4, 7.4]) { SB.box(POST, .6, R.y, .6, x + s, R.y / 2, z); addCircle(x + s, z, .4); } SB.box(POST, 15.4, .6, .6, x, R.y - .6, z);
    }
  }
  for (const st of R.stations) {   // a lift tower with a sign at every station
    SB.setT(st.tx, 0, st.tz, 0); SB.box(WHITE, 2.2, R.y + 2.6, 2.2, 0, (R.y + 2.6) / 2, 0); SB.box(TEAL, 2.3, .5, 2.3, 0, R.y + 2.2, 0); SB.box(TEAL, 2.3, .5, 2.3, 0, 3, 0); SB.box(GLASSC, 2.25, 4, 1.2, 0, 6, 0);
    addBox(st.tx - 1.1, st.tz - 1.1, st.tx + 1.1, st.tz + 1.1, R.y + 3);
    const p = railAt(st.u, {}); SB.setT(p.x, 0, p.z, p.h); SB.box(TEAL, 16, .25, 4.2, 0, R.y + 4.2, 0); SB.box(POST, .2, 3.4, .2, -7.5, R.y + 2.4, 1.9); SB.box(POST, .2, 3.4, .2, 7.5, R.y + 2.4, 1.9); SB.box(POST, .2, 3.4, .2, -7.5, R.y + 2.4, -1.9); SB.box(POST, .2, 3.4, .2, 7.5, R.y + 2.4, -1.9);
  }
}

/* ---------- docks ---------- */
const CONT = [0xb3362e, 0x2f6f9f, 0xd98a1f, 0x2f7a4f, 0x8a8f96, 0x7a3f8f, 0xe8e2d0, 0x1f4f6f].map(col), CONC = col(0x9a9b96), SHED = [0xb9c0c4, 0x9fb0b8, 0xc9b99a].map(col), CRANEC = col(0xe2a51a);
// rows of stacked shipping containers with aisles wide enough to drive through
function containers(x0, z0, x1, z1) {
  SB.setT(0, 0, 0, 0);
  for (let z = z0; z + 2.5 <= z1; z += 8.2) for (let x = x0 + 3.1; x + 3.1 <= x1; x += 6.5) {
    if (rnd() < .2) continue; const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) { SB.box(pick(CONT), 6.1, 2.55, 2.45, x, 1.275 + k * 2.6, z + 1.22); SB.box(DARK, .06, 2.2, 2.1, x + 3.07, 1.275 + k * 2.6, z + 1.22); }
    addBox(x - 3.05, z, x + 3.05, z + 2.45, n * 2.6);
  }
}
function warehouse(cx, cz, w, d, h, c) {
  SB.setT(cx, 0, cz, 0);
  SB.box(c, w, h, d, 0, h / 2, 0); SB.box(col(0x6a7178), w + 1.2, .5, d + 1.2, 0, h + .25, 0); SB.box(col(0x6a7178), w * .5, .9, d + .6, 0, h + .9, 0);
  for (const sgn of [-1, 1]) { SB.box(DARK, 5.5, 4.4, .2, -w / 4, 2.2, sgn * (d / 2 + .06)); SB.box(DARK, 5.5, 4.4, .2, w / 4, 2.2, sgn * (d / 2 + .06)); SB.box(GLASSC, w * .84, 1, .16, 0, h - 1.5, sgn * (d / 2 + .04)); }
  addBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h + 1);
}
// a gantry crane: four legs you can drive between, with the boom reaching west over the quay to the ship
function crane(cx, cz) {
  SB.setT(cx, 0, cz, 0);
  for (const dx of [-6, 6]) for (const dz of [-7, 7]) { SB.box(CRANEC, 1.1, 24, 1.1, dx, 12, dz); addBox(cx + dx - .6, cz + dz - .6, cx + dx + .6, cz + dz + .6, 24); }
  for (const dz of [-7, 7]) { SB.box(CRANEC, 13, 1, 1, 0, 23.5, dz); SB.box(CRANEC, 13, .7, .7, 0, 9, dz); }
  for (const dx of [-6, 6]) SB.box(CRANEC, 1, 1, 15, dx, 23.5, 0);
  SB.box(CRANEC, 46, 1.4, 2.2, -14, 25.2, 0); SB.box(col(0xc23b22), 46, .5, .5, -14, 28.5, 0); SB.box(CRANEC, .8, 6, .8, -6, 27.5, 0);
  SB.box(WHITE, 3, 2.6, 3, -16, 23, 0); SB.box(GLASSC, 3.1, 1.1, 2.4, -16, 23.2, 0); SB.box(DARK, .25, 9, .25, -24, 20, 0); SB.box(pick(CONT), 6.1, 2.55, 2.45, -24, 14.3, 0);
}
function docks(X0, X1, Z0, Z1) {
  const x0 = X0 + INSET + 2, x1 = X1 - INSET - 2, z0 = Z0 + INSET + 2, z1 = Z1 - INSET - 2, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  FB.setT(0, 0, 0, 0); FB.box(CONC, x1 - x0 + 4, .08, z1 - z0 + 4, cx, .04, cz);
  const west = X0 === XS[0], row = Math.round((Z0 - 195) / 65);
  if (west && row < 2) { crane(x0 + 8, cz); containers(x0 + 18, z0, x1, z1); }
  else if (west) { warehouse(cx, z0 + 10, x1 - x0 - 4, 18, 9, SHED[0]); warehouse(cx, z1 - 9, x1 - x0 - 14, 16, 8, SHED[1]); }
  else if (row === 0) { warehouse(cx, z0 + 10, x1 - x0 - 6, 18, 10, SHED[2]); containers(x0, cz + 4, x1, z1); }
  else if (row === 1) containers(x0, z0, x1, z1);
  else { warehouse(x0 + 16, cz, 28, z1 - z0 - 6, 9, SHED[1]); containers(x0 + 34, z0, x1, z1); }
  for (const [lx, lz, dx, dz] of [[X0 + INSET - 1.4, cz, 1, 0], [X1 - INSET + 1.4, cz, -1, 0], [cx, Z0 + INSET - 1.4, 0, 1], [cx, Z1 - INSET + 1.4, 0, -1]]) lamp(lx, lz, dx, dz);
}
// a container ship moored along the quay
function cargoShip(cx, cz) {
  const L = 96, W = 17, HULL = col(0x23384d), RED = col(0x8f2b23);
  SB.setT(cx, 0, cz, 0);
  SB.box(RED, W, 2.2, L, 0, -1.2, 0); SB.box(HULL, W, 5, L, 0, 2.4, 0); SB.box(HULL, W * .7, 5, 8, 0, 2.4, -L / 2 - 3.5); SB.box(HULL, W * .35, 5, 6, 0, 2.4, -L / 2 - 9);
  SB.box(col(0x7d8288), W - 1, .3, L - 1, 0, 5.05, 0);
  SB.box(WHITE, W - 3, 11, 10, 0, 10.5, L / 2 - 8); SB.box(GLASSC, W - 2.8, 1.3, 10.1, 0, 14.2, L / 2 - 8); SB.box(col(0xc23b22), 3, 5, 3, 0, 18, L / 2 - 6);
  for (let z = -L / 2 + 6; z < L / 2 - 18; z += 6.5) for (let x = -W / 2 + 2.2; x < W / 2 - 1; x += 2.6) { const n = 1 + Math.floor(rnd() * 4); for (let k = 0; k < n; k++) SB.box(pick(CONT), 2.45, 2.55, 6.1, x, 6.5 + k * 2.6, z); }
  hulls.push({ x0: cx - W / 2 - 1.5, x1: cx + W / 2 + 1.5, z0: cz - L / 2 - 14, z1: cz + L / 2 + 2 });
}

/* ---------- sea ---------- */
export function buildSea(scene) {
  const seg = MOBILE ? 36 : 64;
  const near = new T.Mesh(new T.PlaneGeometry(900, 760, seg, Math.round(seg * .85)).rotateX(-Math.PI / 2), MAT.water);
  near.position.set(-230, -1.5, 0); near.receiveShadow = true; scene.add(near);
  // the flat sea further out lies below the deepest wave trough, so it can never poke up through the waves (that was the flickering)
  const farM = new T.Mesh(new T.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), MAT.water); farM.position.set(-800, -1.98, 0); scene.add(farM);
  const P = near.geometry.attributes.position, step = 760 / Math.round(seg * .85), EDGE = 70;
  // the patch of moving waves slides along the coast with you (in whole steps of its own grid, so the waves do not jump),
  // and towards its rim the waves flatten out and sink to meet the flat sea, so there is no seam
  G.seaUpdate = t => {
    const pl = G.player, pz = pl ? (pl.ride ? pl.ride.z : pl.car ? pl.car.z : pl.z) : 0, cz = Math.round(Math.max(-760, Math.min(760, pz)) / step) * step; near.position.z = cz;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), zl = P.getZ(i), z = zl + cz, wx = x - 230;
      const e = Math.min(1, Math.min(450 - Math.abs(x), 380 - Math.abs(zl)) / EDGE), f = e * e * (3 - 2 * e);
      P.setY(i, (Math.sin(wx * .16 + t * 1.1) * .11 + Math.cos(z * .21 + t * 1.4) * .09 + Math.sin((wx + z) * .07 + t * .6) * .1) * f - .45 * (1 - f)); }
    P.needsUpdate = true;
  };
}

/* ---------- big wheel ---------- */
export function buildWheel(scene) {
  const g = new T.Group(), wm = new T.MeshStandardMaterial({ color: 0xf2f4f6, roughness: .5 }), R = 15;
  g.position.set(HARB.x1 + 5, R + 3.5, -26); g.rotation.y = Math.PI / 2;
  const w = new T.Group(); g.add(w);
  const add = (geo, mat, x, y, z, rz) => { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (rz) m.rotation.z = rz; m.castShadow = true; return m; };
  w.add(add(new T.TorusGeometry(R, .22, 6, 40), wm));
  for (let i = 0; i < 8; i++) w.add(add(new T.BoxGeometry(R * 2, .12, .12), wm, 0, 0, 0, i * Math.PI / 8));
  const cab = new T.MeshStandardMaterial({ color: 0xd94f3c, roughness: .5 }), cabs = [];
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, c = add(new T.BoxGeometry(1.5, 1.6, 1.4), cab, Math.cos(a) * (R + .9), Math.sin(a) * (R + .9), 0); w.add(c); cabs.push(c); }
  const l1 = add(new T.BoxGeometry(.5, R + 5, .5), wm, -4, -R / 2 - 1.5, 0, -.26), l2 = add(new T.BoxGeometry(.5, R + 5, .5), wm, 4, -R / 2 - 1.5, 0, .26);
  g.add(l1, l2); scene.add(g);
  addCircle(HARB.x1 + 5, -30, 1); addCircle(HARB.x1 + 5, -22, 1);
  G.wheelUpdate = dt => { w.rotation.z += dt * .06; for (const c of cabs) c.rotation.z = -w.rotation.z; };
}

/* ---------- sky, sun, day and night ---------- */
export function buildSky(scene, renderer) {
  const C = h => new T.Color(h);
  const skyU = { top: { value: C(0) }, bot: { value: C(0) }, sd: { value: new T.Vector3(0, 1, 0) }, sc: { value: C(0xffffff) }, gl: { value: 0 } };
  const sky = new T.Mesh(new T.SphereGeometry(1900, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, fog: false, depthWrite: false, uniforms: skyU,
    vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 top;uniform vec3 bot;uniform vec3 sd;uniform vec3 sc;uniform float gl;varying vec3 p;void main(){vec3 n=normalize(p);float h=clamp(n.y*1.5,0.,1.);vec3 col=mix(bot,top,pow(h,.55));float d=max(dot(n,normalize(sd)),0.);col+=sc*gl*(pow(d,6.)*.55+pow(d,60.)*.9)*(1.-.6*h);col+=sc*gl*.25*pow(1.-clamp(n.y,0.,1.),5.)*(.4+.6*d);gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
  }));
  sky.renderOrder = -10; scene.add(sky);
  const sg = new T.BufferGeometry(), sa = [];
  for (let i = 0; i < 600; i++) { const u = Math.random() * Math.PI * 2, v = Math.acos(Math.random() * .96); sa.push(Math.sin(v) * Math.cos(u) * 1800, Math.cos(v) * 1800 + 20, Math.sin(v) * Math.sin(u) * 1800); }
  sg.setAttribute('position', new T.Float32BufferAttribute(sa, 3));
  const starMat = new T.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new T.Points(sg, starMat); stars.renderOrder = -9; scene.add(stars);
  const ball = new T.Mesh(new T.SphereGeometry(40, 20, 14), new T.MeshBasicMaterial({ color: 0xffffff, fog: false })); ball.renderOrder = -8; scene.add(ball);
  const hc = document.createElement('canvas'); hc.width = hc.height = 128; { const x = hc.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, 'rgba(255,255,255,.75)'); g.addColorStop(.5, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  const halo = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(hc), color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, fog: false, blending: T.AdditiveBlending })); halo.scale.set(520, 520, 1); halo.renderOrder = -7; scene.add(halo);
  const hemi = new T.HemisphereLight(0xffffff, 0x555555, 1); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffffff, 3); sun.castShadow = true;
  const sm = MOBILE ? 1024 : 2048; sun.shadow.mapSize.set(sm, sm);
  const R = MOBILE ? 55 : 75, sc = sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 10; sc.far = 520;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = .06; scene.add(sun); scene.add(sun.target);
  const cloudMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, fog: false }), clouds = [];
  const ico = new T.IcosahedronGeometry(1, 1);
  for (let i = 0; i < (MOBILE ? 7 : 12); i++) {
    const g = new T.Group();
    for (let k = 0; k < 5; k++) { const m = new T.Mesh(ico, cloudMat); m.position.set((k - 2) * 22 + Math.random() * 10, Math.random() * 8, Math.random() * 18); const s = 16 + Math.random() * 16; m.scale.set(s, s * .45, s); g.add(m); }
    g.position.set(-900 + Math.random() * 1800, 230 + Math.random() * 120, -900 + Math.random() * 1800); scene.add(g); clouds.push(g);
  }
  const P = {
    night: { top: C(0x050a1e), bot: C(0x1c2a52), sun: C(0x9ab0ff), ball: C(0xe6ecff), hs: C(0x5a72b8), hg: C(0x2c2e40), water: C(0x10224a), cloud: C(0x2a355c), sunI: 1.0, hemiI: 1.0, win: 1, lamp: 1, star: 1, exp: 1.3 },
    dawn: { top: C(0x3b5aa8), bot: C(0xffb48a), sun: C(0xffa868), ball: C(0xffd9a0), hs: C(0xa9a0d8), hg: C(0x7a5a4a), water: C(0x5a6f90), cloud: C(0xffc2a0), sunI: 2.6, hemiI: .75, win: .5, lamp: .4, star: .1, exp: 1 },
    day: { top: C(0x2a7fe0), bot: C(0xcfe6f4), sun: C(0xfff0d8), ball: C(0xfffbe8), hs: C(0xbcd8ff), hg: C(0x9a8f78), water: C(0x2f8fb0), cloud: C(0xffffff), sunI: 3.4, hemiI: 1.15, win: 0, lamp: 0, star: 0, exp: 1 },
    dusk: { top: C(0x2b3f86), bot: C(0xffa060), sun: C(0xff8f45), ball: C(0xffc070), hs: C(0x9a8fd0), hg: C(0x7a5646), water: C(0x4a6a9a), cloud: C(0xffb38a), sunI: 3.0, hemiI: .75, win: .75, lamp: .7, star: .15, exp: 1 }
  };
  const K = [[0, 'night'], [4.9, 'night'], [6.4, 'dawn'], [7.8, 'day'], [17.4, 'day'], [18.6, 'dusk'], [19.9, 'night'], [24, 'night']];
  const S = {}; for (const k in P.day) S[k] = typeof P.day[k] === 'number' ? 0 : new T.Color();
  const dir = new T.Vector3(), moon = new T.Vector3(.35, .7, -.5).normalize();
  G.night = 0;
  G.skyUpdate = (dt, hour, focus, camera) => {
    let i = 0; while (i < K.length - 2 && hour >= K[i + 1][0]) i++;
    const a = P[K[i][1]], b = P[K[i + 1][1]], f = Math.max(0, Math.min(1, (hour - K[i][0]) / (K[i + 1][0] - K[i][0])));
    for (const k in a) { if (typeof a[k] === 'number') S[k] = a[k] + (b[k] - a[k]) * f; else S[k].copy(a[k]).lerp(b[k], f); }
    const ang = (hour - 6) / 13 * Math.PI, el = Math.sin(ang), isDay = el > .04;
    if (isDay) dir.set(Math.cos(ang), Math.max(el, .12), .38).normalize(); else dir.copy(moon);
    const edge = isDay ? Math.min(1, .25 + el * 5) : Math.min(1, .25 + (-el) * 5);
    skyU.top.value.copy(S.top); skyU.bot.value.copy(S.bot); scene.fog.color.copy(S.bot);
    sun.color.copy(S.sun); sun.intensity = S.sunI * edge;
    hemi.color.copy(S.hs); hemi.groundColor.copy(S.hg); hemi.intensity = S.hemiI * 1.7;   // more light from the sky, so things in shadow are dim but not black
    MAT.water.color.copy(S.water); cloudMat.color.copy(S.cloud); ball.material.color.copy(S.ball);
    MAT.lit.emissiveIntensity = S.win * .7; MAT.bulb.emissiveIntensity = S.lamp * 1.5; MAT.gold.emissiveIntensity = .1 + S.win * .6; MAT.glow.opacity = S.lamp * .5;   // softer: lit windows you can see into, pools of lamp light that tint the street instead of painting it
    starMat.opacity = S.star; renderer.toneMappingExposure = S.exp; G.night = S.lamp;
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(dir, 260);
    ball.position.copy(camera.position).addScaledVector(dir, 1750);
    const lowSun = isDay ? 1 - Math.min(1, el * 3.2) : 0;   // 1 when the sun sits on the horizon
    skyU.sd.value.copy(dir); skyU.sc.value.copy(S.ball); skyU.gl.value = isDay ? .35 + .65 * lowSun : .12;
    halo.position.copy(ball.position); halo.material.color.copy(S.sun); halo.material.opacity = isDay ? .5 + .4 * lowSun : .18; halo.scale.setScalar(isDay ? 420 + 520 * lowSun : 300);
    for (const c of clouds) { c.position.x += dt * 2.5; if (c.position.x > 1000) c.position.x = -1000; }
  };
}
G.mooredDBG = () => MOORED.map(m => [Math.round(m.x * 10) / 10, Math.round(m.z * 10) / 10, m.hl, Math.round(m.c), Math.round(m.s)]);
