// Papillon - more of the city: things to pick up, butterflies to find, statistics, weather, shooting from the car, police work.
import * as T from 'three';
import { G, MOBILE, landHeight, kerbH, solidHeight, solidAt, loops, loopPoint, onRoad, JAIL, BASE, AIRPORT, hash2, WETU } from './world.js';
import { crime, panicPeds, peopleStyle, togglePeople } from './actors.js';
import { GUNS, hasGun, shoot, saveGame, addMarker, markers } from './shops.js';

/* ---------- statistics ---------- */
const S0 = { kills: 0, cars: 0, foot: 0, drive: 0, earned: 0, busted: 0, wasted: 0, played: 0, crims: 0, robbed: 0, jumps: 0, rampages: 0 };
const stats = () => (G.inv.stats = Object.assign({}, S0, G.inv.stats));
G.stat = (k, n = 1) => { stats()[k] += n; };
export function statsMenu() {
  const s = stats(), km = m => (m / 1000).toFixed(1) + ' km', h = Math.floor(s.played / 3600), mi = Math.floor(s.played % 3600 / 60);
  const rows = [['Time played', h + ' h ' + mi + ' min'], ['Story missions done', (G.inv.story || 0) + ' of 6'], ['Butterflies found', (G.inv.bf || []).length + ' of ' + BF.length], ['Money earned', '$' + Math.round(s.earned)], ['On foot', km(s.foot)], ['Driven', km(s.drive)],
    ['Cars taken', s.cars], ['People put down', s.kills], ['Criminals stopped', s.crims], ['People robbed', s.robbed], ['Stunt jumps', s.jumps + ' (ramps cleared: ' + (G.inv.jumps || []).length + ' of ' + (G.ramps ? G.ramps.length : 0) + ')'], ['Rampages done', s.rampages], ['Times busted', s.busted], ['Times wasted', s.wasted]];
  G.menu('Statistics', 'How you are doing in Papillon', rows.map(r => ({ label: r[0] + ':  ' + r[1], fn: () => false })).concat([{ label: 'Graphics quality: ' + (G.qualityName ? G.qualityName() : '?') + '  (press to change, F6)', fn: () => { if (G.cycleQuality) G.cycleQuality(); return true; } }, { label: 'People: ' + (peopleStyle() === 'real' ? 'Realistic' : 'Classic') + '  (press to change, the game restarts)', fn: () => { togglePeople(); setTimeout(() => { try { saveGame(); } catch (e) { } location.reload(); }, 200); return true; } }, { label: 'Make a problem report (F2)', fn: () => { if (G.showReport) setTimeout(G.showReport, 50); return true; } }, { label: 'Close', fn: () => true }]));
}

