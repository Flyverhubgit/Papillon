// Papillon - places you can use (shops, garage, flats), weapons, saving
import * as T from 'three';
import { G, doors, solidAt, rr, BASE, XS, ZS, hasEW, MOBILE, onRoad, landHeight, wallAt } from './world.js';
import { puff, crime, knockPed, dropCash, repaintCar, removeCar, panicPeds, spawnTraffic, blast, newCar, toughOf, fixCar } from './actors.js';
import { angerGangs, hitGang } from './gangs.js';

/* ---------- inventory and saving ---------- */
G.inv = { pistol: false, guns: [], ammo: 0, rockets: 0, grenades: 0, armour: 0, flats: [], garage: [] };
// every gun uses the same bullets. cd = seconds between shots, pel = pellets per shot, auto = keeps firing while held
export const GUNS = {
  bat: { name: 'Baseball bat', cost: 80, melee: true },
  pistol: { name: 'Pistol', cost: 250, cd: .32, dmg: 25, car: 20, range: 70, pel: 1, spread: 0 },
  smg: { name: 'SMG', cost: 900, cd: .09, dmg: 14, car: 9, range: 55, pel: 1, spread: .035, auto: true },
  shotgun: { name: 'Shotgun', cost: 700, cd: .85, dmg: 22, car: 16, range: 24, pel: 6, spread: .1 },
  rifle: { name: 'Assault rifle', cost: 2200, cd: .12, dmg: 30, car: 20, range: 90, pel: 1, spread: .018, auto: true },
  sniper: { name: 'Sniper rifle', cost: 3500, cd: 1.3, dmg: 200, car: 70, range: 220, pel: 1, spread: 0 },
  rocket: { name: 'Rocket launcher', cost: 6000, cd: 1.6, rocket: true }
};
export const ORDER = ['bat', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'rocket'];
export const hasGun = k => k === 'pistol' ? G.inv.pistol : G.inv.guns.includes(k);
export const anyGun = () => G.inv.pistol || G.inv.guns.length > 0;
G.weapon = 'fist';
const KEY = 'papillon.save.v1';
// The save lives in the browser and, when you are signed in to Claude, also in your account so it follows you between devices.
let cloud = null, cloudBusy = false, cloudLast = '', cloudT = -1e9;
const stamp = s => JSON.stringify(Object.assign({}, s, { hour: 0, at: 0 }));       // what counts as "changed": everything but the clock
function pushCloud(s) {
  if (!cloud || cloudBusy) return; const k = stamp(s); if (k === cloudLast || performance.now() - cloudT < 12000) return;
  cloudBusy = true; cloudT = performance.now();
  cloud.set({ json: JSON.stringify(s), at: s.at }).then(() => { cloudLast = k; }).catch(() => { }).then(() => { cloudBusy = false; });
}
export function saveGame() {
  const s = { money: G.money, inv: G.inv, sex: G.player.sex, look: G.look, hour: G.hour, at: Date.now() };
  let ok = true; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { ok = false; }
  pushCloud(s); return ok;
}
export function loadGame() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
export function storeLocal(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } }
export function wipeGame() { try { localStorage.removeItem(KEY); } catch (e) { } if (cloud) { cloudLast = ''; cloud.delete().catch(() => { }); } }
// connect to the account save; resolves with the save stored there, or null when there is none or you are not signed in
export async function initCloud() {
  try {
    if (!window.claude || !window.claude.use) return null;
    const db = await window.claude.use('db'), user = await window.claude.use('user'); if (!db || !user) return null;
    const id = await user.id(); if (!id) return null;
    cloud = db.doc('data/users/' + id + '/save');
    const snap = await cloud.get(); if (!snap.exists) return null;
    const d = snap.data(), r = d && typeof d.json === 'string' ? JSON.parse(d.json) : null; if (r) cloudLast = stamp(r); return r;
  } catch (e) { return null; }
}
export function applySave(s) {
  if (!s) return;
  G.money = s.money | 0;
  if (s.inv) { G.inv.pistol = !!s.inv.pistol; G.inv.guns = Array.isArray(s.inv.guns) ? s.inv.guns.filter(k => GUNS[k] && k !== 'pistol') : []; G.inv.ammo = s.inv.ammo | 0; G.inv.rockets = s.inv.rockets | 0; G.inv.grenades = s.inv.grenades | 0; G.inv.armour = s.inv.armour | 0; G.inv.flats = Array.isArray(s.inv.flats) ? s.inv.flats.slice() : []; G.inv.garage = Array.isArray(s.inv.garage) ? s.inv.garage.filter(c => c && typeof c.type === 'string').slice(0, 8) : []; G.inv.jumps = Array.isArray(s.inv.jumps) ? s.inv.jumps.filter(n => typeof n === 'number') : []; }
  if (typeof s.hour === 'number') G.hour = s.hour % 24;
}
G.copHurt = d => { G.copHurtT = G.time; G.hurt(d); };   // hurt by the police: if this kills you, it counts as an arrest
G.hurt = d => {
  const p = G.player; if (p.car) d *= .5;
  if (G.inv.armour > 0) { const a = Math.min(G.inv.armour, d); G.inv.armour -= a; d -= a; }
  p.health -= d; if (G.onHealth) G.onHealth();
  if (d > 4 && !p.car && !p.ride && G.blood) G.blood(p.x, p.y + 1.2, p.z, Math.min(8, 2 + d / 8));
};

