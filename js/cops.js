// Papillon - police officers on foot. Police cars stop near you and an officer gets out:
// at one or two stars he runs up and arrests you, from three stars he keeps his distance and shoots.
import { G, collide, rr, rnd, pick, onRoad, kerbH } from './world.js';
import { makeNPC, playAnim, clearLine, crime, lookOptions, copKey, dressUp } from './actors.js';

G.cops = [];
const pool = [], cp = { x: 0, z: 0 };
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function newCop() {
  let c = pool.pop();
  if (!c) {
    const o = lookOptions('m'), f = a => a.find(n => n.startsWith('Suit_')) || a.find(n => n.startsWith('Casual_')) || a[0];
    const key = copKey(), p = makeNPC(key, { head: f(o.head), body: f(o.body), legs: f(o.legs), feet: f(o.feet), skin: pick([0xf1c9a5, 0xc68642, 0x8d5524, 0xe0ac7e]), hair: pick([0x1c1410, 0x4a2f1a, 0x101010]), top: 0x3d78e6, bottom: 0x1a2a5c }, 0, 0, 0);
    dressUp(p, 'police'); G.npcs.pop();   // officers are moved and animated here
    c = { p };
  }
  c.p.h.visible = true; c.indoor = false; return c;
}
function retire(c) { c.p.h.visible = false; if (c.car && c.car.cop === c) c.car.cop = null; const i = G.cops.indexOf(c); if (i >= 0) G.cops.splice(i, 1); pool.push(c); }
export function clearCops() { for (const c of G.cops.slice()) retire(c); }

// an officer steps out of a stopped police car, on the side nearer to you
G.copOut = car => {
  const c = newCop(), pl = G.player, sx = Math.sin(car.h), sz = Math.cos(car.h), side = ((pl.x - car.x) * sx + (pl.z - car.z) * sz) >= 0 ? 1 : -1;
  c.car = car; c.x = car.x + sx * 1.7 * side; c.z = car.z + sz * 1.7 * side; c.yaw = Math.atan2(pl.x - c.x, pl.z - c.z); c.hp = 60; c.state = 'chase'; c.cd = rr(.9, 1.7); c.t = 0; c.shootT = 0;
  c.warn = 3.2;   // from three stars he gives you a moment to give up before he opens fire
  if (!(G.copSayT > G.time)) { G.copSayT = G.time + 6; G.say(G.stars >= 5 ? '"There he is! Open fire!"' : G.stars >= 3 ? '"Police! Drop it and put your hands up!"  (stand still to give up)' : '"Police! Stop right there!"', 4); }
  car.cop = c; G.cops.push(c); if (G.sfx) G.sfx.door(); return c;
};
G.hitCop = (c, dmg) => { if (G.blood && c.state !== 'down') G.blood(c.x, 1.2, c.z, dmg > 15 ? 6 : 3);
  if (c.state === 'down') return;
  c.hp -= dmg;
  if (c.hp <= 0) { c.state = 'down'; c.t = 16; if (c.car) { c.car.chase = null; c.car.cop = null; c.car = null; } crime(Math.min(6, Math.max(4, G.stars + 1)), false); }
  else crime(Math.min(6, Math.max(3, G.stars)), false);
};

