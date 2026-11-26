// Papillon - things to do on the side: stunt jumps off ramps, and rampages against the clock.
import * as T from 'three';
import { G, MOBILE, solidAt, onRoad, landHeight, inWater, addBox } from './world.js';
import { addMarker, hasGun, saveGame } from './shops.js';

const jobEl = () => document.getElementById('job'), jobText = t => { const e = jobEl(); if (e) { e.style.display = t ? 'block' : 'none'; e.textContent = t; } };

/* ================= stunt jumps ================= */
// Ramps stand in open ground round the city. Hit one fast and the car flies; the longer the flight, the more it pays.
// Every ramp pays a big bonus the first time you clear it. Any other long flight (off a hilltop, say) pays a little too.
const RAMPS = [], WANT = [[900, -1010, 0], [1100, -1010, Math.PI], [1555, 200, Math.PI / 2], [1555, -300, -Math.PI / 2], [700, 1012, 0], [1000, 1012, Math.PI], [330, -700, Math.PI / 2], [-100, -330, 0], [450, 420, 0], [1250, 60, Math.PI / 2]];
const RL = 13, RW = 5, RH = 2.5;
function freeSpot(x, z, h) {   // room for the ramp and a run-up, on flat open ground
  const fx = Math.cos(h), fz = -Math.sin(h);
  for (let t = -30; t <= 22; t += 2) for (const s of [-2.2, 0, 2.2]) { const px = x + fx * t - fz * s, pz = z + fz * t + fx * s; if (solidAt(px, pz) || inWater(px, pz) || landHeight(px, pz) > .05 || (Math.abs(t) < 7 && onRoad(px, pz))) return false; }
  return true;
}
function buildRamp(scene, x, z, h, id) {
  const fx = Math.cos(h), fz = -Math.sin(h), rx = -fz, rz = fx, P = (a, y, s) => [x + fx * a + rx * s, y, z + fz * a + rz * s];
  // a curved ramp in three stretches, each a little steeper than the last, so a fast car is lifted and not stopped
  const prof = [[-RL / 2, .02], [-RL / 6, .42], [RL / 6, 1.2], [RL / 2, RH]], v = [], idx = [];
  for (const [a, y] of prof) { v.push(P(a, y, -RW / 2), P(a, y, RW / 2), P(a, 0, -RW / 2), P(a, 0, RW / 2)); }
  for (let k = 0; k < prof.length - 1; k++) { const o = k * 4, n = o + 4; idx.push(o, o + 1, n + 1, o, n + 1, n,   /* top */ o + 1, o + 3, n + 3, o + 1, n + 3, n + 1,   /* one side */ o, n, n + 2, o, n + 2, o + 2); }
  { const o = (prof.length - 1) * 4; idx.push(o, o + 1, o + 3, o, o + 3, o + 2); }   // the high back
  const flat = v.flat();
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(idx.flatMap(i => v[i]), 3)); g.computeVertexNormals();
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const q = c.getContext('2d'); q.fillStyle = '#e6c21f'; q.fillRect(0, 0, 128, 128); q.fillStyle = '#1b1d22'; for (let i = -128; i < 256; i += 48) { q.beginPath(); q.moveTo(i, 0); q.lineTo(i + 24, 0); q.lineTo(i + 24 - 128, 128); q.lineTo(i - 128, 128); q.fill(); }
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; const uv = []; for (const i of idx) { const p = v[i]; uv.push(((p[0] - x) * fx + (p[2] - z) * fz) / 3, ((p[0] - x) * rx + (p[2] - z) * rz) / 3 + p[1] / 3); } g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); tex.wrapS = tex.wrapT = T.RepeatWrapping;
  const m = new T.Mesh(g, new T.MeshStandardMaterial({ map: tex, roughness: .8, side: T.DoubleSide })); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  // a board on a pole beside it
  const post = new T.Mesh(new T.BoxGeometry(.14, 3.4, .14), new T.MeshStandardMaterial({ color: 0x2a2c30 })); post.position.set(...P(-RL / 2 - 1, 1.7, RW / 2 + 1)); scene.add(post);
  if (G.physAddMesh) G.physAddMesh(flat, idx);
  addBox(Math.min(...v.map(p => p[0])) + .6, Math.min(...v.map(p => p[2])) + .6, Math.max(...v.map(p => p[0])) - .6, Math.max(...v.map(p => p[2])) - .6, RH);   // people walk round it
  RAMPS.push({ x, z, h, id, tx: x + fx * RL / 2, tz: z + fz * RL / 2 });
}
let air = null, airCd = 0;
function updateStunts(dt) {
  const p = G.player, c = p.car; if (airCd > 0) airCd -= dt;
  if (!c || !G.physAir || c.spec.bike) { air = null; return; }
  const up = G.physAir(c);
  if (up) { if (!air) { let ramp = null; for (const r of RAMPS) if (Math.hypot(r.tx - c.x, r.tz - c.z) < 9) ramp = r; air = { x: c.x, z: c.z, t: 0, top: c.py || 0, y0: c.py || 0, ramp, v: c.v }; } air.t += dt; air.top = Math.max(air.top, c.py || 0); }
  else if (air) {
    const a = air; air = null; const dist = Math.hypot(c.x - a.x, c.z - a.z), high = a.top - a.y0;
    if (a.t > .6 && dist > 8 && a.v > 9 && airCd <= 0 && !c.dead) {
      airCd = 3; let pay = Math.round((dist * 4 + high * 20) / 10) * 10, first = false; G.inv.jumps = G.inv.jumps || [];
      if (a.ramp && !G.inv.jumps.includes(a.ramp.id) && dist > 14) { G.inv.jumps.push(a.ramp.id); first = true; pay += 500; }
      if ((c.up === undefined ? 1 : c.up) < .5) pay = Math.round(pay / 2);   // landed on the roof: half
      G.money += pay; if (G.onMoney) G.onMoney(pay); if (G.sfx && G.sfx.cash) G.sfx.cash(); if (G.stat) G.stat('jumps');
      if (G.banner && (first || dist > 30)) G.banner(first ? 'STUNT JUMP!' : 'BIG AIR!', '#f2c21a');
      G.say((first ? 'New ramp cleared (' + G.inv.jumps.length + ' of ' + RAMPS.length + ')! ' : '') + 'Jump: ' + dist.toFixed(0) + ' m long, ' + high.toFixed(1) + ' m high, ' + a.t.toFixed(1) + ' s in the air.  +$' + pay, 6); if (first) saveGame();
    }
  }
}

