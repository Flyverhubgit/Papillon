// Papillon - small rules of the city: robbing people at gunpoint, the airport as a no-go area, breaking out of prison.
import { G, AIRPORT, JAIL, landHeight } from './world.js';
import { crime, panicPeds, newCar, removeCar, makeNPC, playAnim, clearLine } from './actors.js';
import { GUNS, updateHeist } from './shops.js';

let robPed = null, robT = 0, airT = 0, hintT = 0;
// vehicles that always stand ready: an ambulance at the hospital, two patrol cars at the police station. A stolen one is replaced once you are far away
const HOME = [{ type: 'ambulance', x: 121, z: -134.6, h: 0 }, { type: 'police', x: 101, z: -69.6, h: 0 }, { type: 'police', x: 88, z: -69.6, h: 0 }];
let homeT = 1, lastCar = null;
function keepHome() {
  const p = G.player;
  for (const s of HOME) {
    if (s.car && !s.car.dead && G.cars.includes(s.car) && Math.hypot(s.car.x - s.x, s.car.z - s.z) < 3) continue;
    if (s.car && Math.hypot(p.x - s.x, p.z - s.z) < 150) continue;   // taken or wrecked: wait until nobody is looking
    for (const c of G.cars.slice()) if (c !== p.car && !c.ai && !c.chase && Math.hypot(c.x - s.x, c.z - s.z) < 5.5) { if (c.slot) { c.slot.car = null; c.slot = null; } removeCar(c); }
    const c = newCar(s.type); c.x = s.x; c.z = s.z; c.h = s.h; c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.h; c.home = true; s.car = c;
  }
}