/* ---------- things to pick up ---------- */
const picks = [], BF = [];
const M = (c, e) => new T.MeshStandardMaterial({ color: c, roughness: .5, emissive: e || 0, emissiveIntensity: e ? .6 : 0 });
function mesh(kind) {
  const g = new T.Group(), b = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  if (kind === 'health') { const r = M(0xe23b3b, 0x6a0a0a); b(.5, .16, .12, r); b(.16, .5, .12, r); }
  else if (kind === 'armour') { const m = M(0x3a78d8, 0x0a2a6a); b(.46, .4, .12, m, 0, .06); b(.3, .2, .12, m, 0, -.2); }
  else if (kind === 'money') { const m = M(0x3fae5a, 0x0a4a1a); b(.5, .26, .1, m); b(.12, .12, .11, M(0xf2e9b0), 0, 0, 0); }
  else if (kind === 'ammo') { const m = M(0xc9a23a, 0x5a4208); b(.34, .26, .2, m); b(.38, .06, .24, M(0x3a3a3a), 0, .16); }
  else {   // a butterfly: two orange wings that beat
    const w = new T.MeshStandardMaterial({ color: 0xf08a1c, emissive: 0xa04a00, emissiveIntensity: .7, side: T.DoubleSide, roughness: .6 }), body = M(0x1c1410);
    b(.05, .05, .3, body); const L = new T.Group(), R = new T.Group(); for (const [grp, s] of [[L, -1], [R, 1]]) { const p1 = new T.Mesh(new T.PlaneGeometry(.34, .3), w); p1.rotation.x = -Math.PI / 2; p1.position.set(s * .18, 0, -.05); const p2 = new T.Mesh(new T.PlaneGeometry(.24, .2), w); p2.rotation.x = -Math.PI / 2; p2.position.set(s * .14, 0, .14); grp.add(p1, p2); g.add(grp); }
    g.userData.wings = [L, R];
  }
  return g;
}
function addPick(kind, x, z, y, id) { const g = mesh(kind); g.visible = false; G.scene.add(g); const p = { kind, x, z, y, id, g, back: 0 }; picks.push(p); return p; }
function setupPicks() {
  // butterflies: 50 of them, hidden all over the map - on pavements, on roofs, on the islands, in odd corners
  const spots = [[-330, 330], [-400, -250], [JAIL.x - 14, JAIL.z - 2], [BASE.x + 6, BASE.z + 10], [AIRPORT.rx1 - 6, AIRPORT.rz + 30], [372, 0], [-120, -480], [1515, 975], [1515, -975], [320, -975], [-60, 52], [150, 985]];
  let seed = 4711; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  while (spots.length < 50) { const L = loops[Math.floor(rnd() * loops.length)], q = {}; loopPoint(L, rnd() * L.P, q); let x = q.x, z = q.z; const k = spots.length;
    if (k % 3 === 0) { const ox = x - q.dz * 9, oz = z + q.dx * 9; if (solidHeight(ox, oz) > 5) { x = ox; z = oz; } else if (solidHeight(x + q.dz * 9, z - q.dx * 9) > 5) { x += q.dz * 9; z -= q.dx * 9; } }   // every third one up on a roof
    if (spots.every(s => Math.hypot(s[0] - x, s[1] - z) > 90)) spots.push([x, z]); }
  spots.forEach(([x, z], i) => { const roof = solidHeight(x, z), y = roof > 0 ? roof : Math.max(landHeight(x, z), kerbH(x, z)); BF.push(addPick('bf', x, z, y + 1.1, i)); });
  // useful things lying about: they come back a few minutes after you take them
  const kinds = [null, 'armour', 'money', 'ammo', null, 'money'];   // the red health crosses were taken out: health comes from food, bars, hospitals and sleep
  for (let i = 0; i < 60; i++) { const L = loops[Math.floor(rnd() * loops.length)], q = {}; loopPoint(L, rnd() * L.P, q); const x = q.x - q.dz * 1.4, z = q.z + q.dx * 1.4; if (solidAt(x, z, .5)) continue; if (kinds[i % kinds.length]) addPick(kinds[i % kinds.length], x, z, kerbH(x, z) + .8, -1); }
  for (const [x, z, k] of [[JAIL.x + 10, JAIL.z + 12, 'ammo'], [BASE.x - 4, BASE.z + 2, 'armour'], [-400, -262, 'money']]) addPick(k, x, z, landHeight(x, z) + .8, -1);
}
function take(p) {
  const pl = G.player;
  if (p.kind === 'bf') { const got = (G.inv.bf = G.inv.bf || []); if (got.includes(p.id)) return; got.push(p.id); p.g.visible = false; G.money += 100; G.onMoney(100);
    const n = got.length; if (n % 10 === 0) { const bonus = n === BF.length ? 25000 : 2000; G.money += bonus; G.onMoney(bonus); G.say(n === BF.length ? 'ALL ' + n + ' BUTTERFLIES FOUND!  +$' + bonus : n + ' butterflies found: bonus $' + bonus, 6); } else G.say('Butterfly ' + n + ' of ' + BF.length, 3);
    saveGame(); return; }
  if (p.kind === 'health') { if (pl.health >= 100) return; pl.health = Math.min(100, pl.health + 50); G.onHealth(); G.say('Health', 1.5); }
  else if (p.kind === 'armour') { if (G.inv.armour >= 100) return; G.inv.armour = 100; G.onHealth(); G.say('Body armour', 1.5); }
  else if (p.kind === 'money') { const m = 50 + Math.floor(Math.random() * 6) * 50; G.money += m; G.onMoney(m); }
  else if (p.kind === 'ammo') { G.inv.ammo += 20; if (!G.inv.pistol) { G.inv.pistol = true; G.say('A pistol and 20 bullets', 3); } else G.say('20 bullets', 1.5); G.onWeapon(); }
  if (G.sfx) G.sfx.cash(); p.back = G.time + 300; p.g.visible = false;
}
function updatePicks(dt) {
  const pl = G.player, t = G.time, got = G.inv.bf || [], foot = !pl.car && !pl.ride && !G.inside;
  for (const p of picks) {
    if (p.kind === 'bf' ? got.includes(p.id) : p.back > t) { p.g.visible = false; continue; }
    const d = Math.hypot(p.x - pl.x, p.z - pl.z); if (d > 90 || G.inside) { p.g.visible = false; continue; }
    p.g.visible = true; p.g.position.set(p.x, p.y + Math.sin(t * 2 + p.x) * .12, p.z); p.g.rotation.y = t * 1.6 + p.x;
    if (p.g.userData.wings) { const a = Math.sin(t * 14 + p.z) * .7; p.g.userData.wings[0].rotation.z = a; p.g.userData.wings[1].rotation.z = -a; p.g.position.x += Math.sin(t * .9 + p.z) * .5; p.g.position.z += Math.cos(t * .7 + p.x) * .5; }
    if (foot && d < 1.5 && Math.abs(p.y - pl.y - .9) < 1.8) take(p);
  }
}

