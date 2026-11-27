// Papillon - nature: real trees, bushes, grass, ferns, flowers and rocks (the Stylized Nature kit, shrunk, models/nat.js).
// Everything is drawn instanced, in squares of land, and a square is hidden when it is far away.
import * as T from 'three';

export const NAT = [];                              // placements [kind, x, z, scale, turn]
export const natAdd = (k, x, z, s, r) => NAT.push([k, x, z, s || 1, r || 0]);
const TREES = ['CommonTree_1', 'CommonTree_4', 'Pine_1', 'Pine_3', 'TwistedTree_1', 'DeadTree_2'];
const TALL = { CommonTree_1: 11, CommonTree_4: 9.5, Pine_1: 13, Pine_3: 14, TwistedTree_1: 9, DeadTree_2: 8, Bush_Common: 1.7, Bush_Common_Flowers: 1.6, Grass_Common_Tall: 1.0, Grass_Wispy_Short: .8, Fern_1: 1.0, Flower_3_Group: .7, Flower_4_Group: .8, Rock_Medium_1: 1.4, Rock_Medium_2: 1.2 };
const SMALL = new Set(['Grass_Common_Tall', 'Grass_Wispy_Short', 'Fern_1', 'Flower_3_Group', 'Flower_4_Group']);
const CELL = 130;
let cells = [], tick = 0, DENS = 1;
export const setDensity = v => { DENS = v; };

// a tiny seeded random, so the same land always grows the same plants
function rng(seed) { let a = (seed * 2654435761) >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// scatter plants over a rectangle: mode 'country' (a few trees, bushes, lots of grass, rocks) or 'park' (neat, flowery)
export function scatter(x0, z0, x1, z1, seed, mode, skip) {
  const R = rng(seed + 11), area = (x1 - x0) * (z1 - z0) / 1000 * DENS, put = (k, n, s0, s1) => { for (let i = 0; i < n; i++) { const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0); if (skip && skip(x, z)) continue; natAdd(k, x, z, s0 + R() * (s1 - s0), R() * 6.28); } };
  const pick = (a) => a[Math.floor(R() * a.length)];
  if (mode === 'garden') { for (let i = 0, c = Math.round(area * .55); i < c; i++) { const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0); if (skip && skip(x, z)) continue; natAdd(R() < .6 ? 'CommonTree_1' : R() < .6 ? 'CommonTree_4' : 'Pine_1', x, z, .6 + R() * .45, R() * 6.28); } put('Bush_Common', area * 1.1, .7, 1.2); put('Bush_Common_Flowers', area * .8, .8, 1.2); put('Flower_3_Group', area * 1.4, .8, 1.3); put('Flower_4_Group', area * 1.2, .8, 1.3); put('Grass_Common_Tall', area * 3, .8, 1.4); return; }
  if (mode === 'park') { put('Bush_Common_Flowers', area * .5, .8, 1.2); put('Bush_Common', area * .4, .8, 1.2); put('Flower_3_Group', area * 1.2, .8, 1.3); put('Flower_4_Group', area * 1.2, .8, 1.3); put('Grass_Common_Tall', area * 2, .8, 1.4); return; }
  const nT = Math.round(area * 1.1), cs = [0, 1, 2, 3].map(() => [x0 + R() * (x1 - x0), z0 + R() * (z1 - z0)]);   // trees grow in clumps: most stand near one of a few centres
  for (let i = 0; i < nT; i++) { let x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0); if (R() < .65) { const c = cs[i & 3]; x = Math.min(x1, Math.max(x0, c[0] + (R() - .5) * 34)); z = Math.min(z1, Math.max(z0, c[1] + (R() - .5) * 34)); } if (skip && skip(x, z)) continue; const r = R(); natAdd(r < .42 ? pick(['CommonTree_1', 'CommonTree_4']) : r < .74 ? pick(['Pine_1', 'Pine_3']) : r < .9 ? 'TwistedTree_1' : 'DeadTree_2', x, z, .8 + R() * .55, R() * 6.28); }
  put('Bush_Common', area * 1.6, .7, 1.4); put('Bush_Common_Flowers', area * .6, .8, 1.2); put('Grass_Common_Tall', area * 7, .8, 1.6); put('Grass_Wispy_Short', area * 7, .8, 1.6); put('Fern_1', area * 2, .8, 1.4); put('Flower_3_Group', area * 1.4, .8, 1.4); put('Flower_4_Group', area * 1.4, .8, 1.4); put('Rock_Medium_1', area * .25, .6, 1.6); put('Rock_Medium_2', area * .25, .6, 1.6);
}

// build it all: nat is the loaded model, yAt(x, z) the ground height, circle(x, z, r) adds a solid trunk
export function buildNature(scene, nat, yAt, circle) {
  cells = []; if (!nat) return;
  const tpl = {};
  for (const k of Object.keys(TALL)) {
    const root = nat.getObjectByName(k); if (!root) continue; root.updateWorldMatrix(true, true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert(), parts = [], box = new T.Box3();
    root.traverse(o => { if (!o.isMesh) return; const g = o.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld)), m = o.material; m.side = T.DoubleSide; if (/Leaves|Grass|Flower|Petal|Plant|Fern/i.test(m.name)) { m.alphaTest = .5; m.transparent = false; m.alphaToCoverage = true; } m.needsUpdate = true; g.computeBoundingBox(); box.union(g.boundingBox); parts.push([g, m]); });
    tpl[k] = { parts, k: TALL[k] / Math.max(.01, box.max.y - box.min.y), y0: box.min.y };
  }
  const by = new Map(), M = new T.Matrix4(), Q = new T.Quaternion(), UP = new T.Vector3(0, 1, 0), P = new T.Vector3(), S = new T.Vector3();
  for (const p of NAT) { if (!tpl[p[0]]) continue; const key = Math.floor(p[1] / CELL) + ',' + Math.floor(p[2] / CELL) + ',' + (SMALL.has(p[0]) ? 's' : 'b') + ',' + p[0]; let a = by.get(key); if (!a) by.set(key, a = []); a.push(p); if (TREES.includes(p[0])) circle(p[1], p[2], .35 * p[3]); }
  const grp = new Map();
  for (const [key, list] of by) {
    const [cx, cz, sz, k] = key.split(','), t = tpl[k], ck = cx + ',' + cz + ',' + sz; let G0 = grp.get(ck); if (!G0) { G0 = new T.Group(); G0.userData = { x: (+cx + .5) * CELL, z: (+cz + .5) * CELL, small: sz === 's' }; grp.set(ck, G0); scene.add(G0); cells.push(G0); }
    for (const [g, m] of t.parts) { const im = new T.InstancedMesh(g, m, list.length); list.forEach((p, i) => { const s = p[3] * t.k; P.set(p[1], yAt(p[1], p[2]) - t.y0 * s, p[2]); Q.setFromAxisAngle(UP, p[4]); S.set(s, s, s); M.compose(P, Q, S); im.setMatrixAt(i, M); }); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = false; im.userData.kind = k; G0.add(im); }
  }
}
// hide the squares of land that are far from the player (call often; it only works twice a second)
export function updateNature(px, pz, dt) {
  tick -= dt; if (tick > 0) return; tick = .5;
  for (const c of cells) { const d = Math.hypot(c.userData.x - px, c.userData.z - pz), lim = c.userData.small ? 120 : 380; c.visible = d < lim + CELL; }
}
