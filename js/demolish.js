// Papillon - buildings that can be shot down: damage, collapse into rubble, fire, and the fire brigade that comes to put it out.
// The squashing itself is done on the graphics card (see "knocked-down buildings" in world.js): this file decides which building,
// how far gone it is, and what happens round it (dust, flying bricks, flames, the heat, the fire engine and its water).
import * as T from 'three';
import { G, MOBILE, COLS, demo, buildingAt, landHeight, rr } from './world.js';
import { puff, knockPed, sendFireEngine, crime, rideTo, removeCar } from './actors.js';
import { nodes } from './world.js';
import { debris } from './fx.js';

const MAXFALL = 24;
const falls = [];          // buildings coming down
export const fires = [];   // { x, z, w, d, hp, t, rect }  hp 1 = blazing, 0 = out
G.fires = fires;

// how much a building takes before it comes down: a shop or house goes with a shell or two, a tower needs several
function hpOf(it) { if (it.hp === undefined) { const vol = (it.x1 - it.x0) * (it.z1 - it.z0) * it.h; it.hp = Math.max(150, Math.min(520, vol / 11)); } return it.hp; }

// a shell or rocket hits at (x, z): returns true if it was a building (so the shot should stop there)
export function hitBuilding(x, z, dmg, dx, dz) {
  if (G.inside) return false;
  const it = buildingAt(x, z); if (!it || it.fall) return !!it;
  it.hp = hpOf(it) - dmg;
  const cx = (it.x0 + it.x1) / 2, cz = (it.z0 + it.z1) / 2, h = it.h;
  // chips and cracks: bricks fly, dust and smoke pour out of the hole
  debris(x, Math.min(h, 3 + Math.random() * 3), z, 10, 0xb9ada0, dx * 6, dz * 6, .22);
  debris(x, 2.2, z, 5, 0x6d6760, dx * 4, dz * 4, .3);
  for (let i = 0; i < 4; i++) puff(x + rr(-1.5, 1.5), 2 + Math.random() * 3, z + rr(-1.5, 1.5), 0x8d857b, rr(1.2, 2.2), rr(.8, 2), rr(1.6, 2.6));
  if (G.shake) G.shake(.5);
  if (it.hp <= 0) startFall(it, dx, dz);
  else if (G.say && !(G.bldgSayT > G.time)) { G.bldgSayT = G.time + 6; G.say('The walls are cracking. One more hit!', 2.5); }
  return true;
}
G.hitBuilding = hitBuilding; G.buildingAt = buildingAt;

function startFall(it, dx, dz) {
  if (demo.n >= MAXFALL) { it.off = true; if (G.physDropBox) G.physDropBox(it); return; }
  const i = demo.n++; demo.rect[i].set(it.x0 - .12, it.z0 - .12, it.x1 + .12, it.z1 + .12); demo.k[i] = 0; demo.sync();
  const f = { it, i, t: 0, dx, dz, dust: 0, cracked: false, fire: Math.random() < .92 };
  it.fall = f; falls.push(f);
  // anything else with its footprint inside this one (a second wing, a roof hut) goes with it
  for (const o of COLS) if (o !== it && o.b && !o.off && !o.keep && (o.x0 + o.x1) / 2 > it.x0 && (o.x0 + o.x1) / 2 < it.x1 && (o.z0 + o.z1) / 2 > it.z0 && (o.z0 + o.z1) / 2 < it.z1) { o.off = true; if (G.physDropBox) G.physDropBox(o); }
  if (G.stat) G.stat('buildings');
  crime(Math.max(G.stars, 4), false);
}

