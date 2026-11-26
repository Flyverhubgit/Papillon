// Papillon - "The secret documents": Victor asks you to steal a chest of papers from a gang hide-out under the big road bridge.
// Say yes, drive to the marker, reach for the chest: the gang spots you. Beat four waves (some punch, some shoot), take the chest, bring it back alive.
import * as T from 'three';
import { G, rr, rnd, landHeight, addBox, addCircle, solidAt, collide, BRG, slots } from './world.js';
import { addMarker, markers } from './shops.js';
import { makeNPC, playAnim, clearLine } from './actors.js';

const VIC = { x: 64, z: -20 };                 // where Victor stands (the corner by the harbour in the old town)
const BR = { x: 460, z: -890, L: 84, W: 17, H: 7, BL: 44 }, CHEST = { x: 1.6, z: 1.4 };   // the big road bridge, out in the fields east of the city: it sits right on the country road, which runs up one ramp, over the deck and down the other
const PAY = 2500, WAVES = [[2, 1], [2, 2], [3, 2], [3, 3]];   // [fists, pistols] per wave; the last one has the boss in it
const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .85 }, o || {}));
let scene, st = 'idle', wave = 0, pause = 0, cool = 0, goalM = null, docM = null, docMesh = null, hud = null;
const foes = [];
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const drop = m => { if (!m) return; G.scene.remove(m.mesh, m.sprite); const i = markers.indexOf(m); if (i >= 0) markers.splice(i, 1); };
const box = (g, w, h, d, mat, x, y, z, ry) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };

function buildBridge() {
  const g = new T.Group(); g.position.set(BR.x, landHeight(BR.x, BR.z), BR.z); scene.add(g);
  const conc = M(0x9a9c9e), concD = M(0x77797c), concL = M(0xb4b6b8), road = M(0x34373c, { roughness: .95 }), white = M(0xe8e8e2), yellow = M(0xe0b020), steel = M(0x8d939a, { metalness: .6, roughness: .45 }), wood = M(0x7a5a34), woodD = M(0x5a4126), grass = M(0x5f8038), tarp = M(0x3f5f4a), metal = M(0x4a4f56, { metalness: .6, roughness: .5 });
  const { L, W, H, BL } = BR, TOP = H + 1.4, piers = [-35, -21, -7, 7, 21, 35];
  // a big road bridge: six wide piers, a thick deck with four lanes, crash barriers and lamp posts
  for (const px of piers) { box(g, 2.4, H, W - 1, conc, px, H / 2, 0); box(g, 3.0, .5, W - .2, concD, px, .25, 0); box(g, 3.4, .7, W + .2, concL, px, H - .35, 0); addBox(BR.x + px - 1.2, BR.z - (W - 1) / 2, BR.x + px + 1.2, BR.z + (W - 1) / 2, H); }
  box(g, L, 1.3, W, conc, 0, H + .65, 0); for (const s of [-1, 1]) box(g, L, .5, .5, concD, 0, H + .25, s * (W / 2 - .25));   // the deck and its edge beams
  box(g, L, .1, W - 1.2, road, 0, TOP + .0, 0);
  for (const s of [-1, 1]) { box(g, L + .4, .8, .4, concL, 0, TOP + .4, s * (W / 2 - .2)); box(g, L + .4, .08, .1, steel, 0, TOP + 1.1, s * (W / 2 - .2)); for (let x = -L / 2 + 2; x < L / 2; x += 4) box(g, .1, .34, .1, steel, x, TOP + .95, s * (W / 2 - .2)); }   // barriers with a rail on top
  box(g, L, .02, .14, yellow, 0, TOP + .06, .12); box(g, L, .02, .14, yellow, 0, TOP + .06, -.12);
  for (const z of [-3.6, 3.6]) for (let x = -L / 2 + 1; x < L / 2; x += 6) box(g, 2.6, .02, .14, white, x, TOP + .06, z);
  for (let x = -L / 2 + 6; x < L / 2; x += 18) for (const s of [-1, 1]) { box(g, .16, 5, .16, metal, x, TOP + 2.5, s * (W / 2 - .2)); box(g, .12, .12, 2.0, metal, x, TOP + 5, s * (W / 2 - 1.1)); const b = new T.Mesh(new T.BoxGeometry(.5, .1, .3), new T.MeshBasicMaterial({ color: 0xfff0c0 })); b.position.set(x, TOP + 4.9, s * (W / 2 - 2.0)); g.add(b); }
  // the ramps up to it at either end: earth banks with the road running up them
  const shp = new T.Shape(); shp.moveTo(0, 0); shp.lineTo(BL, 0); shp.lineTo(0, TOP); shp.closePath(); const bankGeo = new T.ExtrudeGeometry(shp, { depth: W, bevelEnabled: false }), ang = Math.atan2(TOP, BL), hyp = Math.hypot(TOP, BL);
  for (const s of [-1, 1]) {
    const b = new T.Mesh(bankGeo, concD); b.position.set(s * (L / 2 - .1), -.02, s > 0 ? -W / 2 : W / 2); if (s < 0) b.rotation.y = Math.PI; b.castShadow = true; b.receiveShadow = true; g.add(b);
    const rg = new T.Group(); rg.position.set(s * (L / 2 + BL / 2), TOP / 2, 0); rg.rotation.z = -s * ang; g.add(rg);
    box(rg, hyp, .1, W - 1.2, road, 0, .06, 0); box(rg, hyp, .02, .14, yellow, 0, .12, .12); box(rg, hyp, .02, .14, yellow, 0, .12, -.12); for (const z of [-3.6, 3.6]) for (let x = -hyp / 2 + 1; x < hyp / 2; x += 6) box(rg, 2.6, .02, .14, white, x, .12, z);
    for (const k of [-1, 1]) box(rg, hyp, .6, .35, concL, 0, .36, k * (W / 2 - .2));
    const bk = addBox(BR.x + s * (L / 2 - .1), BR.z - W / 2, BR.x + s * (L / 2 + BL * (1 - 1.3 / TOP)), BR.z + W / 2, 1.3); bk.nophys = true;   // the bank is a wall to somebody on the ground where it is taller than a step
  }
  // for the physics: the two ramps as solid wedges, the deck, and the crash barriers along both sides, so a car can drive up, over and down
  { const gy = g.position.y, P = BRG.phys; BRG.on = true; BRG.x = BR.x; BRG.z = BR.z; BRG.L = L; BRG.W = W; BRG.TOP = TOP; BRG.BL = BL;
    for (const s of [-1, 1]) {
      const th = -s * ang, hy = 1, S = x => TOP * (1 - (Math.abs(x - BR.x) - L / 2) / BL);   // the ramp surface height at x
      P.push({ c: [BR.x + s * (L / 2 + BL / 2) + hy * Math.sin(th), gy + TOP / 2 - hy * Math.cos(th) + .06, BR.z], h: [hyp / 2 + .5, hy, W / 2], rz: th });   // a tilted slab along the road surface
      for (let a = 0; a < BL; a += 4) {   // and solid blocks under it, so nothing can slip in below
        const xa = BR.x + s * (L / 2 + a), xb = BR.x + s * (L / 2 + Math.min(BL, a + 4)), top = Math.max(.3, Math.min(S(xa), S(xb)) - .6), mx = (xa + xb) / 2;
        P.push({ c: [mx, gy + top / 2 - .5, BR.z], h: [Math.abs(xb - xa) / 2 + .05, top / 2 + .5, W / 2] });
      }
      for (const k of [-1, 1]) P.push({ c: [BR.x + s * (L / 2 + BL / 2), gy + TOP / 2 + .5, BR.z + k * (W / 2 - .2)], h: [hyp / 2, .45, .2], rz: -s * ang, fr: .2 });   // the barrier along the ramp
    }
    P.push({ c: [BR.x, gy + TOP + .06 - .8, BR.z], h: [L / 2 + .5, .8, W / 2] });   // the deck
    for (const k of [-1, 1]) P.push({ c: [BR.x, gy + TOP + .5, BR.z + k * (W / 2 - .2)], h: [L / 2 + .5, .45, .2], fr: .2 });   // the barrier along the deck
    for (let i = slots.length - 1; i >= 0; i--) { const sl = slots[i]; if (Math.abs(sl.x - BR.x) < L / 2 + BL + 8 && Math.abs(sl.z - BR.z) < W / 2 + 9) slots.splice(i, 1); }   // no parking places under or on the bridge
  }
  // ---- the hide-out under the middle of the bridge ----
  const crate = (x, z, s, y, ry) => { const c = box(g, s, s, s, y ? woodD : wood, x, (y || 0) + s / 2, z, ry || 0); box(g, s + .04, .12, s + .04, woodD, x, (y || 0) + s - .2, z, ry || 0); box(g, s + .04, .12, s + .04, woodD, x, (y || 0) + .2, z, ry || 0); if (!y) addBox(BR.x + x - s / 2, BR.z + z - s / 2, BR.x + x + s / 2, BR.z + z + s / 2, s + .2); return c; };
  crate(-4.6, -5.6, 1.5); crate(-3.0, -5.8, 1.2, 0, .2); crate(-4.4, -5.7, 1.1, 1.5, .3); crate(-4.8, 4.2, 1.4); crate(-4.7, 5.8, 1.2, 0, -.2); crate(-4.7, 4.6, 1.0, 1.4, .5); crate(4.7, -4.6, 1.5); crate(4.6, -2.9, 1.3, 0, .15); crate(4.6, -4.2, 1.1, 1.5, -.3); crate(4.8, 5.6, 1.3); crate(3.3, 5.9, 1.1);
  crate(-11.5, -5.5, 1.5); crate(-12.8, -3.9, 1.3, 0, .3); crate(-16.4, 5.2, 1.4); crate(-17.9, 5.4, 1.2, 0, -.15); crate(-16.8, 5.3, 1.0, 1.4, .4); crate(11.3, 5.4, 1.5); crate(12.9, 5.6, 1.2, 0, .25); crate(16.6, -5.0, 1.4); crate(16.2, -3.5, 1.2); crate(16.5, -4.6, 1.0, 1.4, .2);
  const drum = (x, z, c) => { const m = new T.Mesh(new T.CylinderGeometry(.42, .42, 1.15, 12), M(c, { metalness: .4, roughness: .6 })); m.position.set(x, .58, z); m.castShadow = true; g.add(m); addCircle(BR.x + x, BR.z + z, .45); return m; };
  drum(-2.2, 5.9, 0x2f4f8a); drum(-1.2, 6.2, 0x8a2f2f); drum(2.0, -6.0, 0x2f6a3a); drum(-9.4, 5.6, 0x8a6a1f); drum(9.4, -5.6, 0x2f4f8a); drum(10.4, -5.9, 0x8a6a1f);
  for (const [fx, fz] of [[3.6, 3.2], [-13.8, 0]]) { drum(fx, fz, 0x2a2a2a); const fire = new T.Mesh(new T.ConeGeometry(.3, .7, 7), new T.MeshBasicMaterial({ color: 0xff9a2a })); fire.position.set(fx, 1.45, fz); g.add(fire); (G.lairFires = G.lairFires || []).push(fire); }   // fires in oil drums
  // the table with maps on it, a lamp hanging over it, chairs, a big map on the pier
  box(g, 2.6, .1, 1.3, wood, -1.2, .85, -1.2); for (const [x, z] of [[-2.4, -1.75], [0, -1.75], [-2.4, -.65], [0, -.65]]) box(g, .1, .85, .1, woodD, x, .42, z); addBox(BR.x - 2.5, BR.z - 1.85, BR.x + .1, BR.z - .55, 1);
  box(g, 1.2, .02, .8, M(0xd8cfae), -1.3, .91, -1.2); box(g, .3, .2, .2, M(0x22252b), -.3, 1.0, -1.4);
  for (const [x, z, r] of [[-1.2, -2.3, 0], [-3.1, -1.2, Math.PI / 2], [.7, -1.2, -Math.PI / 2]]) { const c = new T.Group(); c.position.set(x, 0, z); c.rotation.y = r; g.add(c); box(c, .5, .08, .5, woodD, 0, .48, 0); box(c, .5, .6, .08, woodD, 0, .8, -.22); for (const k of [-1, 1]) for (const q of [-1, 1]) box(c, .07, .48, .07, woodD, k * .2, .24, q * .2); addCircle(BR.x + x, BR.z + z, .3); }
  box(g, .04, 2.6, .04, metal, -1.2, H - 1.3, -1.2); const bulb = new T.Mesh(new T.SphereGeometry(.14, 8, 6), new T.MeshBasicMaterial({ color: 0xfff0b0 })); bulb.position.set(-1.2, H - 2.7, -1.2); g.add(bulb); const lamp = new T.PointLight(0xffe2a0, 40, 22, 1.5); lamp.position.set(-1.2, H - 2.9, -1.2); g.add(lamp);
  box(g, .05, 1.6, 2.6, M(0xd8cfae), -5.77, 2.4, 0); box(g, .06, .25, .35, M(0xb3261e), -5.74, 2.6, .5); box(g, .06, .2, .3, M(0xb3261e), -5.74, 2.1, -.6);   // the wall map, with red marks
  box(g, 4.2, .06, 3.0, tarp, -17, 2.6, -2).rotation.z = .15; for (const [x, z] of [[-18.9, -3.4], [-18.9, -.6], [-15.1, -3.4], [-15.1, -.6]]) box(g, .08, 2.6, .08, metal, x, 1.3, z); box(g, 2.0, .3, 1.0, M(0x39424d), -17, .15, -2); addBox(BR.x - 18, BR.z - 2.5, BR.x - 16, BR.z - 1.5, .5);   // a tarpaulin shelter with a mattress
  { const v = new T.Group(); v.position.set(14.2, 0, .4); v.rotation.y = .25; g.add(v); box(v, 4.6, 1.5, 1.9, M(0x2b2f36), 0, 1.15, 0); box(v, 1.3, .9, 1.8, M(0x1c2530, { roughness: .2 }), 1.75, 1.5, 0); box(v, 4.7, .3, 2.0, M(0x1c1d20), 0, .35, 0); for (const kx of [-1.5, 1.5]) for (const kz of [-1, 1]) { const w = new T.Mesh(new T.CylinderGeometry(.36, .36, .26, 12), M(0x15161a)); w.rotation.x = Math.PI / 2; w.position.set(kx, .36, kz * .9); v.add(w); } addBox(BR.x + 11.9, BR.z - .9, BR.x + 16.5, BR.z + 1.7, 2); }   // the gang's van
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) { if (i === 4) continue; const sb = box(g, 1.0, .32, .5, M(0x9a8f6e), -4.5 + i * 1.0, .16, s * (W / 2 + .6)); sb.rotation.y = rr(-.1, .1); box(g, 1.0, .32, .5, M(0x8f8464), -4.4 + i * 1.0, .48, s * (W / 2 + .6)); }   // sandbag walls with a gap to walk through
  for (const s of [-1, 1]) { addBox(BR.x - 5, BR.z + s * (W / 2 + .6) - .25, BR.x - 1, BR.z + s * (W / 2 + .6) + .25, .7); addBox(BR.x, BR.z + s * (W / 2 + .6) - .25, BR.x + 4, BR.z + s * (W / 2 + .6) + .25, .7); }
  // the chest with the secret documents, on the ground by the table
  docMesh = new T.Group(); const cs = M(0x4f5a3a, { metalness: .3, roughness: .6 }), band = M(0xb9bec6, { metalness: .8, roughness: .3 }); box(docMesh, 1.0, .5, .6, cs, 0, .25, 0); box(docMesh, 1.02, .16, .62, M(0x5d6a45, { metalness: .3, roughness: .6 }), 0, .58, 0); for (const k of [-.32, .32]) box(docMesh, .08, .68, .64, band, k, .34, 0); box(docMesh, .16, .14, .04, M(0xe0b020, { metalness: .8, roughness: .3 }), 0, .46, .32); docMesh.position.set(CHEST.x, 0, CHEST.z); g.add(docMesh); addBox(BR.x + CHEST.x - .5, BR.z + CHEST.z - .3, BR.x + CHEST.x + .5, BR.z + CHEST.z + .3, .7);
}

