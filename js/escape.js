// Papillon - "The Long Night": a mission for Prison Island, inspired by the book.
// An old convict, Dega, has a plan. At night: knock out a guard, climb the wall, find the canoe hidden in the reeds on the shore, row to the
// mainland while the island's searchlight sweeps the sea and the patrol boats hunt you. On land the search party (5 stars, they never lose you)
// hunts you until you reach the hide-out under the big road bridge and stay hidden there until they give up.
import * as T from 'three';
import { G, JAIL, landHeight, COAST, BRG } from './world.js';
import { addMarker, markers } from './shops.js';
import { makeNPC, playAnim } from './actors.js';
import { makeCanoe } from './craft.js';

const PAY = 5000, HIDE = 12;
const DIR = { x: -.2, z: -.98 };   // the way the canoe lies from the island (north)
const WP = [{ x: JAIL.x + 5, z: JAIL.z - 125, t: 'ROW NORTH' }, { x: COAST + 12, z: JAIL.z - 100, t: 'LAND HERE' }];   // the way round the island to the mainland shore
let st = 'idle', cool = 0, hud = null, goalM = null, dega = null, canoe = null, canoeHome = null, hideT = 0, wpI = 0, koM = null;
let beam = null, spot = null, lightA = 0, seenCd = 0;
const drop = m => { if (!m) return; G.scene.remove(m.mesh, m.sprite); const i = markers.indexOf(m); if (i >= 0) markers.splice(i, 1); };
function setHud(s) { if (!hud) { hud = document.createElement('div'); hud.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(20,24,32,.72);color:#fff;font:600 14px system-ui,sans-serif;pointer-events:none;z-index:6;display:none'; document.body.appendChild(hud); } hud.textContent = s || ''; hud.style.display = s ? 'block' : 'none'; }
const stars = n => { if (G.stars < n) { G.stars = n; if (G.onStars) G.onStars(); } G.lostT = 0; };   // the search party never loses you
const guard = () => G.prisonGuards && G.prisonGuards[2];

// ---- the searchlight tower: a beam that circles round the prison and lights up the sea (at night) ----
function buildLight() {
  const J = JAIL, tx = J.x - 24, tz = J.z - 20, ty = landHeight(tx, tz) + 12.6;
  const pivot = new T.Group(); pivot.position.set(tx, ty, tz); const hold = new T.Group(); hold.rotation.z = -.07; pivot.add(hold);
  const lamp = new T.Mesh(new T.SphereGeometry(.7, 12, 8), new T.MeshBasicMaterial({ color: 0xfff6d0 })); hold.add(lamp);
  const cone = new T.Mesh(new T.CylinderGeometry(15, .5, 150, 20, 1, true).rotateZ(-Math.PI / 2).translate(75, 0, 0), new T.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: .13, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
  hold.add(cone);
  spot = new T.SpotLight(0xfff2cc, 900, 230, .11, .55, 1.4); spot.castShadow = false; spot.target.position.set(110, 0, 0); hold.add(spot, spot.target);
  pivot.visible = false; G.scene.add(pivot); beam = { pivot, hold, tx, tz };
}
function updateLight(dt) {
  if (!beam) return; const p = G.player, px = p.car ? p.car.x : p.ride ? p.ride.x : p.x, pz = p.car ? p.car.z : p.ride ? p.ride.z : p.z, d = Math.hypot(px - beam.tx, pz - beam.tz);
  const night = G.hour >= 19 || G.hour < 6, on = night && d < 700 && !G.inside;
  beam.pivot.visible = on; if (!on) return;
  lightA += dt * .42; beam.pivot.rotation.y = lightA;   // a full turn about every 15 seconds
  // caught in the beam, out on the water or outside the yard: you are spotted
  seenCd -= dt;
  if (st === 'canoe' || st === 'row') {
    const a = Math.atan2(-(pz - beam.tz), px - beam.tx), da = Math.abs(Math.atan2(Math.sin(a - lightA), Math.cos(a - lightA)));   // the beam turns about the y axis, so +x turns towards -z
    if (d < 150 && d > 25 && da < Math.atan(14 / Math.max(d, 25)) * .9 + .02 && seenCd <= 0) { seenCd = 7; stars(4); G.say('SPOTTED by the searchlight! The guards open fire and the patrol boats are coming!', 4); }
  }
}

// ---- the canoe, hidden in the reeds on the north shore ----
function hideCanoe(cx, cz) {
  const gm = new T.MeshStandardMaterial({ color: 0x4f7a34, roughness: 1 }), gm2 = new T.MeshStandardMaterial({ color: 0x6b8f3c, roughness: 1 }), dry = new T.MeshStandardMaterial({ color: 0x9c8a4a, roughness: 1 });
  const clump = (x, z, s) => { const g = new T.Group(); for (let i = 0; i < 9; i++) { const h = (1.3 + Math.random() * 1.0) * s, m = new T.Mesh(new T.ConeGeometry(.06 * s, h, 4), Math.random() < .3 ? dry : (Math.random() < .5 ? gm : gm2)); m.position.set((Math.random() - .5) * .8 * s, h / 2 - .1, (Math.random() - .5) * .8 * s); m.rotation.set((Math.random() - .5) * .25, 0, (Math.random() - .5) * .25); g.add(m); } g.position.set(x, -.9, z); G.scene.add(g); };
  for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283 + Math.random() * .3, r = 2.1 + Math.random() * 1.4; clump(cx + Math.cos(a) * r * 1.5, cz + Math.sin(a) * r, 1 + Math.random() * .5); }   // a ring of reeds all round the canoe
  const net = new T.Mesh(new T.BoxGeometry(2.4, .06, 1.2), new T.MeshStandardMaterial({ color: 0x3f5a2a, roughness: 1 })); net.position.set(cx - .1, -.42, cz); net.rotation.z = .08; G.scene.add(net);   // branches thrown over the canoe
}

function reset() {
  drop(goalM); goalM = null; drop(koM); koM = null; st = 'idle'; hideT = 0; wpI = 0; setHud('');
  const g = guard(); if (g && g.down > 0) g.down = .5;
  if (canoe) { if (G.player.ride === canoe) G.player.ride = null; canoe.x = canoeHome.x; canoe.z = canoeHome.z; canoe.h = 0; canoe.vx = canoe.vz = canoe.v = 0; }
}
function fail(why) { if (st === 'idle') return; reset(); cool = 30; G.say('Escape failed: ' + why + '. Dega will help you try again.', 6); }
function win() {
  reset(); cool = 600; G.money += PAY; if (G.onMoney) G.onMoney(PAY); if (G.sfx && G.sfx.cash) G.sfx.cash(); G.jailed = false; G.stars = 0; G.lostT = 0; if (G.onStars) G.onStars();
  G.say('The search party gives up. YOU ARE FREE. A man like Papillon always finds a way. +$' + PAY, 10);
}

function start() {
  if (G.hour < 21 && G.hour > 5) G.hour = 22;   // it has to be night
  st = 'guard'; G.jailed = true; const g = guard();
  if (g) koM = addMarker({ x: g.x - Math.sin(g.yaw) * 1.3, z: g.z - Math.cos(g.yaw) * 1.3, y: landHeight(g.x, g.z), type: 'story', icon: '!', text: 'PRESS E: KNOCK OUT', color: 0xd9731f, onEnter: knockOut });
  setHud('1) Follow the arrow to the guard by the wall.  2) Walk up close behind him.  3) Press E (or punch him) to knock him out');
}
G.onPunch = (x, z, reach) => { if (st !== 'guard') return; const g = guard(); if (g && Math.hypot(g.x - x, g.z - z) < reach + .9) knockOut(); };   // a punch at the guard works too, not only the E mark
function knockOut() {
  if (st !== 'guard') return; const g = guard(); if (!g) return;
  if (G.sfx && G.sfx.punch) G.sfx.punch();
  g.down = 900; playAnim(g.n, 'Death', true, 1.2); drop(koM); koM = null; st = 'wall';
  const wx = JAIL.x - 21.5, wz = JAIL.z - 1;
  goalM = addMarker({ x: wx, z: wz, y: landHeight(wx, wz), type: 'story', icon: '!', text: 'CLIMB THE WALL (E)', color: 0xd9731f, onEnter: climb });
  setHud('Guard out cold. Climb the west wall of the yard (press E at the mark)');
  G.say('He is out cold, and you have his keys. Now the wall on the west side. Quick, before the shift changes.', 7);
}
function climb() {
  if (st !== 'wall') return; const p = G.player; drop(goalM); goalM = null;
  p.x = p.px = JAIL.x - 28.5; p.z = p.pz = JAIL.z - 1; p.y = landHeight(p.x, p.z) + 1; p.vy = 3; p.isle = true; p.swim = false; stars(3);
  st = 'canoe'; goalM = addMarker({ x: canoeHome.x, z: canoeHome.z, y: 0, type: 'goal', icon: '!', text: 'HIDDEN CANOE', color: 0xc8a050, onEnter: board });
  setHud('ALARM! Run north round the island to the canoe hidden in the reeds on the shore!');
  G.say('Over the wall! The alarm is ringing, the guards are shooting. The canoe is hidden in the reeds on the north shore: RUN! Stay out of the searchlight.', 8);
}
function board() {
  if (st !== 'canoe') return; const p = G.player; drop(goalM); goalM = null;
  p.ride = canoe; p.swim = false; p.isle = false; canoe.vx = canoe.vz = canoe.v = 0; canoe.h = 0; st = 'row'; wpI = 0; stars(3);
  G.say('In the canoe. Row (W) and steer (A/D). Round the north of the island, then east to the mainland. Keep out of the searchlight!', 8); nextWp();
}
function nextWp() { drop(goalM); const w = WP[wpI]; goalM = addMarker({ x: w.x, z: w.z, y: 0, type: 'goal', icon: '!', text: w.t, color: 0x3a7bd5, onEnter: () => {} }); setHud(wpI === 0 ? 'Row north round the island, away from the guards and the searchlight' : 'Row east to the mainland shore'); }
function talk() {
  if (st === 'guard') { G.say('"The guard by the wall. Creep up behind him and take him out. Quietly."', 4); return true; }
  if (st !== 'idle') { G.say('"Go! Do not talk to me, the guards are watching!"', 3); return true; }
  if (cool > 0) { G.say('"Not now. The guards are watching. Come back later."', 3); return true; }
  G.menu('Dega', '"Psst, Papillon. Tonight we leave. You knock out the guard by the wall and climb over. A canoe is hidden in the reeds on the north shore. Row to the mainland, but when the alarm rings EVERYONE hunts you: guards, a searchlight, boats, helicopters, and they will not stop until you are hidden. I know a hide-out: under the big road bridge. Are you in?"  Pays $' + PAY, [
    { label: 'Yes, tonight', note: 'it becomes night. Knock out the guard first', fn: () => { start(); G.say('"Good. Follow the orange arrow to the guard by the wall. Walk up behind him, then press E or punch him."', 8); return true; } },
    { label: 'No', fn: () => { G.say('"A pity. I will be here if you change your mind."', 3); return true; } }]);
  return true;
}
export function setupEscape() {
  const J = JAIL;
  let r = 30; while (r < 140 && landHeight(J.x + DIR.x * r, J.z + DIR.z * r) > .3) r += 1;   // the north shore of the island
  canoeHome = { x: J.x + DIR.x * (r + 12), z: J.z + DIR.z * (r + 12) }; canoe = makeCanoe(canoeHome.x, canoeHome.z, 0); hideCanoe(canoeHome.x, canoeHome.z);
  buildLight();
  const dx = J.x - 5, dz = J.z + 7; dega = makeNPC('pm', { head: 'Casual_Head', body: 'Casual_Body', legs: 'Casual_Legs', feet: 'Casual_Feet', skin: 0xc68642, hair: 0x8a8a8a, top: 0xd9731f, bottom: 0xd9731f }, dx, dz, Math.PI / 2);
  dega.h.position.y = landHeight(dx, dz); dega.far = true;
  addMarker({ x: dx + .9, z: dz, y: landHeight(dx, dz), type: 'story', icon: '★', text: 'DEGA', color: 0xd9731f, onEnter: talk });
  const ob = G.onBusted; G.onBusted = () => { if (st !== 'idle') fail('you were arrested'); if (ob) ob(); };
  G.onJailed = () => { if (st === 'idle' && cool <= 0) G.say('An old convict in the yard waves you over: "Psst, newcomer." (DEGA is marked on your map)', 7); };
  G.escapeDBG = { get st() { return st; }, start, knockOut, climb, board, talk, canoe, canoeHome, WP, beam, get hideT() { return hideT; }, get lightA() { return lightA; } };
}
// on-screen arrow: points at the current goal, relative to where the camera looks
let arrowEl = null;
function updateArrow() {
  const t = st === 'idle' ? null : (goalM || koM);
  if (!t) { if (arrowEl) arrowEl.style.display = 'none'; return; }
  if (!arrowEl) {
    arrowEl = document.createElement('div');
    arrowEl.style.cssText = 'position:fixed;left:50%;top:112px;transform:translateX(-50%);text-align:center;color:#fff;font:700 13px system-ui,sans-serif;pointer-events:none;z-index:6;text-shadow:0 1px 3px #000';
    arrowEl.innerHTML = '<svg width="54" height="54" viewBox="-27 -27 54 54"><g id="escArrowG"><path d="M0,-22 L16,14 L0,6 L-16,14 Z" fill="#ffb02e" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/></g></svg><div id="escArrowD"></div>';
    document.body.appendChild(arrowEl);
  }
  const pl = G.player, px = pl.car ? pl.car.x : pl.ride ? pl.ride.x : pl.x, pz = pl.car ? pl.car.z : pl.ride ? pl.ride.z : pl.z;
  const f = new T.Vector3(); G.camera.getWorldDirection(f);
  const ang = Math.atan2(t.x - px, t.z - pz) - Math.atan2(f.x, f.z);   // world bearing minus camera bearing
  arrowEl.style.display = 'block';
  arrowEl.querySelector('#escArrowG').setAttribute('transform', 'rotate(' + (-ang * 180 / Math.PI).toFixed(1) + ')');
  arrowEl.querySelector('#escArrowD').textContent = Math.round(Math.hypot(t.x - px, t.z - pz)) + ' m';
}
export function updateEscape(dt) {
  if (cool > 0) cool -= dt;
  updateLight(dt);
  updateArrow();
  if (st === 'idle') return;
  const pl = G.player; if (pl.health <= 0) { fail('you died'); return; }
  const px = pl.car ? pl.car.x : pl.ride ? pl.ride.x : pl.x, pz = pl.car ? pl.car.z : pl.ride ? pl.ride.z : pl.z;
  if (st === 'canoe') { stars(3); if (pl.swim && Math.hypot(px - canoeHome.x, pz - canoeHome.z) < 14) board(); return; }   // swam out to it: in you get
  if (st === 'row') {
    stars(3); if (pl.ride !== canoe) { if (px > COAST) fail('you left the canoe'); else pl.ride = canoe; }
    const w = WP[wpI]; if (w && Math.hypot(canoe.x - w.x, canoe.z - w.z) < 16) { wpI++; if (wpI < WP.length) nextWp(); }
    if (wpI >= WP.length || canoe.x > COAST - 6) {   // landed: out of the canoe and running
      drop(goalM); goalM = null; pl.ride = null; pl.swim = false; pl.x = pl.px = COAST + 4; pl.z = pl.pz = canoe.z; pl.y = 0; st = 'hunt'; stars(5);
      G.say('You are ashore. The search party is everywhere: helicopters, patrol cars, roadblocks. Steal a car and get to the hide-out under the big road bridge!', 9);
      goalM = addMarker({ x: BRG.x, z: BRG.z, y: 0, type: 'goal', icon: '!', text: 'HIDE-OUT', color: 0x3ac86a, onEnter: () => {} });
    }
    return;
  }
  if (st === 'hunt' || st === 'hide') {
    const near = Math.hypot(px - BRG.x, pz - BRG.z) < 12 && Math.abs(pz - BRG.z) < 9 && !pl.ride;
    if (near) { if (st === 'hunt') { st = 'hide'; hideT = 0; } hideT += dt; setHud('Stay hidden under the bridge... ' + Math.max(0, Math.ceil(HIDE - hideT)) + ' s'); if (G.stars > 0 && hideT > HIDE * .5) { G.stars = Math.min(G.stars, 2); if (G.onStars) G.onStars(); } if (hideT >= HIDE) win(); }
    else { if (st === 'hide') { st = 'hunt'; hideT = 0; } stars(5); setHud('The search party is hunting you. Get to the hide-out under the big road bridge!'); }
  }
}