/* ---------- markers: glowing rings you walk or drive into ---------- */
export const markers = [];
const ringGeo = new T.CylinderGeometry(1.25, 1.25, .7, 28, 1, true);
function label(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = '#' + new T.Color(color).getHexString(); x.beginPath(); if (x.roundRect) x.roundRect(4, 4, 504, 88, 44); else x.rect(4, 4, 504, 88); x.fill();
  x.lineWidth = 6; x.strokeStyle = 'rgba(255,255,255,.9)'; x.stroke();
  x.fillStyle = '#fff'; x.font = 'bold 46px system-ui,Arial,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 50, 470);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  const s = new T.Sprite(new T.SpriteMaterial({ map: t, fog: false, depthWrite: false })); s.scale.set(3.6, .68, 1); return s;
}
// ----- name signs -----
// Every place has a proper sign instead of a floating label: a hanging blade sign on the wall over a door,
// a board on a post where there is no wall, a small hanging board indoors.
const boardMats = {}, woodMat = new T.MeshLambertMaterial({ color: 0x555a61 })   /* now a grey metal frame and post */, ironMat = new T.MeshLambertMaterial({ color: 0x1d1d20 });
function boardMat(text, color) {
  const key = text + '|' + color; if (boardMats[key]) return boardMats[key];
  // An ordinary modern sign: a flat panel in the colour of the place, a thin white frame, clean bold white letters
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  const col = new T.Color(color), hsl = {}; col.getHSL(hsl); if (hsl.l > .5) col.setHSL(hsl.h, hsl.s, .42); else if (hsl.l < .18) col.setHSL(hsl.h, hsl.s, .2);   // dark enough for white letters
  const hex = '#' + col.getHexString(), dark = '#' + col.clone().multiplyScalar(.72).getHexString();
  x.fillStyle = '#e9ebee'; x.fillRect(0, 0, 512, 128);                                  // the frame
  const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, hex); gr.addColorStop(1, dark); x.fillStyle = gr; x.fillRect(7, 7, 498, 114);   // the panel
  x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 2; x.strokeRect(15, 15, 482, 98);
  x.font = '800 62px "Helvetica Neue",Arial,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(0,0,0,.3)'; x.fillText(text, 258, 68, 440); x.fillStyle = '#ffffff'; x.fillText(text, 256, 66, 440);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return (boardMats[key] = new T.MeshBasicMaterial({ map: t }));
}
function board(text, color, w, h) {
  const g = new T.Group(), mat = boardMat(text, color), geo = new T.PlaneGeometry(w, h);
  const f = new T.Mesh(geo, mat), bk = new T.Mesh(geo, mat), core = new T.Mesh(new T.BoxGeometry(w + .06, h + .06, .05), woodMat);
  f.position.z = .031; bk.position.z = -.031; bk.rotation.y = Math.PI; g.add(core, f, bk); g.userData = { f, bk, w, h }; return g;
}
const bar = (g, w, h, d, x, y, z, mat) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); };
// put the board where a real sign would be
function placeSign(o, g) {
  const { w, h } = g.userData, y0 = o.y || 0, D = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  if (o.indoor) {   // indoors: the exit board is on the wall over the door; the others hang from the ceiling over the counter they belong to
    let near = null, nt = 3; for (const [dx, dz] of D) for (let t = .2; t < nt; t += .1) if (solidAt(o.x + dx * t, o.z + dz * t, .05)) { nt = t; near = [dx, dz]; break; }
    const [dx, dz] = near || [0, -1];
    if (o.text === 'EXIT') { g.position.set(o.x + dx * (nt - .08), 2.55, o.z + dz * (nt - .08)); g.rotation.y = Math.atan2(-dx, -dz); return; }
    g.position.set(o.x + dx * (near ? nt + .25 : 0), 2.9, o.z + dz * (near ? nt + .25 : 0)); g.rotation.y = Math.atan2(-dx, -dz); for (const sx of [-1, 1]) bar(g, .025, .3, .025, sx * (w / 2 - .12), h / 2 + .15, 0, ironMat); return;
  }
  if (o.car) {   // drive-in places: a board on a post at the nearest kerb, turned to face the traffic
    let best = null, bt = 9; for (const [dx, dz] of D) for (let t = 1; t < bt; t += .5) if (!onRoad(o.x + dx * t, o.z + dz * t)) { bt = t; best = [dx, dz]; break; }
    const [dx, dz] = best || [0, 1], px = o.x + dx * (bt + .7), pz = o.z + dz * (bt + .7);
    g.position.set(px, y0 + 3.6, pz); g.rotation.y = Math.atan2(dz, -dx); bar(g, .16, 3.6 - h / 2, .16, 0, -(3.6 + h / 2) / 2 + .0, 0, woodMat); return;
  }
  let wall = null, wt = 3.7; for (const [dx, dz] of D) for (let t = .2; t < wt; t += .1) if (solidAt(o.x + dx * t, o.z + dz * t, .05)) { wt = t; wall = [dx, dz]; break; }
  if (wall) {   // on the wall over the door, facing the street, hung on two iron hooks
    const [dx, dz] = wall;
    // it sticks out from the wall on an iron arm, like a shop sign: you read it from along the street, and it never covers the name painted on the front
    g.position.set(o.x + dx * (wt - w / 2 - .25), y0 + 3.55, o.z + dz * (wt - w / 2 - .25)); g.rotation.y = Math.atan2(dz, -dx);
    bar(g, w + .5, .06, .06, .12 * 0, h / 2 + .14, 0, ironMat); for (const k of [-1, 1]) bar(g, .04, .14, .04, k * (w / 2 - .25), h / 2 + .07, 0, ironMat); return;
  }
  g.position.set(o.x + .9, y0 + 3, o.z); bar(g, .14, 3 - h / 2, .14, 0, -(3 + h / 2) / 2, 0, woodMat);   // no wall near: a board on a post beside the spot
}
function setLabel(m, text) { const mat = boardMat(text, m.color), u = m.sprite.userData; u.f.material = mat; u.bk.material = mat; m.text = text; }
export function addMarker(o) {
  const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: o.color, transparent: true, opacity: .4, side: T.DoubleSide, depthWrite: false }));
  m.position.set(o.x, (o.y || 0) + .36, o.z); if (o.car) m.scale.set(2.1, 1, 2.1);
  o.ring = o.type === 'goal';                         // only job targets keep a ring on the ground: you have to see where to go
  o.use = !o.car && !o.ring;                          // everything you walk up to works with E
  o.door = o.use && !o.indoor && (o.type === 'gun' || o.type === 'food' || o.type === 'clinic' || o.type === 'desk' || o.type === 'flat' || o.type === 'bank' || o.type === 'bar' || o.type === 'cloth');
  let s;
  if (o.ring) { s = label(o.text, o.color); s.position.set(o.x, (o.y || 0) + 3.6, o.z); }
  else { s = o.indoor ? board(o.text, o.color, 1.6, .4) : board(o.text, o.color, o.car ? 5 : 2.6, o.car ? 1.25 : .75); placeSign(o, s); }
  m.visible = o.ring;
  G.scene.add(m, s); o.mesh = m; o.sprite = s; o.inside = false; markers.push(o); return o;
}
// E: use the nearest door, counter, person or thing. Returns true when there was something to use
let useHintT = 0, useHint = null;
function nearUse() {
  const p = G.player; if (p.car || p.ride || p.swim) return null;
  let best = null, bd = 9; for (const m of markers) { if (!m.use || !!m.indoor !== !!G.inside) continue; const d = Math.hypot(m.x - p.x, m.z - p.z), r = m.indoor ? 1.8 : m.door ? 2.7 : 2.3; if (d < r && d < bd && Math.abs((m.y || 0) - p.y) < 3) { bd = d; best = m; } }
  return best;
}
export function tryDoor() { const m = nearUse(); if (!m) return false; m.onEnter(m); return true; }
export function updateMarkers(dt) {
  const p = G.player, px = p.car ? p.car.x : p.x, pz = p.car ? p.car.z : p.z;
  for (const m of markers) {
    const d = Math.hypot(m.x - px, m.z - pz), vis = d < 120; m.sprite.visible = vis; m.mesh.visible = vis && m.ring; if (!vis) { m.inside = false; continue; }
    if (m.use) continue;
    if (m.ring) { m.mesh.rotation.y += dt * .8; m.mesh.material.opacity = .32 + .12 * Math.sin(G.time * 3); }
    const ins = m.car ? (!!p.car && d < 2.9 && p.car.v < 7) : (!p.car && !p.ride && d < 1.5);
    if (ins && !m.inside) { m.inside = true; m.onEnter(m); } else if (!ins && d > (m.car ? 4.5 : 2.3)) m.inside = false;
  }
  const u = nearUse(); useHintT -= dt;   // a hint while you stand at something you can use
  if (u && (u !== useHint || useHintT <= 0) && !G.menuOpen) { useHint = u; useHintT = 1.5; G.say((MOBILE ? 'Tap the door button: ' : 'Press E: ') + u.text, 1.7); } else if (!u) useHint = null;
}
const used = new Set();
function doorNear(x, z, wantShop) {
  let best = null, bd = 1e9;
  for (const d of doors) { if (!d.ok || used.has(d)) continue; let dd = Math.hypot(d.x - x, d.z - z); if (!!d.shop !== !!wantShop) dd += 40; if (dd < bd) { bd = dd; best = d; } }
  used.add(best); return best;
}
const pay = cost => { if (G.money < cost) { G.say('Not enough money', 2); return false; } G.money -= cost; G.onMoney(0); return true; };