/* ---------- the gang ---------- */
const LOOKS = [
  { head: 'Punk_Head', body: 'Punk_Body', legs: 'Punk_Legs', feet: 'Punk_Feet', top: 0x1c1512, bottom: 0x15151a },
  { head: 'Casual_Head', body: 'Casual_Body', legs: 'Casual_Legs', feet: 'Casual_Feet', top: 0x7a1f1f, bottom: 0x22252b },
  { head: 'Casual2_Head', body: 'Casual_Body', legs: 'Casual_Legs', feet: 'Casual_Feet', top: 0x2a2a2a, bottom: 0x3a2f22 }];
function makeFoes() {
  for (let i = 0; i < 6; i++) {
    const p = makeNPC('pm', Object.assign({ skin: [0xf1c9a5, 0xc68642, 0x8d5524, 0xe0ac7e][i % 4], hair: [0x1c1410, 0x7a2f1a, 0x101010][i % 3] }, LOOKS[i % 3]), BR.x, BR.z, 0); G.npcs.pop(); p.h.visible = false;
    const e = { p, x: BR.x, z: BR.z, yaw: 0, hp: 0, kind: 'fist', st: 'off', cd: 1, t: 0, swing: 0, shootT: 0 }; foes.push(e);
    G.targets.push({ get x() { return e.x; }, get z() { return e.z; }, get y() { return landHeight(e.x, e.z); }, top: 2.1, r: .5, person: true, alive: () => e.st === 'on',
      hit: (dmg, dx, dz) => { if (e.st !== 'on') return; e.hp -= dmg; e.stag = .25; if (G.blood) G.blood(e.x, 1.2, e.z, dmg > 15 ? 6 : 3, (dx || 0) * 5, (dz || 0) * 5);
        if (e.hp <= 0) { e.st = 'down'; e.t = 7; if (e.p.pistol) e.p.pistol.visible = false; playAnim(e.p, 'Death', true, 1.2); if (G.stat) G.stat('kills'); if (e.kind === 'gun' && (G.inv.pistol || G.inv.guns.length)) { G.inv.ammo += 10; if (G.onWeapon) G.onWeapon(); } } } });
  }
}
function spawnWave(n) {
  const [nf, ng] = WAVES[n], pl = G.player; let k = 0;
  for (const e of foes) { if (k >= nf + ng) break; const gun = k >= nf, boss = n === 3 && k === 0;
    let x = 0, z = 0; for (let tries = 0; tries < 30; tries++) { const a = rnd() * 6.283, r = rr(22, 34); x = BR.x + Math.cos(a) * r; z = BR.z + Math.sin(a) * r; if (!solidAt(x, z, .5) && Math.hypot(x - pl.x, z - pl.z) > 14) break; }
    e.x = x; e.z = z; e.kind = gun ? 'gun' : 'fist'; e.hp = boss ? 130 : gun ? 38 : 48; e.boss = boss; e.st = 'on'; e.cd = rr(.6, 1.6); e.swing = 0; e.shootT = 0; e.stag = 0; e.p.h.visible = true; e.p.h.scale.setScalar(boss ? 1.15 : 1); if (e.p.pistol) e.p.pistol.visible = gun; k++; }
  wave = n; G.say('Wave ' + (n + 1) + ' of 4' + (n === 3 ? ': here comes the boss!' : n === 0 ? ': they have seen you!' : ''), 4); if (G.sfx && G.sfx.door) G.sfx.door();
}
const cp = { x: 0, z: 0 };
function updateFoes(dt) {
  const pl = G.player, tx = pl.car ? pl.car.x : pl.ride ? pl.ride.x : pl.x, tz = pl.car ? pl.car.z : pl.ride ? pl.ride.z : pl.z, onFoot = !pl.car && !pl.ride;
  for (const e of foes) {
    const p = e.p; if (e.st === 'off') continue;
    if (e.st === 'down') { e.t -= dt; if (e.t <= 0) { e.st = 'off'; p.h.visible = false; } p.mixer.update(dt); continue; }
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || .01; let moving = false;
    e.yaw += wrapA(Math.atan2(dx, dz) - e.yaw) * Math.min(1, dt * 8); if (e.stag > 0) e.stag -= dt;
    const alive = pl.health > 0 && !G.inside;
    if (e.kind === 'fist') {
      const reach = pl.car ? 2.3 : 1.25; if (e.swing > 0) e.swing -= dt;
      if (d > reach && !(e.stag > 0)) { const sp = (e.boss ? 3.1 : 3.7) * dt; cp.x = e.x + dx / d * sp; cp.z = e.z + dz / d * sp; collide(cp, .35); e.x = cp.x; e.z = cp.z; moving = true; }
      else if (alive) { e.cd -= dt; if (e.cd <= 0) { e.cd = rr(.9, 1.4); e.swing = .5; if (p.acts && p.acts.Punch_Right) p.acts.Punch_Right.reset(); if (G.sfx && G.sfx.punch) G.sfx.punch();
        if (pl.car) { pl.car.hp -= 2; if (G.shake) G.shake(.15); } else if (onFoot) { G.hurt(e.boss ? rr(10, 14) : rr(6, 9)); if (G.shake) G.shake(.3); } } }
      playAnim(p, e.stag > 0 ? 'Hit_Head' : e.swing > 0 ? 'Punch_Right' : moving ? 'Run' : 'Idle', e.stag > 0 || e.swing > 0, e.swing > 0 ? 1.5 : moving ? 1.25 : 1);
    } else {
      const see = d < 36 && clearLine(e.x, e.z, tx, tz);
      if ((d > 15 || !see) && !(e.stag > 0)) { const sp = 3.1 * dt; cp.x = e.x + dx / d * sp; cp.z = e.z + dz / d * sp; collide(cp, .35); e.x = cp.x; e.z = cp.z; moving = true; }
      e.cd -= dt;
      if (see && alive && e.cd <= 0) { e.cd = rr(1.0, 1.9); const hit = onFoot ? rnd() < (d < 10 ? .42 : .28) : rnd() < .18;
        G.tracer(e.x, 1.3 + landHeight(e.x, e.z), e.z, tx + (hit ? 0 : rr(-1.4, 1.4)), 1.2 + pl.y, tz + (hit ? 0 : rr(-1.4, 1.4))); if (G.sfx) G.sfx.shot(true); if (hit) G.hurt(7); e.shootT = .4; }
      e.shootT = Math.max(0, e.shootT - dt); if (p.pistol) p.pistol.visible = true;
      playAnim(p, moving ? (e.shootT > 0 ? 'Run_Aim' : 'Run_Hold') : 'Aim1', false, moving ? 1.25 : 1);
    }
    for (const o of foes) if (o !== e && o.st === 'on') { const qx = e.x - o.x, qz = e.z - o.z, q = Math.hypot(qx, qz); if (q < .8 && q > .001) { e.x += qx / q * (.8 - q) * .5; e.z += qz / q * (.8 - q) * .5; } }   // they do not stand inside each other
    p.h.position.set(e.x, landHeight(e.x, e.z), e.z); p.h.rotation.y = e.yaw; p.mixer.update(dt);
  }
}
const left = () => foes.filter(e => e.st === 'on').length;
function clearFoes() { for (const e of foes) { e.st = 'off'; e.p.h.visible = false; } }

