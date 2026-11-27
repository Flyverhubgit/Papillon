// Papillon - gangs: two groups that hold a patch of the city and shoot back when provoked
import { G, doors, collide, rr, rnd, onRoad, solidAt, kerbH, landHeight, BASE, inWater } from './world.js';
import { makeNPC, playAnim, clearLine, crime, dropCash } from './actors.js';

// One gang, and it holds the old army base: olive-green sweatshirts, always armed. Shoot them (or walk in on them) and they all open fire.
// Every member carries a real gun (pistol, SMG, shotgun or rifle): when one goes down you can take it.
export const GANGS = [
  { name: 'The Iron Wolves', color: 0x4a6a2a, cx: BASE.x, cz: BASE.z, r: 70, body: 'Punk_Body', legs: 'Punk_Legs', feet: 'Punk_Feet', heads: ['Punk_Head', 'Casual_Head'], top: 0x4a5a2c, bottom: 0x23261d },
  // the two walled estates (see estates.js): their guards stay at home, they never go raiding
  { name: 'The Syndicate', color: 0x15151a, cx: -118, cz: 985, r: 70, still: true, n: 9, rect: [-170, -66, 915, 1060], shout: '"Intruder! Open fire!"', body: 'Punk_Body', legs: 'Punk_Legs', feet: 'Punk_Feet', heads: ['Casual_Head'], top: 0x14141a, bottom: 0x14141a },
  { name: 'Presidential Guard', color: 0x15151a, cx: 1320, cz: -430, r: 95, still: true, n: 10, rect: [1245, 1400, -495, -365], shout: '"Intruder at the residence! Fire!"', body: 'Punk_Body', legs: 'Punk_Legs', feet: 'Punk_Feet', heads: ['Casual_Head'], top: 0x101216, bottom: 0x101216 },
  { name: 'The Army', color: 0x4a5a2c, cx: 26, cz: -586, r: 110, still: true, n: 12, rect: [-165, 215, -607, -566], shout: '"Intruder on the base! Open fire!"', body: 'Punk_Body', legs: 'Punk_Legs', feet: 'Punk_Feet', heads: ['Casual_Head'], top: 0x58633a, bottom: 0x3f4a2a }
];
const KINDS = { pistol: { name: 'pistol', cd: [.9, 1.8], dmg: 8, ammo: 14, range: 36 }, smg: { name: 'SMG', cd: [.3, .6], dmg: 5, ammo: 40, range: 36 }, shotgun: { name: 'shotgun', cd: [1.3, 2.1], dmg: 15, ammo: 16, range: 24 }, rifle: { name: 'rifle', cd: [.8, 1.4], dmg: 10, ammo: 30, range: 48 } };
const KIND_LIST = ['pistol', 'smg', 'rifle', 'shotgun', 'pistol', 'smg', 'rifle', 'smg', 'shotgun', 'pistol'];
G.gang = [];
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
let MOBILEN = false;
export function setupGangs(n, mobile) {
  MOBILEN = !!mobile;
  for (const g of GANGS) {
    let made = 0; const want = g.n ? (MOBILEN ? Math.ceil(g.n * .6) : g.n) : n;
    for (let tries = 0; tries < 600 && made < want; tries++) {
      const a = rnd() * 6.283, r = 6 + rnd() * 34, x = g.rect ? g.rect[0] + rnd() * (g.rect[1] - g.rect[0]) : g.cx + Math.cos(a) * r, z = g.rect ? g.rect[2] + rnd() * (g.rect[3] - g.rect[2]) : g.cz + Math.sin(a) * r;
      if (solidAt(x, z, 1.4) || inWater(x, z) || G.gang.some(o => Math.hypot(o.hx - x, o.hz - z) < 5)) continue;
      const i = made++, kind = KIND_LIST[i % KIND_LIST.length];
      const p = makeNPC('pm', { head: g.heads[i % g.heads.length], body: g.body, legs: g.legs, feet: g.feet, skin: [0xf1c9a5, 0xc68642, 0x8d5524, 0xe0ac7e][i % 4], hair: [0x1c1410, 0x7a2f1a, 0x101010][i % 3], top: g.top, bottom: g.bottom }, x, z, 0);
      G.npcs.pop();   // gang members are moved and animated here, not as standing staff
      G.gang.push({ p, g, kind, hx: x, hz: z, x, z, yaw: rnd() * 6, hp: 40, state: 'idle', t: rr(1, 5), cd: rr(.5, 1.5), tx: x, tz: z });
    }
  }
}
// members near a point turn hostile (a shot was fired, or one of them was attacked)
export function angerGangs(x, z, r) { for (const m of G.gang) if (m.state !== 'down' && (m.x - x) ** 2 + (m.z - z) ** 2 < r * r) { m.state = 'hostile'; m.calm = 14; } }
export function hitGang(m, dmg, dx, dz) {
  if (m.state === 'down') return;
  m.hp -= dmg; angerGangs(m.x, m.z, 50); if (G.blood) G.blood(m.x, 1.2, m.z, dmg > 15 ? 6 : 3, (dx || 0) * 5, (dz || 0) * 5);
  if (m.hp <= 0) { if (G.stat) G.stat('kills'); G.gangDowns = (G.gangDowns || 0) + 1; m.state = 'down'; m.t = 70; dropCash(m.x + dx, m.z + dz); if (rnd() < .4 && (G.inv.pistol || G.inv.guns.length)) { G.inv.ammo += 12; G.onWeapon(); G.say('Picked up 12 bullets', 2); } crime(Math.max(1, G.stars), false); }
}
const LONGK = { smg: 1, rifle: 1, shotgun: 1 };
function showGun(m, on) { const p = m.p; if (p.guns) for (const k in p.guns) p.guns[k].visible = on && k === m.kind; else if (p.pistol) p.pistol.visible = on && m.kind === 'pistol'; }
function gunAnim(m, moving) { const L = LONGK[m.kind]; playAnim(m.p, moving ? (m.shootT > 0 ? (L ? 'Run_Aim2' : 'Run_Aim') : 'Run_Hold') : (L ? 'Aim2' : 'Aim1'), false, moving ? 1.25 : 1); }
// a member who is down: walk up to him and you take his gun and ammo
function lootGun(m) {
  m.looted = true; const K = KINDS[m.kind];
  if (m.kind === 'pistol') G.inv.pistol = true; else if (!G.inv.guns.includes(m.kind)) G.inv.guns.push(m.kind);
  G.inv.ammo += K.ammo; if (!G.weapon || G.weapon === 'fist' || G.weapon === 'fists' || G.weapon === 'bat') G.weapon = m.kind; G.onWeapon(); if (G.sfx && G.sfx.cash) G.sfx.cash();
  G.say('You took his ' + K.name + ' and ' + K.ammo + ' bullets', 4);
}
let turf = null;
// Gang wars: every few minutes a few members of one gang turn up at a patch of the other and a shoot-out starts.
// It only happens at a patch near enough for you to go and watch (or join in). Shoot at them and they all turn on you.
let warCd = 100;
function startWar() {
  const pl = G.player, near = GANGS.filter(g => { if (g.still) return false; const d = Math.hypot(pl.x - g.cx, pl.z - g.cz); return d > 50 && d < 320; });
  if (!near.length) return false;
  const T = near[Math.floor(rnd() * near.length)], raiders = G.gang.filter(m => !m.g.still && m.g.name !== T.name && m.state === 'idle' && !m.p.h.visible).slice(0, 3);
  if (raiders.length < 2) return false;
  let sx = 0, sz = 0, ok = false; for (let k = 0; k < 16 && !ok; k++) { const a = rnd() * 6.28; sx = T.cx + Math.sin(a) * (T.r * .5 + 12); sz = T.cz + Math.cos(a) * (T.r * .5 + 12); ok = !solidAt(sx, sz, 1.2) && Math.hypot(sx - pl.x, sz - pl.z) > 40; }
  if (!ok) return false;
  raiders.forEach((m, i) => { m.x = sx + (i - 1) * 1.6; m.z = sz + (i % 2) * 1.4; m.state = 'war'; m.foe = null; m.wx = T.cx; m.wz = T.cz; m.warT = 0; m.away = true; m.hp = 40; });
  for (const m of G.gang) if (m.g === T && m.state === 'idle') { m.state = 'war'; m.foe = null; m.wx = sx; m.wz = sz; m.warT = 0; }
  G.say('Gang war! ' + raiders[0].g.name + ' are attacking ' + T.name + ' territory nearby', 6);
  return true;
}
G.gangWar = () => { warCd = 0; };
export function updateGangs(dt) {
  if (!G.gang.length) return;   // no gangs in the game: no wars, no territory messages
  warCd -= dt; if (warCd <= 0) warCd = startWar() ? rr(240, 420) : 25;
  const pl = G.player, px = pl.x, pz = pl.z, onFoot = !pl.ride && !G.inside;
  let now = null; for (const g of GANGS) if (Math.hypot(px - g.cx, pz - g.cz) < g.r) now = g;
  if (now !== turf) { turf = now; if (now && !G.inside) G.say(now.name + ' territory', 3); }
  const cp = { x: 0, z: 0 };
  for (const m of G.gang) {
    const dx = px - m.x, dz = pz - m.z, d = Math.hypot(dx, dz), p = m.p;
    if (d > 140) { p.h.visible = false; if (m.away && m.state !== 'war') { m.away = false; m.x = m.hx; m.z = m.hz; m.tx = m.hx; m.tz = m.hz; } if (m.state === 'war') { m.warT += dt; if (m.warT > 40) m.state = 'idle'; } if (m.state === 'down') { m.t -= dt; if (m.t <= 0) { m.state = 'idle'; m.hp = 40; m.x = m.hx; m.z = m.hz; } } continue; }
    p.h.visible = true;
    if (m.state === 'down') { m.t -= dt; playAnim(p, 'Death', true, 1.2); showGun(m, false); if (!m.looted && d < 1.9 && onFoot && pl.health > 0 && !pl.swim) lootGun(m); if (m.t <= 0 && d > 45) { m.state = 'idle'; m.hp = 40; m.x = m.hx; m.z = m.hz; m.looted = false; } }
    else if (m.state === 'hostile') {
      m.calm -= dt * (d > 70 ? 3 : d > 34 ? 1 : 0); if (m.calm <= 0 || pl.health <= 0) { m.state = 'idle'; m.tx = m.hx; m.tz = m.hz; }
      m.yaw += wrapA(Math.atan2(dx, dz) - m.yaw) * Math.min(1, dt * 8);
      const K = KINDS[m.kind], see = d < K.range && clearLine(m.x, m.z, px, pz); let moving = false;
      if (d > (m.kind === 'rifle' ? 24 : m.kind === 'shotgun' ? 9 : 16) || !see) { const sp = 3.2 * dt; cp.x = m.x + dx / d * sp; cp.z = m.z + dz / d * sp; collide(cp, .35); m.x = cp.x; m.z = cp.z; moving = true; }
      m.cd -= dt;
      if (see && m.cd <= 0) {
        m.cd = rr(K.cd[0], K.cd[1]); const hit = onFoot ? rnd() < (m.kind === 'shotgun' ? (d < 10 ? .75 : .2) : d < 12 ? .5 : .32) : rnd() < .2;
        G.tracer(m.x, 1.3, m.z, px + (hit ? 0 : rr(-1.4, 1.4)), 1.2, pz + (hit ? 0 : rr(-1.4, 1.4))); if (G.sfx) G.sfx.shot(true);
        if (hit) G.hurt(K.dmg); m.shootT = .4;
      }
      m.shootT = Math.max(0, (m.shootT || 0) - dt);
      showGun(m, true); gunAnim(m, moving);
    } else if (m.state === 'war') {
      let foe = m.foe; if (!foe || foe.state === 'down' || foe.g.name === m.g.name) { foe = null; let bd = 46; for (const o of G.gang) if (o.g.name !== m.g.name && o.state !== 'down') { const q = Math.hypot(o.x - m.x, o.z - m.z); if (q < bd) { bd = q; foe = o; } } m.foe = foe; }
      const gx = foe ? foe.x : m.wx, gz = foe ? foe.z : m.wz, fx = gx - m.x, fz = gz - m.z, fd = Math.hypot(fx, fz) || .01; let moving = false;
      m.yaw += wrapA(Math.atan2(fx, fz) - m.yaw) * Math.min(1, dt * 8);
      const see = foe && fd < 34 && clearLine(m.x, m.z, gx, gz);
      if (foe ? (fd > 15 || !see) : fd > 8) { const sp = 3.2 * dt; cp.x = m.x + fx / fd * sp; cp.z = m.z + fz / fd * sp; collide(cp, .35); m.x = cp.x; m.z = cp.z; moving = true; }
      if (!foe) { m.warT += dt; if (m.warT > 14) { m.state = 'idle'; m.tx = m.x; m.tz = m.z; } } else m.warT = 0;
      m.cd -= dt;
      if (see && m.cd <= 0) {
        m.cd = rr(1, 2.2); const hit = rnd() < .3;
        G.tracer(m.x, 1.3, m.z, foe.x + (hit ? 0 : rr(-1.4, 1.4)), 1.2, foe.z + (hit ? 0 : rr(-1.4, 1.4))); if (G.sfx && d < 90) G.sfx.shot(d > 25); m.shootT = .4;
        if (foe.state === 'idle') { foe.state = 'war'; foe.foe = m; foe.wx = m.x; foe.wz = m.z; foe.warT = 0; }
        if (hit) { foe.hp -= 10; if (G.blood) G.blood(foe.x, 1.2, foe.z, 4, fx / fd * 4, fz / fd * 4); if (foe.hp <= 0) { foe.state = 'down'; foe.t = 70; m.foe = null; } }
      }
      m.shootT = Math.max(0, (m.shootT || 0) - dt);
      showGun(m, true); gunAnim(m, moving);
    } else {
      showGun(m, true);   // always armed
      if (d < 20 && !G.inside && pl.health > 0 && clearLine(m.x, m.z, px, pz)) { angerGangs(m.x, m.z, 45); if (!G.gangWarned || G.time - G.gangWarned > 25) { G.gangWarned = G.time; G.say(m.g.shout || '"Hey! This is our base! Get him!"', 3); } }
      m.t -= dt; if (m.t <= 0) { m.t = rr(4, 10); m.tx = (m.away ? m.x : m.hx) + rr(-4, 4); m.tz = (m.away ? m.z : m.hz) + rr(-1.5, 1.5); }
      const tx = m.tx - m.x, tz = m.tz - m.z, td = Math.hypot(tx, tz);
      if (td > .3) { const sp = 1.3 * dt; cp.x = m.x + tx / td * sp; cp.z = m.z + tz / td * sp; collide(cp, .35); m.x = cp.x; m.z = cp.z; m.yaw += wrapA(Math.atan2(tx, tz) - m.yaw) * Math.min(1, dt * 6); playAnim(p, 'Walk_Hold', false, 1.2); }
      else playAnim(p, 'Idle_Hold');
    }
    p.h.position.set(m.x, Math.max(kerbH(m.x, m.z), landHeight(m.x, m.z)), m.z); p.h.rotation.y = m.yaw; p.mixer.update(dt);
  }
}
