// Papillon - boats and the helicopter
import * as T from 'three';
import { G, HARB, COAST, inWater, landHeight, solidHeight, hulls, AIRPORT, JAIL, isleY } from './world.js';
import { puff, blast, clearLine, newPerson, copKey, playAnim } from './actors.js';
import { mergeStatic } from './merge.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .5 }, o || {}));
const box = (w, h, d, mat, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m; };

/* ================= boats ================= */
G.boats = [];
// The outline of a boat seen from above: square stern at -1, pointed bow at +1 (it is stretched to the boat's real size).
const plan = (k = 1) => { const s = new T.Shape(); s.moveTo(-1, -.42 * k); s.lineTo(.15, -.46 * k); s.quadraticCurveTo(.75, -.36 * k, 1 - (1 - k) * .6, 0); s.quadraticCurveTo(.75, .36 * k, .15, .46 * k); s.lineTo(-1, .42 * k); s.closePath(); return s; };
const slab = (shape, depth) => new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2);
const hullGeo = slab(plan(), 1), keelGeo = slab(plan(.72), 1);
const rimGeo = (() => { const o = plan(); const hole = new T.Path(plan(.86).getPoints(8).map(p => new T.Vector2(p.x * .97 - .01, p.y))); o.holes.push(hole); return slab(o, 1); })();   // the side walls round the cockpit
const bowGeo = (() => { const s = new T.Shape(); s.moveTo(.22, -.455); s.quadraticCurveTo(.77, -.36, 1, 0); s.quadraticCurveTo(.77, .36, .22, .455); s.closePath(); return slab(s, 1); })();   // the covered foredeck
const label = (text, bg, fg) => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 256, 64); x.fillStyle = fg; x.font = '900 46px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 35); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
const cyl = (r, len, mat, x, y, z, axis) => { const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 10), mat); if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2; m.position.set(x, y, z); m.castShadow = true; return m; };
// A motor boat. Forward is +x. The hull is a real boat shape: a dark underwater part, coloured sides, a white rim round an open cockpit,
// a covered bow with a rail, a windscreen, a wheel and seats, and an outboard motor on the stern. police = the police launch.
function newBoat(x, z, h, color, police) {
  const g = new T.Group(), L = 6.4, SX = L / 2, SZ = L / 2 * 1.05, put = (geo, mat, y, hgt, sx = 1, sz = 1) => { const m = new T.Mesh(geo, mat); m.scale.set(SX * sx, hgt, SZ * sz); m.position.y = y; m.castShadow = true; g.add(m); return m; };
  const white = M(0xf4f3ee, { roughness: .35 }), dark = M(0x22252b), wood = M(0x9a6a3a, { roughness: .7 }), steel = M(0xb9c0c8, { roughness: .3, metalness: .5 }), glass = M(0x9fd0e8, { roughness: .1, transparent: true, opacity: .5 }), seat = M(police ? 0x2a2f3a : 0xe9e4d6);
  put(keelGeo, M(police ? 0x10182e : 0x7a2a22, { roughness: .6 }), -.78, .3, .97);            // under the water
  put(hullGeo, M(color, { roughness: .35 }), -.5, .62);                                        // the sides
  put(hullGeo, white, .12, .05, 1.005, 1.01);                                                  // a white line where the deck meets the hull
  put(hullGeo, police ? M(0x3a4048, { roughness: .8 }) : wood, .13, .05, .95, .9);             // the cockpit floor
  put(rimGeo, police ? M(0x6f7780, { roughness: .6 }) : white, .17, .34);                      // the walls round the cockpit (grey rubber on the police boat)
  put(bowGeo, white, .5, .06);                                                                 // foredeck
  g.add(box(.5, .04, .5, dark, 1.55, .58, 0));                                                 // hatch
  for (const s of [-1, 1]) { const rail = cyl(.025, 1.5, steel, 2.0, .86, s * .78, 'x'); rail.rotation.y = s * .33; g.add(rail); for (const px of [1.35, 2.6]) g.add(cyl(.02, .3, steel, px, .7, s * (px > 2 ? .55 : 1.02), 'y')); }   // the bow rail
  g.add(box(.1, .1, .1, steel, 3.02, .6, 0));                                                  // bow cleat
  if (!police) {
    const ws = box(.06, .5, 1.9, glass, .98, .86, 0); ws.rotation.z = .45; g.add(ws); g.add(box(.07, .05, 1.96, steel, 1.09, 1.08, 0));   // windscreen and its top frame
    g.add(box(.35, .5, 1.9, white, .78, .42, 0));                                              // dashboard
    const wheel = new T.Mesh(new T.TorusGeometry(.17, .025, 6, 14), dark); wheel.rotation.y = Math.PI / 2; wheel.rotation.z = -.35; wheel.position.set(.55, .72, -.48); g.add(wheel);
    for (const s of [-1, 1]) { g.add(box(.5, .12, .52, seat, -.1, .36, s * .48)); g.add(box(.1, .5, .52, seat, -.37, .6, s * .48)); }   // two seats
    g.add(box(.5, .26, 2.0, seat, -2.35, .3, 0)); g.add(box(.1, .34, 2.0, seat, -2.62, .5, 0));   // the bench across the stern
    g.add(cyl(.012, .9, steel, -2.95, .95, .95, 'y')); g.add(box(.02, .22, .36, M(color), -2.95, 1.28, .77));   // a little flag
  } else {
    // the wheelhouse: white, with dark windows all round, POLICE on the sides, lights and a mast on the roof
    g.add(box(1.9, 1.15, 1.75, white, .25, .75, 0)); g.add(box(2.1, .08, 1.95, M(0x1b2a55), .25, 1.36, 0));
    const win = M(0x18222e, { roughness: .1, metalness: .4 }); const fw = box(.06, .5, 1.5, win, 1.21, .98, 0); g.add(fw); g.add(box(.06, .45, 1.3, win, -.71, 1.0, 0)); for (const s of [-1, 1]) g.add(box(1.4, .45, .05, win, .3, 1.0, s * .885));
    const lab = new T.MeshBasicMaterial({ map: label('POLICE', '#1b2a55', '#ffffff') });
    for (const s of [-1, 1]) { const pl = new T.Mesh(new T.PlaneGeometry(1.5, .34), lab); pl.position.set(.25, .5, s * .886); pl.rotation.y = s > 0 ? 0 : Math.PI; g.add(pl);
      const hl = new T.Mesh(new T.PlaneGeometry(1.7, .36), lab); hl.position.set(-1.6, -.12, s * 1.428); hl.rotation.y = s > 0 ? 0 : Math.PI; g.add(hl);                      // and on the hull
      for (let k = 0; k < 6; k++) g.add(box(.3, .16, .03, M(k % 2 ? 0xe6d21f : 0x1f4fbf), -.5 + k * .3, .27, s * .89)); }                                                  // blue and yellow squares
    g.add(cyl(.03, .9, dark, -.3, 1.85, 0, 'y')); g.add(box(.5, .06, .12, white, -.3, 2.2, 0)); g.add(cyl(.02, .5, dark, -.3, 2.5, 0, 'y'));                               // mast with radar bar and aerial
    g.add(box(.2, .2, .2, M(0xdfe6ee, { emissive: 0xfff2c0, emissiveIntensity: .8 }), 1.05, 1.5, 0));                                                                       // searchlight
    g.add(box(.3, .9, 1.5, M(0x2a2f3a), -2.5, .5, 0));                                                                                                                     // equipment locker at the stern
  }
  // the outboard motor
  g.add(box(.55, .62, .48, police ? M(0x15171c) : M(0x2b2e35), -3.3, .62, 0)); g.add(box(.5, .08, .5, M(0xc8ccd2), -3.3, .96, 0)); g.add(box(.16, 1.0, .16, dark, -3.36, -.1, 0)); g.add(box(.3, .08, .34, dark, -3.4, -.55, 0));
  if (police) { g.add(box(.55, .62, .48, M(0x15171c), -3.3, .62, .75)); g.add(box(.16, 1.0, .16, dark, -3.36, -.1, .75)); }   // a second engine
  mergeStatic(g);
  const b = { g, x, z, h, vx: 0, vz: 0, v: 0, boat: true, roll: 0, seat: police ? null : { x: -.05, y: -.02, z: -.48 }, hp: 100, burnT: 0, home: { x, z, h } };
  G.scene.add(g); G.boats.push(b); placeBoat(b); return b;
}
function placeBoat(b) { b.g.position.set(b.x, -1.02 + Math.sin(G.time * 1.3 + b.x) * .07, b.z); b.g.rotation.set(b.roll, b.h, Math.sin(G.time * 1.1 + b.z) * .03, 'YXZ'); }
export function boatBlocked(x, z) {
  if (!inWater(x, z) || landHeight(x, z) > .15 || isleY(x, z) !== null) return true;
  for (const h of hulls) if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return true;
  if (x > HARB.x0 && x < HARB.x1 && Math.abs(z) < HARB.z1) {
    if (Math.abs(z) > 16) for (let px = -165; px <= 35; px += 40) if (Math.abs(x - px) < 8.5) return true;
    if (x > 50 && Math.abs(z) < 35 && Math.abs(z + 22.5) > 2.4) return true;   // the sailing boats along the east quay, with one lane left open for the motor boat moored between them
  }
  if (x > -243 && x < COAST && ((z > -86 && z < -38) || (z > 54 && z < 70))) return true;
  return Math.abs(z) > 1400 || x < -1500;
}
export function swimBlocked(x, z) {
  if (!inWater(x, z) || landHeight(x, z) > .15 || isleY(x, z) !== null) return true;
  for (const h of hulls) if (x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return true;
  if (x > -243 && x < COAST && ((z > -86 && z < -38) || (z > 54 && z < 70))) return true;
  return Math.abs(z) > 1400 || x < -1500;
}
export function driveBoat(b, thr, steer, dt) {
  let fx = Math.cos(b.h), fz = -Math.sin(b.h), vf = b.vx * fx + b.vz * fz, vl = -b.vx * fz + b.vz * fx;
  vf += (thr > 0 ? (b.row ? 3.2 : b.sail ? 4.5 : 9) : (b.row ? 2 : b.sail ? 2 : 5)) * thr * dt; vf -= vf * .45 * dt; vf = clamp(vf, b.row ? -2 : b.sail ? -3 : -6, b.row ? 5.4 : 26);   // a rowing canoe is slow vl *= Math.exp(-2.2 * dt);   // a sailing boat is slower and gentler than a motor boat
  if (b.sail && b.sailG) { b.swing = (b.swing || 0) + ((steer * .55 + (thr > 0 ? .35 : .12) * (b.tack || 1)) - (b.swing || 0)) * Math.min(1, dt * 1.8); if (Math.abs(steer) > .3) b.tack = Math.sign(steer); b.sailG.rotation.y = b.swing; }   // the boom swings out, and over to the other side when you turn
  const turn = steer * (b.sail ? 1.0 : 1.5) * Math.min(1, Math.abs(vf) / 3) * (vf < 0 ? -1 : 1); b.h -= turn * dt; b.roll += ((b.sail ? -(b.swing || 0) * .3 * Math.min(1, Math.abs(vf) / 5) : -steer * Math.min(1, Math.abs(vf) / 10) * .35) - b.roll) * Math.min(1, dt * 4);
  fx = Math.cos(b.h); fz = -Math.sin(b.h); b.vx = fx * vf - fz * vl; b.vz = fz * vf + fx * vl;
  const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
  const free = (x, z) => !boatBlocked(x + fx * 2.6, z + fz * 2.6) && !boatBlocked(x - fx * 2.6, z - fz * 2.6);
  if (!free(nx, nz) && b === G.player.ride) { const hit = Math.hypot(b.vx, b.vz); if (hit > 6.5 && !(b.hitCd > G.time)) { b.hitCd = G.time + .5; b.hp -= (hit - 5) * 2.2; if (G.sfx) G.sfx.crash(hit); if (G.shake) G.shake(Math.min(1, hit * .06)); } }   // running into a quay or the shore dents it like a car
  if (free(nx, nz)) { b.x = nx; b.z = nz; }
  else if (free(nx, b.z)) { b.x = nx; b.vz *= -.2; }
  else if (free(b.x, nz)) { b.z = nz; b.vx *= -.2; }
  else { b.vx *= -.3; b.vz *= -.3; }
  b.v = Math.hypot(b.vx, b.vz);
}
// where the player can step ashore from a boat, or null
export function boatLanding(b) {
  if (b.x > HARB.x0 && b.x < HARB.x1) { if (b.z < HARB.z0 + 7) return { x: b.x, z: HARB.z0 - 2 }; if (b.z > HARB.z1 - 7) return { x: b.x, z: HARB.z1 + 2 }; }
  if (b.x > HARB.x1 - 9 && Math.abs(b.z) < HARB.z1) return { x: HARB.x1 + 2, z: b.z };
  if (b.x < COAST && b.x > COAST - 7 && Math.abs(b.z) > 90) return { x: COAST + 2.5, z: b.z };
  return null;
}

/* ================= helicopter ================= */
G.helis = [];
function newHeli(x, z, h) {
  const g = new T.Group(), body = M(0xf2f2ee, { roughness: .35 }), dark = M(0x1f3f8a, { roughness: .4 }), blk = M(0x1c1d22);
  const cab = new T.Mesh(new T.SphereGeometry(1, 18, 12), body); cab.scale.set(2.1, 1.15, 1.15); cab.position.set(.3, 1.55, 0); cab.castShadow = true; g.add(cab);
  const glass = new T.Mesh(new T.SphereGeometry(1, 16, 12), M(0x152535, { roughness: .08, metalness: .3 })); glass.scale.set(1.25, .98, 1.06); glass.position.set(1.3, 1.66, 0); g.add(glass);
  g.add(box(3.6, .28, .28, dark, -3.0, 1.75, 0)); g.add(box(.5, 1.1, .08, dark, -4.6, 2.2, 0)); g.add(box(2.0, .5, 1.0, dark, -.6, 1.2, 0));
  g.add(box(.18, .5, .18, blk, .1, 2.8, 0));
  for (const s of [1, -1]) { g.add(box(3.2, .09, .09, blk, .3, .12, s * .95)); g.add(box(.08, .7, .08, blk, 1.1, .45, s * .95)); g.add(box(.08, .7, .08, blk, -.5, .45, s * .95)); }
  const rotor = new T.Group(); rotor.position.set(.1, 3.08, 0); rotor.add(box(9.4, .05, .3, blk), box(.3, .05, 9.4, blk)); g.add(rotor);
  const tail = new T.Group(); tail.position.set(-4.6, 2.25, .12); tail.add(box(1.5, .2, .03, blk), box(.2, 1.5, .03, blk)); g.add(tail);
  const hl = { g, rotor, tail, x, z, y: 0, h, vx: 0, vy: 0, vz: 0, v: 0, spin: 0, heli: true, pitch: 0, roll: 0 };
  G.scene.add(g); G.helis.push(hl); placeHeli(hl); return hl;
}
// a small propeller plane. It lives in the same list as the helicopter so getting in, the camera and the map all just work
function newPlane(x, z, h) {
  const g = new T.Group(), body = M(0xf4f2ec, { roughness: .35 }), red = M(0xc8102e, { roughness: .4 }), blk = M(0x1c1d22), glass = M(0x152535, { roughness: .08, metalness: .3 });
  const fus = new T.Mesh(new T.CylinderGeometry(.75, .45, 7.4, 12).rotateZ(-Math.PI / 2), body); fus.position.set(-.3, 1.55, 0); fus.castShadow = true; g.add(fus);
  const nose = new T.Mesh(new T.CylinderGeometry(.45, .75, 1.2, 12).rotateZ(-Math.PI / 2), red); nose.position.set(3.95, 1.55, 0); g.add(nose);
  g.add(box(1.9, .7, 1.25, glass, 1.2, 2.2, 0)); g.add(box(1.8, .16, 10.6, body, .9, 2.62, 0)); g.add(box(1.8, .17, 2.2, red, .9, 2.63, 4.4)); g.add(box(1.8, .17, 2.2, red, .9, 2.63, -4.4));
  g.add(box(.09, 1.1, .09, blk, 1.3, 2.1, 2.3)); g.add(box(.09, 1.1, .09, blk, 1.3, 2.1, -2.3));
  g.add(box(1.0, .1, 3.4, body, -3.6, 1.75, 0)); g.add(box(1.3, 1.5, .12, red, -3.6, 2.5, 0));
  for (const sz of [1.1, -1.1]) { g.add(box(.1, 1.0, .1, blk, 1.0, .75, sz)); const w = new T.Mesh(new T.CylinderGeometry(.3, .3, .2, 12).rotateX(Math.PI / 2), blk); w.position.set(1.0, .3, sz); g.add(w); }
  const tw = new T.Mesh(new T.CylinderGeometry(.18, .18, .14, 10).rotateX(Math.PI / 2), blk); tw.position.set(-3.5, .9, 0); g.add(tw); g.add(box(.08, .5, .08, blk, -3.5, 1.1, 0));
  const prop = new T.Group(); prop.position.set(4.6, 1.55, 0); prop.add(box(.06, 2.6, .22, blk), box(.06, .22, 2.6, blk)); g.add(prop);
  const pl = { g, prop, x, z, y: 0, h, s: 0, vx: 0, vy: 0, vz: 0, v: 0, spin: 0, heli: true, plane: true, pitch: 0, roll: 0, air: false };
  G.scene.add(g); G.helis.push(pl); placeHeli(pl); return pl;
}
// W = throttle, S = brake, A/D = steer on the ground and bank in the air, Space = climb, Shift = descend. Too slow in the air and it sinks.
function flyPlane(pl, thr, steer, up, dt, on) {
  pl.spin += ((on ? 1 : 0) - pl.spin) * Math.min(1, dt * (on ? 1.2 : .5)); pl.prop.rotation.x += pl.spin * (18 + pl.s * .5) * dt;
  const floor = heliFloor(pl.x, pl.z), air = pl.y > floor + .15;
  if (on && pl.spin > .7) pl.s += (thr > 0 ? thr * 9 : thr * (air ? 6 : 16)) * dt;
  pl.s -= pl.s * (air ? .05 : (on && thr > 0 ? .05 : .9)) * dt; if (!on && air) pl.s -= 3 * dt;
  pl.s = clamp(pl.s, 0, 58);
  pl.h -= steer * (air ? .85 : 1.1 * Math.min(1, pl.s / 8)) * dt;
  const fx = Math.cos(pl.h), fz = -Math.sin(pl.h);
  if (air) { const want = pl.s < 22 ? -9 : up > 0 ? up * 26 : up * 15; pl.vy += (want - pl.vy) * Math.min(1, dt * 2.4); }   // climbs about 25 degrees: the tallest tower is 142 m, so it can be cleared from 60 m away
  else if (pl.s > 26 && up > 0) pl.vy = 3; else pl.vy = 0;
  let nx = clamp(pl.x + fx * pl.s * dt, -1100, 900), nz = clamp(pl.z + fz * pl.s * dt, -900, 900);
  const nf = heliFloor(nx, nz);
  if (nf > pl.y + .8) { if (on && pl.s > 12) { G.hurt(Math.min(90, pl.s * 2)); if (G.sfx) G.sfx.crash(20); G.say('Crash!', 2); } pl.s = 0; pl.vy = Math.min(pl.vy, 0); }
  else { pl.x = nx; pl.z = nz; }
  pl.y += pl.vy * dt; if (pl.y > 320) { pl.y = 320; pl.vy = 0; }
  const f2 = heliFloor(pl.x, pl.z);
  if (pl.y <= f2) { if (pl.vy < -9 && on) { G.hurt(40); if (G.sfx) G.sfx.crash(12); G.say('Hard landing!', 2); } pl.y = f2; if (pl.vy < 0) pl.vy = 0; if (f2 > 1 || inWater(pl.x, pl.z)) pl.s -= pl.s * 3 * dt; }
  pl.pitch += (clamp(pl.vy * .035, -.35, .35) * (air ? 1 : 0) - pl.pitch) * Math.min(1, dt * 3); pl.roll += (clamp(steer * .55, -.55, .55) * (air ? 1 : 0) - pl.roll) * Math.min(1, dt * 3);
  pl.vx = fx * pl.s; pl.vz = fz * pl.s; pl.v = pl.s; pl.air = air; placeHeli(pl);
}
function placeHeli(hl) { hl.g.position.set(hl.x, hl.y, hl.z); hl.g.rotation.set(hl.roll, hl.h, hl.pitch, 'YXZ'); }
// The helicopter is wide: what is under any part of it counts, not only what is under its middle
const WIDE = [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5], [1.8, 1.8], [-1.8, 1.8], [1.8, -1.8], [-1.8, -1.8], [1.25, 0], [-1.25, 0], [0, 1.25], [0, -1.25]];
function heliFloorWide(x, z) { let m = 0; for (const o of WIDE) m = Math.max(m, heliFloor(x + o[0], z + o[1])); return m; }
export function heliFloor(x, z) { if (inWater(x, z) && landHeight(x, z) < .2) return 1.2; return Math.max(landHeight(x, z), solidHeight(x, z)); }
export function flyHeli(hl, thr, steer, up, dt, on) {
  if (hl.dead) {   // shot down: the engine is out, it spins and falls
    hl.spin += (0 - hl.spin) * Math.min(1, dt * .8); if (hl.rotor) { hl.rotor.rotation.y += hl.spin * 26 * dt; hl.h += 2.4 * dt; } if (hl.prop) hl.prop.rotation.x += hl.spin * 18 * dt;
    hl.vy -= 11 * dt; hl.vx -= hl.vx * .3 * dt; hl.vz -= hl.vz * .3 * dt; const nx = clamp(hl.x + hl.vx * dt, -1100, 900), nz = clamp(hl.z + hl.vz * dt, -900, 900);
    if (heliFloor(nx, nz) > hl.y + .8) { hl.vx = hl.vz = 0; } else { hl.x = nx; hl.z = nz; }
    hl.y += hl.vy * dt; hl.pitch += (.25 - hl.pitch) * Math.min(1, dt * 2); hl.roll += (.3 - hl.roll) * Math.min(1, dt * 2); hl.air = true; hl.v = Math.hypot(hl.vx, hl.vy, hl.vz); placeHeli(hl); return;
  }
  if (hl.plane) return flyPlane(hl, thr, steer, up, dt, on);
  hl.spin += ((on ? 1 : 0) - hl.spin) * Math.min(1, dt * (on ? .9 : .5));
  hl.rotor.rotation.y += hl.spin * 26 * dt; hl.tail.rotation.z += hl.spin * 40 * dt;
  let floor = heliFloor(hl.x, hl.z); { const fw = heliFloorWide(hl.x, hl.z); if (hl.y >= fw - .8) floor = fw; } const air = hl.y > floor + .15, ready = hl.spin > .85;
  if (ready) hl.vy += (up * 9 - hl.vy * 1.6) * dt; else hl.vy -= 6 * dt;
  if (!on && air) hl.vy -= 5 * dt;
  let fx = Math.cos(hl.h), fz = -Math.sin(hl.h);
  if (air && ready) { hl.h -= steer * 1.5 * dt; fx = Math.cos(hl.h); fz = -Math.sin(hl.h); hl.vx += fx * thr * 14 * dt; hl.vz += fz * thr * 14 * dt; }
  const drag = air ? .55 : 6; hl.vx -= hl.vx * drag * dt; hl.vz -= hl.vz * drag * dt;
  const sp = Math.hypot(hl.vx, hl.vz); if (sp > 36) { hl.vx *= 36 / sp; hl.vz *= 36 / sp; }
  let nx = hl.x + hl.vx * dt, nz = hl.z + hl.vz * dt;
  nx = clamp(nx, -1100, 900); nz = clamp(nz, -900, 900);
  const nf = heliFloorWide(nx, nz);
  if (nf > hl.y + .8) { hl.vx *= -.35; hl.vz *= -.35; } else { hl.x = nx; hl.z = nz; }   // a wall, a roof edge or a hillside in the way of any part of it: it bounces back
  hl.y += hl.vy * dt; if (hl.y > 320) { hl.y = 320; hl.vy = 0; }
  let f2 = heliFloor(hl.x, hl.z); { const fw = heliFloorWide(hl.x, hl.z); if (hl.y >= fw - .8) f2 = fw; }   // coming down on a roof edge: it rests on the roof, it does not sink through it
  if (hl.y <= f2) { hl.y = f2; if (hl.vy < 0) hl.vy = 0; }
  const vf = hl.vx * fx + hl.vz * fz;
  hl.pitch += (clamp(-thr * .22 - vf * .004, -.3, .3) * (air ? 1 : 0) - hl.pitch) * Math.min(1, dt * 3); hl.roll += (clamp(steer * .3, -.3, .3) * (air ? 1 : 0) - hl.roll) * Math.min(1, dt * 3);
  hl.v = Math.hypot(hl.vx, hl.vy, hl.vz); hl.air = air; placeHeli(hl);
}