/* ---------- the mission ---------- */
function setHud(t) { if (!hud) { hud = document.createElement('div'); hud.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(20,24,32,.72);color:#fff;font:600 14px system-ui,sans-serif;pointer-events:none;z-index:6;display:none'; document.body.appendChild(hud); } hud.textContent = t || ''; hud.style.display = t ? 'block' : 'none'; }
function fail(why) { if (st === 'idle') return; st = 'idle'; pause = 0; clearFoes(); drop(goalM); goalM = null; drop(docM); docM = null; docMesh.visible = true; setHud(''); cool = 20; G.say('Mission failed: ' + why + '. Victor will give you another go.', 6); }
function chestMark(text) { return addMarker({ x: BR.x + CHEST.x, z: BR.z + CHEST.z + 1.2, type: 'goal', icon: '!', text, color: 0xf2c21a, onEnter: touchChest }); }
function begin() { st = 'go'; drop(goalM); goalM = chestMark('DOCUMENTS'); }
// You reach for the chest. The first time, the gang spots you and comes for you; once all four waves are beaten, it is yours.
function touchChest() {
  if (st === 'go') { st = 'fight'; pause = 0; drop(goalM); goalM = null; G.say('"HEY! He is stealing the documents! GET HIM!"', 4); spawnWave(0); return; }
  if (st !== 'docs') return;
  st = 'return'; drop(docM); docM = null; docMesh.visible = false; goalM = addMarker({ x: VIC.x + 3, z: VIC.z, car: true, type: 'goal', icon: '!', text: 'VICTOR', color: 0x35c46a, onEnter: () => { } }); setHud('Bring the chest back to Victor. Do not die!'); if (G.sfx && G.sfx.cash) G.sfx.cash(); G.say('You have the chest with the secret documents! Take it back to Victor, alive.', 6);
}
function talk() {
  if (st === 'return') { st = 'idle'; drop(goalM); goalM = null; setHud(''); docMesh.visible = true; cool = 240; G.money += PAY; if (G.onMoney) G.onMoney(PAY); if (G.sfx && G.sfx.cash) G.sfx.cash(); G.say('"You got them! Good work." Victor pays you $' + PAY + '.', 7); return true; }
  if (st !== 'idle') { G.say(st === 'go' ? '"The hide-out is under the big road bridge. Follow the mark on your map and take the chest."' : '"Not yet. Bring me the documents first."', 4); return true; }
  if (cool > 0) { G.say('"Nothing for you right now. Come back in a little while."', 3); return true; }
  G.menu('Victor', '"Psst. A gang keeps a chest of secret documents in their hide-out under the big road bridge. I want it. Sneak in and take the chest. If they see you, you will have to fight. Will you do it?"  Pays $' + PAY, [
    { label: 'Yes, I will do it', note: 'the hide-out is marked on your map', fn: () => { begin(); setHud('Go to the hide-out under the big road bridge and take the chest'); G.say('"Good. It is out in the fields east of the city. Follow the mark on your map."', 6); return true; } },
    { label: 'No', fn: () => { G.say('"Your loss. I will be here if you change your mind."', 3); return true; } }]);
  return true;
}
export function setupLair(sc) {
  scene = sc; buildBridge(); makeFoes();
  const n = makeNPC('pm', { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', skin: 0xe0ac7e, hair: 0x2a2a2a, top: 0x26303f, bottom: 0x1c1c22 }, VIC.x, VIC.z, Math.PI / 2); n.h.position.y = .12; n.far = true;
  addMarker({ x: VIC.x + .9, z: VIC.z, type: 'story', icon: '★', text: 'VICTOR', color: 0x3a7bd5, onEnter: talk });
  const ob = G.onBusted; G.onBusted = () => { if (st !== 'idle') fail('you were arrested'); if (ob) ob(); };
  G.lairDBG = { get st() { return st; }, get wave() { return wave; }, foes, BR, VIC, talk, left, yes() { cool = 0; begin(); }, touchChest, CHEST };
}
export function updateLair(dt) {
  const pl = G.player; if (cool > 0) cool -= dt; if (Math.hypot(pl.x - BR.x, pl.z - BR.z) < 420) { if (G.lairFires) for (const f of G.lairFires) f.scale.y = 1 + Math.sin(G.time * 17 + f.position.x) * .18; }
  if (st === 'idle') return;
  if (pl.health <= 0) { fail('you died'); return; }
  const px = pl.car ? pl.car.x : pl.ride ? pl.ride.x : pl.x, pz = pl.car ? pl.car.z : pl.ride ? pl.ride.z : pl.z, d = Math.hypot(px - BR.x, pz - BR.z);
  if (st === 'go') return;   // nothing happens until you reach for the chest
  if (st === 'fight') {
    updateFoes(dt); const n = left();
    if (n > 0) setHud('Wave ' + (wave + 1) + ' of 4  -  ' + n + ' left');
    else if (pause <= 0) { pause = wave < 3 ? 3 : .01; setHud(wave < 3 ? 'Wave ' + (wave + 1) + ' beaten. Get ready...' : ''); if (wave < 3) G.say('Wave ' + (wave + 1) + ' beaten!', 2.5); }
    else { pause -= dt; if (pause <= 0) { pause = 0; if (wave < 3) spawnWave(wave + 1); else { st = 'docs'; docM = chestMark('TAKE THE CHEST'); setHud('All four waves beaten. Take the chest'); G.say('You beat them all! Now take the chest.', 6); } } }
    return;
  }
  if (st === 'docs' || st === 'return') updateFoes(dt);
  if (st === 'return' && Math.hypot(px - VIC.x, pz - VIC.z) < 4.5 && !(pl.car && pl.car.v > 7) && !pl.ride) talk();   // back at Victor, on foot or pulling up in a car: he takes the documents and pays
}
