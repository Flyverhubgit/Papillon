// Papillon - small effects: blood (drops and stains on the ground) and flying bits when something breaks.
import * as T from 'three';
import { G, MOBILE, landHeight, onRoad, removeProp, propsNear } from './world.js';

const NS = MOBILE ? 24 : 60, NP = MOBILE ? 40 : 110;   // how many stains and flying bits can exist at once (the oldest is reused)
const stains = [], bits = [];
let si = 0, bi = 0, ready = false;
const RED = 0x8a0d0d;

function init() {
  ready = true;
  const disc = new T.CircleGeometry(1, 12).rotateX(-Math.PI / 2), cube = new T.BoxGeometry(1, 1, 1);
  for (let i = 0; i < NS; i++) {
    const m = new T.Mesh(disc, new T.MeshBasicMaterial({ color: 0x6e0a0a, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.visible = false; m.renderOrder = 2; G.scene.add(m); stains.push({ m, age: 0, size: 1, on: false });
  }
  for (let i = 0; i < NP; i++) {
    const m = new T.Mesh(cube, new T.MeshLambertMaterial({ color: RED })); m.visible = false; G.scene.add(m);
    bits.push({ m, vx: 0, vy: 0, vz: 0, t: 0, on: false, blood: false, spin: 0 });
  }
}
// a stain on the ground
function stain(x, z, size) {
  if (landHeight(x, z) > .3 || G.inside) return;
  const s = stains[si]; si = (si + 1) % NS;
  s.on = true; s.age = 0; s.size = size; s.m.visible = true; s.m.position.set(x, onRoad(x, z) ? .07 : .16, z); s.m.rotation.y = Math.random() * 6.28;
  s.m.scale.set(.1, 1, .1); s.m.material.opacity = .85;
}
function bit(x, y, z, vx, vy, vz, size, color, blood, life) {
  const b = bits[bi]; bi = (bi + 1) % NP;
  b.on = true; b.t = life; b.vx = vx; b.vy = vy; b.vz = vz; b.blood = blood; b.spin = (Math.random() - .5) * 14;
  b.m.visible = true; b.m.position.set(x, y, z); b.m.scale.set(size, size * (blood ? 1 : .6 + Math.random()), size * (blood ? 1 : .6 + Math.random())); b.m.material.color.setHex(color);
}
// blood: n drops thrown from a point (they leave small stains where they land) and one stain right below. vx, vz = the push of the hit
export function blood(x, y, z, n, vx = 0, vz = 0) {
  if (!ready) init();
  if (MOBILE) n = Math.ceil(n / 2);
  for (let i = 0; i < n; i++) bit(x, y, z, vx * .35 + (Math.random() - .5) * 4, 1.5 + Math.random() * 3.5, vz * .35 + (Math.random() - .5) * 4, .07 + Math.random() * .06, RED, true, 2);
  stain(x + (Math.random() - .5) * .4, z + (Math.random() - .5) * .4, .28 + n * .05);
}
// bits of something broken: n pieces in the given colour
export function debris(x, y, z, n, color, vx = 0, vz = 0, size = .16) {
  if (!ready) init();
  if (MOBILE) n = Math.ceil(n / 2);
  for (let i = 0; i < n; i++) bit(x + (Math.random() - .5) * .6, y + Math.random() * .6, z + (Math.random() - .5) * .6, vx * .5 + (Math.random() - .5) * 6, 2 + Math.random() * 4, vz * .5 + (Math.random() - .5) * 6, size * (.6 + Math.random() * .8), color, false, 2.2 + Math.random());
}
export function updateFx(dt) {
  if (!ready) return;
  for (const b of bits) {
    if (!b.on) continue;
    b.t -= dt; b.vy -= 18 * dt; const p = b.m.position; p.x += b.vx * dt; p.y += b.vy * dt; p.z += b.vz * dt; b.m.rotation.x += b.spin * dt; b.m.rotation.z += b.spin * .7 * dt;
    const g = landHeight(p.x, p.z) + .04;
    if (p.y <= g) {
      if (b.blood) { if (Math.random() < .45) stain(p.x, p.z, .1 + Math.random() * .14); b.on = false; b.m.visible = false; continue; }
      if (b.t < 1.5 && b.m.material.color.getHex() === 0xbfe6f5) { b.on = false; b.m.visible = false; continue; }
      p.y = g; if (b.vy < -2) { b.vy *= -.35; b.vx *= .6; b.vz *= .6; b.spin *= .5; } else { b.vy = 0; b.vx *= 1 - Math.min(1, 6 * dt); b.vz *= 1 - Math.min(1, 6 * dt); b.spin = 0; }
    }
    if (b.t <= 0) { b.on = false; b.m.visible = false; }
  }
  for (const s of stains) {
    if (!s.on) continue;
    s.age += dt; const k = Math.min(1, s.age / .35) * s.size; s.m.scale.set(k, 1, k);   // spreads out, stays a minute, then fades
    if (s.age > 60) { s.m.material.opacity = .85 * Math.max(0, 1 - (s.age - 60) / 8); if (s.age > 68) { s.on = false; s.m.visible = false; } }
  }
}
/* ---------- breaking street furniture ---------- */
const poles = []; let polesMade = false;
function fallPole(x, z, vx, vz, len, thick, color) {   // a pole that tips over the way it was hit and lies there for a while
  if (!polesMade) { polesMade = true; const g = new T.BoxGeometry(1, 1, 1).translate(0, .5, 0); for (let i = 0; i < 8; i++) { const piv = new T.Group(), m = new T.Mesh(g, new T.MeshLambertMaterial({ color: 0x222428 })); m.castShadow = true; piv.add(m); piv.visible = false; G.scene.add(piv); poles.push({ piv, m, t: 0, a: 0, on: false }); } }
  let p = poles.find(q => !q.on) || poles.reduce((a, b) => (a.t < b.t ? a : b));
  const l = Math.hypot(vx, vz) || 1; p.on = true; p.t = 25; p.a = 0; p.m.scale.set(thick, len, thick); p.m.material.color.setHex(color);
  p.piv.visible = true; p.piv.position.set(x, .1, z); p.piv.rotation.set(0, Math.atan2(vx / l, vz / l), 0); p.m.rotation.x = 0;
}
const spouts = [];   // broken hydrants spraying water
const KIND = {
  lamp: (pr, vx, vz) => { fallPole(pr.x, pr.z, vx, vz, 5.6, .16, 0x222428); debris(pr.x, 5, pr.z, 5, 0xf3e7a8, vx, vz, .1); debris(pr.x, .4, pr.z, 3, 0x222428, vx, vz); },
  sign: (pr, vx, vz) => { fallPole(pr.x, pr.z, vx, vz, 2.6, .08, 0x8d9299); debris(pr.x, 2.4, pr.z, 3, 0xc8352b, vx, vz, .2); },
  bench: (pr, vx, vz) => debris(pr.x, .5, pr.z, 9, 0x8a5a33, vx, vz, .3),
  bin: (pr, vx, vz) => { debris(pr.x, .5, pr.z, 5, 0x3d5a48, vx, vz, .28); debris(pr.x, .8, pr.z, 8, 0xe8e2d0, vx, vz, .09); },
  postbox: (pr, vx, vz) => { debris(pr.x, .6, pr.z, 6, 0xe0b21c, vx, vz, .28); debris(pr.x, 1, pr.z, 8, 0xf4f4f0, vx, vz, .1); },
  newsbox: (pr, vx, vz) => { debris(pr.x, .6, pr.z, 6, 0x2f62b5, vx, vz, .26); debris(pr.x, .9, pr.z, 8, 0xdedede, vx, vz, .12); },
  hydrant: (pr, vx, vz) => { debris(pr.x, .4, pr.z, 6, 0xc8352b, vx, vz, .2); spouts.push({ x: pr.x, z: pr.z, t: 9, n: 0 }); },
  shelter: (pr, vx, vz) => { fallPole(pr.x, pr.z, vx, vz, 2.6, .1, 0x4a5058); debris(pr.x, 2.4, pr.z, 8, 0x1f8a8a, vx, vz, .45); debris(pr.x, 1.2, pr.z, 8, 0xbfe3ea, vx, vz, .1); }
};
// knock one down. vx, vz = the speed of what hit it
export function breakProp(pr, vx, vz) {
  if (!ready) init();
  if (!removeProp(pr)) return; if (G.physDropProp) G.physDropProp(pr);
  if (G.physDebris && G.physDebris(pr.kind, pr.x, pr.z, vx, vz)) {   // real physics: the thing itself is knocked loose and tumbles away
    debris(pr.x, pr.kind === 'lamp' ? 5 : .7, pr.z, 4, pr.kind === 'lamp' ? 0xf3e7a8 : 0xdedede, vx, vz, .1); if (pr.kind === 'hydrant') spouts.push({ x: pr.x, z: pr.z, t: 9, n: 0 });
  } else (KIND[pr.kind] || KIND.bin)(pr, vx, vz);
  const d = Math.hypot(pr.x - G.player.x, pr.z - G.player.z); if (G.sfx && d < 60) G.sfx.crash(Math.min(14, 5 + Math.hypot(vx, vz) * .4));
}
export function breakNear(x, z, r) { for (const pr of propsNear(x, z, r)) { const d = Math.hypot(pr.x - x, pr.z - z) || 1; breakProp(pr, (pr.x - x) / d * 9, (pr.z - z) / d * 9); } }
export function updateBreaks(dt) {
  for (const p of poles) { if (!p.on) continue; p.t -= dt; if (p.a < 1.5) { p.a = Math.min(1.5, p.a + (1.2 + p.a * 5) * dt); p.m.rotation.x = p.a; } if (p.t <= 0) { p.on = false; p.piv.visible = false; } }
  for (let i = spouts.length - 1; i >= 0; i--) { const s = spouts[i]; s.t -= dt; s.n += dt * (MOBILE ? 14 : 30);
    while (s.n >= 1) { s.n--; bit(s.x + (Math.random() - .5) * .2, .4, s.z + (Math.random() - .5) * .2, (Math.random() - .5) * 2.4, 8 + Math.random() * 4, (Math.random() - .5) * 2.4, .06 + Math.random() * .07, 0xbfe6f5, false, 1.5); }
    if (s.t <= 0) spouts.splice(i, 1); }
}
G.blood = blood; G.debris = debris; G.breakProp = breakProp; G.breakNear = breakNear;
