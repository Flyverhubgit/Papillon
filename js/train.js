// Papillon - the monorail train: three cars going round the loop, stopping at four stations.
// Walk into a MONORAIL ring while the train stands at that station to get on; press F at a station to get off.
import * as T from 'three';
import { G, RAIL, railAt } from './world.js';
import { addMarker } from './shops.js';

const SPEED = 15, STOP = 8, GAP = 10.4;
let tr = null; const q = {};
function carMesh(front) {
  const g = new T.Group(), body = new T.MeshStandardMaterial({ color: 0xf2f2ee, roughness: .4 }), teal = new T.MeshStandardMaterial({ color: 0x1f8a8a, roughness: .5 }), glass = new T.MeshStandardMaterial({ color: 0x152535, roughness: .1, metalness: .3 });
  const add = (w, h, d, m, x, y, z) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); };
  add(9.6, 2.5, 2.5, body, 0, 1.75, 0); add(9.62, .5, 2.52, teal, 0, .85, 0); add(8.6, .95, 2.54, glass, 0, 2.2, 0); add(9.2, .25, 2.1, teal, 0, 3.1, 0); add(8, .5, 1.3, teal, 0, .25, 0);
  if (front) add(.2, 1.1, 2.1, glass, 4.75, 2.1, 0);
  return g;
}
export function setupTrain(scene) {
  tr = { train: true, u: 60, v: 0, x: 0, z: 0, y: RAIL.y, h: 0, stopT: 0, next: 0, station: null, cars: [carMesh(true), carMesh(false), carMesh(false)] };
  tr.cars.forEach(c => scene.add(c)); G.train = tr;
  RAIL.stations.forEach((st, i) => addMarker({ x: st.mx, z: st.mz, type: 'rail', icon: 'M', text: 'MONORAIL', color: 0x1f8a8a, onEnter: () => {
    const p = G.player; if (G.stars > 2) { G.say('Not while the police are after you.', 2); return; }
    if (tr.stopT > 0 && tr.station === st) { p.ride = tr; G.say(st.name + '. Press F at a station to get off.', 5); if (G.sfx) G.sfx.door(); }
    else { const d = (((st.u - tr.u) % RAIL.len) + RAIL.len) % RAIL.len, eta = Math.ceil(d / SPEED + (tr.stopT > 0 ? tr.stopT : 0) + Math.floor(d / (RAIL.len / 4)) * STOP); G.say(st.name + ' station. Next train in about ' + eta + ' seconds. Press E again when it is here.', 4); }
  }, st }));
  place();
}
function place() {
  tr.cars.forEach((c, i) => { railAt(tr.u - i * GAP, q); c.position.set(q.x, RAIL.y + .35, q.z); c.rotation.y = q.h; });
  railAt(tr.u - GAP, q); tr.x = q.x; tr.z = q.z; tr.h = q.h;
}
export function updateTrain(dt) {
  if (!tr) return;
  if (tr.stopT > 0) {
    tr.stopT -= dt; tr.v = 0;
    // someone waiting in the ring gets on by himself when the train is standing there
    const p = G.player, st = tr.station; if (st && !p.ride && !p.car && G.stars <= 2 && Math.hypot(p.x - st.mx, p.z - st.mz) < 1.5 && !tr.asked) { tr.asked = true; p.ride = tr; G.say(st.name + '. Press F at a station to get off.', 5); }
    if (tr.stopT <= 0) { tr.station = null; tr.asked = false; }
  } else {
    const st = RAIL.stations[tr.next], d = (((st.u + GAP - tr.u) % RAIL.len) + RAIL.len) % RAIL.len;   // the middle car stops at the station
    const want = Math.min(SPEED, Math.max(1.2, Math.sqrt(2 * 2.2 * d))); tr.v += Math.max(-6 * dt, Math.min(3 * dt, want - tr.v));
    const step = tr.v * dt;
    if (step >= d) { tr.u += d; tr.stopT = STOP; tr.station = st; tr.next = (tr.next + 1) % RAIL.stations.length; if (G.player.ride === tr) G.say(st.name + '. Press F to get off.', 4); }
    else tr.u += step;
    tr.u %= RAIL.len;
  }
  place();
}