/* ---------- weather ---------- */
let wx = 'clear', wxT = 200, rainAmt = 0, rain = null, tint = null;
G.getWeather = () => wx;
const WX = [['clear', 5], ['clear', 3], ['cloudy', 3], ['rain', 3], ['fog', 1.5]];
function nextWeather() { const tot = WX.reduce((a, w) => a + w[1], 0); let r = Math.random() * tot; for (const w of WX) { r -= w[1]; if (r <= 0) { wx = w[0]; break; } } wxT = 150 + Math.random() * 240; G.weather = wx; }
G.setWeather = w => { wx = w; wxT = 300; G.weather = w; };
function updateWeather(dt, camera) {
  wxT -= dt; if (wxT <= 0) nextWeather();
  if (!rain) {
    const N = MOBILE ? 500 : 1400, pos = new Float32Array(N * 6); for (let i = 0; i < N; i++) { const x = (Math.random() - .5) * 44, y = Math.random() * 22, z = (Math.random() - .5) * 44; pos.set([x, y, z, x + .25, y - .9, z], i * 6); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); rain = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xbfd4e6, transparent: true, opacity: 0, depthWrite: false })); rain.frustumCulled = false; rain.visible = false; G.scene.add(rain);
    tint = document.createElement('div'); tint.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;background:#5a6a78;opacity:0;mix-blend-mode:multiply'; document.body.appendChild(tint);
  }
  const want = wx === 'rain' ? 1 : 0; rainAmt += (want - rainAmt) * Math.min(1, dt * .25); G.wet = rainAmt; WETU.value = rainAmt;
  const dim = (wx === 'rain' ? .34 : wx === 'cloudy' ? .2 : wx === 'fog' ? .14 : 0) * (1 - .75 * (G.night || 0));   // at night it is dark enough already tint.style.opacity = (+tint.style.opacity + (dim - +tint.style.opacity) * Math.min(1, dt * .3)).toFixed(3);
  rain.visible = rainAmt > .03 && !G.inside;
  if (rain.visible) { rain.material.opacity = .5 * rainAmt; const P = rain.geometry.attributes.position, a = P.array, fall = 24 * dt; for (let i = 0; i < a.length; i += 6) { a[i + 1] -= fall; a[i + 4] -= fall; if (a[i + 4] < -2) { a[i + 1] += 22; a[i + 4] += 22; } } P.needsUpdate = true; rain.position.set(camera.position.x, camera.position.y - 6, camera.position.z); }
  // mist and rain close the view in
  const f = G.scene.fog, base = G.viewFar || f.far, k = wx === 'fog' ? .3 : wx === 'rain' ? .62 : wx === 'cloudy' ? .85 : 1; G.viewFar = base; G.fogK = (G.fogK || 1) + (k - (G.fogK || 1)) * Math.min(1, dt * .2); f.far = base * G.fogK; f.near = base * .3 * G.fogK * (wx === 'fog' ? .3 : 1);
}

/* ---------- shooting from the car ---------- */
let dbCd = 0, burst = 0;
G.driveBy = () => {
  const g = GUNS[G.weapon]; if (dbCd > G.time) return;
  if (!g || g.melee || g.rocket || (G.weapon !== 'pistol' && G.weapon !== 'smg')) { const k = hasGun('smg') ? 'smg' : hasGun('pistol') ? 'pistol' : null; if (!k) { G.say('You need a pistol or an SMG to shoot from a car or a boat', 2); dbCd = G.time + 2; return; } G.weapon = k; G.onWeapon(); }
  burst = G.weapon === 'smg' ? 3 : 1; dbCd = G.time + (G.weapon === 'smg' ? .45 : .4);
};