export function updateDemolish(dt) {
  const pl = G.player;
  for (let n = falls.length - 1; n >= 0; n--) {
    const f = falls[n], it = f.it; f.t += dt;
    const cx = (it.x0 + it.x1) / 2, cz = (it.z0 + it.z1) / 2, w = it.x1 - it.x0, d = it.z1 - it.z0, h = it.h;
    let k;
    if (f.t < .8) { k = .03 * Math.abs(Math.sin(f.t * 38)); if (Math.random() < dt * 14) debris(cx + rr(-w / 2, w / 2), h * Math.random(), cz + rr(-d / 2, d / 2), 2, 0xa79d90, 0, 0, .16); }   // it shudders first
    else { const s = Math.min(1, (f.t - .8) / 3.2); k = Math.pow(s, 1.5) + (s >= 1 ? 0 : 0); if (s > .93) k = Math.min(1, k) ; }
    if (f.t >= .8 && !f.cracked) { f.cracked = true; if (G.sfx) { G.sfx.crash(30); G.sfx.shot(); } if (G.shake) G.shake(Math.hypot(pl.x - cx, pl.z - cz) < 110 ? 1.1 : .4); }
    demo.k[f.i] = k;
    // dust rolling out and bricks flying while it comes down
    if (f.t > .8 && f.t < 4.4) { f.dust -= dt; if (f.dust <= 0) { f.dust = .09;
      const px = cx + rr(-w / 2, w / 2), pz = cz + rr(-d / 2, d / 2);
      puff(px, rr(.5, 3), pz, 0xb4aa9d, rr(2.4, 4.2), rr(1.2, 3), rr(2.4, 3.6)); if (Math.random() < .5) puff(px, rr(1, 5), pz, 0x6a645d, rr(2, 3.4), rr(2, 4), rr(2.6, 4));
      debris(px, rr(1, h * .6), pz, 3, Math.random() < .5 ? 0xa97a63 : 0x9a948b, (px - cx) * 1.2, (pz - cz) * 1.2, .24); } }
    if (f.t > 1.6 && !it.off) { it.off = true; if (G.physDropBox) G.physDropBox(it); }   // it stops being a wall once it is half down
    // the people in it, or under it
    if (f.t > 1.2 && f.t < 3.6) {
      for (const q of G.peds) if (q.h.visible && q.x > it.x0 && q.x < it.x1 && q.z > it.z0 && q.z < it.z1 && knockPed(q, 0, 0)) { q.dead = true; q.t = 16; if (G.stat) G.stat('kills'); }
      if (!pl.car && !pl.ride && pl.x > it.x0 - 1 && pl.x < it.x1 + 1 && pl.z > it.z0 - 1 && pl.z < it.z1 + 1 && G.hurt) G.hurt(70 * dt);
    }
    if (f.t >= 4.4) {
      demo.k[f.i] = 1; falls.splice(n, 1);
      if (f.fire) igniteBuilding(it);
      for (let i = 0; i < 10; i++) puff(cx + rr(-w / 2, w / 2), rr(.5, 2), cz + rr(-d / 2, d / 2), 0xaaa296, rr(3, 5), rr(.5, 1.5), rr(3.5, 5));
    }
  }
  updateFires(dt);
}