// Prison guards: two by the gate, one in the yard. They leave a prisoner alone inside the walls, but anyone going out through the gate,
// and any visitor who walks in, gets shot at until they are well away from the island.
const guards = []; G.prisonGuards = guards; let alarm = 0, escT = 0, tookBoat = false;
function prisonGuards(dt) {
  const p = G.player, d = Math.hypot(p.x - JAIL.x, p.z - JAIL.z);
  if (!guards.length) { const COP = { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', top: 0x2b3a2f, bottom: 0x1c241e };
    for (const [ox, oz, yaw] of [[21.5, -5.2, -Math.PI / 2], [21.5, 5.2, -Math.PI / 2], [-6, 9, Math.PI / 2]]) { const x = JAIL.x + ox, z = JAIL.z + oz, n = makeNPC('pm', Object.assign({ skin: 0xe0ac7e, hair: 0x1c1410 }, COP), x, z, yaw); n.h.position.y = landHeight(x, z); n.far = true; const g = { n, x, z, yaw, cd: 1, hp: 60, down: 0 }; guards.push(g);
      G.targets.push({ get x() { return g.x; }, get z() { return g.z; }, y: n.h.position.y, top: 2.1, r: .5, person: true, alive: () => g.down <= 0,
        hit: (dmg, dx, dz) => { if (g.down > 0) return; g.hp -= dmg; if (G.blood) G.blood(g.x, n.h.position.y + 1.2, g.z, dmg > 15 ? 6 : 3, (dx || 0) * 5, (dz || 0) * 5); alarm = Math.max(alarm, 40);
          if (g.hp <= 0) { g.down = 150; playAnim(n, 'Death', true, 1.2); crime(Math.min(6, Math.max(4, G.stars + 1)), false); if (G.stat) G.stat('kills'); } else crime(Math.min(6, Math.max(3, G.stars)), false); } }); }
    // the other prisoners, in orange: two at the tables, one under the hoop, one at the weights, two talking by the cell block
    const skins = [0xf1c9a5, 0x8d5524, 0xe0ac7e, 0xc68642, 0xf1c9a5, 0x8d5524], hairs = [0x1c1410, 0x101010, 0x7a2f1a, 0x101010, 0x8a8a8a, 0x3b2516];
    [[-15, 2.2, Math.PI, 'Sit'], [-9, .8, 0, 'Sit'], [-14.5, 10.5, 0, null], [-.3, 14.6, Math.PI / 2, null], [2, -5, Math.PI / 2, null], [3.3, -5.2, -Math.PI / 2, null]].forEach(([ox, oz, yaw, an], i) => {
      const x = JAIL.x + ox, z = JAIL.z + oz, n = makeNPC(i % 3 === 1 ? 'pw' : 'pm', { skin: skins[i], hair: hairs[i], top: 0xd9731f, bottom: 0xd9731f }, x, z, yaw); n.h.position.y = landHeight(x, z) - (an ? .06 : 0); n.far = true; if (an) playAnim(n, an); }); }
  // taking the prison launch is stealing it: the police will be waiting
  if (escT > 0) escT -= dt;
  if (p.ride && p.ride === G.prisonBoat) { if (!tookBoat) { tookBoat = true; crime(escT > 0 ? 3 : 2, false); G.say(escT > 0 ? 'You escaped in the prison launch! The police are looking for you. Head east to the city.' : 'You took the prison launch. The police saw that.', 6); } } else tookBoat = false;
  if (d > 140) { alarm = 0; return; }
  const inYard = Math.abs(p.x - JAIL.x) < 23.5 && Math.abs(p.z - JAIL.z) < 19.5, onIsle = d < 95 && !p.swim && !p.ride;
  if (G.jailed) { if (!inYard) { G.jailed = false; alarm = 30; escT = 900; crime(2, false); G.say('You broke out! The guards are shooting: get down to the boat.', 5); } }
  else if (inYard && alarm <= 0 && !G.inside) { alarm = 30; crime(3, false); G.say('Intruder in the prison! The guards open fire.', 4); }
  if (alarm > 0) { alarm -= dt; if (!onIsle && d > 70) alarm = 0; }
  for (const g of guards) {
    const dx = p.x - g.x, dz = p.z - g.z, gd = Math.hypot(dx, dz) || 1;
    if (g.down > 0) { g.down -= dt; if (g.down <= 0 && gd < 110) g.down = 1; else if (g.down <= 0) { g.hp = 60; playAnim(g.n, 'Idle'); } continue; }   // shot down: he lies there, and a new guard is on the post when you come back later
    if (alarm > 0 && gd < 75) {
      g.n.h.rotation.y = Math.atan2(dx, dz); playAnim(g.n, 'Aim1'); g.cd -= dt;
      if (g.cd <= 0 && clearLine(g.x, g.z, p.x, p.z)) { g.cd = .9 + Math.random() * 1.1; const hit = !p.ride && Math.random() < (gd < 25 ? .32 : .16); G.tracer(g.x, g.n.h.position.y + 1.3, g.z, p.x + (hit ? 0 : (Math.random() - .5) * 3), p.y + 1.2, p.z + (hit ? 0 : (Math.random() - .5) * 3)); if (G.sfx) G.sfx.shot(gd > 25); if (hit) G.copHurt(9); }
    } else { g.n.h.rotation.y = g.yaw; playAnim(g.n, 'Idle'); }
  }
}
export function updateExtras(dt) {
  const p = G.player;
  prisonGuards(dt); updateHeist(dt);
  homeT -= dt; if (homeT <= 0) { homeT = 4; keepHome(); }
  if (p.car !== lastCar) { lastCar = p.car; const c = p.car;
    if (c && !p.passenger) { if (c.type === 'ambulance') G.say('Ambulance: press T to start a paramedic shift', 5);
      if (c.police && c.home && !c.stolen) { c.stolen = true; crime(2, false); G.say('You stole a patrol car from the station!', 4); } } }
  // --- robbing: hold your aim on someone close for a moment and they hand over their money ---
  let hit = null;
  if (G.aim && !p.car && !p.ride && !G.inside) {
    const g = GUNS[G.weapon];
    if (g && !g.melee && !g.rocket) {
      const dx = Math.sin(G.camYaw), dz = Math.cos(G.camYaw); let best = 7.5;
      for (const q of G.peds) {
        if (!q.h.visible || q.robbed > G.time || !(q.state === 'walk' || q.state === 'chat' || q.state === 'sit' || q.state === 'on' || q.state === 'off' || q.state === 'robbed')) continue;
        const ox = q.x - p.x, oz = q.z - p.z, f = ox * dx + oz * dz, l = Math.abs(ox * dz - oz * dx);
        if (f > 1 && f < best && l < .9) { best = f; hit = q; }
      }
    }
  }
  if (hit !== robPed) { if (robPed && robPed.state === 'robbed') { robPed.state = 'flee'; robPed.t = 8; robPed.dir = 1; } robPed = hit; robT = 0; }
  if (hit) {
    if (hit.state !== 'robbed') { hit.state = 'robbed'; hit.t = 4; hit.cy = Math.atan2(p.x - hit.x, p.z - hit.z); }   // they freeze and turn to face you
    hit.t = 4; robT += dt; hintT -= dt; if (hintT <= 0) { hintT = 3; G.say('Keep your aim on them...', 1.2); }
    if (robT > 1.3) {
      const got = 20 + Math.floor(Math.random() * 11) * 10; G.money += got; G.onMoney(got); if (G.sfx) G.sfx.cash();
      G.say('You robbed them of $' + got, 3); if (G.stat) G.stat('robbed'); hit.robbed = G.time + 240; hit.state = 'flee'; hit.t = 10; hit.dir = Math.random() < .5 ? 1 : -1; robPed = null; robT = 0;
      panicPeds(p.x, p.z, 14); crime(2, false);
    }
  }
  // --- the airport: the runway and the apron are off limits unless you are flying ---
  if (!p.ride && !G.inside) {
    const x = p.car ? p.car.x : p.x, z = p.car ? p.car.z : p.z, air = x > AIRPORT.rx0 - 10 && x < AIRPORT.rx1 + 10 && Math.abs(z - AIRPORT.rz) < 22;
    if (air) { airT += dt; if (airT > 2.5 && G.stars < 2) { crime(2, false); G.say('Airport security has called the police: the runway is off limits', 4); } } else airT = 0;
  }
}