export function updateCops(dt) {
  const pl = G.player, px = pl.car ? pl.car.x : pl.x, pz = pl.car ? pl.car.z : pl.z, pv = Math.abs(pl.car ? pl.car.v : pl.speed), reach = !pl.ride && !G.inside && !pl.swim;
  let grab = false;
  // the police follow you into shops and the hospital: they come in through the door a few seconds after you
  if (G.inside && G.stars > 0 && pl.health > 0) {
    G.inCopT = (G.inCopT || 0) + dt; const inN = G.cops.filter(q => q.indoor && q.state !== 'down').length;
    if (G.inCopT > (inN ? 7 : 3.5) && inN < Math.min(3, 1 + Math.floor(G.stars / 2))) {
      G.inCopT = 0; const r = G.rooms[G.inside.name], ex = r && r.markers[r.markers.length - 1];
      if (ex) { const c = newCop(); c.indoor = true; c.car = null; c.x = ex.x + rr(-.4, .4); c.z = ex.z + .7; c.yaw = Math.PI; c.hp = 60; c.state = 'chase'; c.cd = rr(.8, 1.4); c.t = 0; c.shootT = 0; c.warn = G.stars >= 3 ? 1.6 : 0; G.cops.push(c); if (G.sfx) G.sfx.door(); if (!(G.copSayT > G.time)) { G.copSayT = G.time + 6; G.say('"Police! You are not going anywhere!"', 3); } }
    }
  } else G.inCopT = 0;
  for (let i = G.cops.length - 1; i >= 0; i--) {
    const c = G.cops[i], p = c.p, dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz) || .01;
    if (c.indoor && c.state !== 'down' && (!G.inside || G.stars === 0)) { retire(c); continue; }
    if (c.state === 'down') { c.t -= dt; if (p.pistol) p.pistol.visible = false; playAnim(p, 'Death', true, 1.2); if ((c.t <= 0 && d > 30) || c.t < -45) { retire(c); continue; } }
    else if (!c.indoor && (G.stars === 0 || d > 60 || !reach || (pl.car && pv > 12 && d > 22))) {
      // nothing more to do here: walk back to the car and get in (or just leave if the car is gone)
      c.state = 'back'; if (p.pistol) p.pistol.visible = false;
      if (!c.car || c.car.dead) { c.t += dt; playAnim(p, 'Idle'); if (c.t > 5 && d > 25 || c.t > 40) { retire(c); continue; } }
      else {
        const tx = c.car.x - c.x, tz = c.car.z - c.z, td = Math.hypot(tx, tz);
        if (td < 2.4) { retire(c); continue; }
        cp.x = c.x + tx / td * 5 * dt; cp.z = c.z + tz / td * 5 * dt; collide(cp, .35); c.x = cp.x; c.z = cp.z; c.yaw += wrapA(Math.atan2(tx, tz) - c.yaw) * Math.min(1, dt * 8); playAnim(p, 'Run', false, 1.5);
      }
    } else {
      c.state = 'chase'; c.t = 0;
      // standing still with no gun raised is giving up: he stops shooting, walks up and takes you in. (At five stars and more nobody is taking prisoners.)
      const still = !pl.car && pv < .6 && !G.aim && !(pl.shootT > 0), giveUp = still && G.stars < 5 && d < 22;
      if (pl.shootT > 0 || G.aim || G.stars >= 5) c.warn = 0; else c.warn = Math.max(0, (c.warn || 0) - dt);
      const guns = G.stars >= 3, see = d < 40 && clearLine(c.x, c.z, px, pz), stop = guns && !giveUp ? 9 : 1.3; let moving = false;
      c.yaw += wrapA(Math.atan2(dx, dz) - c.yaw) * Math.min(1, dt * 8);
      if (d > stop || !see) { cp.x = c.x + dx / d * 4.6 * dt; cp.z = c.z + dz / d * 4.6 * dt; collide(cp, .35); c.x = cp.x; c.z = cp.z; moving = true; }
      c.shootT = Math.max(0, c.shootT - dt);
      if (guns && see && d < 34 && !giveUp && !(c.warn > 0)) {
        c.cd -= dt;
        if (c.cd <= 0) {
          c.cd = rr(.9, 1.8); const hit = rnd() < (pl.car ? .27 : d < 12 ? .55 : .36);
          G.tracer(c.x, 1.3, c.z, px + (hit ? 0 : rr(-1.4, 1.4)), 1.2, pz + (hit ? 0 : rr(-1.4, 1.4))); if (G.sfx) G.sfx.shot(true);
          if (hit) G.copHurt(8 + G.stars * 1.5); c.shootT = .4;
        }
      }
      if (d < 2.1 && pv < 2.5) grab = true;
      if (p.pistol) p.pistol.visible = guns;
      if (guns) playAnim(p, moving ? (c.shootT > 0 ? 'Run_Aim' : 'Run_Hold') : 'Aim1', false, moving ? 1.5 : 1); else playAnim(p, moving ? 'Run' : 'Idle', false, moving ? 1.5 : 1);
    }
    p.h.position.set(c.x, kerbH(c.x, c.z), c.z); p.h.rotation.y = c.yaw; p.mixer.update(dt);
  }
  // an officer standing right by you while you are nearly still makes the arrest
  if (G.stars > 0 && grab) { G.bustT += dt; if (G.bustT > 1.2 && G.onBusted) { G.bustT = 0; G.onBusted(); } } else G.bustT = Math.max(0, G.bustT - dt * .5);
}