/* ---------- fire ---------- */
function igniteBuilding(it) {
  const fr = { x: (it.x0 + it.x1) / 2, z: (it.z0 + it.z1) / 2, w: it.x1 - it.x0, d: it.z1 - it.z0, hp: 1, t: 0, called: false, truck: null, it };
  fires.push(fr);
  if (G.say) G.say('The ruin is on fire! Somebody will call the fire brigade.', 4);
}
let fireLight = null;
function updateFires(dt) {
  const pl = G.player;
  if (!fireLight && G.scene && !MOBILE) { fireLight = new T.PointLight(0xff7a22, 0, 60, 1.6); G.scene.add(fireLight); }
  if (!flashL && G.scene && !MOBILE) { flashL = new T.PointLight(0xffb060, 0, 90, 1.5); G.scene.add(flashL); }   // made now, not at the first explosion: a new light makes the game recompile every surface (a 2 second freeze)
  let near = null, nd = 1e9;
  for (let n = fires.length - 1; n >= 0; n--) {
    const fr = fires[n]; fr.t += dt;
    // after the fall the brigade is called: about 20 seconds later an engine is on its way
    if (!fr.called && fr.t > 9) { fr.called = true; sendFireEngine(fr); }
    if (fr.hp <= 0) { fr.out = (fr.out || 0) + dt; if (fr.out > 6) { fires.splice(n, 1); continue; } }
    // nobody comes: it burns itself out after a couple of minutes
    if (!fr.truck || fr.truck.dead) fr.hp = Math.max(0, fr.hp - dt / 150);
    const k = fr.hp, d = Math.hypot(pl.x - fr.x, pl.z - fr.z); if (d < nd) { nd = d; near = fr; }
    if (d < 140) {
      // flames: how many depends on how strong the fire is
      fr.fl = (fr.fl || 0) - dt;
      if (fr.fl <= 0 && k > 0) { fr.fl = (MOBILE ? .35 : .16) / Math.max(.25, k);
        const px = fr.x + rr(-fr.w * .4, fr.w * .4), pz = fr.z + rr(-fr.d * .4, fr.d * .4), y = landHeight(px, pz);
        puff(px, y + .6, pz, Math.random() < .5 ? 0xff8a1f : 0xffc43a, rr(.8, 1.8) * (.5 + k * .7), rr(2.5, 4.5), rr(.7, 1.2));
        if (Math.random() < .55) puff(px, y + 1.4, pz, Math.random() < .5 ? 0x2c2a28 : 0x56524d, rr(1.6, 2.8) * (.5 + k * .6), rr(3, 6), rr(2.4, 3.6));
      }
    }
    // standing in the burning rubble hurts
    if (k > .15 && !pl.car && !pl.ride && Math.abs(pl.x - fr.x) < fr.w / 2 + .5 && Math.abs(pl.z - fr.z) < fr.d / 2 + .5 && G.hurt) G.hurt(22 * dt);
  }
  if (fireLight) {
    if (near && nd < 90 && near.hp > 0) { fireLight.position.set(near.x, 4, near.z); fireLight.intensity = (45 + Math.random() * 25) * near.hp * (.4 + (G.night || 0) * .9); } else fireLight.intensity = 0;
  }
}

/* ---------- the hose ---------- */
// a jet of water from the fire engine's cannon (a few dozen drops flying in an arc)
const NW = MOBILE ? 30 : 70;
let drops = null, di = 0;
function initWater() {
  drops = []; const g = new T.SphereGeometry(.2, 5, 4), m = new T.MeshBasicMaterial({ color: 0xcfe9f7, transparent: true, opacity: .75, depthWrite: false });
  for (let i = 0; i < NW; i++) { const s = new T.Mesh(g, m); s.visible = false; G.scene.add(s); drops.push({ s, on: false, vx: 0, vy: 0, vz: 0 }); }
}
export function spray(x, y, z, tx, ty, tz) {
  if (!drops) initWater();
  for (let i = 0; i < 2; i++) {
    const o = drops[di]; di = (di + 1) % NW; const T1 = .85 + Math.random() * .12, ex = tx + rr(-1.5, 1.5), ez = tz + rr(-1.5, 1.5);
    o.on = true; o.s.visible = true; o.s.position.set(x, y, z); o.s.scale.setScalar(.7 + Math.random() * .8);
    o.vx = (ex - x) / T1; o.vz = (ez - z) / T1; o.vy = (ty - y) / T1 + 9 * T1 * .5 * 1.0;   // lands near the target after about a second
  }
}
export function updateWater(dt) {
  if (!drops) return;
  for (const o of drops) { if (!o.on) continue; o.vy -= 9 * dt; const p = o.s.position; p.x += o.vx * dt; p.y += o.vy * dt; p.z += o.vz * dt;
    if (p.y < landHeight(p.x, p.z) + .1 || p.y < 0) { o.on = false; o.s.visible = false; if (Math.random() < .3) puff(p.x, p.y + .3, p.z, 0xdfeef5, .7, 1.2, .8); } }
}

