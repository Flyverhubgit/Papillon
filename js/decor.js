// Papillon - dresses the places you can walk into so that you know what they are from the street:
// the police station has police cars and officers outside, the hospital has ambulances and staff, the bank an armoured truck and guards ...
import { G, solidAt, onRoad } from './world.js';
import { newCar, makeNPC, dressUp, playAnim } from './actors.js';
import { markers } from './shops.js';

const SKIN = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524];
const HAIR = [0x1c1410, 0x2a1c14, 0x4a2f1a, 0x101010, 0xc9a24a];
const pickOf = a => a[Math.floor(Math.random() * a.length)];
const UNI = {
  police: { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', top: 0x3d78e6, bottom: 0x1a2a5c },
  medic: { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', top: 0xf2f4f7, bottom: 0x3a8ca8 },
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
    }
  }
}