/* ---------- the places ---------- */
export function gunMenu() {
  const o = [];
  for (const k of ORDER) if (!hasGun(k)) { const g = GUNS[k]; o.push({ label: g.name + (g.melee ? '' : g.rocket ? ' with 3 rockets' : ' with 24 bullets'), cost: g.cost, fn: () => { if (pay(g.cost)) { if (k === 'pistol') G.inv.pistol = true; else G.inv.guns.push(k); if (g.rocket) G.inv.rockets += 3; else if (!g.melee) G.inv.ammo += 24; G.weapon = k; G.onWeapon(); G.say(g.name + ' bought. Press R to switch weapon.', 4); saveGame(); return true; } } }); }
  o.push({ label: '24 bullets', note: 'fit every gun', cost: 60, fn: () => { if (!anyGun()) { G.say('Buy a gun first', 2); return; } if (pay(60)) { G.inv.ammo += 24; G.onWeapon(); saveGame(); } } });
  if (hasGun('rocket')) o.push({ label: '3 rockets', cost: 500, fn: () => { if (pay(500)) { G.inv.rockets += 3; G.onWeapon(); saveGame(); } } });
  o.push({ label: '3 grenades', note: 'press G to throw', cost: 300, fn: () => { if (pay(300)) { G.inv.grenades += 3; G.onWeapon(); saveGame(); } } });
  o.push({ label: 'Body armour', cost: 200, fn: () => { if (G.inv.armour >= 100) { G.say('Your armour is already full', 2); return; } if (pay(200)) { G.inv.armour = 100; G.onHealth(); saveGame(); } } });
  o.push({ label: 'Rob the shop', note: 'the police will come', fn: () => { const got = 200 + Math.floor(Math.random() * 7) * 50; G.money += got; G.onMoney(got); const k = ORDER.find(q => !hasGun(q) && !GUNS[q].melee); G.inv.ammo += 12; if (k === 'rocket') G.inv.rockets += 2; if (k) { if (k === 'pistol') G.inv.pistol = true; else G.inv.guns.push(k); G.weapon = k; G.say('You grabbed $' + got + ' and a ' + GUNS[k].name.toLowerCase(), 4); } G.onWeapon(); crime(k && ORDER.indexOf(k) >= 3 ? 4 : 3, false); saveGame(); return true; } });
  G.menu('Anchor Arms', 'Guns, bullets and armour', o);
}
// The Rusty Anchor: a drink does you good, too many make the street sway; the barman knows things
const TIPS = ['"There are fifty blue butterflies hidden round the city. Collectors pay well."', '"They say there is a tank rusting in the docks."', '"The old army base up the dirt road still has crates of weapons."', '"Fields outside the ring road have ramps. A fast car flies a long way."', '"Marcel by the harbour always has work, if you are not fussy."', '"Take a police car and press T: the force pays for every crook you stop."', '"If the police boats come, get to land. They are slower than you, but they shoot."'];
export function barMenu() {
  const drink = (name, cost, hp, tipsy) => ({ label: name, cost, fn: () => { if (pay(cost)) { G.player.health = Math.min(100, G.player.health + hp); G.onHealth(); G.tipsy = Math.max(G.tipsy || 0, G.time) + tipsy; G.say(G.tipsy - G.time > 60 ? 'The room is starting to move...' : 'Cheers!', 2.5); } } });
  G.menu('The Rusty Anchor', 'What will it be?', [drink('Beer', 5, 10, 18), drink('Glass of red', 8, 15, 25), drink('Whisky', 12, 20, 40),
    { label: 'Buy a round for the house', cost: 40, fn: () => { if (pay(40)) { G.say(TIPS[Math.floor(Math.random() * TIPS.length)], 7); return true; } } },
    { label: 'Leave', fn: () => true }]);
}
// Papillon Mode: change how you look, or buy a padded jacket
export function clothMenu() {
  G.menu('Papillon Mode', 'Something new to wear?', [{ label: 'Change your clothes and look', cost: 40, fn: () => { if (pay(40)) { if (G.openBuilder) setTimeout(G.openBuilder, 50); return true; } } },
    { label: 'Padded jacket (body armour)', cost: 150, fn: () => { if (G.inv.armour >= 100) { G.say('You already wear one', 2); return true; } if (pay(150)) { G.inv.armour = 100; G.onHealth(); G.say('That should take a few knocks', 3); saveGame(); return true; } } },
    { label: 'Leave', fn: () => true }]);
}
export function foodMenu() {
  G.menu('Harbour Snacks', 'Food fills your health', [{ label: 'Coffee', cost: 4, fn: () => { if (pay(4)) { G.player.health = Math.min(100, G.player.health + 25); G.onHealth(); G.say('That hit the spot', 2); return true; } } }, { label: 'Grilled sandwich', cost: 10, fn: () => { if (G.player.health >= 100) { G.say('You are not hungry', 2); return true; } if (pay(10)) { G.player.health = 100; G.onHealth(); G.say('Health restored', 2); return true; } } },
    { label: 'Rob the till', note: 'the police will come', fn: () => { if (G.tillT > G.time) { G.say('The till is empty', 2); return true; } const got = 60 + Math.floor(Math.random() * 8) * 20; G.money += got; G.onMoney(got); G.tillT = G.time + 300; if (G.sfx) G.sfx.cash(); G.say('You emptied the till: $' + got, 3); crime(2, false); saveGame(); return true; } }]);
}
// crates at the old army base: free weapons and ammo, each one fills up again after a while
const LOOT = { ammo: ['OLD AMMO', () => { G.inv.ammo += 60; return '60 bullets'; }], rifle: ['RIFLE CRATE', () => { if (!hasGun('rifle')) { G.inv.guns.push('rifle'); G.inv.ammo += 30; G.weapon = 'rifle'; return 'an assault rifle with 30 bullets'; } G.inv.ammo += 45; return '45 bullets'; }],
  grenades: ['GRENADES', () => { G.inv.grenades += 3; return '3 grenades (G to throw)'; }], rockets: ['ROCKETS', () => { if (!hasGun('rocket')) { G.inv.guns.push('rocket'); G.inv.rockets += 2; return 'a rocket launcher with 2 rockets'; } G.inv.rockets += 2; return '2 rockets'; }], armour: ['ARMOUR', () => { G.inv.armour = 100; G.onHealth(); return 'body armour'; }] };