/* ---------- the engine ---------- */
export function updateBrigade(dt) {
  const pl = G.player;
  for (let i = G.brigade.length - 1; i >= 0; i--) {
    const c = G.brigade[i], b = c.brig;
    if (!b || c === pl.car || c.dead || !G.cars.includes(c)) { c.brig = null; G.brigade.splice(i, 1); continue; }   // taken, wrecked or gone
    b.t += dt; const fr = b.fire, fx = Math.cos(c.h), fz = -Math.sin(c.h);
    if (c.bar) { const blink = Math.floor(G.time * 6) % 2; c.bar[0].visible = !!blink; c.bar[1].visible = !blink; }
    if (b.st === 'go') {
      const stopD = Math.max(fr.w, fr.d) / 2 + 11, d = rideTo(c, b.ch, fr.x, fr.z, stopD, dt);
      if (d < stopD + 4 && c.v < 2.5) { b.st = 'spray'; b.t = 0; if (G.say) G.say('"Stand back! We will put it out!"', 3); }
      else if (b.t > 140) b.st = 'leave';
    } else if (b.st === 'spray') {
      c.v *= .9; const ax = fr.x - c.x, az = fr.z - c.z, da = Math.hypot(ax, az) || 1;
      spray(c.x + fx * -1.2, 3.75, c.z + fz * -1.2, fr.x + (ax / da) * -1, 1.2, fr.z + (az / da) * -1);
      if (G.fireWater) G.fireWater(true);
      fr.hp = Math.max(0, fr.hp - dt / 13);
      if (fr.hp <= 0 && !b.done) { b.done = true; b.t = 0; if (G.say) G.say('The fire is out.', 3); }
      if (b.done && b.t > 5) { b.st = 'leave'; b.t = 0; }
    } else {   // drive off to somewhere far away, then vanish
      if (!b.far) { let best = -1, bd = 1e9; nodes.forEach((n, j) => { const d = Math.hypot(n.x - c.x, n.z - c.z); if (d > 230 && d < 360) { const s = Math.abs(d - 280) + Math.random() * 50; if (s < bd) { bd = s; best = j; } } }); b.far = best >= 0 ? nodes[best] : { x: c.x + 300, z: c.z }; }
      const d = rideTo(c, b.ch, b.far.x, b.far.z, 6, dt), dp = Math.hypot(pl.x - c.x, pl.z - c.z);
      if (b.t > 8 && (dp > 150 || d < 10 && dp > 60) || b.t > 90) { removeCar(c); G.brigade.splice(i, 1); }
    }
  }
}

/* ---------- a tank shell going off ---------- */
// a flash of light (one light, reused), an expanding shock ring, a fireball and lumps of masonry
let flashL = null, flashT = 0, flashD = .2;
G.flash = (x, y, z, inten, color, dur) => { if (MOBILE || !G.scene) return; if (!flashL) { flashL = new T.PointLight(0xffb060, 0, 90, 1.5); G.scene.add(flashL); } flashL.position.set(x, y, z); flashL.color.setHex(color || 0xffb060); flashL.userData.i = inten; flashT = flashD = dur || .25; };
const rings = []; let ringGeo = null;
function ring(x, y, z, size) {
  if (!ringGeo) ringGeo = new T.RingGeometry(.82, 1, 28).rotateX(-Math.PI / 2);
  const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: .8, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
  m.position.set(x, y, z); G.scene.add(m); rings.push({ m, t: 0, size });
}
G.bigBlast = (x, y, z, dx, dz) => {
  G.flash(x, Math.max(2, y), z, 600, 0xffa24a, .35); if (G.shake) G.shake(Math.hypot(G.player.x - x, G.player.z - z) < 60 ? 1.1 : .5);
  ring(x, landHeight(x, z) + .3, z, 16);
  for (let i = 0; i < 22; i++) puff(x + rr(-2.2, 2.2), rr(.4, 3.6), z + rr(-2.2, 2.2), i % 3 === 0 ? 0xffe27a : i % 3 === 1 ? 0xff9a2a : 0xff7a1c, rr(3.2, 6), rr(1.5, 5), rr(.9, 1.7));   // the fireball
  for (let i = 0; i < 8; i++) puff(x + rr(-2, 2), rr(1, 4), z + rr(-2, 2), 0x2b2927, rr(2.2, 4), rr(3, 7), rr(2.6, 4));   // black smoke after it
  debris(x, y, z, 12, 0xa6a097, -dx * 5, -dz * 5, .3); debris(x, y, z, 8, 0x4a4540, -dx * 3, -dz * 3, .42);
};
export function updateBlastFx(dt) {
  if (flashL) { flashT -= dt; flashL.intensity = flashT > 0 ? flashL.userData.i * (flashT / flashD) : 0; }
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt / .4; if (r.t >= 1) { G.scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; } r.m.scale.setScalar(1 + r.t * r.size); r.m.material.opacity = .8 * (1 - r.t); }
}
