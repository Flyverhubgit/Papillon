// Papillon - dresses the places you can walk into so that you know what they are from the street:
// the police station has police cars and officers outside, the hospital has ambulances and staff, the bank an armoured truck and guards ...
import * as T from 'three';
import { G, solidAt, onRoad } from './world.js';
import { newCar, makeNPC, dressUp, playAnim } from './actors.js';
import { markers } from './shops.js';

const SKIN = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524];
const HAIR = [0x1c1410, 0x2a1c14, 0x4a2f1a, 0x101010, 0xc9a24a];
const pickOf = a => a[Math.floor(Math.random() * a.length)];
const UNI = {
  police: { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', top: 0x3d78e6, bottom: 0x1a2a5c },
  medic: { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', top: 0xf2f4f7, bottom: 0x3a8ca8 },
  drinker: {},
  guard: { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', top: 0x4a4e57, bottom: 0x25272c },
};

// which way is the wall, and where does the street start? (from the doorway)
function layout(m) {
  const D = [[0, 1], [0, -1], [1, 0], [-1, 0]]; let wall = null, wt = 3.7;
  for (const [dx, dz] of D) for (let t = .2; t < wt; t += .1) if (solidAt(m.x + dx * t, m.z + dz * t, .05)) { wt = t; wall = [dx, dz]; break; }
  if (!wall) return null;
  const sx = -wall[0], sz = -wall[1]; let tr = -1;
  for (let t = .5; t < 16; t += .5) if (onRoad(m.x + sx * t, m.z + sz * t)) { tr = t; break; }
  return { sx, sz, ax: -sz, az: sx, tr };
}
const at = (m, L, out, lat) => ({ x: m.x + L.sx * out + L.ax * lat, z: m.z + L.sz * out + L.az * lat });

function parkCars(m, L, type, n, extra) {
  if (L.tr < 0) return 0; let made = 0;
  const base = L.tr + 2.1, h = Math.atan2(-L.az, L.ax);
  for (let i = 0; i < n; i++) {
    const lat = (i - (n - 1) / 2) * 5.6 + (extra || 0), p = at(m, L, base, lat);
    if (!onRoad(p.x, p.z)) continue;
    try { const c = newCar(typeof type === 'function' ? type(i) : type); c.x = p.x; c.z = p.z; c.h = h + (i % 4 === 3 ? Math.PI : 0); c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.h; c.decor = true; made++; } catch (e) { }
  }
  return made;
}
function stand(m, L, kind, out, lat, face) {
  const p = at(m, L, out, lat), yaw = Math.atan2(face ? L.sx : -L.sx + L.ax * lat * .15, face ? L.sz : -L.sz);
  try {
    const n = makeNPC('pm', Object.assign({ skin: pickOf(SKIN), hair: pickOf(HAIR) }, UNI[kind]), p.x, p.z, Math.atan2(L.sx, L.sz) + (Math.random() - .5) * (face ? .5 : 2.2));
    if (kind === 'police') dressUp(n, 'police'); else if (kind === 'guard') dressUp(n, 'guard');
    return n;
  } catch (e) { return null; }
}

const MAT = c => new T.MeshStandardMaterial({ color: c, roughness: .85 });
function bx(g, w, h, d, c, x, y, z) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), MAT(c)); m.position.set(x, y, z); m.castShadow = false; g.add(m); return m; }
function cy(g, r, h, c, x, y, z, r2) { const m = new T.Mesh(new T.CylinderGeometry(r2 === undefined ? r : r2, r, h, 12), MAT(c)); m.position.set(x, y, z); g.add(m); return m; }
// a pavement table with two chairs and a parasol; returns the two seat spots (world) so people can sit
function cafeTable(m, L, out, lat, col) {
  const p = at(m, L, out, lat), g = new T.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(L.sx, L.sz); G.scene.add(g);
  cy(g, .45, .05, 0xf2efe6, 0, .76, 0); cy(g, .04, .74, 0x2a2c30, 0, .37, 0); cy(g, .22, .03, 0x2a2c30, 0, .02, 0);
  const par = cy(g, 1.2, .4, col, 0, 2.3, 0, .05); par.scale.y = 1; cy(g, .03, 2.1, 0xd9d2c0, 0, 1.05, .0);
  const seats = [];
  for (const s of [-1, 1]) { bx(g, .4, .05, .4, 0x3a2f28, s * .78, .45, 0); bx(g, .05, .4, .4, 0x3a2f28, s * .97, .65, 0); for (const [dx, dz] of [[-.15, -.15], [.15, -.15], [-.15, .15], [.15, .15]]) bx(g, .04, .43, .04, 0x2a2c30, s * .78 + dx, .22, dz); seats.push({ x: p.x + Math.cos(g.rotation.y) * s * .78, z: p.z - Math.sin(g.rotation.y) * s * .78, s }); }
  return { seats, yaw: g.rotation.y };
}
function sitter(sp, tableYaw, look) {
  try { const n = makeNPC(Math.random() < .5 ? 'pw' : 'pm', Object.assign({ skin: pickOf(SKIN), hair: pickOf(HAIR), bottom: null }, look || { top: pickOf([0xb3362e, 0x2f5f9f, 0xe0b23a, 0x3f7a4a, 0x7a3f8f, 0xd9d2c0]) }), sp.x, sp.z, tableYaw + (sp.s > 0 ? -Math.PI / 2 : Math.PI / 2)); playAnim(n, 'Sit'); return n; } catch (e) { return null; }
}
function clothesRack(m, L, out, lat) {
  const p = at(m, L, out, lat), g = new T.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = Math.atan2(L.ax, L.az) + Math.PI / 2; G.scene.add(g);
  for (const x of [-.7, .7]) cy(g, .02, 1.6, 0xb9c0c8, x, .8, 0); bx(g, 1.5, .03, .03, 0xb9c0c8, 0, 1.6, 0);
  for (let k = 0; k < 9; k++) bx(g, .1, .7 + (k % 3) * .06, .2, [0xb3362e, 0x2f5f9f, 0xe0b23a, 0x2f7a5a, 0xf2f2ee, 0x30343f, 0x7a3f8f, 0xd98a1f][k % 8], -.65 + k * .16, 1.2 - (k % 3) * .03, 0);
}