function crate(m) {
  if (m.ready > G.time) { G.say('Empty. Come back in ' + Math.ceil((m.ready - G.time) / 60) + ' min.', 2); return; }
  m.ready = G.time + 360; const got = LOOT[m.kind][1](); G.onWeapon(); G.say('You found ' + got, 4); if (G.sfx) G.sfx.cash(); saveGame();
}
// the bank: tell the teller it is a robbery, then empty the vault while the alarm rings
export function bankMenu() {
  if (G.heist) { G.say('"Please, just take it! The vault is open!"', 3); return; }
  const wait = (G.bankT || 0) - G.time;
  G.menu('Papillon Savings Bank', wait > 0 ? 'The vault is empty after the last robbery' : 'Good day. How can we help?', wait > 0 ? [{ label: 'Leave', fn: () => true }] : [
    { label: 'Rob the bank', note: 'the alarm goes off at once: then empty the vault at the back', fn: () => { G.heist = { fill: 0, on: false }; crime(4, false); panicPeds(G.player.x, G.player.z, 30); G.say('ALARM! Go to the vault at the back and press E, then stay there while you fill the bag.', 6); if (G.sfx) G.sfx.star(); return true; } },
    { label: 'Just looking', fn: () => true }]);
}
export function vaultUse(m) {
  if (!G.heist) { G.say('The vault is locked. Only the teller can open it...', 3); return; }
  G.heist.on = true; G.heist.x = m.x; G.heist.z = m.z; G.say('Filling the bag. Stay by the vault!', 2);
}
export function updateHeist(dt) {
  const h = G.heist, p = G.player; if (!h) return;
  if (!G.inside || G.inside.name !== 'bank') { G.heist = null; if (h.fill > 0 || h.on) G.say('You left the money behind.', 3); return; }
  if (!h.on) return;
  if (Math.hypot(p.x - h.x, p.z - h.z) > 2.4) { h.on = false; G.say('Go back to the vault and press E to keep filling the bag', 3); return; }
  h.fill += dt; h.sayT = (h.sayT || 0) - dt; if (h.sayT <= 0) { h.sayT = 1; G.say('Filling the bag... ' + Math.min(100, Math.round(h.fill / 8 * 100)) + '%', 1.2); }
  if (h.fill >= 8) { const got = 3000 + Math.floor(Math.random() * 13) * 250; G.money += got; G.onMoney(got); G.heist = null; G.bankT = G.time + 900; G.lastHeist = G.time; crime(5, false); if (G.sfx) G.sfx.cash(); saveGame(); G.say('You got $' + got + '! The whole city is looking for you. Get out and lose them.', 7); }
}
// the police armoury: a break-in gets you serious guns and the whole force after you
export function armouryMenu() {
  if (G.armouryT > G.time) { G.say('The armoury is empty. They restock in ' + Math.ceil((G.armouryT - G.time) / 60) + ' min.', 3); return; }
  G.menu('Police armoury', 'Locked. The desk officer is looking the other way...', [
    { label: 'Break in', note: 'guns, bullets and body armour. Every officer in town will come for you', fn: () => {
      const got = []; for (const k of ['smg', 'shotgun', 'rifle']) if (!hasGun(k)) { G.inv.guns.push(k); got.push(GUNS[k].name.toLowerCase()); }
      if (!G.inv.pistol) { G.inv.pistol = true; got.push('pistol'); } G.inv.ammo += 90; G.inv.armour = 100; G.inv.grenades = (G.inv.grenades || 0) + 3; G.weapon = hasGun('rifle') ? 'rifle' : G.weapon;
      G.onWeapon(); G.onHealth(); G.armouryT = G.time + 600; crime(4, false); if (G.sfx) G.sfx.cash(); saveGame();
      G.say('You took ' + (got.length ? got.join(', ') + ', ' : '') + '90 bullets, 3 grenades and body armour. RUN.', 6); return true; } },
    { label: 'Leave it', fn: () => true }]);
}
export function clinicMenu() {
  G.menu('Papillon Hospital', 'Patched up while you wait', [
    { label: 'Full treatment', cost: 60, fn: () => { if (G.player.health >= 100) { G.say('Nothing wrong with you', 2); return true; } if (pay(60)) { G.player.health = 100; G.onHealth(); G.say('Good as new', 2); saveGame(); return true; } } },
    { label: 'Bandages', note: 'half your health back', cost: 25, fn: () => { if (pay(25)) { G.player.health = Math.min(100, G.player.health + 50); G.onHealth(); return true; } } }]);
}
export function deskMenu() {
  const fine = 350 * G.stars;
  G.menu('Police station', G.stars ? 'You are wanted: ' + G.stars + ' star' + (G.stars > 1 ? 's' : '') : 'Nothing against you today', G.stars === 0 ? [{ label: 'Just looking', fn: () => true }] : G.stars > 3 ? [{ label: 'Too serious for a fine', note: 'lose them another way', fn: () => true }] :
    [{ label: 'Pay the fine', note: 'clears your stars', cost: fine, fn: () => { if (pay(fine)) { G.stars = 0; G.lostT = 0; G.onStars(true); G.say('Fine paid. You are free to go.', 3); saveGame(); return true; } } }]);
}
function spray(m) {
  const p = G.player, c = p.car; if (!c) return;
  if (G.stars > 0 && G.police.some(q => Math.hypot(q.x - c.x, q.z - c.z) < 35)) { G.say('The police can see you. Lose them first.', 3); return; }
  if (!pay(100)) return;
  repaintCar(c); fixCar(c); c.hp = 100; c.vx = c.vz = 0; G.stars = 0; G.lostT = 0; G.onStars(true); G.say('New paint. The police are no longer looking for this car.', 4); saveGame();
}
const SCRAP = { sports: 400, police: 350, bus: 300, ambulance: 250, van: 180, sedan: 150, taxi: 120, hatch: 100 };
function scrap() {
  const p = G.player, c = p.car; if (!c) return;
  const v = SCRAP[c.type] || 100; p.car = null; p.x = c.x + Math.sin(c.h) * 3; p.z = c.z + Math.cos(c.h) * 3; p.speed = 0;
  removeCar(c); spawnTraffic(); G.money += v; G.onMoney(v); G.say('Car crushed for scrap: +$' + v, 3); if (G.sfx) G.sfx.crash(12); saveGame();
}
// The garage that comes with every flat you own: drive into the ring to store a car, walk into the small ring to take one out.
const CARNAME = { sedan: 'Sedan', hatch: 'Hatchback', sports: 'Sports car', muscle: 'Muscle car', pickup: 'Pickup', coupe: 'Coupe', jeep: 'Jeep', rally: 'Rally car', ghini: 'Supercar', mobil: 'Classic cruiser', italia: 'GT coupe', fenyr: 'Hypercar', psx1: 'Station wagon', psx2: 'Hot rod', psx3: 'Compact', psx4: 'Minivan', psx7: 'Wagon', psx8: 'Delivery van', van: 'Van', bus: 'Bus', ambulance: 'Ambulance', army: 'Army van', taxi: 'Taxi', police: 'Police car', truck: 'Truck', tank: 'Tank', bike: 'Motorbike' };
function storeCar(m) {
  const p = G.player, c = p.car; if (!c) return;
  if (!G.inv.flats.includes(m.id)) { G.say('This garage belongs to the flat. Buy the flat to use it.', 3); return; }
  const room = G.inv.flats.length * 2; if (G.inv.garage.length >= room) { G.say('Your garage is full (' + room + ' cars). Take one out first.', 3); return; }
  if (G.stars > 0) { G.say('Not with the police on your tail.', 2); return; }
  G.inv.garage.push({ type: c.type, col: c.g.children[0].material.color.getHex() });
  p.car = null; p.x = m.fx; p.z = m.fz; p.speed = 0; if (G.bombCar === c) G.bombCar = null; removeCar(c); spawnTraffic(); if (G.sfx) G.sfx.door();
  G.say((CARNAME[c.type] || 'Car') + ' stored. Walk into the garage ring to take it out.', 4); saveGame();
}
function garageMenu(m) {
  if (!G.inv.flats.includes(m.id)) { G.say('This garage belongs to the flat. Buy the flat to use it.', 3); return; }
  if (!G.inv.garage.length) { G.say('Your garage is empty. Drive a car into the big ring to store it.', 4); return; }
  G.menu('Your garage', G.inv.garage.length + ' of ' + G.inv.flats.length * 2 + ' places used', G.inv.garage.map((g, i) => ({ label: 'Take out the ' + (CARNAME[g.type] || 'car').toLowerCase(), fn: () => {
    if (G.cars.some(c => Math.hypot(c.x - m.cx, c.z - m.cz) < 4)) { G.say('Something is parked in front of the garage.', 3); return; }
    G.inv.garage.splice(i, 1); const c = newCar(g.type, g.col); c.x = m.cx; c.z = m.cz; c.h = m.ch; c.used = true; c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.h; saveGame(); G.say('Your car is on the street.', 3); return true;
  } })));
}
// the bomb shop in the docks rigs the car you drive in with; get out, walk away and press B
function bombShop() {
  const c = G.player.car; if (!c) return; if (G.bombCar === c) { G.say('This car is already rigged. Get out and press B.', 3); return; }
  if (!pay(500)) return; G.bombCar = c; G.say('Car rigged. Park it, walk away and press B to set it off.', 5);
}
export function detonate() {
  const c = G.bombCar; if (!c || c.dead || !G.cars.includes(c)) { G.bombCar = null; return false; }
  if (G.player.car === c) { G.say('Get out first!', 2); return false; }
  G.bombCar = null; const police = G.cars.some(q => q.police && !q.dead && Math.hypot(q.x - c.x, q.z - c.z) < 9);
  blast(c.x, c.z, 7); for (const m of G.gang) if (m.state !== 'down' && Math.hypot(m.x - c.x, m.z - c.z) < 7) hitGang(m, 200, 0, 0);
  angerGangs(c.x, c.z, 60); crime(Math.min(6, Math.max(police ? 5 : 3, G.stars + 1)), false); return true;
}
export function bedMenu() {
  G.menu('Your bed', 'Sleeping skips eight hours', [{ label: 'Sleep and save the game', fn: () => { G.hour = (G.hour + 8) % 24; G.player.health = 100; G.onHealth(); G.say(saveGame() ? 'Game saved' : 'Saving is not possible in this browser', 3); return true; } }]);
}
function flatMenu(m) {
  if (G.inv.flats.includes(m.id)) { G.enterRoom('flat', m.out); return; }
  G.menu(m.name, 'For sale', [{ label: 'Buy this flat', cost: m.price, fn: () => { if (pay(m.price)) { G.inv.flats.push(m.id); setLabel(m, 'YOUR FLAT'); G.say('You own ' + m.name + '. Walk into the ring to go inside.', 5); saveGame(); return true; } } }]);
}
export function setupShops() {
  const outOf = d => ({ x: d.x - d.nx, z: d.z - d.nz });
  for (const q of [[104, -10], [-60, 140]]) { const d = doorNear(q[0], q[1], true); addMarker({ x: d.x, z: d.z, out: outOf(d), type: 'gun', icon: 'G', text: 'GUN SHOP', color: 0xc9423a, onEnter: m => G.enterRoom('gun', m.out) }); }
  for (const q of [[24, -50.5], [178, -32.5], [-120, 50.5]]) addMarker({ x: q[0], z: q[1], type: 'food', icon: 'F', text: 'CAFE', color: 0xe08a1f, onEnter: m => G.enterRoom('cafe', { x: m.x, z: m.z }) });
  for (const c of BASE.crates) addMarker({ x: c.x, z: c.z, y: c.y, type: 'crate', icon: 'A', kind: c.kind, ready: 0, text: LOOT[c.kind][0], color: 0x6a7a3a, onEnter: crate });
  addMarker({ x: 119, z: -137.4, type: 'clinic', icon: '+', text: 'HOSPITAL', color: 0xd9463c, onEnter: m => G.enterRoom('clinic', { x: m.x, z: m.z }) });
  addMarker({ x: 99.5, z: -72.8, type: 'desk', icon: 'P', text: 'POLICE', color: 0x2f5fd0, onEnter: m => G.enterRoom('desk', { x: m.x, z: m.z }) });
  for (const q of [[185, 132.1], [-60, -127.9]]) addMarker({ x: q[0], z: q[1], car: true, type: 'spray', icon: 'S', text: 'RESPRAY $100', color: 0x2f8fd0, onEnter: spray });
  for (const q of [[30, 60], [900, -190], [1430, 620]]) { const d = doorNear(q[0], q[1], true); addMarker({ x: d.x, z: d.z, out: outOf(d), type: 'bank', icon: '$', text: 'BANK', color: 0x2f7a4a, onEnter: m => G.enterRoom('bank', m.out) }); }
  // the same services spread over the big city and the four towns
  for (const q of [[910, -260], [650, 325], [570, -640], [1170, 195], [1430, -890], [1430, 640]]) { const d = doorNear(q[0], q[1], true); addMarker({ x: d.x, z: d.z, out: outOf(d), type: 'gun', icon: 'G', text: 'GUN SHOP', color: 0xc9423a, onEnter: m => G.enterRoom('gun', m.out) }); }
  for (const q of [[740, 0], [1000, 130], [1170, -325], [480, -550], [910, 550], [400, 195], [650, 890], [1430, -130], [1430, -860], [1430, 610]]) { const d = doorNear(q[0], q[1], true); addMarker({ x: d.x - d.nx * .6, z: d.z - d.nz * .6, type: 'food', icon: 'F', text: 'CAFE', color: 0xe08a1f, onEnter: m => G.enterRoom('cafe', { x: m.x, z: m.z }) }); }
  for (const q of [[-30, -60], [150, 100], [800, -250], [1100, 300], [600, 500]]) { const d = doorNear(q[0], q[1], true); addMarker({ x: d.x, z: d.z, out: outOf(d), type: 'bar', icon: 'B', text: 'BAR', color: 0x9a6a2a, onEnter: m => G.enterRoom('bar', m.out) }); }
  for (const q of [[90, 60], [-90, -110], [850, 100], [1250, -200], [500, -350]]) { const d = doorNear(q[0], q[1], true); addMarker({ x: d.x, z: d.z, out: outOf(d), type: 'cloth', icon: 'C', text: 'CLOTHES', color: 0x7a4f8a, onEnter: m => G.enterRoom('cloth', m.out) }); }
  for (const q of [[830, 65], [1260, -640], [740, 640], [1400, -100]]) { const d = doorNear(q[0], q[1], false); addMarker({ x: d.x - d.nx * .6, z: d.z - d.nz * .6, type: 'clinic', icon: '+', text: 'HOSPITAL', color: 0xd9463c, onEnter: m => G.enterRoom('clinic', { x: m.x, z: m.z }) }); }
  for (const q of [[610, -130], [1000, -470], [870, 390], [1300, 65], [520, 720], [1390, -890], [1390, 640]]) {   // respray spots: on the nearest east-west street, in the lane
    let bx = 0, bz = 0, bd = 1e9; for (let i = 0; i + 1 < XS.length; i++) for (let j = 0; j < ZS.length; j++) if (hasEW(i, j)) { const mx = (XS[i] + XS[i + 1]) / 2, dd = Math.hypot(mx - q[0], ZS[j] - q[1]); if (dd < bd) { bd = dd; bx = mx; bz = ZS[j]; } }
    addMarker({ x: bx, z: bz + 2.1, car: true, type: 'spray', icon: 'S', text: 'RESPRAY $100', color: 0x2f8fd0, onEnter: spray });
  }
  addMarker({ x: -140, z: 197.1, car: true, type: 'scrap', icon: 'C', text: 'SCRAPYARD', color: 0x6a6f78, onEnter: scrap });
  const flats = [[-150, -100, 1500, 'Old Town flat'], [120, 100, 4000, 'City flat'], [-40, -76, 9000, 'Harbour View flat']];
  addMarker({ x: -60, z: 262.2, car: true, type: 'bomb', icon: 'B', text: 'BOMB SHOP $500', color: 0x8a3fbf, onEnter: bombShop });
  flats.forEach((f, i) => { const d = doorNear(f[0], f[1], false), own = G.inv.flats.includes(i);
    { const tx = -d.nz, tz = d.nx, cx = d.x - d.nx * 9.2, cz = d.z - d.nz * 9.2, fx = d.x - d.nx * 1.6 + tx * 3.6, fz = d.z - d.nz * 1.6 + tz * 3.6, ch = Math.atan2(-tz, tx);
      addMarker({ x: cx, z: cz, car: true, type: 'garage', icon: 'P', id: i, fx, fz, text: 'GARAGE', color: 0x3a9a5a, onEnter: storeCar });
      addMarker({ x: fx, z: fz, type: 'garage', icon: 'P', id: i, cx, cz, ch, text: 'GARAGE', color: 0x3a9a5a, onEnter: garageMenu }); } addMarker({ x: d.x, z: d.z, out: outOf(d), type: 'flat', icon: 'H', id: i, name: f[3], price: f[2], text: own ? 'YOUR FLAT' : 'FLAT $' + f[2], color: 0x3a9a5a, onEnter: flatMenu }); });
}
export function homeSpot() { const id = G.inv.flats[G.inv.flats.length - 1]; if (id === undefined) return null; const m = markers.find(q => q.type === 'flat' && q.id === id); return m ? { x: m.x, z: m.z } : null; }