/* ================= rampages ================= */
// A red marker starts one: you are handed a weapon and a target against the clock. Do it and you are paid; the police will be on you either way.
let ram = null; const SPOTS = [[150, -100], [-100, 250], [700, -300], [1000, 400], [1300, -500], [500, 700]];
function startRampage(m) {
  if (ram) return; if (m.cd > G.time) { G.say('Nothing here right now. Come back later.', 3); return; }
  const gangNear = (G.gang || []).filter(q => q.state !== 'down' && Math.hypot(q.x - m.x, q.z - m.z) < 160).length >= 5, kind = gangNear && Math.random() < .5 ? 'gang' : 'wreck';
  if (kind === 'wreck') { if (!hasGun('rocket')) G.inv.guns.push('rocket'); G.inv.rockets += 8; G.weapon = 'rocket'; ram = { kind, need: 6, t: 110, base: G.wrecks || 0, pay: 600, m, text: 'Blow up 6 vehicles' }; }
  else { if (!hasGun('smg')) G.inv.guns.push('smg'); G.inv.ammo += 150; G.weapon = 'smg'; ram = { kind, need: 8, t: 130, base: G.gangDowns || 0, pay: 700, m, text: 'Take down 8 gang members' }; }
  if (G.onWeapon) G.onWeapon(); if (G.banner) G.banner('RAMPAGE!', '#e0362a'); G.say(ram.text + ' in ' + ram.t + ' seconds. ' + (kind === 'wreck' ? 'You have a rocket launcher and 8 rockets.' : 'You have an SMG and 150 bullets.'), 6);
}
function updateRampage(dt) {
  if (!ram) return; const p = G.player; ram.t -= dt; const got = (ram.kind === 'wreck' ? (G.wrecks || 0) : (G.gangDowns || 0)) - ram.base;
  jobText('RAMPAGE  ' + ram.text + ':  ' + Math.min(got, ram.need) + ' / ' + ram.need + '    ' + Math.max(0, Math.ceil(ram.t)) + ' s');
  if (got >= ram.need) { G.money += ram.pay; if (G.onMoney) G.onMoney(ram.pay); if (G.sfx && G.sfx.cash) G.sfx.cash(); if (G.banner) G.banner('RAMPAGE COMPLETE', '#3fae5a'); G.say('Rampage done!  +$' + ram.pay, 5); if (G.stat) G.stat('rampages'); ram.m.cd = G.time + 600; ram = null; jobText(''); saveGame(); }
  else if (ram.t <= 0 || p.health <= 0 || G.bustT > 0) { G.say('Rampage failed. ' + got + ' of ' + ram.need + '.', 4); ram.m.cd = G.time + 120; ram = null; jobText(''); }
}

export function setupJobs(scene) {
  let id = 0;
  for (const [wx, wz, h] of WANT) {   // each wanted place: the spot itself, or the nearest free one a little way off
    let done = false; for (let r = 0; r <= 60 && !done; r += 12) for (let a = 0; a < 6.28 && !done; a += (r ? 12 / r : 7)) { const x = wx + Math.cos(a) * r, z = wz + Math.sin(a) * r; if (freeSpot(x, z, h)) { buildRamp(scene, x, z, h, id); done = true; } }
    id++;
  }
  for (const [x0, z0] of SPOTS) {   // rampage markers: on the pavement near each spot
    let sx = x0, sz = z0, ok = false; for (let r = 0; r <= 40 && !ok; r += 4) for (let a = 0; a < 6.28 && !ok; a += (r ? 6 / r : 7)) { const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r; if (!solidAt(x, z) && !onRoad(x, z) && !solidAt(x + 1, z) && !solidAt(x - 1, z) && !solidAt(x, z + 1) && !solidAt(x, z - 1)) { sx = x; sz = z; ok = true; } }
    if (ok) addMarker({ x: sx, z: sz, type: 'rampage', icon: 'R', text: 'RAMPAGE', color: 0xe0362a, onEnter: startRampage });
  }
  G.ramps = RAMPS;
}
export function updateJobs(dt) { updateStunts(dt); updateRampage(dt); }