export function dressPlaces() {
  const done = new Set();
  for (const m of markers) {
    if (m.indoor || done.has(m) || !m.door) continue;
    const L = layout(m); if (!L) continue; done.add(m);
    if (m.type === 'desk') {   // the police station: a whole fleet at the kerb, officers at the door and by the cars
      parkCars(m, L, 'police', 6);
      stand(m, L, 'police', 1.4, -2.3, true); stand(m, L, 'police', 1.4, 2.3, true); stand(m, L, 'police', 3.3, -1.2); stand(m, L, 'police', 3.6, 1.8);
    } else if (m.type === 'clinic') {   // the hospital: ambulances, with medics waiting
      parkCars(m, L, i => i === 2 ? 'sedan' : 'ambulance', 4);
      stand(m, L, 'medic', 1.4, -2.2, true); stand(m, L, 'medic', 1.6, 2.4); stand(m, L, 'medic', 3.4, 0);
    } else if (m.type === 'bank') {   // the bank: an armoured truck at the kerb and two guards at the door
      parkCars(m, L, 'truck', 1); stand(m, L, 'guard', 1.4, -2, true); stand(m, L, 'guard', 1.4, 2, true);
    } else if (m.type === 'gun') {   // the gun shop: a guard on the step
      stand(m, L, 'guard', 1.4, 2.2, true);

    } else if (m.type === 'food' && L.tr > 3.6) {   // the cafe: tables with parasols on the pavement, and people having coffee
      for (const [lat, col] of [[-2.8, 0xb3362e], [2.8, 0x2f5f9f]]) { const t = cafeTable(m, L, 2.4, lat, col); sitter(t.seats[0], t.yaw); if (Math.random() < .8) sitter(t.seats[1], t.yaw); }
    } else if (m.type === 'bar') {   // the bar: drinkers smoking and talking on the pavement
      for (const [out, lat] of [[1.9, -2.2], [2.3, -1.5], [1.9, 2.4]]) stand(m, L, 'drinker', out, lat);
    } else if (m.type === 'cloth') {   // the clothes shop: a rail of clothes on the pavement and a few shoppers
      clothesRack(m, L, 1.6, -2.4); clothesRack(m, L, 1.6, 2.4); stand(m, L, 'drinker', 3.0, -.8); stand(m, L, 'drinker', 3.0, .9);
    }
  }
}