/* ---------- weapons ---------- */
export function switchWeapon() {
  const list = ['fist'].concat(ORDER.filter(hasGun));
  if (list.length === 1) { G.weapon = 'fist'; G.say('You have no gun. Buy one at a gun shop.', 3); } else G.weapon = list[(list.indexOf(G.weapon) + 1) % list.length];
  G.onWeapon();
}
const SHG = new T.Vector3();
const tracers = [], trGeo = new T.BoxGeometry(1, .035, .035).translate(.5, 0, 0), trMat = new T.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: .9, fog: false });
G.tracer = (x0, y0, z0, x1, y1, z1) => {
  const m = new T.Mesh(trGeo, trMat), dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz) || .01;
  m.position.set(x0, y0, z0); m.scale.set(len, 1, 1); m.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), new T.Vector3(dx / len, dy / len, dz / len));
  G.scene.add(m); tracers.push({ m, t: .07 });
};
// rockets in flight: straight ahead until they meet a wall, a car or a person, then they blow up
const rockets = [], rkGeo = new T.CylinderGeometry(.05, .07, .6, 8).rotateZ(Math.PI / 2), rkMat = new T.MeshBasicMaterial({ color: 0xffe9a0 });
// grenades: thrown in an arc the way you face, they stop at walls and go off after a moment
// A hand grenade: an olive cast-iron body cut into squares ("pineapple"), a metal fuse on top, the safety lever down one side and the pull ring
const nades = [];
const ndBody = new T.MeshStandardMaterial({ color: 0x4d5c33, roughness: .75, metalness: .25, flatShading: true }), ndGroove = new T.MeshStandardMaterial({ color: 0x1c2213, roughness: .9 }), ndSteel = new T.MeshStandardMaterial({ color: 0x9a9d96, roughness: .4, metalness: .8 }), ndDark = new T.MeshStandardMaterial({ color: 0x4b4f47, roughness: .5, metalness: .7 });
const ndGeo = (() => { const pts = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI, r = Math.sin(a) * (.062 + .012 * Math.sin(a)), y = -Math.cos(a) * .082; pts.push(new T.Vector2(Math.max(.012, r), y)); } return new T.LatheGeometry(pts, 10); })();
const ndRing = new T.TorusGeometry(.064, .006, 5, 14), ndNeck = new T.CylinderGeometry(.022, .03, .03, 10), ndFuse = new T.CylinderGeometry(.017, .02, .045, 10), ndLever = new T.BoxGeometry(.02, .006, .05), ndLever2 = new T.BoxGeometry(.02, .13, .006), ndPull = new T.TorusGeometry(.028, .004, 5, 14), ndPin = new T.CylinderGeometry(.004, .004, .05, 5);
function grenadeMesh() {
  const g = new T.Group(), add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  add(ndGeo, ndBody, 0, 0, 0).castShadow = true;
  for (const y of [-.045, -.015, .015, .045]) { const r = add(ndRing, ndGroove, 0, y, 0, Math.PI / 2); const k = Math.sqrt(Math.max(.1, 1 - (y / .082) ** 2)) * 1.12; r.scale.set(k, k, 1); }   // the grooves round it
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI; add(ndRing, ndGroove, 0, 0, 0, 0, a, 0).scale.set(1.15, 1.28, 1); }   // and the grooves down it
  add(ndNeck, ndDark, 0, .092, 0); add(ndFuse, ndSteel, 0, .128, 0);                                   // the fuse
  add(ndLever, ndSteel, 0, .152, .02); add(ndLever2, ndSteel, 0, .09, .058, -.16);                       // the safety lever, bent down the side
  add(ndPin, ndSteel, 0, .135, 0, 0, 0, Math.PI / 2); add(ndPull, ndSteel, -.05, .125, 0, 0, Math.PI / 2, 0);   // the pin and its ring
  g.scale.setScalar(1.55); return g;   // a little bigger than life, so you can see it fly
}
G.grenadeMeshDBG = grenadeMesh;
export function throwGrenade() {
  const p = G.player; if (G.inv.grenades <= 0) { G.say('No grenades. Buy some at a gun shop.', 2); return false; }
  G.inv.grenades--; G.onWeapon(); const dx = Math.sin(G.camYaw), dz = Math.cos(G.camYaw), m = grenadeMesh(); G.scene.add(m); p.yaw = G.camYaw;
  nades.push({ m, x: p.x + dx * .6, z: p.z + dz * .6, y: 1.5, vy: 5.5, dx, dz, v: 11, t: 0 }); return true;
}
function updateNades(dt) {
  for (let i = nades.length - 1; i >= 0; i--) {
    const n = nades[i]; n.t += dt; n.vy -= 14 * dt; n.y += n.vy * dt; if (n.y < .11) { n.y = .11; n.vy = Math.abs(n.vy) * .35; n.v *= .55; }
    const nx = n.x + n.dx * n.v * dt, nz = n.z + n.dz * n.v * dt; if (solidAt(nx, nz)) n.v = 0; else { n.x = nx; n.z = nz; }
    n.m.position.set(n.x, n.y, n.z); { const roll = Math.max(1.5, n.v) * dt * 1.6; n.m.rotation.x += roll * n.dz; n.m.rotation.z -= roll * n.dx; }   // it tumbles as it flies and rolls
    if (n.t > 1.7) {
      // a grenade only brings the police when it hurts somebody (a person, a gang member, an officer, someone in a car), and then it is two stars at most
      const near = (o, r) => Math.hypot(o.x - n.x, o.z - n.z) < r, was = G.stars;
      const hurt = G.peds.some(q => q.h.visible && q.state !== 'down' && q.state !== 'inside' && near(q, 5.5)) || G.gang.some(m => m.state !== 'down' && near(m, 5.5)) || (G.cops || []).some(c => c.state !== 'down' && near(c, 5.5)) || G.cars.some(c => !c.dead && (c.ai || c.chase || c.driver) && near(c, 7));
      blast(n.x, n.z, 5.5); for (const m of G.gang) if (m.state !== 'down' && Math.hypot(m.x - n.x, m.z - n.z) < 5.5) hitGang(m, 200, n.dx, n.dz);
      angerGangs(n.x, n.z, 55); { const want = Math.max(was, hurt ? 2 : 0); if (G.stars !== want) { G.stars = want; if (G.onStars) G.onStars(); } if (hurt) G.lostT = 0; } G.scene.remove(n.m); nades.splice(i, 1);
    }
  }
}
// y and dy (rise per metre) are given when it is aimed up or down with the crosshair; without them it flies level (the tank)
// a tank shell: a heavy steel round with a brass band, a white-hot tip and a streak of light behind it
let shellG = null;
function makeShell() {
  if (!shellG) { shellG = {
    body: new T.CylinderGeometry(.17, .17, 1.1, 10).rotateZ(Math.PI / 2), nose: new T.ConeGeometry(.17, .5, 10).rotateZ(-Math.PI / 2).translate(.8, 0, 0), band: new T.CylinderGeometry(.185, .185, .12, 10).rotateZ(Math.PI / 2).translate(-.25, 0, 0),
    tip: new T.SphereGeometry(.22, 8, 6).translate(1.0, 0, 0), streak: new T.PlaneGeometry(9, .5).translate(-4.9, 0, 0),
    steel: new T.MeshStandardMaterial({ color: 0x4a4f52, roughness: .35, metalness: .9 }), brass: new T.MeshStandardMaterial({ color: 0xb8892b, roughness: .3, metalness: .9 }),
    hot: new T.MeshBasicMaterial({ color: 0xfff3c2 }), glow: new T.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: .55, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }) }; }
  const q = shellG, g = new T.Group(); g.add(new T.Mesh(q.body, q.steel), new T.Mesh(q.nose, q.steel), new T.Mesh(q.band, q.brass), new T.Mesh(q.tip, q.hot));
  const st = new T.Mesh(q.streak, q.glow), st2 = st.clone(); st2.rotation.x = Math.PI / 2; g.add(st, st2); return g;
}
export function fireRocket(x, z, dx, dz, y, dy, big) { const m = big ? makeShell() : new T.Mesh(rkGeo, rkMat); if (big) { if (G.flash) G.flash(x, 1.6, z, 220, 0xffb34a, .18); if (G.shake) G.shake(.8); for (let i = 0; i < 9; i++) puff(x + dx * rr(.2, 2.2) + rr(-.4, .4), 1.3 + Math.random() * .5, z + dz * rr(.2, 2.2) + rr(-.4, .4), i % 3 ? 0xffb347 : 0xe9e4da, rr(.7, 1.6), rr(.3, 1.5), rr(.25, .6)); } m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(dx, dz) - Math.PI / 2; m.rotation.z = Math.atan(dy || 0); G.scene.add(m); rockets.push({ m, x, z, dx, dz, t: 0, y: y === undefined ? null : y, dy: dy || 0, big: !!big }); }
function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]; let hit = false; r.t += dt;
    for (let s = 0; s < 4 && !hit; s++) {
      r.x += r.dx * 42 * dt / 4; r.z += r.dz * 42 * dt / 4;
      if (r.y !== null) { r.y += r.dy * 42 * dt / 4; const gy = landHeight(r.x, r.z); if (r.y < gy + .1) { hit = true; break; } if (r.y > gy + 3.2) { if (r.t > 3 || (wallAt(r.x, r.z) && r.y < gy + 45)) hit = true; continue; } }   // into the ground it goes off there; high up it flies over cars and people
      if (wallAt(r.x, r.z) || r.t > 3) hit = true;
      for (const c of G.cars) if (c !== G.player.car && !c.dead && Math.hypot(c.x - r.x, c.z - r.z) < 1.8) hit = true;
      for (const q of G.peds) if (q.h.visible && q.state !== 'down' && Math.hypot(q.x - r.x, q.z - r.z) < .9) hit = true;
      for (const m of G.gang) if (m.state !== 'down' && Math.hypot(m.x - r.x, m.z - r.z) < .9) hit = true;
      for (const t of G.targets) if (t.alive() && Math.hypot(t.x - r.x, t.z - r.z) < t.r + .6 && (r.y === null || (r.y > t.y - .5 && r.y < t.y + t.top + .5))) hit = true;
    }
    r.m.position.set(r.x, r.y === null ? 1.3 : r.y, r.z);
    if (r.big) { r.tr = (r.tr || 0) - dt; if (r.tr <= 0) { r.tr = .03; puff(r.x - r.dx * .8, (r.y === null ? 1.3 : r.y), r.z - r.dz * .8, Math.random() < .5 ? 0xd9d3c8 : 0xff9a3a, rr(.35, .6), rr(.1, .5), rr(.7, 1.1)); } }
    if (hit) {
      const police = G.cars.some(c => c.police && !c.dead && Math.hypot(c.x - r.x, c.z - r.z) < 7.5);
      if (G.hitBuilding) G.hitBuilding(r.x + r.dx * .35, r.z + r.dz * .35, r.big ? 170 : 85, r.dx, r.dz);   // a wall is hit: the building takes damage, and falls when it has had enough
      if (r.big && G.bigBlast) G.bigBlast(r.x, r.y === null ? 1.5 : r.y, r.z, r.dx, r.dz);
      blast(r.x, r.z, r.big ? 7.5 : 6); for (const t of G.targets) if (t.alive() && Math.hypot(t.x - r.x, t.z - r.z) < 6 + t.r) t.hit(250, r.dx, r.dz);
      for (const m of G.gang) if (m.state !== 'down' && Math.hypot(m.x - r.x, m.z - r.z) < 6) hitGang(m, 200, r.dx, r.dz);
      angerGangs(r.x, r.z, 60); crime(Math.min(6, Math.max(police ? 5 : 4, G.stars + 1)), false);
      G.scene.remove(r.m); rockets.splice(i, 1);
    }
  }
}
export function updateTracers(dt) {
  updateRockets(dt); updateNades(dt); for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; t.t -= dt; if (t.t <= 0) { G.scene.remove(t.m); tracers.splice(i, 1); } } }