/* ================= police helicopter ================= */
// From four stars a police helicopter circles above you and keeps the police on your trail; from five it shoots.
let copter = null;
function updateCopter(dt) {
  const pl = G.player, px = pl.car ? pl.car.x : pl.ride ? pl.ride.x : pl.x, pz = pl.car ? pl.car.z : pl.ride ? pl.ride.z : pl.z, sea = !G.inside && ((pl.ride && pl.ride.boat) || pl.swim), air = !G.inside && pl.ride && pl.ride.heli ? pl.ride : null, on = G.stars >= (sea || air ? 2 : 4) && !G.inside;   // when you fly it comes from two stars too, and shoots your aircraft down   // out on the water it comes from two stars, and shoots from three
  if (!copter) {
    if (!on) return;
    copter = newHeli(px + 160, pz - 120, 0); G.helis.pop(); copter.y = 60; copter.ang = rr2(0, 6); copter.cd = 2; copter.spin = 1;
    copter.g.traverse(o => { if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0xf2f2ee) { o.material = o.material.clone(); o.material.color.setHex(0x1b2a55); } });
  }
  const c = copter; c.g.visible = true; c.rotor.rotation.y += 26 * dt; c.tail.rotation.z += 40 * dt;
  if (on) { c.ang += dt * .35; const rad = air ? 20 : 16; c.tx = px + Math.cos(c.ang) * rad; c.tz = pz + Math.sin(c.ang) * rad; c.ty = air ? Math.max(heliFloor(c.x, c.z) + 6, air.y + 5) : Math.max(24, heliFloor(c.x, c.z) + 14); c.away = 0; }
  else { c.away = (c.away || 0) + dt; c.tx = c.x + 40; c.tz = c.z - 30; c.ty = 90; if (c.away > 9) { c.g.visible = false; G.scene.remove(c.g); copter = null; return; } }
  const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz), sp = Math.min(air ? 46 : 34, d * 1.2);
  if (d > .1) { c.x += dx / d * sp * dt; c.z += dz / d * sp * dt; }
  c.y += (c.ty - c.y) * Math.min(1, dt * (air ? 1.6 : .8)); c.h += wrap2(Math.atan2(-(pz - c.z), px - c.x) - c.h) * Math.min(1, dt * 2); c.pitch = -.12; c.roll = 0; placeHeli(c);
  const dist = Math.hypot(px - c.x, pz - c.z);
  if (on && dist < 60) G.lostT = 0;   // it can see you: the stars do not fade
  if (on && air && !air.dead && dist < 60) {   // you are flying: it shoots at your aircraft until it comes down
    c.cd -= dt; if (c.cd <= 0) { c.cd = rr2(.9, 1.7) * (G.stars >= 4 ? .65 : 1); const hit = Math.random() < (dist < 30 ? .5 : .32);
      G.tracer(c.x, c.y + 1, c.z, px + (hit ? 0 : rr2(-3, 3)), air.y + 1.5 + (hit ? 0 : rr2(-2, 2)), pz + (hit ? 0 : rr2(-3, 3))); if (G.sfx) G.sfx.shot(true);
      if (hit) { if (air.hp === undefined) air.hp = 100; air.hp -= rr2(9, 14); air.copShot = G.time; if (G.shake) G.shake(.35); if (G.sfx && G.sfx.crash) G.sfx.crash(5); if (air.hp > 0 && air.hp < 50 && !air.warned && G.say) { air.warned = true; G.say('You are hit and smoking. Land, or they will shoot you down!', 4); } } }
  }
  else if (on && G.stars >= (sea ? 3 : 5) && dist < 45) { c.cd -= dt; if (c.cd <= 0) { c.cd = rr2(1.2, 2.4); const hit = Math.random() < (pl.car || pl.ride ? .15 : .28); G.tracer(c.x, c.y + 1, c.z, px + (hit ? 0 : rr2(-2, 2)), 1.2, pz + (hit ? 0 : rr2(-2, 2))); if (G.sfx) G.sfx.shot(true); if (hit) G.copHurt(8); } }
}
// Aircraft can be shot down: under half they smoke, at nothing the engine stops, they fall and blow up where they land. A new one is parked again after a while.
const downed = [];
function airDamage(dt) {
  const p = G.player;
  for (let i = downed.length - 1; i >= 0; i--) { const d = downed[i]; d.t -= dt; if (d.t <= 0 && Math.hypot(p.x - d.hl.hx, p.z - d.hl.hz) > 60) { const hl = d.hl; hl.x = hl.hx; hl.z = hl.hz; hl.h = hl.hh; hl.y = heliFloor(hl.x, hl.z); hl.vx = hl.vy = hl.vz = 0; if (hl.s !== undefined) hl.s = 0; hl.hp = 100; hl.dead = false; hl.warned = false; hl.spin = 0; hl.pitch = hl.roll = 0; hl.g.visible = true; G.helis.push(hl); placeHeli(hl); downed.splice(i, 1); } }
  for (let i = G.helis.length - 1; i >= 0; i--) {
    const hl = G.helis[i]; if (hl.hp === undefined) { hl.hp = 100; hl.hx = hl.x; hl.hz = hl.z; hl.hh = hl.h; }
    // crashing: a sudden stop (into a building, a hill, a hard landing) costs health by how hard it was
    { const lx = hl.lvx || 0, ly = hl.lvy || 0, lz = hl.lvz || 0, dv = Math.hypot(hl.vx - lx, hl.vy - ly, hl.vz - lz); hl.lvx = hl.vx; hl.lvy = hl.vy; hl.lvz = hl.vz;
      if (!hl.dead && p.ride === hl && dv > 4.5 && !(hl.hitCd > G.time)) { hl.hitCd = G.time + .4; hl.hp -= Math.min(45, (dv - 3.5) * 2); if (G.sfx && G.sfx.crash) G.sfx.crash(dv); if (G.shake) G.shake(Math.min(1, dv * .07));
        if (hl.hp > 0 && hl.hp < 50 && !hl.warned && G.say) { hl.warned = true; G.say('It is badly damaged and smoking. One more crash and it blows up!', 4); } } }
    if (hl.hp < 50) { hl.smokeT = (hl.smokeT || 0) - dt; if (hl.smokeT <= 0) { hl.smokeT = .07 + Math.max(0, hl.hp) * .004; puff(hl.x + rr2(-.4, .4), hl.y + 2.2, hl.z + rr2(-.4, .4), hl.hp <= 0 ? (Math.random() < .5 ? 0xff8a1f : 0x222222) : hl.hp < 22 ? 0x2a2a2a : 0x9a9a9a, rr2(.4, .8), rr2(1.5, 3), rr2(.8, 1.5)); } }
    if (hl.hp <= 0 && !hl.dead) { hl.dead = true; if (p.ride === hl && G.say) G.say('Engine out! You are going down!', 4); }
    if (!hl.dead) continue;
    if (p.ride !== hl) flyHeli(hl, 0, 0, 0, dt, false);   // nobody aboard: it still falls
    const floor = heliFloor(hl.x, hl.z);
    if (hl.y <= floor + .05) {   // it hits the ground (or a roof, or the sea) and blows up
      const hard = hl.vy < -13, aboard = p.ride === hl; hl.y = floor; blast(hl.x, hl.z, 6);
      if (aboard) { p.ride = null; p.x = hl.x; p.z = hl.z; p.px = p.x; p.pz = p.z; p.y = floor; p.vy = 0; p.speed = 0; (hl.copShot > G.time - 20 ? G.copHurt : G.hurt)(hard ? 200 : 60); }   // shot down by the police helicopter: that crash is theirs
      hl.g.visible = false; hl.vx = hl.vy = hl.vz = 0; G.helis.splice(i, 1); downed.push({ hl, t: 75 });
    }
  }
}
G.airDBG = () => ({ copter: copter ? [Math.round(copter.x), Math.round(copter.y), Math.round(copter.z)] : null, downed: downed.length });
/* ================= sailing boats ================= */
// A small sailing yacht you can take: a slim hull with a little cabin, a mast with a mainsail on a boom and a jib, and a tiller at the stern.
function newSail(x, z, h, color) {
  const g = new T.Group(), L = 7.6, SX = L / 2, SZ = L / 2 * .82, put = (geo, mat, y, hgt, sx = 1, sz = 1) => { const m = new T.Mesh(geo, mat); m.scale.set(SX * sx, hgt, SZ * sz); m.position.y = y; m.castShadow = true; g.add(m); return m; };
  const white = M(0xf6f4ee, { roughness: .35 }), wood = M(0x9a6a3a, { roughness: .7 }), steel = M(0xc0c6cc, { roughness: .3, metalness: .5 }), cloth = M(0xfbf8ef, { roughness: .9, side: T.DoubleSide }), dark = M(0x22252b);
  put(keelGeo, M(0x1f3a5a, { roughness: .6 }), -.85, .4, .96); put(hullGeo, M(color, { roughness: .35 }), -.5, .62); put(hullGeo, white, .12, .05, 1.005, 1.01); put(hullGeo, wood, .13, .05, .95, .9); put(rimGeo, white, .17, .26); put(bowGeo, white, .42, .05);
  g.add(box(.18, 1.4, .1, dark, -.2, -1.6, 0));                                                   // the keel fin, down in the water
  g.add(box(2.2, .5, 1.5, white, .9, .45, 0)); g.add(box(2.3, .06, 1.6, wood, .9, .72, 0)); for (const s of [-1, 1]) g.add(box(1.5, .2, .04, M(0x1b2530, { roughness: .1 }), .9, .5, s * .76));   // the cabin with its windows
  g.add(cyl(.07, 9.2, steel, .7, 5.0, 0, 'y'));                                                   // the mast
  for (const s of [-1, 1]) { const st = cyl(.012, 9.3, steel, .7, 4.8, s * .75, 'y'); st.rotation.x = s * .16; g.add(st); }   // the wires that hold it
  const sg = new T.Group(); sg.position.set(.62, 1.5, 0); g.add(sg);                               // boom and mainsail turn together about the mast
  sg.add(cyl(.05, 3.6, steel, -1.8, 0, 0, 'x'));
  const tri = (pts, mat) => { const ge = new T.BufferGeometry(); ge.setAttribute('position', new T.Float32BufferAttribute(pts.flat(), 3)); ge.computeVertexNormals(); const m = new T.Mesh(ge, mat); m.castShadow = true; return m; };
  sg.add(tri([[0, .15, 0], [-3.5, .15, 0], [0, 7.9, 0]], cloth)); sg.add(tri([[-.6, 2.2, .01], [-1.5, 2.2, .01], [-.6, 3.4, .01]], M(color, { side: T.DoubleSide })));   // the sail, with a patch of the boat's colour
  g.add(tri([[.85, 1.0, 0], [3.55, .55, 0], [.82, 7.6, 0]], cloth));                               // the jib, out to the bow
  g.add(box(1.3, .06, .08, wood, -2.9, .78, 0)); g.add(box(.08, .7, .3, wood, -3.75, .1, 0));     // tiller and rudder
  g.add(box(.5, .24, 1.9, wood, -2.3, .3, 0));                                                    // the helmsman's seat
  mergeStatic(g);
  const b = { g, x, z, h, vx: 0, vz: 0, v: 0, boat: true, sail: true, sailG: sg, roll: 0, seat: { x: -2.25, y: -.1, z: .35 }, hp: 100, burnT: 0, home: { x, z, h } };
  G.scene.add(g); G.boats.push(b); placeBoat(b); return b;
}
/* ================= boat damage ================= */
const sunk = [];
function boatDamage(dt) {
  const p = G.player;
  for (let i = G.boats.length - 1; i >= 0; i--) {
    const b = G.boats[i]; if (b.hp === undefined) continue; const ex = b.x - Math.cos(b.h) * 3.2, ez = b.z + Math.sin(b.h) * 3.2;
    if (b.hp <= 0 && b.burnT <= 0) { b.burnT = 6; if (p.ride === b && G.say) G.say('The boat is on fire. Jump out!', 3); }
    if (b.burnT > 0) {
      b.burnT -= dt; if (Math.random() < dt * 14) puff(ex + rr2(-.4, .4), .2 + Math.random() * .4, ez + rr2(-.4, .4), Math.random() < .6 ? 0xff8a1f : 0xffd24a, rr2(.3, .6), rr2(1.5, 3), rr2(.4, .8));
      if (b.burnT <= 0) {   // it blows up and goes down; whoever is still aboard ends up in the water, hurt
        const aboard = p.ride === b; blast(b.x, b.z, 5);
        if (aboard) { p.ride = null; p.swim = true; p.x = b.x; p.z = b.z; p.y = -1.58; p.speed = 0; G.hurt(60); }
        b.g.visible = false; b.vx = b.vz = 0; b.v = 0; G.boats.splice(i, 1); sunk.push({ b, t: 90 });
      }
    } else if (b.hp < 40) { b.smokeT = (b.smokeT || 0) - dt; if (b.smokeT <= 0) { b.smokeT = .12 + b.hp * .012; puff(ex, .3, ez, b.hp < 18 ? 0x2a2a2a : 0x9a9a9a, rr2(.25, .45), rr2(1.2, 2.2), rr2(.8, 1.4)); } }
  }
  for (let i = sunk.length - 1; i >= 0; i--) { const s = sunk[i]; s.t -= dt; if (s.t <= 0 && Math.hypot(s.b.home.x - p.x, s.b.home.z - p.z) > 60) { const b = s.b; b.x = b.home.x; b.z = b.home.z; b.h = b.home.h; b.hp = 100; b.burnT = 0; b.g.visible = true; G.boats.push(b); placeBoat(b); sunk.splice(i, 1); } }   // a new one is tied up where the old one was
}
/* ================= police boats ================= */
// Wanted and out on the water (in a boat or swimming): police launches come after you. The officers on board shoot,
// and if they catch you standing still you are arrested. They give up when you are back on land or the stars are gone.
const pboats = []; let seaT = 0, pbCd = 0; G.seaCops = pboats;
function newPoliceBoat(x, z, h) {
  const b = newBoat(x, z, h, 0xf2f3f5, true); G.boats.pop();   // not one you can take
  const g = b.g, navy = M(0x141c33), skin = M(0xe0ac7e), vest = M(0xe6d21f);
  b.bar = [box(.28, .16, .55, new T.MeshBasicMaterial({ color: 0xff2a2a }), .6, 1.48, .5), box(.28, .16, .55, new T.MeshBasicMaterial({ color: 0x2a6bff }), .6, 1.48, -.5)]; g.add(b.bar[0]); g.add(b.bar[1]);
  for (const [ox, oz] of [[-1.3, .45], [-1.75, -.45]]) {   // two real officers in the stern, guns up (a still pose: they only need to look right)
    try { const n = newPerson(copKey()); n.h.position.set(ox, .17, oz); n.h.rotation.y = Math.PI / 2; playAnim(n, 'Aim1'); n.mixer.update(.05); if (n.guns && n.guns.pistol) n.guns.pistol.visible = true; n.h.visible = true; g.add(n.h); b.crew = (b.crew || []).concat(n); } catch (e) { }
  }
  b.hp = 160;   // a sturdy launch: more than a car
  G.targets.push(b.tg = { get x() { return b.x; }, get z() { return b.z; }, y: -1.3, top: 3.4, r: 2.2, car: true, alive: () => pboats.includes(b) && !b.sunkT, hit: dmg => { b.hp -= dmg; b.cd = Math.min(b.cd, .3); } });
  b.cd = 2; b.near = 0; b.away = 0; b.k = pboats.length; pboats.push(b); return b;
}
function updatePoliceBoats(dt) {
  const pl = G.player, r = pl.ride && pl.ride.boat ? pl.ride : null, sea = !G.inside && (!!r || !!pl.swim), px = r ? r.x : pl.x, pz = r ? r.z : pl.z, pv = r ? r.v : pl.speed;
  seaT = sea ? seaT + dt : 0; pbCd -= dt;
  const want = sea && seaT > 1.5 && G.stars >= 2 ? Math.min(3, G.stars - 1) : 0;
  if (pboats.length < want && pbCd <= 0) {
    for (let t = 0; t < 14; t++) { const a = rr2(0, 6.283), d = rr2(90, 130), x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d; let ok = true; for (const [ox, oz] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]]) if (boatBlocked(x + ox, z + oz)) ok = false;
      if (ok) { newPoliceBoat(x, z, Math.atan2(-(pz - z), px - x)); pbCd = 5; if (pboats.length === 1 && G.say) G.say('Police boats! Get to land or lose them.', 4); break; } }
  }
  for (let i = pboats.length - 1; i >= 0; i--) {
    const b = pboats[i], k = b.k % 3, tx = px + [0, 7, -7][k] * Math.cos(b.h + 1.57), tz = pz - [0, 7, -7][k] * Math.sin(b.h + 1.57), dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz) || 1, pd = Math.hypot(px - b.x, pz - b.z);
    const chase = want > 0 || (G.stars > 0 && pd < 60 && b.away < 12);
    if (want > 0) b.away = 0; else b.away += dt;
    if (b.away > 14 && (pd > 70 || b.away > 40) || G.stars === 0 && b.away > 6 && pd > 40) { G.scene.remove(b.g); pboats.splice(i, 1); const ti = G.targets.indexOf(b.tg); if (ti >= 0) G.targets.splice(ti, 1); continue; }
    // shot to pieces: it smokes, burns, blows up and goes down
    if (b.hp <= 0) { b.fire = (b.fire || 0) + dt; if (Math.random() < dt * 14) puff(b.x + rr2(-1, 1), .4 + Math.random() * .6, b.z + rr2(-1, 1), Math.random() < .6 ? 0xff8a1f : 0xffd24a, rr2(.3, .7), rr2(1.5, 3), rr2(.4, .8));
      b.vx *= .97; b.vz *= .97; driveBoat(b, 0, 0, dt); placeBoat(b); b.bar[0].visible = b.bar[1].visible = false;
      if (b.fire > 3) { blast(b.x, b.z, 5); G.scene.remove(b.g); pboats.splice(i, 1); const ti = G.targets.indexOf(b.tg); if (ti >= 0) G.targets.splice(ti, 1); pbCd = 12; if (G.stat) G.stat('kills'); if (G.say) G.say('Police boat sunk!', 3); if (G.stars < 6 && G.onStars) { G.stars = Math.min(6, Math.max(4, G.stars + 1)); G.onStars(); } }
      continue; }
    if (b.hp < 70 && Math.random() < dt * 6) puff(b.x - Math.cos(b.h) * 3, .4, b.z + Math.sin(b.h) * 3, 0x55585c, rr2(.3, .5), rr2(1.2, 2.2), rr2(.8, 1.4));
    // steer for the player, round whatever land is in the way
    let wantH = Math.atan2(-dz, dx); if (!chase) wantH = b.h;
    const clear = h => { const fx = Math.cos(h), fz = -Math.sin(h); for (const s of [4, 8, 13, 19]) { if (s > d + 3) break; if (boatBlocked(b.x + fx * s, b.z + fz * s)) return false; } return true; };
    b.sideT = (b.sideT || 0) - dt;
    if (chase && !clear(wantH)) {   // go round: keep to the side first chosen for a few seconds, so it does not dither in front of a pier
      if (b.sideT <= 0) { b.side = 0; for (const o of [.45, -.45, .9, -.9, 1.4, -1.4, 2, -2, 2.6, -2.6]) if (clear(wantH + o)) { b.side = Math.sign(o); break; } b.side = b.side || (Math.random() < .5 ? 1 : -1); b.sideT = 3; }
      let found = false; for (const o of [.45, .9, 1.4, 2, 2.6, 3.1]) if (clear(wantH + o * b.side)) { wantH += o * b.side; found = true; break; }
      if (!found) { b.side = -b.side; wantH += 1.5 * b.side; }
    }
    // stuck against something: back off for a moment
    if (chase && b.v < 1 && d > 14) { b.stuck = (b.stuck || 0) + dt; if (b.stuck > 1.2) { b.rev = 1.6; b.stuck = 0; b.side = -(b.side || 1); b.sideT = 4; } } else b.stuck = 0;
    if (b.rev > 0) b.rev -= dt;
    const steer = b.rev > 0 ? b.side || 1 : clamp(wrap2(b.h - wantH) * 1.6, -1, 1), thr = !chase ? 0 : b.rev > 0 ? -1 : d > 12 ? 1 : d > 6 ? .35 : -.3;
    driveBoat(b, thr, steer, dt); b.v = Math.hypot(b.vx, b.vz); if (b.v > 16) { b.vx *= 16 / b.v; b.vz *= 16 / b.v; b.v = 16; }   // a touch slower than a boat flat out: you can get away
    for (const o of pboats) if (o !== b) { const ex = b.x - o.x, ez = b.z - o.z, e = Math.hypot(ex, ez); if (e < 6 && e > .01 && !boatBlocked(b.x + ex / e * .5, b.z + ez / e * .5)) { b.x += ex / e * (6 - e) * .5; b.z += ez / e * (6 - e) * .5; } }
    if (r && pd < 4.6 && pd > .01) { const nx = (b.x - px) / pd, nz = (b.z - pz) / pd; if (!boatBlocked(b.x + nx, b.z + nz)) { b.x += nx * (4.6 - pd); b.z += nz * (4.6 - pd); } b.vx *= .8; b.vz *= .8; r.vx *= .96; r.vz *= .96; }   // bump, not pass through
    placeBoat(b); const bl = Math.floor(G.time * 6) % 2; b.bar[0].visible = !!bl; b.bar[1].visible = !bl;
    if (!chase) continue;
    if (pd < 75) G.lostT = 0;   // they have you in sight
    if (pd < 55) { b.cd -= dt; if (b.cd <= 0 && clearLine(b.x, b.z, px, pz)) { b.cd = rr2(.8, 1.7) * (G.stars >= 4 ? .65 : 1); const hit = Math.random() < (pl.swim ? .3 : .18) * (pd < 25 ? 1.5 : 1) && sea; G.tracer(b.x, .9, b.z, px + (hit ? 0 : rr2(-2.5, 2.5)), hit ? .9 : .1, pz + (hit ? 0 : rr2(-2.5, 2.5))); if (G.sfx) G.sfx.shot(true); if (hit) { G.copHurt(6); if (r) r.hp -= 5; } } }
    if (sea && pd < 8 && pv < 2 && G.stars < 5) { b.near += dt; if (b.near > 2.5 && G.onBusted) { b.near = 0; G.onBusted(); } } else b.near = 0;
  }
}
const rr2 = (a, b) => a + Math.random() * (b - a), wrap2 = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/* ================= set-up and idle update ================= */
export function setupCraft(scene) {
  newBoat(15, -41.2, 0, 0xf4f1e8); newBoat(-65, 41.2, 0, 0x2f6f9f); newBoat(-145, -41.2, 0, 0xb3362e); newBoat(-25, 41.2, Math.PI, 0xf0d9a0);
  newBoat(55, -40.5, Math.PI, 0xc8352b); newBoat(55, 40.5, Math.PI, 0x2f8f5f); newBoat(55.5, -22.5, Math.PI, 0xf0d9a0);   // three at the east quay: one in each corner and one between the sailing boats
  { const st = M(0xd8b21c, { roughness: .5, metalness: .3 }), lad = (x, z, ry) => { const g = new T.Group(); g.add(box(.07, 2.6, .07, st, -.25, -.85, 0)); g.add(box(.07, 2.6, .07, st, .25, -.85, 0)); for (let k = 0; k < 8; k++) g.add(box(.5, .05, .05, st, 0, -1.95 + k * .3, 0)); g.add(box(.07, .07, .5, st, -.25, .45, -.22)); g.add(box(.07, .07, .5, st, .25, .45, -.22)); mergeStatic(g); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); };
    for (let x = -153; x <= 50; x += 40) { lad(x, HARB.z0 + .12, 0); lad(x, HARB.z1 - .12, Math.PI); } for (const z of [-24, 0, 24]) lad(HARB.x1 - .12, z, Math.PI / 2); }   // yellow ladders: swim to the wall anywhere and you climb out, these just show it
  newSail(-125, -13.5, Math.PI, 0xb3362e); newSail(-85, 13.5, Math.PI, 0x2f6f9f); newSail(-5, -13.5, Math.PI, 0x2f8f5f); newSail(-45, 13.5, 0, 0xe0a82a);   // four sailing yachts at the ends of the jetties: step off the jetty and take one
  newBoat(15, 41.2, Math.PI, 0xe8e2d0); newBoat(-25, -41.2, 0, 0x3f8f6f); newBoat(-65, -41.2, 0, 0xd98a1f); newBoat(-105, 41.2, Math.PI, 0xf4f1e8); newBoat(-105, -41.2, 0, 0x7a4fa0); newBoat(-145, 41.2, Math.PI, 0x2f6f9f);   // more motor boats along both quays
  G.prisonBoat = newBoat(JAIL.boat.x, JAIL.boat.z - 4, 0, 0x8a8f96);   // the prison launch, tied up at the island jetty
  // helipad on the south-east corner of the quay
  const px = 61, pz = 49.5, pad = new T.Group(), y = M(0xe6c626, { roughness: .8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), w = M(0xf4f4f0, { roughness: .8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const ring = new T.Mesh(new T.RingGeometry(4.4, 4.9, 40).rotateX(-Math.PI / 2), y); ring.position.y = .06; pad.add(ring);
  const b1 = new T.Mesh(new T.PlaneGeometry(.5, 3.2).rotateX(-Math.PI / 2), w), b2 = b1.clone(), b3 = new T.Mesh(new T.PlaneGeometry(2, .5).rotateX(-Math.PI / 2), w);
  b1.position.set(-1, .07, 0); b2.position.set(1, .07, 0); b3.position.set(0, .07, 0); pad.add(b1, b2, b3);
  pad.position.set(px, 0, pz); scene.add(pad);
  newHeli(px, pz, Math.PI / 2);
  newPlane(AIRPORT.plane.x, AIRPORT.plane.z, Math.PI / 2);   // parked on the apron, nose towards the runway
}
export function updateCraft(dt) {
  const p = G.player;
  const BF = (((G.Q && G.Q.car) || 320) * .8) ** 2, bx = G.camera ? G.camera.position.x : p.x, bz = G.camera ? G.camera.position.z : p.z;
  for (const b of G.boats) { if (b !== p.ride) { if (b.v > .05) driveBoat(b, 0, 0, dt); placeBoat(b); } b.g.visible = b === p.ride || (b.x - bx) ** 2 + (b.z - bz) ** 2 < BF; }   // boats far away are not drawn
  boatDamage(dt);
  for (const h of G.helis) if (h !== p.ride) flyHeli(h, 0, 0, -1, dt, false);
  updateCopter(dt); updatePoliceBoats(dt); airDamage(dt);
}
// A small wooden canoe, rowed by hand (used in the prison escape): slow, quiet and low in the water.
export function makeCanoe(x, z, h) {
  const g = new T.Group(), wood = M(0x7a5230, { roughness: .8 }), dark = M(0x3a2a1a, { roughness: .9 });
  const hull = new T.Mesh(new T.SphereGeometry(1, 14, 8), wood); hull.scale.set(2.3, .34, .62); hull.position.y = -.05; hull.castShadow = true; g.add(hull);
  const inner = new T.Mesh(new T.SphereGeometry(1, 12, 6), dark); inner.scale.set(2.05, .22, .5); inner.position.y = .13; g.add(inner);
  const plank = new T.Mesh(new T.BoxGeometry(.3, .05, 1.0), wood); plank.position.set(-.1, .18, 0); g.add(plank);
  for (const s2 of [-1, 1]) { const oar = new T.Mesh(new T.CylinderGeometry(.025, .025, 1.7, 6), wood); oar.rotation.x = Math.PI / 2; oar.rotation.z = .25 * s2; oar.position.set(-.1, .42, s2 * .75); g.add(oar); const bl = new T.Mesh(new T.BoxGeometry(.4, .03, .14), wood); bl.position.set(-.1, .36, s2 * 1.5); g.add(bl); }
  const b = { g, x, z, h, vx: 0, vz: 0, v: 0, boat: true, row: true, roll: 0, seat: { x: -.1, y: .02, z: 0 }, hp: 100, burnT: 0, home: { x, z, h } };
  G.scene.add(g); G.boats.push(b); placeBoat(b); return b;
}
export { placeBoat };