/* ---------- police work: in a police car, press T ---------- */
let vig = null;
export function startVigilante() {
  if (vig) return; const pl = G.player, c = pl.car; if (!c || !c.police) return;
  vig = { car: c, level: 0, t: 0, target: null, mk: null, earned: 0, hitCd: 0 }; nextCrim(); if (vig) G.say('Police work: chase the criminal on your map and ram the car until it stops. Get out to end.', 6);
}
function nextCrim() {
  const pl = G.player, c = vig.car, cand = G.cars.filter(o => o.ai && !o.police && !o.dead && o.type !== 'bus' && !o.spec.bike && Math.hypot(o.x - c.x, o.z - c.z) > 60 && Math.hypot(o.x - c.x, o.z - c.z) < 320);
  if (!cand.length) { G.say('No criminals about right now. Try again in a moment.', 3); endVig(); return; }
  const t = cand[Math.floor(Math.random() * cand.length)]; t.fast = 1.55; t.crim = true; t.chp = 60 + vig.level * 15; vig.target = t; vig.t = 110 + vig.level * 5;
  vig.mk = addMarker({ x: t.x, z: t.z, car: true, type: 'goal', icon: '!', text: 'CRIMINAL', color: 0xd9463c, onEnter: () => { } });
}
const jobText = t => { const e = document.getElementById('job'); if (e) { e.style.display = t ? 'block' : 'none'; e.textContent = t; } };
function endVig(msg) { if (!vig) return; jobText(''); if (vig.mk) { G.scene.remove(vig.mk.mesh, vig.mk.sprite); const i = markers.indexOf(vig.mk); if (i >= 0) markers.splice(i, 1); } if (vig.target) { vig.target.fast = 0; vig.target.crim = false; } const e = vig.earned, n = vig.level; vig = null; if (msg !== false) G.say((msg || 'Police work over.') + ' ' + n + ' stopped, $' + e + ' earned.', 5); }
function updateVig(dt) {
  if (!vig) return; const pl = G.player, c = vig.car, t = vig.target;
  if (pl.car !== c || c.dead) return endVig();
  vig.t -= dt; if (vig.t <= 0) return endVig('The criminal got away.');
  if (!t || t.dead || !G.cars.includes(t) || !t.ai) { if (t && (t.dead || t.chp <= 0)) won(); else { if (vig.mk) { G.scene.remove(vig.mk.mesh, vig.mk.sprite); const i = markers.indexOf(vig.mk); if (i >= 0) markers.splice(i, 1); vig.mk = null; } vig.target = null; nextCrim(); } return; }
  const m = vig.mk; m.x = t.x; m.z = t.z; m.mesh.position.set(t.x, .36, t.z); m.sprite.position.set(t.x, 3.6, t.z);
  vig.hitCd -= dt; const d = Math.hypot(t.x - c.x, t.z - c.z), rel = Math.hypot(c.vx - (t.vx || 0), c.vz - (t.vz || 0));
  if (d < 4.2 && rel > 3.5 && vig.hitCd <= 0) { vig.hitCd = .5; t.chp -= rel * 2.2; t.hp -= rel * 1.2; if (G.debris) G.debris(t.x, .8, t.z, 5, 0xbfe3ea, c.vx, c.vz, .1); if (G.sfx) G.sfx.crash(rel); if (G.shake) G.shake(.4); if (t.chp <= 0) won(); }
  jobText('Stop the criminal: ' + Math.max(0, Math.round(t.chp)) + '% left   ' + Math.ceil(vig.t) + ' s');
}
function won() {
  const t = vig.target, pay = 300 + vig.level * 100; t.fast = 0; t.crim = false; t.stopReq = true; t.hp = Math.min(t.hp, 25); vig.level++; vig.earned += pay; G.money += pay; G.onMoney(pay); G.stat('crims'); saveGame();
  if (vig.mk) { G.scene.remove(vig.mk.mesh, vig.mk.sprite); const i = markers.indexOf(vig.mk); if (i >= 0) markers.splice(i, 1); vig.mk = null; } vig.target = null; G.say('Criminal stopped!  +$' + pay, 3); nextCrim();
}

/* ---------- every frame ---------- */
let lastCar = null, lx = 0, lz = 0, saveT = 0, ready = false;
export function updateMore(dt, camera) {
  const pl = G.player; if (!ready) { ready = true; setupPicks(); lx = pl.x; lz = pl.z; }
  updatePicks(dt); updateWeather(dt, camera); updateVig(dt);
  if (burst > 0 && ((pl.car && !pl.passenger) || (pl.ride && pl.ride.boat))) { const veh = pl.car || pl.ride; dbT -= dt; if (dbT <= 0) { dbT = .09; burst--; pl.x = veh.x; pl.z = veh.z; if (shoot()) crime(Math.max(1, G.stars), false); } } else burst = 0;
  // statistics
  const s = stats(), h = pl.car || pl.ride || pl, d = Math.hypot(h.x - lx, h.z - lz); lx = h.x; lz = h.z; if (d < 30 && !G.inside) { if (pl.car || pl.ride) s.drive += d; else s.foot += d; }
  s.played += dt; if (pl.car !== lastCar) { if (pl.car && !pl.passenger && !pl.car.mine) { pl.car.mine = true; s.cars++; } lastCar = pl.car; }
}
let dbT = 0;