// fire the gun in hand along the camera direction; returns true when a shot was fired
const SHV = new T.Vector3();
export function shoot() {
  const p = G.player, g = GUNS[G.weapon]; if (!g || g.melee) return false;
  if (g.rocket) {
    if (G.inv.rockets <= 0) { G.say('Out of rockets', 2); return false; }
    G.inv.rockets--; G.onWeapon(); if (G.sfx) G.sfx.shot(); panicPeds(p.x, p.z, 34);
    const dx = Math.sin(G.camYaw), dz = Math.cos(G.camYaw), sh = G.shoulder || 0; let sl; if (G.camera && !MOBILE) { G.camera.getWorldDirection(SHV); sl = SHV.y / (Math.hypot(SHV.x, SHV.z) || .001); }
    if (sl === undefined) fireRocket(p.x + dx * 1.2 - dz * sh, p.z + dz * 1.2 + dx * sh, dx, dz); else fireRocket(p.x + dx * 1.2 - dz * sh, p.z + dz * 1.2 + dx * sh, dx, dz, 1.55 + p.y + sl * 1.2, sl);   // the rocket follows the crosshair up and down too
    return true;
  }
  if (G.inv.ammo <= 0) { G.say('Out of bullets', 2); return false; }
  G.inv.ammo--; G.onWeapon(); if (G.sfx) G.sfx.shot(); panicPeds(p.x, p.z, 34);
  angerGangs(p.x, p.z, 45);
  let any = false, police = false, pedHit = false, carHit = null, cop = false;
  for (let n = 0; n < g.pel; n++) {
    const yaw = G.camYaw + (Math.random() - .5) * 2 * g.spread, dx = Math.sin(yaw), dz = Math.cos(yaw), ox = p.x + dx * .6, oz = p.z + dz * .6, sx = p.x - Math.cos(G.camYaw) * (G.shoulder || 0), sz = p.z + Math.sin(G.camYaw) * (G.shoulder || 0);   // the shot follows the crosshair line, which sits a little to the right of you
    let best = g.range, hitPed = null, hitCar = null, hitG = null, hitC = null, hitT = null;
    // the shot goes where the crosshair points, up and down too: into the ground when you aim at the ground, over their heads when you aim high.
    // y0 + slope * f is how high the line is at f metres out. On a phone (no fine aim) the height is not checked.
    let slope = 0; const y0 = 1.55 + p.y + (G.aim ? .08 : 0);
    const FLAT = MOBILE || !!p.car || !!p.ride;   // from a car or a boat (and on a phone) shots fly level: there is no fine aim there
    if (G.camera && !FLAT) { G.camera.getWorldDirection(SHV); slope = SHV.y / (Math.hypot(SHV.x, SHV.z) || .001) + (Math.random() - .5) * 2 * g.spread; }
    const high = (f, base, top) => { if (FLAT) return true; const yy = y0 + slope * f - base; return yy > -.25 && yy < top; };
    for (const q of G.peds) { if (!q.h.visible || q.state === 'down') continue; const rx = q.x - sx, rz = q.z - sz, f = rx * dx + rz * dz; if (f < .8 || f > best || !high(f, q.h.position.y, 2.1)) continue; if (Math.abs(rx * dz - rz * dx) < .5 + f * .012) { best = f; hitPed = q; hitCar = null; } }
    for (const m of G.gang) { if (m.state === 'down' || !m.p.h.visible) continue; const rx = m.x - sx, rz = m.z - sz, f = rx * dx + rz * dz; if (f < .8 || f > best || !high(f, m.p.h.position.y, 2.1)) continue; if (Math.abs(rx * dz - rz * dx) < .5 + f * .012) { best = f; hitG = m; hitPed = null; } }
    for (const o of G.cops) { if (o.state === 'down') continue; const rx = o.x - sx, rz = o.z - sz, f = rx * dx + rz * dz; if (f < .8 || f > best || !high(f, landHeight(o.x, o.z), 2.1)) continue; if (Math.abs(rx * dz - rz * dx) < .5 + f * .012) { best = f; hitC = o; hitPed = null; hitG = null; } }
    for (const c of G.cars) { if (c === p.car) continue; const rx = c.x - sx, rz = c.z - sz, f = rx * dx + rz * dz; if (f < 1.5 || f > best || !high(f, c.g.position.y, c.spec.top + .2)) continue; if (Math.abs(rx * dz - rz * dx) < 1.2) { best = f - 1; hitCar = c; hitPed = null; hitG = null; hitC = null; } }
    for (const t of G.targets) { if (!t.alive()) continue; const rx = t.x - sx, rz = t.z - sz, f = rx * dx + rz * dz; if (f < .8 || f > best || !high(f, t.y, t.top)) continue; if (Math.abs(rx * dz - rz * dx) < t.r + f * .012) { best = Math.max(.5, f - t.r * .5); hitT = t; hitPed = null; hitCar = null; hitG = null; hitC = null; } }
    let dirt = false;
    for (let s = .75; s < best; s += .75) {
      const gy = landHeight(sx + dx * s, sz + dz * s);
      if (!FLAT && y0 + slope * s < gy) { const a = y0 + slope * (s - .75) - landHeight(sx + dx * (s - .75), sz + dz * (s - .75)), b = gy - (y0 + slope * s); best = s - .75 + .75 * (a > 0 ? a / (a + b) : 0); dirt = true; hitPed = hitCar = hitG = hitC = hitT = null; break; }   // into the ground
      if (wallAt(sx + dx * s, sz + dz * s) && (FLAT || y0 + slope * s < gy + 45)) { best = s; hitPed = hitCar = hitG = hitC = hitT = null; break; }
    }
    const ey = Math.max(landHeight(sx + dx * best, sz + dz * best) + .03, y0 + slope * best);
    let oy = 1.35 + p.y, gx = ox, gz = oz;
    { const gun = !p.car && !p.ride && p.guns && p.guns[G.weapon]; if (gun && gun.visible) { gun.getWorldPosition(SHG); gx = SHG.x + dx * .22; gz = SHG.z + dz * .22; oy = SHG.y + .04; } }   // on foot the streak starts at the gun in your hand, not at your head
    G.tracer(gx, oy, gz, sx + dx * best, FLAT ? (hitPed || hitG || hitC || hitT ? 1.1 : 1.25) + p.y : ey, sz + dz * best);
    if (G.netShot) G.netShot(gx, oy, gz, sx + dx * best, FLAT ? (hitPed || hitG || hitC || hitT ? 1.1 : 1.25) + p.y : ey, sz + dz * best);
    if (dirt && G.debris) G.debris(sx + dx * best, ey, sz + dz * best, 3, 0xa9a294, -dx * 2, -dz * 2, .07);   // a puff of grit where it lands
    if (hitT) { hitT.hit(hitT.car ? g.car : g.dmg, dx, dz); any = true; cop = true; }
    else if (hitC) { G.hitCop(hitC, g.dmg); any = true; cop = true; }
    else if (hitG) { hitGang(hitG, g.dmg, dx, dz); any = true; }
    else if (hitPed) { if (G.blood) G.blood(hitPed.x, 1.25, hitPed.z, 5, dx * 6, dz * 6); if (knockPed(hitPed, dx * 3, dz * 3)) { hitPed.dead = true; hitPed.t = 16; if (G.stat) G.stat('kills'); dropCash(hitPed.x + dx, hitPed.z + dz); } pedHit = true; any = true; }
    else if (hitCar) { hitCar.hp -= g.car / toughOf(hitCar.spec); carHit = hitCar; any = true; if (hitCar.police) police = true; else if (hitCar.ai) hitCar.bump = 2.5; }
  }
  if (cop) { /* hitting an officer raises the stars by itself */ }
  else if (pedHit) crime(Math.min(4, Math.max(2, G.stars + 1)), false);
  else if (police) crime(Math.min(6, Math.max(3, G.stars + (Math.random() < .35 ? 1 : 0))), false);
  else if (carHit) crime(Math.max(1, G.stars), false);
  else if (!any && G.police.length) crime(Math.max(2, G.stars), false);
  return true;
}
