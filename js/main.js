// Papillon - main: start-up, input, player, camera, HUD, game loop
import * as T from 'three';
import { G, MOBILE, buildWorld, buildSea, buildWheel, buildSky, collide, solidAt, XS, ZS, ZMAX, ZMIN, HARB, RH, COAST, RAIL, BASE, STRIPS, TOWNS, zoneAt, onRing, JAIL, onRoad, updateLights, solidHeight, kerbH } from './world.js';
import { pushNPCs, loadModels, prepPeople, makePlayer, animPlayer, makePeds, updatePeds, knockPed, staggerPed, dentCar, makeTraffic, updateCars, driveCar, takeCar, crime, updatePolice, dropCash, updateCash, lookOptions, defaultLook, cleanLook, SKINS, HAIRS, CLOTHS } from './actors.js';

import { setupShops, updateMarkers, updateTracers, markers, shoot, switchWeapon, saveGame, loadGame, applySave, wipeGame, homeSpot, initCloud, storeLocal } from './shops.js';

import { setupCraft, updateCraft, driveBoat, boatLanding, flyHeli, heliFloor, placeBoat, boatBlocked, swimBlocked } from './craft.js';
import { BRG, bridgeH, landHeight, inWater, jettyH, isleY, harbourDeck, inHedge, roofPush, deckPush } from './world.js';
const SWIM_Y = -1.58;
const boatAt = (x, z) => G.boats.some(b => Math.hypot(b.x - x, b.z - z) < 3.5);
import { initSound, updateSound, radioNext, speak, voiceToggle } from './sound.js';
import { setupInteriors, enterRoom, updateRoomLight } from './interiors.js';
import { gunMenu, bedMenu, GUNS, hasGun, fireRocket, throwGrenade, detonate, foodMenu, clinicMenu, deskMenu, armouryMenu, tryDoor, markers as MK, barMenu, clothMenu } from './shops.js';
addEventListener('keydown', e => { if (e.code === 'KeyB' && !e.repeat && playing && !menuOpen) detonate(); });
addEventListener('keydown', e => { if (e.code === 'KeyG' && !e.repeat && playing && !menuOpen && G.player && !G.player.car && !G.player.ride && !G.player.swim && !G.inside) throwGrenade(); });
import { warmUpActors, initCarEnv, updateNPCs, updatePuffs, newCar, groundCar, aiWarp, streamWorld } from './actors.js';
import { nodes, nearestNode } from './world.js';
// ----- riding as a passenger: taxis take you where you ask, buses run their line -----
const TAXI_PLACES = [['Harbour', 80, 0], ['Old Town', -100, -130], ['Docks', -100, 260], ['Beach', -100, -325], ['Downtown', 80, -260], ['Airport', 80, -390], ['East gate (road to the army base)', 220, -195], ['South end', 150, 390], ['City flat', 150, 130], ['High-rise district', 910, -325], ['Industry', 400, 550], ['Les Pins (town)', 1430, -890], ['La Roche (town)', 1430, -130], ['Vallon (town)', 1430, 640], ['Port Sud (town)', 650, 890]];
/* the name of the part of town you are in, shown for a few seconds when you cross into it */
function districtAt(x, z) {
  if (x < COAST) return Math.hypot(x - JAIL.x, z - JAIL.z) < 95 ? 'Prison Island' : Math.hypot(x + 330, z - 330) < 65 ? 'Lighthouse Island' : Math.hypot(x + 400, z + 250) < 80 ? 'Palm Island' : 'The Bay';
  for (const t of TOWNS) if (Math.hypot(x - t.x, z - t.z) < 120) return t.name;
  if (Math.hypot(x - BASE.x, z - BASE.z) < 172) return 'Old Army Base'; if (Math.hypot(x - 372, z) < 150) return 'Monument Hill';
  if (x < 300 && z < -400) return 'Airport';
  if (x < 236 && z > ZMIN - 10 && z < ZMAX + 10) return z < -195 ? (x < 0 ? 'Villas and Beach' : 'Downtown') : z > 195 ? (x < 0 ? 'Docks' : 'South End') : (x < 0 ? 'Harbour' : 'Old Town');
  if (Math.hypot(x - 910, z + 300) < 210) return 'Towers'; if (z > 400 && x < 520) return 'Industry';
  if (zoneAt(x, z) === 'country') return 'Countryside';
  return z < -195 ? 'North Quarter' : z > 195 ? 'South Quarter' : 'East Side';
}
let areaEl = null, areaName = '', areaT = 0, areaShow = 0;
function areaTick(dt) {
  if (!areaEl) { areaEl = document.createElement('div'); areaEl.style.cssText = 'position:fixed;right:18px;bottom:' + (MOBILE ? '46%' : '22px') + ';font:italic 800 ' + (MOBILE ? 20 : 30) + 'px Georgia,serif;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.75);opacity:0;transition:opacity .8s;pointer-events:none;z-index:5'; document.body.appendChild(areaEl); }
  if (areaShow > 0) { areaShow -= dt; if (areaShow <= 0) areaEl.style.opacity = 0; }
  areaT -= dt; if (areaT > 0) return; areaT = .7;
  const p = G.player; if (G.inside) return; const h = p.car || p.ride || p, n = districtAt(h.x, h.z);
  if (n !== areaName) { areaName = n; areaEl.textContent = n; areaEl.style.opacity = 1; areaShow = 4; }
}
function hail() {
  const p = G.player; if (!playing || menuOpen || p.ride || G.inside || p.swim) return;
  if (p.car) { if (p.car.type === 'taxi' && !p.passenger) startTaxiShift(); else if (p.car.type === 'ambulance') startParamedic(); else if (p.car.police && !p.passenger) startVigilante(); return; }
  let best = null, bd = 16; for (const c of G.cars) { if (!c.ai || c.dead) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd && (c.type === 'taxi' || (c.type === 'bus' && c.atStop))) { best = c; bd = d; } }
  if (!best) { say('Stand near a yellow taxi and press T. For a bus: press T at a stop while the bus is standing there.', 5); return; }
  if (G.stars > 1) { say('"Not with the police after you!"', 2); return; }
  if (best.type === 'bus') { if (G.money < 2) { say('The bus costs $2', 2); return; } G.money -= 2; G.onMoney(0); p.car = best; p.passenger = 'bus'; if (G.sfx) G.sfx.door(); say('On the bus ($2). Press F at a stop to get off.', 5); return; }
  p.car = best; p.passenger = 'taxi'; best.stopReq = true; best.leaving = false; if (G.sfx) G.sfx.door();
  G.menu('Taxi', 'Where to?', TAXI_PLACES.map(([name, x, z]) => { const fare = Math.max(8, Math.round(Math.hypot(x - best.x, z - best.z) * .09)); return { label: name, cost: fare, fn: () => { if (G.money < fare) { say('Not enough money', 2); return; } best.goal = nearestNode(x, z); best.fare = fare; best.fast = 1.7; best.stopReq = false; say('On the way to ' + name + '. Space skips the ride, F gets out early.', 5); return true; } }; }));
}
addEventListener('keydown', e => { if (e.code === 'KeyT' && !e.repeat) hail(); if (e.code === 'KeyI' && !e.repeat && playing && !menuOpen) statsMenu(); });
function passengerTick(dt) {
  const p = G.player, c = p.car; p.x = c.x; p.z = c.z; p.y = 0; p.speed = c.v; inp.punch = false;
  const out = () => { const sx = Math.sin(c.h), sz = Math.cos(c.h); p.car = null; p.passenger = null; c.goal = null; c.fast = 0; c.stopReq = false; c.leaving = false; p.x = c.x + sx * 2.7; p.z = c.z + sz * 2.7; p.speed = 0; camIdle = 9; if (G.sfx) G.sfx.door(); };
  const pay = v => { v = Math.min(G.money, v | 0); if (v > 0) { G.money -= v; G.onMoney(0); } };
  if (c.dead || !c.ai) { out(); return; }
  if (p.passenger === 'bus') { if (inp.enter) { inp.enter = false; if (c.atStop) out(); else say('Wait for the next stop', 2); } return; }
  if (c.goal == null) { if (!menuOpen) out(); inp.enter = false; return; }   // closed the menu without choosing: step out again, no charge
  const n = nodes[c.goal], d = Math.hypot(n.x - c.x, n.z - c.z);
  if (inp.jump && d > 60) aiWarp(c, c.goal);
  if (d < 22 && !c.leaving) c.stopReq = true;
  if (d < 22 && c.v < .6) { pay(c.fare); say('"That is $' + c.fare + '. Have a good day."', 3); out(); return; }
  if (inp.enter) { inp.enter = false; c.stopReq = true; c.leaving = true; say('"Pulling over."', 2); }
  if (c.leaving && c.v < .6) { pay(c.fare / 2); out(); }
}
import { setupGangs, updateGangs, hitGang, GANGS } from './gangs.js';
import { setupLair, updateLair } from './lair.js';
import { setupEscape, updateEscape } from './escape.js';
import { updateCops, clearCops } from './cops.js';
import { setupMissions, updateMissions, startTaxiShift, startParamedic, missionInfo } from './missions.js';
import { setGps, updateGps } from './gps.js';
import { updateNature, warmNature } from './nature.js';
import { updateFx, updateBreaks } from './fx.js';
import { updateDemolish, updateWater, updateBrigade, updateBlastFx } from './demolish.js';
import { updateExtras } from './extras.js';
import { startNet, updateNet } from './net.js';
import { setupEstates, updateEstates, VILLA, RESIDENCE, ARMY, SILO } from './estates.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { updateMore, statsMenu, startVigilante } from './more.js';
import { setupTrain, updateTrain } from './train.js';
import { initPhysics, updatePhysics } from './phys.js';
import { showReport } from './report.js';
import { setupJobs, updateJobs } from './jobs.js';
const COMBO = [{ clip: 'Punch_Left', ts: 1.5, len: .38, hit: .14, dmg: 8 }, { clip: 'Punch_Right', ts: 1.5, len: .46, hit: .2, dmg: 12 }, { clip: 'Hook', ts: 1, len: .7, hit: .27, dmg: 30, big: true }, { clip: 'Hook', ts: 1.15, len: .6, hit: .22, dmg: 60, big: true }];   // the last one is the bat swing

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const canvas = $('c');
let renderer;
try { renderer = new T.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: 'high-performance' }); }
catch (e) { $('status').textContent = 'This game needs 3D graphics (WebGL), which did not start in this browser.'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
const VIEW0 = MOBILE ? 430 : 760; let VIEW = VIEW0, cullT = 0;
const scene = new T.Scene(); scene.fog = new T.Fog(0xcfe6f4, VIEW * .3, VIEW);
const camera = new T.PerspectiveCamera(55, 1, .5, 4500);
G.scene = scene; G.cars = []; G.time = 0; G.hour = 9; G.peds = [];
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); document.body.classList.toggle('portrait', MOBILE && h > w); }
addEventListener('resize', resize); resize();

/* ----- graphics quality: Low / Medium / High (F6, or the Statistics menu). It sets the shadows, the fine graphics, the sharpness, and how far away things are drawn ----- */
const QUAL = { low: { pr: MOBILE ? .75 : 1, shadow: 0, view: .5, fancy: false, ped: 50, car: 110, nat: 170, natS: 0 }, med: { pr: 1.25, shadow: 2048, view: .8, fancy: false, ped: 90, car: 200, nat: 280, natS: 70 }, high: { pr: 2, shadow: 2048, view: 1, fancy: true, ped: 100, car: 260, nat: 380, natS: 120 } };
const QORDER = ['low', 'med', 'high'], QNAME = { low: 'Low', med: 'Medium', high: 'High' };
G.Q = Object.assign({}, QUAL.high);
function applyQuality(q, save) {
  if (!QUAL[q]) q = 'med'; const f = QUAL[q]; G.quality = q; G.Q = Object.assign({}, f);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, MOBILE ? Math.min(f.pr, 1.5) : f.pr)); resize(); resizeComposer();
  const sh = f.shadow > 0, was = renderer.shadowMap.enabled; renderer.shadowMap.enabled = sh;
  scene.traverse(o => { if (o.isDirectionalLight && o.castShadow !== undefined && o.shadow) { const s = Math.min(f.shadow || 1024, MOBILE ? 1024 : 4096); if (sh && o.shadow.mapSize.x !== s) { o.shadow.mapSize.set(s, s); if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; } } } });
  if (was !== sh) scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(x => { x.needsUpdate = true; }); });
  VIEW = VIEW0 * f.view; scene.fog.near = VIEW * .3; scene.fog.far = VIEW; cullT = 0;
  fancy = f.fancy && !MOBILE; if (save) { try { localStorage.setItem('papillon.quality', q); } catch (e) { } }
}
G.cycleQuality = () => { G.qManual = true; const q = QORDER[(QORDER.indexOf(G.quality) + 1) % 3]; applyQuality(q, true); say('Graphics: ' + QNAME[q] + ' (F6 changes it)', 3); };
G.qualityName = () => QNAME[G.quality] || '?';
addEventListener('keydown', e => { if (e.code === 'F6' && !e.repeat) { e.preventDefault(); G.cycleQuality(); } });
/* ----- the finishing passes over the picture (PC only; press K to switch them off if the game runs slowly) -----
   soft shadow where things meet (corners, under cars, at the foot of walls), a glow round lamps and lit windows, and a colour grade */
let composer = null, bloom = null, gtao = null, fancy = !MOBILE && (() => { try { return localStorage.getItem('papillon.fancy') !== '0'; } catch (e) { return true; } })();
function buildComposer() {
  const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
  const rt = new T.WebGLRenderTarget(w * pr, h * pr, { type: T.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt); composer.setPixelRatio(pr); composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, w, h); gtao.output = GTAOPass.OUTPUT.Default; gtao.blendIntensity = .9;
  gtao.updateGtaoMaterial({ radius: .9, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  composer.addPass(gtao);
  // one broken pixel (not-a-number, or absurdly bright) would be smeared by the glow into a black box that flashes on screen: clean the picture first
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { vec4 c = texture2D(tDiffuse, vUv); vec3 k = c.rgb; if (!(k.r >= 0.0 && k.r < 1e4)) k.r = 0.0; if (!(k.g >= 0.0 && k.g < 1e4)) k.g = 0.0; if (!(k.b >= 0.0 && k.b < 1e4)) k.b = 0.0; gl_FragColor = vec4(min(k, vec3(24.0)), 1.0); }' }));
  bloom = new UnrealBloomPass(new T.Vector2(w / 2, h / 2), .22, .5, .92); composer.addPass(bloom);
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null }, uSat: { value: 1.12 }, uCon: { value: 1.03 }, uVig: { value: .28 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform float uSat, uCon, uVig; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(.2126, .7152, .0722)); c.rgb = mix(vec3(l), c.rgb, uSat); c.rgb = (c.rgb - .18) * uCon + .18; vec2 q = vUv - .5; c.rgb *= 1. - uVig * dot(q, q) * 1.6; gl_FragColor = c; }' }));
  composer.addPass(new OutputPass());
}
function resizeComposer() { if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); } }
addEventListener('resize', resizeComposer);
// Caps Lock switches "always run" on and off, so the Shift key need not be held (holding right Shift for 8 seconds makes Windows pop up its Filter Keys question)
let runLock = false; try { runLock = localStorage.getItem('papRunLock') === '1'; } catch (e) {}
addEventListener('keydown', e => { if (e.code === 'CapsLock' && !e.repeat && playing && !menuOpen) { runLock = !runLock; try { localStorage.setItem('papRunLock', runLock ? '1' : '0'); } catch (e2) {} say(runLock ? 'Always run: ON (Caps Lock switches it off, Shift walks)' : 'Always run: off', 3); } });
addEventListener('keydown', e => { if (e.code === 'KeyV' && !e.repeat && playing && !menuOpen) say(voiceToggle() ? 'Voices on (V switches them off)' : 'Voices off', 2.5); });
addEventListener('keydown', e => { if (e.code === 'KeyK' && !e.repeat && playing && !menuOpen) { fancy = !fancy; try { localStorage.setItem('papillon.fancy', fancy ? '1' : '0'); } catch (e2) { } say(fancy ? 'Fine graphics on' : 'Fine graphics off (faster)', 3); } });
document.body.classList.toggle('mobile', MOBILE);

/* ---------- input ---------- */
const keys = {}, inp = { mx: 0, my: 0, run: false, jump: false, enter: false };
let camYaw = -Math.PI / 2, camPitch = .3, camDist = 5, camIdle = 9, playing = false, locked = false, mouseDown = false;
addEventListener('keydown', e => { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); if (!keys[e.code] && (e.code === 'KeyF' || e.code === 'KeyE' || e.code === 'Enter')) inp.enter = true; if (!keys[e.code] && e.code === 'KeyQ') inp.punch = true; if (!keys[e.code] && (e.code === 'KeyR' || e.code === 'Tab') && playing && !menuOpen) { e.preventDefault(); switchWeapon(); } if (e.code === 'Escape' && menuOpen) closeMenu(); if (!keys[e.code] && e.code === 'KeyN' && playing && G.player.car) say('Radio: ' + radioNext(), 2.5); keys[e.code] = true; });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function look(dx, dy) { camYaw -= dx * .0032; camPitch = clamp(camPitch + dy * .0026, -.12, 1.25); camIdle = 0; }
canvas.addEventListener('click', () => { if (!MOBILE && playing && !locked) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } } });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; });
addEventListener('mousedown', e => { if (e.button !== 0) return; mouseDown = true; if (locked && playing && !menuOpen) inp.punch = true; }); addEventListener('mouseup', e => { if (e.button === 2) aimHeld = false; else mouseDown = false; });
let aimHeld = false, shoulder = 0; const xhEl = $('xhair');
addEventListener('mousedown', e => { if (e.button === 2 && locked && playing && !menuOpen) aimHeld = true; }); addEventListener('contextmenu', e => { if (playing) e.preventDefault(); });
addEventListener('mousemove', e => { if (!MOBILE && playing && (locked || mouseDown)) look(e.movementX || 0, e.movementY || 0); else if (builderOpen && mouseDown && e.target === canvas) camYaw -= (e.movementX || 0) * .006; });
// touch: left side = move stick, right side = look
const stick = { id: null, x0: 0, y0: 0, x: 0, y: 0 }, lookT = { id: null, x: 0, y: 0 }, knob = $('knob'), base = $('stick');
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  if (e.clientX < innerWidth * .45 && stick.id === null) { stick.id = e.pointerId; stick.x0 = e.clientX; stick.y0 = e.clientY; stick.x = stick.y = 0; base.style.display = 'block'; base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px'; knob.style.transform = 'translate(-50%,-50%)'; }
  else if (lookT.id === null) { lookT.id = e.pointerId; lookT.x = e.clientX; lookT.y = e.clientY; }
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId === stick.id) { let dx = e.clientX - stick.x0, dy = e.clientY - stick.y0; const l = Math.hypot(dx, dy), m = 56; if (l > m) { dx *= m / l; dy *= m / l; } stick.x = dx / m; stick.y = dy / m; knob.style.transform = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`; }
  else if (e.pointerId === lookT.id) { look((e.clientX - lookT.x) * 1.8, (e.clientY - lookT.y) * 1.8); lookT.x = e.clientX; lookT.y = e.clientY; }
});
const endTouch = e => { if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; base.style.display = 'none'; } if (e.pointerId === lookT.id) lookT.id = null; };
canvas.addEventListener('pointerup', endTouch); canvas.addEventListener('pointercancel', endTouch);
const tb = { jump: false };
const hold = (el, on, off) => { el.addEventListener('pointerdown', e => { e.preventDefault(); on(); }); if (off) for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, off); };
hold($('bCar'), () => { inp.enter = true; });
hold($('bJump'), () => { tb.jump = true; }, () => { tb.jump = false; });
hold($('bHit'), () => { inp.punch = true; tb.down = true; }, () => { tb.down = false; });
hold($('bAim'), () => { aimHeld = !aimHeld; $('bAim').classList.toggle('on', aimHeld); });
hold($('bNade'), () => { const p = G.player; if (playing && !menuOpen && p && !p.car && !p.ride && !p.swim && !G.inside) throwGrenade(); });
hold($('bTaxi'), () => hail());
hold($('bBomb'), () => { if (playing && !menuOpen) detonate(); });
function readInput() {
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), my = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  if (stick.id !== null) { mx = stick.x; my = -stick.y; }
  inp.mx = mx; inp.my = my; inp.run = (!!(keys.ShiftLeft || keys.ShiftRight) !== runLock) || Math.hypot(stick.x, stick.y) > .88; inp.jump = !!keys.Space || tb.jump;
}

/* ---------- HUD ---------- */
const starEls = [...document.querySelectorAll('#stars span')], hint = $('hint'), clockEl = $('clock'), speedEl = $('speed'), big = $('big');
let hintT = 0, menuOpen = false;
G.lastSays = [];
function say(t, sec) { hint.textContent = t; hint.style.opacity = t ? 1 : 0; hintT = sec || 0; if (t && t.charAt(0) === '"' && !MOBILE) speak(t);   /* a line in quotes is somebody talking: it is also said out loud */ if (t && G.lastSays[G.lastSays.length - 1] !== t) { G.lastSays.push(t); if (G.lastSays.length > 8) G.lastSays.shift(); } }
G.say = say;
let lastStars = 0;
G.onStars = quiet => { starEls.forEach((s, i) => s.classList.toggle('on', i < G.stars)); if (G.stars === 0 && !quiet) say('You lost the police', 3); if (G.stars > lastStars && G.sfx) G.sfx.star(); lastStars = G.stars; };
const weaponEl = $('weapon'), arEl = $('ar');
G.onWeapon = () => { const g = GUNS[G.weapon]; weaponEl.textContent = (g ? g.name + (g.melee ? '' : '  ' + (g.rocket ? G.inv.rockets : G.inv.ammo)) : 'Fists') + (G.inv.grenades > 0 ? '  +' + G.inv.grenades + ' grenades' : ''); };
weaponEl.addEventListener('pointerdown', e => { e.preventDefault(); if (playing && !menuOpen) switchWeapon(); });
$('speed').addEventListener('pointerdown', e => { e.preventDefault(); if (playing && G.player.car) say('Radio: ' + radioNext(), 2.5); });
// a simple menu for shops and flats
const menuEl = $('menu');
function closeMenu() { menuOpen = false; menuEl.style.display = 'none'; }
G.menu = (title, sub, opts) => {
  menuOpen = true; try { document.exitPointerLock(); } catch (e) { }
  $('mTitle').textContent = title; $('mSub').textContent = sub + '  -  you have $' + G.money;
  const box = $('mOpts'); box.textContent = '';
  for (const o of opts) {
    const b = document.createElement('button'); b.className = 'mopt';
    b.textContent = o.label + (o.cost ? '  -  $' + o.cost : '') + (o.note ? '  (' + o.note + ')' : '');
    b.addEventListener('click', () => { const done = o.fn(); $('mSub').textContent = sub + '  -  you have $' + G.money; if (done) closeMenu(); });
    box.appendChild(b);
  }
  menuEl.style.display = 'flex';
};
$('mClose').addEventListener('click', closeMenu);
let bustedT = 0, wasted = false, copKill = false;
// Arrested (or shot down by the police): they take every weapon, the grenades and the bullets. You keep your money.
function takeStuff() { const had = G.inv.pistol || G.inv.guns.length || G.inv.ammo > 0 || G.inv.grenades > 0 || G.inv.rockets > 0; G.inv.pistol = false; G.inv.guns = []; G.inv.ammo = 0; G.inv.rockets = 0; G.inv.grenades = 0; G.weapon = 'fist'; if (G.onWeapon) G.onWeapon(); return had; }
const moneyEl = $('money'), hpEl = $('hp');
G.onMoney = v => { moneyEl.textContent = '$' + G.money; if (v > 0 && G.stat) G.stat('earned', v); if (v > 0) { say('+$' + v, 1.5); if (G.sfx) G.sfx.cash(); } };
G.onHealth = () => { const p = G.player; hpEl.style.width = clamp(p.health, 0, 100) + '%'; arEl.style.width = clamp(G.inv.armour, 0, 100) + '%'; if (p.health <= 0 && bustedT <= 0) { wasted = true; bustedT = 3.2; if (!p.car && !p.ride && !p.swim) { if (!(p.flung > 0)) { p.fvx = p.fvz = 0; p.flSpin = 0; p.flSpinV = 0; } p.flung = 5; }   /* dead on foot: you drop and stay down */ copKill = G.time - (G.copHurtT === undefined ? -99 : G.copHurtT) < 8;   /* brought down by the police: that is an arrest, in the police hospital */ big.textContent = 'WASTED'; big.style.opacity = 1; } };
/* thrown by a hit: vx, vz = how fast the thing that hit you was going */
G.fling = (vx, vz) => { const p = G.player, sp = Math.hypot(vx, vz); if (p.car || p.ride || G.inside || sp < 3) return; p.fvx = vx * .8; p.fvz = vz * .8; p.vy = Math.min(8, 2 + sp * .35); p.y += .05; p.air = true; p.flung = 1.3; G.shake(.7); p.flSpin = 0; p.flSpinV = (Math.random() < .5 ? -1 : 1) * (4 + Math.random() * 4); if (G.blood) G.blood(p.x, p.y + 1, p.z, 5, vx, vz); if (G.physDoll) G.physDoll(p, p.x, p.y, p.z, p.fvx, p.vy, p.fvz, p.yaw); };
G.banner = (t, c) => { if (bustedT > 0) return; big.textContent = t; big.style.color = c || ''; big.style.opacity = 1; setTimeout(() => { if (bustedT <= 0) { big.style.opacity = 0; setTimeout(() => { big.style.color = ''; }, 900); } }, 2600); };
G.onBusted = () => { if (bustedT > 0) return; wasted = false; copKill = false; bustedT = 3.2; big.textContent = 'BUSTED'; big.style.opacity = 1; };
function finishBusted() {
  const p = G.player; big.style.opacity = 0; if (p.doll && G.physUndoll) { G.physUndoll(p); p.h.rotation.set(0, p.yaw, 0); }
  if (p.car) { p.car.vx = p.car.vz = 0; p.car = null; }
  if (p.ride) { p.ride.vx = p.ride.vz = 0; p.ride = null; }
  p.swim = false; p.y = 0; p.flung = 0; clearCops(); if (G.failMission) G.failMission(wasted ? 'you were wasted' : 'you were busted');
  G.inside = null;
  const byCops = wasted && copKill; copKill = false; const took = !wasted && takeStuff();   // only an arrest costs you your weapons; if they kill you, you keep them
  const msg = byCops ? 'The police shot you. You wake up in the police hospital' + (took ? ': they took your weapons, grenades and bullets.' : '.') : wasted ? 'Patched up at the hospital' : 'Released from the police station' + (took ? '. They took your weapons, grenades and bullets.' : '');
  if (G.stat) G.stat(wasted ? 'wasted' : 'busted');
  const jailed = !wasted && G.stars >= 3;   /* a serious arrest means the island prison, a small one the police station */
  const wasWasted = wasted, hx = p.x, hz = p.z;
  if (wasted) { p.x = 115; p.z = -137.6; } else if (jailed) { p.x = p.px = JAIL.yard.x; p.z = p.pz = JAIL.yard.z; p.isle = true; G.jailed = true; } else { p.x = 95; p.z = -73.2; }
  p.y = jailed ? landHeight(p.x, p.z) : 0; if (jailed) { p.yaw = -Math.PI / 2; camYaw = -Math.PI / 2; p.health = 100; hpEl.style.width = '100%'; wasted = false; G.stars = 0; G.lostT = 0; starEls.forEach(s => s.classList.remove('on')); G.hour = (G.hour + 6) % 24; say('Locked up on Prison Island' + (took ? ' (they took your weapons)' : '') + '. The gate is open: walk out, go down to the jetty and take the boat (or swim) east to the city.', 9); setTimeout(() => { if (G.onJailed) G.onJailed(); }, 9600); return; }
  p.y = 0; p.yaw = Math.PI; camYaw = Math.PI; p.health = 100; hpEl.style.width = '100%'; wasted = false;
  G.stars = 0; G.lostT = 0; starEls.forEach(s => s.classList.remove('on')); G.hour = (G.hour + 2) % 24;
  /* you come round inside: in the nearest hospital, or in the police station. Walk out of the door when you are ready */
  if (byCops) { const st = MK.find(m => m.type === 'desk'); if (st) enterRoom('ward', { x: st.x, z: st.z }); }
  else if (wasWasted) { let h = null, bd = 1e9; for (const m of MK) if (m.type === 'clinic') { const d = Math.hypot(m.x - hx, m.z - hz); if (d < bd) { bd = d; h = m; } } if (h) enterRoom('clinic', { x: h.x, z: h.z }); }
  else { const st = MK.find(m => m.type === 'desk'); if (st) enterRoom('desk', { x: st.x, z: st.z }); }
  say(msg, byCops || took ? 7 : 4); saveGame();
}
// minimap
// ----- the big map (M, or tap the small map): the whole of Papillon with every place marked -----
const bm = $('bigmap'), bx = bm.getContext('2d'); let mapOpen = false, mapT = 0, mapS = 1, mapW = 1, mapH = 1; const mv = { cx: 580, cz: 0, k: 1 };
function drawBigMap() {
  const W = bm.width = innerWidth, H = bm.height = innerHeight, s = Math.min(W / 2120, H / 2120) * mv.k; mapS = s; mapW = W; mapH = H;
  const X = x => (x - mv.cx) * s + W / 2, Y = z => (z - mv.cz) * s + H / 2, rect = (c, x0, z0, x1, z1) => { bx.fillStyle = c; bx.fillRect(X(x0), Y(z0), (x1 - x0) * s, (z1 - z0) * s); }, disc = (c, x, z, r) => { bx.fillStyle = c; bx.beginPath(); bx.arc(X(x), Y(z), r * s, 0, 7); bx.fill(); };
  bx.fillStyle = '#3f9cc2'; bx.fillRect(0, 0, W, H);
  rect('#c8bf98', COAST, -1100, 1700, 1100); rect('#ddd4b6', COAST, -612, 241, ZMAX + 16); rect('#d6cfb4', 241, -770, 1220, 770); rect('#d6cfb4', COAST, ZMAX, 1220, 770); rect('#3f9cc2', HARB.x0 - 5, HARB.z0, HARB.x1, HARB.z1);
  rect('#f0e3b2', COAST, ZMIN - 11, -110, -205); rect('#c4c4be', COAST, -611, 241, -411); rect('#55575c', -150, -557, 225, -533); rect('#cfcfca', -180, 195, -20, 400);
  disc('#aaa680', 372, 0, 128); disc('#aaa680', BASE.x, BASE.z, 150); disc('#b9b08a', -330, 330, 60); disc('#b9b08a', -400, -250, 75); disc('#b9b08a', JAIL.x, JAIL.z, 82);
  bx.strokeStyle = '#fff'; bx.lineWidth = Math.max(2, 2 * RH * s); bx.lineCap = 'square'; bx.beginPath();
  for (const q of STRIPS) { bx.moveTo(X(q.x0), Y(q.z0)); bx.lineTo(X(q.x1), Y(q.z1)); }
  bx.stroke();
  bx.strokeStyle = '#f0c23a'; bx.lineWidth = Math.max(3.5, 2.4 * RH * s); bx.beginPath(); for (const q of STRIPS) if (onRing(q.x0, q.z0) && onRing(q.x1, q.z1) && onRing((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2)) { bx.moveTo(X(q.x0), Y(q.z0)); bx.lineTo(X(q.x1), Y(q.z1)); } bx.stroke();   /* the ring road in yellow */
  if (BASE.path) { bx.strokeStyle = '#8c6a3a'; bx.lineWidth = Math.max(3, 7 * s); bx.lineCap = 'round'; bx.lineJoin = 'round'; bx.beginPath(); BASE.path.forEach((q, i) => i ? bx.lineTo(X(q[0]), Y(q[1])) : bx.moveTo(X(q[0]), Y(q[1]))); bx.stroke(); }
  bx.strokeStyle = '#1f8a8a'; bx.lineWidth = 2.5; bx.setLineDash([8, 6]); bx.strokeRect(X(RAIL.x0), Y(RAIL.z0), (RAIL.x1 - RAIL.x0) * s, (RAIL.z1 - RAIL.z0) * s); bx.setLineDash([]);
  bx.textAlign = 'center'; bx.textBaseline = 'middle';
  const label = (t, x, z, c) => { bx.font = '700 ' + Math.max(11, Math.round(15 * s)) + 'px system-ui,sans-serif'; bx.lineWidth = 3; bx.strokeStyle = 'rgba(255,255,255,.85)'; bx.strokeText(t, X(x), Y(z)); bx.fillStyle = c || '#2a2f3a'; bx.fillText(t, X(x), Y(z)); };
  for (const m of markers) { if (m.indoor || m.type === 'goal' || m.car || !FILT[GROUP[m.type] || 'svc']) continue; const px = X(m.x), py = Y(m.z); if (px < -20 || py < -20 || px > W + 20 || py > H + 20) continue;
    const r = Math.max(9, 7 + 2 * s); bx.fillStyle = '#fff'; bx.beginPath(); bx.arc(px, py, r + 2, 0, 7); bx.fill(); disc('#' + m.mesh.material.color.getHexString(), m.x, m.z, r / s); bx.fillStyle = '#fff'; bx.font = '800 ' + Math.round(r * 1.15) + 'px system-ui,sans-serif'; bx.fillText(m.icon || '', px, py + .5); }
  for (const m of markers) if (m.type === 'goal') { bx.fillStyle = '#fff'; bx.beginPath(); bx.arc(X(m.x), Y(m.z), 14, 0, 7); bx.fill(); disc('#35c46a', m.x, m.z, 12 / s); bx.fillStyle = '#fff'; bx.font = '800 15px system-ui,sans-serif'; bx.fillText('!', X(m.x), Y(m.z)); }
  if (G.gps) { const g = G.gps, pts = g.route || [[G.player.x, G.player.z], [g.x, g.z]]; bx.lineJoin = bx.lineCap = 'round'; bx.beginPath(); pts.forEach((q, i) => i ? bx.lineTo(X(q[0]), Y(q[1])) : bx.moveTo(X(q[0]), Y(q[1]))); bx.strokeStyle = '#fff'; bx.lineWidth = 9; bx.stroke(); bx.strokeStyle = '#2a7fff'; bx.lineWidth = 5; bx.stroke();
    const gx = X(g.x), gy = Y(g.z); bx.fillStyle = '#2a7fff'; bx.strokeStyle = '#fff'; bx.lineWidth = 3; bx.beginPath(); bx.moveTo(gx, gy); bx.bezierCurveTo(gx - 15, gy - 16, gx - 13, gy - 36, gx, gy - 36); bx.bezierCurveTo(gx + 13, gy - 36, gx + 15, gy - 16, gx, gy); bx.fill(); bx.stroke(); bx.fillStyle = '#fff'; bx.beginPath(); bx.arc(gx, gy - 24, 4.5, 0, 7); bx.fill(); }
  for (const h of G.helis) { disc('#111', h.x, h.z, Math.max(7, 6 / s)); bx.fillStyle = '#fff'; bx.fillText(h.plane ? '✈' : 'X', X(h.x), Y(h.z)); }
  for (const a of AREAS) if (mv.k >= (a[3] || 0)) label(a[0], a[1], a[2], a[4]);
  const p = G.player, hx = p.car ? p.car.x : p.ride ? p.ride.x : p.x, hz = p.car ? p.car.z : p.ride ? p.ride.z : p.z; bx.save(); bx.translate(X(hx), Y(hz)); bx.rotate(-camYaw + Math.PI); bx.fillStyle = '#e02020'; bx.strokeStyle = '#fff'; bx.lineWidth = 2; bx.beginPath(); bx.moveTo(0, -13); bx.lineTo(9, 10); bx.lineTo(0, 5); bx.lineTo(-9, 10); bx.closePath(); bx.fill(); bx.stroke(); bx.restore();
}
/* ----- map controls: search, filters, mission panel, GPS, zoom and drag ----- */
const AREAS = [['OLD TOWN', 30, -98], ['HARBOUR', -60, 0, 0, '#fff'], ['DOCKS', -100, 300], ['BEACH', -150, -300], ['VILLAS', -60, -228], ['DOWNTOWN', 150, -292], ['AIRPORT', 40, -585], ['OLD ARMY BASE', BASE.x, BASE.z - 30, 0, '#5a3a1a'], ['Dirt road', 330, -195, 0, '#5a3a1a'], ['LIGHTHOUSE', -330, 345], ['PRISON ISLAND', JAIL.x, JAIL.z + 5], ['PALM ISLAND', -400, -235], ['MONUMENT HILL', 372, 20], ['SOUTH END', 150, 360], ['EAST SIDE', 700, 80], ['NORTH QUARTER', 700, -560], ['TOWERS', 910, -300], ['INDUSTRY', 160, 600], ['SOUTH QUARTER', 800, 560], ['RING ROAD', 1000, -1005, 0, '#8a6a10'], ['RING ROAD', 1000, 1005, 0, '#8a6a10'],
  ['GANGSTER VILLA', VILLA.x, VILLA.z - 38, 0, '#7a2a2a'], ['PRESIDENT', RESIDENCE.x, RESIDENCE.z - 30, 0, '#1f3f8a'], ['MILITARY BASE', (ARMY.x0 + ARMY.x1) / 2, ARMY.z1 + 12, 0, '#3a4a1a'], ['THE SILO', SILO.x, SILO.z - 40, 1.4, '#6a5a1a'], ...TOWNS.map(t => [t.name.toUpperCase(), t.x, t.z - 40, 0, '#1f5f3a'])];
const GROUP = { gun: 'shops', bomb: 'shops', cloth: 'shops', spray: 'shops', scrap: 'shops', bar: 'shops', food: 'shops', bank: 'shops', clinic: 'svc', desk: 'svc', garage: 'svc', flat: 'svc', rail: 'svc', silo: 'svc', job: 'jobs', goal: 'jobs', story: 'jobs', rampage: 'jobs', crate: 'loot' };
const FILT = { shops: true, svc: true, jobs: true, loot: true };
const CHIPS = [['shops', 'Shops  G B C S $ F'], ['svc', 'Services  + P H M'], ['jobs', 'Jobs  J !'], ['loot', 'Loot  A']];
const dist2 = (x, z) => { const p = G.player; return Math.round(Math.hypot((p.car ? p.car.x : p.x) - x, (p.car ? p.car.z : p.z) - z)); };
const mName = m => m.type === 'job' ? 'Job point' : m.type === 'rampage' ? 'Rampage' : String(m.text || m.type);
let mTab = 'act';
function goTo(x, z, name, zoom) { setGps(x, z, name); updateGps(0); mv.cx = x; mv.cz = z; mv.k = Math.max(mv.k, zoom || 2.2); drawBigMap(); mapUI(); }
function mapPlaces(q) {
  q = q.trim().toLowerCase(); if (!q) return []; const out = [];
  for (const a of AREAS) if (a[0].toLowerCase().includes(q) && !out.some(o => o.name === a[0])) out.push({ name: a[0], x: a[1], z: a[2], icon: '#', color: '#4a5568' });
  for (const m of markers) { if (m.indoor || m.car || m.type === 'crate') continue; const n = mName(m), hay = (n + ' ' + m.type + ' ' + (m.name || '')).toLowerCase(); if (hay.includes(q)) out.push({ name: n + (m.name ? ' ' + m.name : ''), x: m.x, z: m.z, icon: m.icon || '', color: '#' + m.mesh.material.color.getHexString() }); }
  for (const o of out) o.d = dist2(o.x, o.z); out.sort((a, b) => a.d - b.d); return out.slice(0, 12);
}
const row = (icon, color, name, d, fn) => { const r = document.createElement('div'); r.className = 'mRow'; r.innerHTML = '<b style="background:' + color + '">' + icon + '</b><span></span><i>' + (d !== undefined ? (d >= 1000 ? (d / 1000).toFixed(1) + ' km' : d + ' m') : '') + '</i>'; r.children[1].textContent = name; r.onclick = fn; return r; };
function mapUI() {
  if (!mapOpen) return; const res = $('mRes'), list = $('mList'), q = $('mQ').value;
  const put = (el, kids) => { const k = kids.map(e => e.textContent).join('|'); if (el._k !== k) { el._k = k; el.replaceChildren(...kids); } };   // only touch the page when the text changed, or a click can land on a row that was just replaced
  put(res, mapPlaces(q).map(o => row(o.icon, o.color, o.name, o.d, () => { $('mQ').value = ''; goTo(o.x, o.z, o.name); })));
  const info = missionInfo(), L = [], h = t => { const d = document.createElement('div'); d.className = 'mH'; d.textContent = t; return d; }, note = t => { const d = document.createElement('div'); d.style.cssText = 'opacity:.75;padding:4px'; d.textContent = t; return d; };
  if (mTab === 'act') {
    const goals = markers.filter(m => m.type === 'goal');
    if (info.active) { L.push(h(info.active.name + (info.active.pay ? '  $' + info.active.pay : ''))); L.push(note(info.active.text || 'In progress')); }
    for (const m of goals) L.push(row('!', '#35c46a', mName(m), dist2(m.x, m.z), () => goTo(m.x, m.z, mName(m), 1.6)));
    if (!info.active && !goals.length) L.push(note('No mission running. Walk into a yellow J job point to pick one.'));
  } else if (mTab === 'av') {
    L.push(h('Job points')); const g = info.givers.map(o => Object.assign({ d: dist2(o.x, o.z) }, o)).sort((a, b) => a.d - b.d); for (const o of g) L.push(row('J', '#f2c21a', 'Job point', o.d, () => goTo(o.x, o.z, 'Job point')));
    L.push(h('Jobs you can take')); for (const j of info.jobs) L.push(note(j.name + '  $' + j.pay + ' - ' + j.note));
    const more = markers.filter(m => m.type === 'story' || m.type === 'rampage'); if (more.length) { L.push(h('Story and rampage')); for (const m of more) L.push(row(m.icon || '!', '#' + m.mesh.material.color.getHexString(), mName(m), dist2(m.x, m.z), () => goTo(m.x, m.z, mName(m)))); }
  } else {
    const d = Object.entries(info.done); if (G.inv.story) d.push(['Story missions', G.inv.story]);
    if (!d.length) L.push(note('Nothing finished yet.')); for (const [n, c] of d) L.push(note('✔ ' + n + (c > 1 ? '  x' + c : '')));
  }
  put(list, L);
  const gp = G.gps; $('mGps').style.display = gp ? 'block' : 'none'; if (gp) $('mGt').textContent = 'GPS: ' + gp.name + '  -  ' + (gp.len >= 1000 ? (gp.len / 1000).toFixed(1) + ' km' : Math.round(gp.len) + ' m');
}
function toggleMap(on) { if (!playing || (on && menuOpen)) return; mapOpen = on; bm.style.display = on ? 'block' : 'none'; $('mapui').style.display = on ? 'block' : 'none'; if (on) { const p = G.player; mv.cx = p.car ? p.car.x : p.x; mv.cz = p.car ? p.car.z : p.z; mv.k = 1; if (mv.cx < -480 || mv.cx > 1640 || G.inside) { mv.cx = 580; mv.cz = 0; } drawBigMap(); mapUI(); } else $('mQ').blur(); }
addEventListener('keydown', e => { if (e.target && e.target.id === 'mQ') return; if (e.code === 'KeyM' && !e.repeat) toggleMap(!mapOpen); else if (e.code === 'Escape' && mapOpen) toggleMap(false); });
$('mQ').addEventListener('keydown', e => { e.stopPropagation(); if (e.code === 'Escape') toggleMap(false); else if (e.code === 'Enter') { const r = mapPlaces($('mQ').value)[0]; if (r) { $('mQ').value = ''; goTo(r.x, r.z, r.name); } } });
$('mQ').addEventListener('keyup', e => e.stopPropagation()); $('mQ').addEventListener('input', mapUI);
$('mChips').replaceChildren(...CHIPS.map(([k, t]) => { const c = document.createElement('div'); c.className = 'chip on'; c.textContent = t; c.onclick = () => { FILT[k] = !FILT[k]; c.classList.toggle('on', FILT[k]); drawBigMap(); }; return c; }));
document.querySelectorAll('#mTabs .chip').forEach(c => c.onclick = () => { mTab = c.dataset.t; document.querySelectorAll('#mTabs .chip').forEach(o => o.classList.toggle('on', o === c)); mapUI(); });
$('mX').onclick = () => toggleMap(false); $('mGx').onclick = () => { setGps(null); drawBigMap(); mapUI(); };
const zoomAt = (f, px, py) => { const w0 = [(px - mapW / 2) / mapS + mv.cx, (py - mapH / 2) / mapS + mv.cz], k = Math.min(12, Math.max(.6, mv.k * f)); mv.k = k; const s2 = Math.min(mapW / 2120, mapH / 2120) * k; mv.cx = w0[0] - (px - mapW / 2) / s2; mv.cz = w0[1] - (py - mapH / 2) / s2; drawBigMap(); };
$('mIn').onclick = () => zoomAt(1.5, mapW / 2, mapH / 2); $('mOut').onclick = () => zoomAt(1 / 1.5, mapW / 2, mapH / 2); $('mMe').onclick = () => { const p = G.player; mv.cx = p.car ? p.car.x : p.x; mv.cz = p.car ? p.car.z : p.z; drawBigMap(); };
bm.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.25 : .8, e.clientX, e.clientY); }, { passive: false });
{ const ptr = new Map(); let moved = 0, pinch = 0;
  bm.addEventListener('pointerdown', e => { bm.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; pinch = 0; bm.style.cursor = 'grabbing'; });
  bm.addEventListener('pointermove', e => { const q = ptr.get(e.pointerId); if (!q) return; const dx = e.clientX - q[0], dy = e.clientY - q[1]; ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoomAt(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = d; moved = 99; return; }
    moved += Math.abs(dx) + Math.abs(dy); if (moved > 6) { mv.cx -= dx / mapS; mv.cz -= dy / mapS; drawBigMap(); } });
  const up = e => { const had = ptr.delete(e.pointerId); bm.style.cursor = 'grab'; if (!had || moved > 6) return;   // a tap: set the GPS on the nearest place, or on the spot you touched
    const wx = (e.clientX - mapW / 2) / mapS + mv.cx, wz = (e.clientY - mapH / 2) / mapS + mv.cz; let best = null, bd = (22 / mapS) ** 2;
    for (const m of markers) { if (m.indoor || m.car && m.type !== 'goal' || !FILT[GROUP[m.type] || 'svc']) continue; const d = (m.x - wx) ** 2 + (m.z - wz) ** 2; if (d < bd) { bd = d; best = m; } }
    if (best) goTo(best.x, best.z, mName(best), mv.k); else { setGps(wx, wz, 'Pin'); updateGps(0); drawBigMap(); mapUI(); } };
  bm.addEventListener('pointerup', up); bm.addEventListener('pointercancel', e => { ptr.delete(e.pointerId); }); }
$('map').addEventListener('click', () => toggleMap(true));
const mm = $('map'), mc = mm.getContext('2d'), MS = 150; mm.width = mm.height = MS * 2; mc.scale(2, 2);
function drawMap() {
  const p = G.player, s = .34, px = p.car ? p.car.x : p.x, pz = p.car ? p.car.z : p.z;
  if (G.inside) { mc.fillStyle = '#2a2f3a'; mc.fillRect(0, 0, MS, MS); mc.fillStyle = '#fff'; mc.font = 'bold 15px system-ui,sans-serif'; mc.textAlign = 'center'; mc.textBaseline = 'middle'; mc.fillText('Indoors', MS / 2, MS / 2); return; }
  mc.fillStyle = '#d8cfb8'; mc.fillRect(0, 0, MS, MS); mc.save(); mc.translate(MS / 2 - px * s, MS / 2 - pz * s);
  mc.fillStyle = '#4a9fc0'; mc.fillRect(-3000 * s, -3000 * s, (3000 + COAST) * s, 6000 * s); mc.fillRect(COAST * s, HARB.z0 * s, (HARB.x1 - COAST) * s, (HARB.z1 - HARB.z0) * s);
  mc.fillStyle = '#b9ae96'; mc.fillRect(236 * s, -3000 * s, 3000 * s, 6000 * s); mc.fillRect(COAST * s, -3000 * s, 3000 * s, (3000 - 612) * s); mc.fillRect(COAST * s, (ZMAX + 16) * s, 3000 * s, 3000 * s);
  mc.fillStyle = '#8fbf6a'; mc.fillRect(160 * s, -55 * s, 50 * s, 45 * s);
  if (G.gang.length) for (const g of GANGS) { mc.fillStyle = '#' + g.color.toString(16).padStart(6, '0') + '44'; mc.beginPath(); mc.arc(g.cx * s, g.cz * s, g.r * s, 0, 7); mc.fill(); }
  mc.strokeStyle = '#fff'; mc.lineWidth = 2 * RH * s; mc.lineCap = 'square'; mc.beginPath();
  for (const q of STRIPS) { mc.moveTo(q.x0 * s, q.z0 * s); mc.lineTo(q.x1 * s, q.z1 * s); }
  mc.stroke();
  mc.strokeStyle = '#f0c23a'; mc.beginPath(); for (const q of STRIPS) if (onRing(q.x0, q.z0) && onRing(q.x1, q.z1) && onRing((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2)) { mc.moveTo(q.x0 * s, q.z0 * s); mc.lineTo(q.x1 * s, q.z1 * s); } mc.stroke();   /* the ring road in yellow */
  mc.font = 'bold 8px system-ui,sans-serif'; mc.textAlign = 'center'; mc.textBaseline = 'middle';
  for (const m of markers) { if (m.indoor) continue; mc.fillStyle = '#' + m.mesh.material.color.getHexString(); mc.beginPath(); mc.arc(m.x * s, m.z * s, 5.5, 0, 7); mc.fill(); mc.fillStyle = '#fff'; mc.fillText(m.icon, m.x * s, m.z * s + .5); }
  for (const b of G.boats) { mc.fillStyle = '#1f5fa8'; mc.beginPath(); mc.arc(b.x * s, b.z * s, 3, 0, 7); mc.fill(); }
  for (const h of G.helis) { mc.fillStyle = '#111'; mc.beginPath(); mc.arc(h.x * s, h.z * s, 5.5, 0, 7); mc.fill(); mc.fillStyle = '#fff'; mc.fillText('X', h.x * s, h.z * s + .5); }
  for (const c of G.police) { mc.fillStyle = Math.floor(G.time * 4) % 2 ? '#2050ff' : '#ff2030'; mc.beginPath(); mc.arc(c.x * s, c.z * s, 3.2, 0, 7); mc.fill(); }
  if (G.gps && G.gps.route) { mc.lineJoin = mc.lineCap = 'round'; mc.beginPath(); G.gps.route.forEach((q, i) => i ? mc.lineTo(q[0] * s, q[1] * s) : mc.moveTo(q[0] * s, q[1] * s)); mc.strokeStyle = '#fff'; mc.lineWidth = 5; mc.stroke(); mc.strokeStyle = '#2a7fff'; mc.lineWidth = 3; mc.stroke(); }
  mc.restore();
  if (G.gps) { const dx = (G.gps.x - px) * s, dz = (G.gps.z - pz) * s, L = Math.hypot(dx, dz), R = MS / 2 - 9, k = L > R ? R / L : 1; const gx = MS / 2 + dx * k, gz = MS / 2 + dz * k; mc.fillStyle = '#2a7fff'; mc.beginPath(); mc.arc(gx, gz, 6.5, 0, 7); mc.fill(); mc.strokeStyle = '#fff'; mc.lineWidth = 1.5; mc.stroke(); mc.fillStyle = '#fff'; mc.fillText('>', gx, gz + .5); mc.fillStyle = 'rgba(10,14,24,.7)'; mc.fillRect(MS / 2 - 26, MS - 14, 52, 13); mc.fillStyle = '#fff'; mc.fillText(G.gps.len >= 1000 ? (G.gps.len / 1000).toFixed(1) + ' km' : Math.round(G.gps.len) + ' m', MS / 2, MS - 7.5); }
  for (const m of markers) if (m.type === 'goal') {   /* a job target outside the little map sits on its rim, so you always know which way to go */
    const dx = (m.x - px) * s, dz = (m.z - pz) * s, L = Math.hypot(dx, dz), R = MS / 2 - 9; if (L <= R) continue;
    const gx = MS / 2 + dx / L * R, gz = MS / 2 + dz / L * R; mc.fillStyle = '#35c46a'; mc.beginPath(); mc.arc(gx, gz, 6.5, 0, 7); mc.fill(); mc.strokeStyle = '#fff'; mc.lineWidth = 1.5; mc.stroke(); mc.fillStyle = '#fff'; mc.fillText('!', gx, gz + .5);
  }
  const veh = p.car || p.ride, a = veh ? Math.atan2(-Math.sin(veh.h), Math.cos(veh.h)) : Math.atan2(Math.cos(p.yaw), Math.sin(p.yaw));
  mc.save(); mc.translate(MS / 2, MS / 2); mc.rotate(a); mc.fillStyle = '#111'; mc.beginPath(); mc.moveTo(8, 0); mc.lineTo(-5, 5); mc.lineTo(-2, 0); mc.lineTo(-5, -5); mc.closePath(); mc.fill(); mc.strokeStyle = '#fff'; mc.lineWidth = 1.2; mc.stroke(); mc.restore();
}

/* ---------- player ---------- */
const pp = { x: 0, z: 0 }, FOOT_OFFS = [1.2, 0, -1.2];
function nearestCar(maxD) { const p = G.player; let best = null, bd = maxD; for (const c of G.cars) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } } return best; }
function exitCar() {
  const p = G.player, c = p.car; if (c.v > 7) { say('Slow down to get out', 2); return; }
  const sx = Math.sin(c.h), sz = Math.cos(c.h), opts = [[-1.9 * sx, -1.9 * sz], [1.9 * sx, 1.9 * sz], [-3.4 * Math.cos(c.h), 3.4 * Math.sin(c.h)]];
  for (const o of opts) { const x = c.x + o[0], z = c.z + o[1]; if (!solidAt(x, z)) { p.car = null; p.x = x; p.z = z; p.y = 0; p.yaw = Math.atan2(Math.cos(c.h), -Math.sin(c.h)); p.speed = 0; return; } }
  say('No room to get out here', 2);
}
function nearestOf(list, maxD) { const p = G.player; let best = null, bd = maxD; for (const c of list) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd && Math.abs((c.y || 0) - p.y) < 3) { bd = d; best = c; } } return best; }
function leaveRide() {
  const p = G.player, r = p.ride;
  if (r.train) { if (!(r.stopT > 0) || !r.station) { say('Wait for the next station, then press F', 3); return; } p.ride = null; p.x = r.station.mx + 1.8; p.z = r.station.mz + 1.8; p.y = 0; p.speed = 0; return; }
  if (r.boat) { const l = boatLanding(r); r.vx = r.vz = 0; r.v = 0;
    if (l) { p.ride = null; p.x = l.x; p.z = l.z; p.y = 0; }
    else { const sx = r.x + Math.cos(r.h) * 2.2, sz = r.z - Math.sin(r.h) * 2.2; if (boatBlocked(sx, sz)) { say('No room to jump in here', 2); return; } p.ride = null; p.swim = true; p.x = sx; p.z = sz; p.y = SWIM_Y; say('You jumped in. Swim to a quay to climb out.', 4); } }
  else { if (r.air || r.v > 1.5) { say('Land first', 2); return; } const off = r.plane ? 3.2 : 2.4, bk = r.plane ? -1.5 : 0; p.ride = null; p.x = r.x + Math.sin(r.h) * off + Math.cos(r.h) * bk; p.z = r.z + Math.cos(r.h) * off - Math.sin(r.h) * bk; p.y = r.y; p.vy = 0;
    if (r.y > 2 && solidHeight(p.x, p.z) < r.y - 1) { let ok = false; for (let k = 1; k < 8 && !ok; k++) { const a = r.h + k * Math.PI / 4, x = r.x + Math.sin(a) * 2.4, z = r.z + Math.cos(a) * 2.4; if (solidHeight(x, z) >= r.y - 1) { p.x = x; p.z = z; ok = true; } } if (!ok) { p.x = r.x; p.z = r.z; } }   /* landed on a roof: step out onto the roof, not over the edge */
    p.px = p.x; p.pz = p.z; }
  p.speed = 0;
}
function updateRide(dt) {
  const p = G.player, r = p.ride; if (inp.enter) { inp.enter = false; leaveRide(); if (!p.ride) return; }
  if (r.train) { p.y = 0; }   // the monorail drives itself
  else if (r.boat) { driveBoat(r, inp.my, inp.mx, dt); placeBoat(r); p.y = 0; }
  else { const up = (inp.jump ? 1 : 0) - ((keys.ShiftLeft || keys.ShiftRight || keys.KeyC || tb.down) ? 1 : 0); flyHeli(r, inp.my, inp.mx, up, dt, true); p.y = r.y;
    if (r.attack && inp.punch && !(r.shotCd > G.time)) { r.shotCd = G.time + .45; const cx = Math.cos(r.h), cz = -Math.sin(r.h), sd = (r.salvo = !r.salvo) ? 1.75 : -1.75; fireRocket(r.x + cx * 2 - cz * sd, r.z + cz * 2 + cx * sd, cx, cz, r.y + .8, -.1, false); if (G.sfx) G.sfx.shot(); } }
  if (r.boat && inp.punch && G.driveBy) G.driveBy();   /* a click in a boat: shoot, as from a car */
  p.x = r.x; p.z = r.z; p.speed = r.v; inp.punch = false;
}
function updatePlayer(dt) {
  const p = G.player;
  if (p.ride) { p.swim = false; updateRide(dt); return; }
  if (p.car && p.passenger) { passengerTick(dt); return; }
  if (p.doll && (p.car || p.swim || p.ride || G.inside)) { G.physUndoll(p); p.flung = 0; p.h.rotation.set(0, p.yaw, 0); }
  if (p.flung > 0 && !p.car && !p.swim) {   /* knocked flying (hit by a car, caught in a blast): no control until you have landed and got up */
    const gnd = landHeight(p.x, p.z);
    if (p.doll) {   /* real physics: a tumbling body until it lies still */
      if (G.physDollPose(p, p.h, p)) { G.physUndoll(p); p.h.rotation.set(0, p.yaw, 0); p.y = gnd; p.vy = 0; p.air = false; p.fvx = p.fvz = 0; p.flung = Math.min(p.flung, 1); }
      else { p.y = p.dy; p.air = true; }
      p.speed = 0; p.punchT = 0; p.px = p.x; p.pz = p.z; inp.enter = inp.punch = false; return;
    }
    p.x += p.fvx * dt; p.z += p.fvz * dt; p.vy -= 18 * dt; p.y += p.vy * dt; p.flSpin += p.flSpinV * dt;
    if (p.y <= gnd) { if (p.air && G.sfx && G.sfx.punch) G.sfx.punch(); p.y = gnd; p.vy = 0; p.air = false; const k = Math.pow(.01, dt); p.fvx *= k; p.fvz *= k; p.flung -= dt; } else p.air = true;
    if (inWater(p.x, p.z) && p.y < .3 && gnd < .3) { p.flung = 0; p.swim = true; p.speed = 0; return; }
    if (gnd < .5 || Math.hypot(p.x - BASE.x, p.z - BASE.z) < 60 || Math.hypot(p.x - JAIL.x, p.z - JAIL.z) < 45) { const ox = p.x, oz = p.z; collide(p, G.inside ? .38 : .66); if (p.x !== ox || p.z !== oz) { p.fvx *= .3; p.fvz *= .3; } }
    p.speed = 0; p.punchT = 0; p.px = p.x; p.pz = p.z; inp.enter = inp.punch = false; return;
  }
  if (inp.enter) {
    inp.enter = false;
    if (p.car) exitCar();
    else if (tryDoor()) { /* went in through a shop door */ }
    else { const c = nearestCar(3.7), bt = c ? null : nearestOf(G.boats, 6.5), hl = c || bt ? null : nearestOf(G.helis, 5);
      if (bt) { p.ride = bt; camIdle = 9; say(MOBILE ? 'Stick to steer the boat. Car button to step ashore at a quay.' : 'W/S and A/D steer the boat. F to step ashore at a quay.', 5); }
      else if (hl && hl.plane) { p.ride = hl; camIdle = 9; say(MOBILE ? 'Stick up for throttle. At speed hold Jump to take off. Hit button to descend.' : 'W throttle, S brake, A/D steer. Above 95 km/h hold Space to take off. Shift descends. Keep your speed up!', 9); }
      else if (hl) { p.ride = hl; camIdle = 9; say(MOBILE ? 'Jump button up, Hit button down, stick to fly' : 'Space up, Shift down, W/S forward and back, A/D turn, F to get out after landing', 7); }
      else if (c) { if (takeCar(c)) { p.speed = 0; camIdle = 9; if (G.sfx) G.sfx.door(); say(c.spec.tank ? (MOBILE ? 'A tank! The hit button fires the cannon.' : 'A tank! Left mouse fires the cannon. W/S drive, A/D steer, F get out') : MOBILE ? 'Stick to drive. Brake button for the handbrake. Tap the speed to change the radio.' : 'W/S drive, A/D steer, Space handbrake, N radio, F get out', 5); } else say(c.dead ? 'This car is wrecked' : 'The car is moving too fast', 2); } }
  }
  if (p.car && p.car.dead) { const c = p.car; p.car = null; p.x = c.x - Math.sin(c.h) * 2; p.z = c.z - Math.cos(c.h) * 2; p.speed = 0; }
  if (p.car) {
    const c = p.car, imp = driveCar(c, inp.my, inp.mx, inp.jump, dt);
    if (c.phys) p.y = c.py || 0;   /* real physics places the car */
    else { c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.h; groundCar(c); p.y = c.g.position.y; }
    p.x = c.x; p.z = c.z; p.speed = c.v;
    if (c.spec.bike && !c.phys) { c.g.rotation.order = 'YXZ'; c.lean = (c.lean || 0) + ((c.leanT || 0) - (c.lean || 0)) * Math.min(1, dt * 7); c.g.rotation.x = c.lean; }
    if (c.v > 3) for (const q of G.peds) { if (!q.h.visible) continue; const dx = q.x - c.x, dz = q.z - c.z; if (dx * dx + dz * dz < 4.5 && knockPed(q, c.vx, c.vz)) { if (Math.random() < .5) dropCash(q.x, q.z); if (G.stars < 3) crime(1, true); else crime(G.stars, false); } }
    if (c.v > 3) for (const t of G.targets) { if (!t.person || !t.alive() || t.runCd > G.time) continue; const dx = t.x - c.x, dz = t.z - c.z; if (dx * dx + dz * dz < 5) { t.runCd = G.time + .8; t.hit(c.v * 7, dx, dz); } }
    if (c.v > 3 && G.cops) for (const o of G.cops) { if (o.state === 'down' || o.runCd > G.time) continue; const dx = o.x - c.x, dz = o.z - c.z; if (dx * dx + dz * dz < 5) { o.runCd = G.time + .8; G.hitCop(o, c.v * 7); const d = Math.hypot(dx, dz) || 1; o.x += dx / d * 1.2 + c.vx * .08; o.z += dz / d * 1.2 + c.vz * .08; if (G.sfx && G.sfx.punch) G.sfx.punch(); } }   /* run into a police officer: he is hurt, and a hard hit kills him */
    if (c.spec.tank && inp.punch && !(c.shotCd > G.time)) { c.shotCd = G.time + 1.3; const cx = Math.cos(c.h), cz = -Math.sin(c.h); fireRocket(c.x + cx * 5, c.z + cz * 5, cx, cz, undefined, undefined, true); if (G.sfx) G.sfx.shot(); c.vx -= cx * 1.5; c.vz -= cz * 1.5; }
    if (!c.spec.tank && inp.punch && !p.passenger && G.driveBy) G.driveBy();   /* a click in the car: shoot out of the window */
    inp.punch = false;
    if (imp > 3.5 && G.sfx && !(c.crashCd > G.time)) { c.crashCd = G.time + .35; G.sfx.crash(imp); G.shake(Math.min(1, imp * .06)); }
    if (c.spec.bike && c.phys && imp > 8.5 && !p.passenger) { p.car = null; p.x = c.x; p.z = c.z; p.y = c.py || 0; G.hurt(imp * 1.6); G.fling(c.vx * .9 + Math.cos(c.h) * 3, c.vz * .9 - Math.sin(c.h) * 3); say('You came off the bike!', 2.5); return; }   /* a hard crash on a motorbike throws you off */
    if (imp > 6 && c.hitCar && G.crimeCd <= 0) { G.crimeCd = 5; if (c.hitCar.police) crime(2, true); }   // bumping an ordinary car no longer brings the police; ramming a police car does
    c.hitCar = null;
    return;
  }
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -fz, rz = fx;
  let dx = fx * inp.my + rx * inp.mx, dz = fz * inp.my + rz * inp.mx; const l = Math.hypot(dx, dz);
  let target = 0;
  if (p.swim) {
    // in the water: slower, no fighting, and you climb out wherever there is open ground at the edge
    if (l > .12) { dx /= l; dz /= l; target = (inp.run ? 2.8 : 1.5) * Math.min(1, l); p.yaw += wrapA(Math.atan2(dx, dz) - p.yaw) * Math.min(1, dt * 5); }
    p.speed += clamp(target - p.speed, -6 * dt, 5 * dt);
    if (l > .12) {
      const nx = p.x + dx * p.speed * dt, nz = p.z + dz * p.speed * dt;
      const dkn = harbourDeck(nx + dx * .7, nz + dz * .7);
      if (dkn !== null) { p.swim = false; p.x = nx + dx * .7; p.z = nz + dz * .7; p.y = dkn; p.vy = 0; p.speed = 0; p.pont = true; p.px = p.x; p.pz = p.z; }   // climb onto a pontoon or a moored boat
      else if (!swimBlocked(nx, nz)) { p.x = nx; p.z = nz; }
      else if (!solidAt(nx + dx * .7, nz + dz * .7) && !inWater(nx + dx * .7, nz + dz * .7)) { p.swim = false; p.x = nx + dx * .7; p.z = nz + dz * .7; p.y = landHeight(p.x, p.z); p.vy = 0; p.speed = 0; }
      else if (p.x < COAST) {   // an island shore: wade out where the ground rises
        let done = false; for (let k = 1; k <= 6 && !done; k++) { const ix = nx + dx * k, iz = nz + dz * k; if (landHeight(ix, iz) > .4 || isleY(ix, iz) !== null) { p.swim = false; p.x = p.px = ix; p.z = p.pz = iz; p.y = Math.max(landHeight(ix, iz), isleY(ix, iz) === null ? 0 : isleY(ix, iz)); p.vy = 0; p.speed = 0; p.isle = true; done = true; } }
        if (!done) p.speed = 0; else return;
      }
      else p.speed = 0;
    }
    p.y += (SWIM_Y - p.y) * Math.min(1, dt * 6); p.vy = 0; p.air = false; inp.punch = false; p.punchT = 0; p.shootT = 0;
    return;
  }
  if (inp.jump && p.isle) {   // dive off an island
    const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw); for (let k = 1; k <= 8; k++) { const ix = p.x + hx * k, iz = p.z + hz * k; if (landHeight(ix, iz) < .1 && !swimBlocked(ix, iz)) { p.swim = true; p.isle = false; p.x = ix; p.z = iz; p.speed = 1; return; } }
  }
  // jump off a quay into the water
  if (inp.jump && p.y < .5) { const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw); if (!swimBlocked(p.x + hx * 1.8, p.z + hz * 1.8) && !swimBlocked(p.x + hx * 3, p.z + hz * 3) && !boatAt(p.x + hx * 1.8, p.z + hz * 1.8)) { p.swim = true; p.x += hx * 1.8; p.z += hz * 1.8; p.speed = 1; if (G.sfx && G.sfx.splash) G.sfx.splash(); return; } }
  if (l > .12) { dx /= l; dz /= l; target = (inp.run && !G.aim ? 5.4 : 1.5) * Math.min(1, l); /* plain = walk, Shift = sprint */ if (!G.aim) p.yaw += wrapA(Math.atan2(dx, dz) - p.yaw) * Math.min(1, dt * 9); }
  if (G.aim) p.yaw += wrapA(camYaw - p.yaw) * Math.min(1, dt * 14);   // aiming: face where you look, sidestep instead of turning
  p.speed += clamp(target - p.speed, -13 * dt, (p.speed < 1.5 ? 7 : 10) * dt);   /* eases into a walk, builds up to a sprint, and takes a step or two to stop */
  if (!G.inside && inHedge(p.x, p.z)) p.speed = Math.min(p.speed, 1.1);   /* wading through a hedge */
  if (l > .12) { p.x += dx * p.speed * dt; p.z += dz * p.speed * dt; }
  p.shootT = Math.max(0, (p.shootT || 0) - dt); p.shootCd = Math.max(0, (p.shootCd || 0) - dt);
  const gdef = GUNS[G.weapon], melee = !!(gdef && gdef.melee), gun = melee ? null : gdef, held = gun && gun.auto && !menuOpen && ((mouseDown && locked) || tb.down || keys.KeyQ);
  if (gun && (inp.punch || held)) { inp.punch = false; if (p.shootCd <= 0 && shoot()) { p.kick = true; p.shootCd = gun.cd; p.shootT = Math.max(.45, gun.cd + .2); p.yaw = camYaw; } }
  if (p.shootT > 0) p.yaw += wrapA(camYaw - p.yaw) * Math.min(1, dt * 14);
  // fist fight: jab, cross, hook. Keep pressing to run the combo; the hook knocks people over
  if (inp.punch) { inp.punch = false; if (p.punchT > 0) p.punchQ = true; else p.punchQ = 2; }
  if (!(p.punchT > 0)) { if (p.comboT > 0) p.comboT -= dt; }
  if (p.punchQ && !(p.punchT > 0) && !(p.punchQ === true && !(p.comboT > 0))) {
    p.step = melee ? 3 : p.comboT > 0 ? ((p.step | 0) + 1) % 3 : 0; p.punchQ = false;
    const s = COMBO[p.step]; p.punchT = s.len; p.punchAge = 0; p.hitDone = false; p.punchClip = s.clip; p.punchTs = s.ts;
    // turn to face the nearest person in front
    let bd = 2.8, by = null; const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw);
    const look = (x, z) => { const qx = x - p.x, qz = z - p.z, d = Math.hypot(qx, qz); if (d < bd && d > .05 && (qx * hx + qz * hz) > d * .1) { bd = d; by = Math.atan2(qx, qz); } };
    for (const q of G.peds) if (q.h.visible && q.state !== 'down') look(q.x, q.z);
    for (const m of G.gang) if (m.state !== 'down') look(m.x, m.z);
    for (const m of G.cops) if (m.state !== 'down') look(m.x, m.z);
    if (by !== null) p.yaw = by;
  } else if (p.punchQ === 2) p.punchQ = false;
  if (p.punchT > 0) {
    p.punchT -= dt; p.punchAge += dt; if (p.punchT <= 0) p.comboT = .55;
    const s = COMBO[p.step | 0];
    if (!p.hitDone && p.punchAge >= s.hit) {
      p.hitDone = true; const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw), reach = s.big ? 2.4 : 1.9;
      for (const q of G.peds) { if (!q.h.visible) continue; const qx = q.x - p.x, qz = q.z - p.z, d = Math.hypot(qx, qz); if (d < reach && (qx * hx + qz * hz) > d * .3 && (s.big ? knockPed(q, hx * 9, hz * 9) : staggerPed(q, p.x, p.z))) { if (G.sfx) G.sfx.punch(); if (s.big) dropCash(q.x + hx * 1.6, q.z + hz * 1.6); crime(1, false); break; } }
      for (const m of G.gang) { if (m.state === 'down') continue; const qx = m.x - p.x, qz = m.z - p.z, d = Math.hypot(qx, qz); if (d < reach && (qx * hx + qz * hz) > d * .3) { hitGang(m, s.dmg, hx, hz); if (G.sfx) G.sfx.punch(); break; } }
      for (const m of G.cops) { if (m.state === 'down') continue; const qx = m.x - p.x, qz = m.z - p.z, d = Math.hypot(qx, qz); if (d < reach && (qx * hx + qz * hz) > d * .3) { G.hitCop(m, s.dmg * 1.5); if (G.sfx) G.sfx.punch(); break; } }
      if (G.onPunch) G.onPunch(p.x, p.z, reach, hx, hz);   // missions that want a punch (knock out the guard)
      if (G.inside) for (const n of G.npcs) { if (!n.h.visible) continue; const qx = n.h.position.x - p.x, qz = n.h.position.z - p.z, d = Math.hypot(qx, qz); if (d < reach && (qx * hx + qz * hz) > d * .3 && G.hitNPC(n, s.dmg * 1.5)) { if (G.sfx) G.sfx.punch(); break; } }
      for (const t of G.targets) { if (!t.person || !t.alive()) continue; const qx = t.x - p.x, qz = t.z - p.z, d = Math.hypot(qx, qz); if (d < reach && (qx * hx + qz * hz) > d * .3) { t.hit(s.dmg * 1.5, hx, hz); if (G.sfx) G.sfx.punch(); break; } }
    }
  }
  if (BRG.on && !G.inside && p.y > 1.2 && Math.abs(p.x - BRG.x) < BRG.L / 2 + BRG.BL && Math.abs(p.z - BRG.z) < BRG.W / 2 + .3 && p.y > bridgeH(p.x, p.z, p.y) - 1.2) { const lim = BRG.W / 2 - .55; p.z = BRG.z + Math.max(-lim, Math.min(lim, p.z - BRG.z)); }   // up on the big bridge: the crash barriers keep you on it
  let gnd = Math.max(landHeight(p.x, p.z, p.y), G.inside ? 0 : kerbH(p.x, p.z));
  const jet = G.inside ? 0 : jettyH(p.x, p.z), iy = G.inside || p.x > COAST ? null : isleY(p.x, p.z); if (iy !== null && iy < gnd) gnd = kerbH(p.x, p.z) || iy; if (jet > gnd) gnd = jet;
  const dk = G.inside || p.y > 1.2 ? null : harbourDeck(p.x, p.z); if (dk !== null) gnd = dk;   /* a pontoon or the deck of a moored boat in the harbour */
  // walking straight at the water's edge: step down onto a pontoon or a boat if one is there, otherwise in you go
  let stepW = 0; if (!G.inside && !p.isle && p.y < .8 && gnd < .3 && l > .12 && dk === null && !jet) { const mx = p.x - p.px, mz = p.z - p.pz, ml = Math.hypot(mx, mz);
    if (ml > .001) { const ax = p.x + mx / ml * .95, az = p.z + mz / ml * .95; if (inWater(ax, az) && !(solidHeight(ax, az) > 0)) { if (harbourDeck(ax, az) !== null) { p.x = ax; p.z = az; stepW = 2; } else if (!swimBlocked(ax, az) && !swimBlocked(ax + mx / ml * 1.2, az + mz / ml * 1.2)) { p.x = ax; p.z = az; stepW = 1; } } } }   /* the prison jetty: a deck over the water you can walk out on, to the boat */
  if (!G.inside && p.y > 2) { const rh = solidHeight(p.x, p.z); if (rh > 0 && p.y >= rh - .7) gnd = Math.max(gnd, rh); }   /* up on a roof (you got there by helicopter): the roof is the ground, until you step off the edge */
  if (inp.jump && p.y <= gnd + .01) p.vy = 5.4;
  p.vy -= 15 * dt; p.y += p.vy * dt; if (p.y < gnd) { if (p.vy < -13 && !p.swim) { G.hurt((-p.vy - 11) * 5); G.shake(.6); } p.y = gnd - p.y < .2 ? Math.min(gnd, p.y + 1.6 * dt) : gnd; p.vy = 0; }   /* a long drop hurts */ p.air = p.y > gnd + .14;
  // islands: you walk down the beach to the water's edge, and one step further you are swimming
  if (p.isle && p.x < COAST && gnd <= .3 && iy === null && !jet) {
    if (!swimBlocked(p.x, p.z)) { p.swim = true; p.isle = false; p.speed = 1; p.y = 0; p.vy = 0; if (G.sfx && G.sfx.splash) G.sfx.splash(); p.px = p.x; p.pz = p.z; return; }
    p.x = p.px; p.z = p.pz; const j2 = G.inside ? 0 : jettyH(p.x, p.z); if (j2 && p.y < j2) { p.y = j2; p.vy = 0; }
  } else if (jet || iy !== null && gnd < .5 && Math.hypot(p.x - JAIL.x, p.z - JAIL.z) >= 45) { /* on the jetty or the open beach: nothing in the way */
  } else if (dk !== null || stepW === 2) { p.pont = true; if (dk !== null && dk > -.8) deckPush(p, .36);   /* standing on a pontoon or a moored boat: nothing in the way */
  } else if (p.pont && !G.inside && inWater(p.x, p.z)) {   /* stepped off it: into the water (or stay, if something is in the way) */
    if (swimBlocked(p.x, p.z)) { p.x = p.px; p.z = p.pz; } else { p.pont = false; p.swim = true; p.speed = Math.min(p.speed, 1.5); p.vy = 0; if (G.sfx && G.sfx.splash) G.sfx.splash(); p.px = p.x; p.pz = p.z; return; }
  } else if (stepW === 1) {
    p.swim = true; p.speed = Math.min(p.speed, 1.5); p.vy = 0; if (G.sfx && G.sfx.splash) G.sfx.splash(); if (!G.swimTold) { G.swimTold = true; say('You are in the water. Swim to a quay wall or a ladder to climb out.', 5); } p.px = p.x; p.pz = p.z; return;   /* walked off the quay: in you go */
  } else if ((gnd < .5 && p.y < 9) || Math.hypot(p.x - BASE.x, p.z - BASE.z) < 60 || Math.hypot(p.x - JAIL.x, p.z - JAIL.z) < 45) collide(p, G.inside ? .38 : .66);   // walls count on flat ground, and up at the army base
  if (!G.inside && p.y > 2.6) roofPush(p, p.y, .42);   /* up on a roof: the stair hut, tanks, pillars and upper storeys are solid */
  if (dk === null && stepW !== 2 && !inWater(p.x, p.z)) p.pont = false;
  if (!p.car && !p.ride) pushNPCs(p);
  p.isle = p.x < COAST && (landHeight(p.x, p.z) > .3 || (!G.inside && (jettyH(p.x, p.z) > 0 || isleY(p.x, p.z) !== null))); p.px = p.x; p.pz = p.z;
  for (const c of G.cars) {
    if (Math.abs(c.x - p.x) > 8 || Math.abs(c.z - p.z) > 8) continue; const cfx = Math.cos(c.h), cfz = -Math.sin(c.h);
    for (const o of (c.spec.offs || FOOT_OFFS)) { const qx = c.x + cfx * o, qz = c.z + cfz * o, ddx = p.x - qx, ddz = p.z - qz, d = Math.hypot(ddx, ddz); if (d < 1.38 && d > .001) { p.x += ddx / d * (1.38 - d); p.z += ddz / d * (1.38 - d); } }
  }
}

/* ---------- camera ---------- */
const tgt = new T.Vector3(), cpos = new T.Vector3(), stgt = new T.Vector3(); let shake = 0; G.shake = a => { shake = Math.min(1.2, Math.max(shake, a)); };
function updateCamera(dt) {
  const p = G.player; let want;
  if (builderOpen) { if (!mouseDown && lookT.id === null) camYaw += dt * .25; tgt.set(p.x, 1.0, p.z); want = 3.5; camPitch = .1; camDist = want; }
  else if (!playing) { camYaw += dt * .04; tgt.set(40, 6, 0); want = 150; camPitch = .42; }
  else if (p.car) { const c = p.car; tgt.set(c.x, 1.5 + c.g.position.y, c.z); want = 8.6 + c.v * .05; camIdle += dt; if (camIdle > 1.2 && c.v > 2) { const fwd = c.vx * Math.cos(c.h) - c.vz * Math.sin(c.h); if (fwd > 0) camYaw += wrapA(c.h + Math.PI / 2 - camYaw) * Math.min(1, dt * 2.6); } camera.fov += (55 + Math.min(14, c.v * .32) - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
  else if (p.ride) { const r = p.ride; tgt.set(r.x, (r.train ? r.y + 2.5 : r.heli ? r.y + 1.8 : .6), r.z); want = r.train ? 20 : r.heli ? 14 : 11; camIdle += dt; if (camIdle > 1.2 && r.v > 2) camYaw += wrapA(r.h + Math.PI / 2 - camYaw) * Math.min(1, dt * 2.2); }
  else {
    // with a gun in hand the camera sits over the right shoulder so the crosshair is clear of your back; right mouse zooms in to aim
    const gdef = GUNS[G.weapon], gunny = !!gdef && !gdef.melee && !p.swim; G.aim = gunny && aimHeld && !G.inside;
    shoulder += ((gunny ? (G.aim ? .62 : .5) : 0) - shoulder) * Math.min(1, dt * 8); G.shoulder = shoulder;
    tgt.set(p.x - Math.cos(camYaw) * shoulder, 1.55 + p.y + (G.aim ? .08 : 0), p.z + Math.sin(camYaw) * shoulder);
    want = G.debug && G.debug.dist ? G.debug.dist : G.inside ? 3.6 : G.aim ? 2.6 : 5.2; camIdle += dt;
    if (camIdle > (MOBILE ? 1.5 : 3) && p.speed > 1 && !G.aim && !G.inside && !(p.shootT > 0)) { const off = wrapA(p.yaw - camYaw); if (Math.abs(off) < 1.9) camYaw += off * Math.min(1, dt * (MOBILE ? 1.4 : .7)); }   /* swing round behind the walker, but not when they walk towards the camera */
    const sv = p.car && !p.car.spec.tank ? p.car.v : (p.ride ? p.ride.v || 0 : 0), fov = G.aim ? (G.weapon === 'sniper' ? 15 : 42) : 55 + Math.min(13, Math.max(0, sv - 12) * .45); { const sl = document.getElementById('speedfx'); if (sl) sl.style.opacity = Math.min(.85, Math.max(0, (sv - 20) / 30)).toFixed(2); } if (Math.abs(camera.fov - fov) > .05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 7); camera.updateProjectionMatrix(); }
  }
  const xh = playing && !p.car && !p.ride && !p.swim && !menuOpen && GUNS[G.weapon] && !GUNS[G.weapon].melee; if (xhEl && xh !== xhEl.shown) { xhEl.shown = xh; xhEl.style.display = xh ? 'block' : 'none'; }
  if (p.car || p.ride) { G.aim = false; G.shoulder = shoulder = 0; }
  if (playing && !builderOpen) { const far = stgt.distanceToSquared(tgt) > 36, k = far ? 1 : Math.min(1, dt * (p.car || p.ride ? 14 : 11)); stgt.x += (tgt.x - stgt.x) * k; stgt.z += (tgt.z - stgt.z) * k; stgt.y += (tgt.y - stgt.y) * (far ? 1 : Math.min(1, dt * 7)); tgt.copy(stgt); } else stgt.copy(tgt);
  const cp = Math.cos(camPitch), ox = -Math.sin(camYaw) * cp, oy = Math.sin(camPitch), oz = -Math.cos(camYaw) * cp;
  let d = want;
  if (playing && tgt.y < 9 && !p.ride && !p.swim && !p.isle) for (let s = .15; s <= 1.001; s += .085) { const x = tgt.x + ox * want * s, z = tgt.z + oz * want * s, y = tgt.y + oy * want * s; if (y < 9 && solidAt(x, z)) { d = Math.max(p.car ? 3 : 1.2, want * (s - .1)); break; } }
  camDist += (d - camDist) * Math.min(1, dt * (d < camDist ? 20 : 4));
  cpos.set(tgt.x + ox * camDist, Math.max(landHeight(tgt.x + ox * camDist, tgt.z + oz * camDist) + .4, tgt.y + oy * camDist), tgt.z + oz * camDist);
  if (G.inside && cpos.y > 2.9) cpos.y = 2.9;
  if (shake > .01) { cpos.x += (Math.random() - .5) * shake * .5; cpos.y += (Math.random() - .5) * shake * .4; cpos.z += (Math.random() - .5) * shake * .5; shake *= Math.pow(.004, dt); }
  camera.position.copy(cpos); camera.lookAt(tgt.x, tgt.y + .25, tgt.z);
}

/* ---------- loop ---------- */
const clock = new T.Clock(); let frameN = 0, ready = false, saveT = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05); if (!ready) return;
  const t0 = performance.now(); sim(dt); updateSound(); const t1 = performance.now();
  if (fancy) { if (!composer) { try { buildComposer(); } catch (e) { fancy = false; console.warn('fine graphics unavailable', e); } } }
  renderer.info.reset();
  renderer.shadowMap.autoUpdate = false; G.shSk = (G.shSk || 0) + 1; renderer.shadowMap.needsUpdate = G.perf.frame < 14 || (G.perf.frame < 24 ? G.shSk % 2 === 0 : G.shSk % 3 === 0);   // on a slow PC the shadows are redrawn every second frame instead of every frame
  if (fancy && composer) { bloom.strength = .2 + .28 * (G.night || 0); composer.render(dt); } else renderer.render(scene, camera);
  const t2 = performance.now(); let t3 = t2;
  if (G.perfOn) { try { renderer.getContext().finish(); } catch (e) { } t3 = performance.now(); }   // only while the F3 panel is open: wait for the graphics card, so its time is counted too
  { const now = performance.now(), gap = now - (G.lastFrameT || now); G.lastFrameT = now; G.lastGap = gap;
    G.sess = G.sess || { n: 0, t: 0, over: 0, lost: 0 }; if (gap < 3000 && !document.hidden) { G.sess.n++; G.sess.t += gap; if (gap > 70) { G.sess.over++; G.sess.lost += gap; } }
    if (gap > 70 && gap < 3000 && !document.hidden && G.hitches.length < 120) { const ri = renderer.info; G.hitches.push(Math.round(G.time) + 's: ' + Math.round(gap) + ' ms (logic ' + Math.round(t1 - t0) + ', drawing ' + Math.round(t2 - t1) + ') ' + (G.inside ? 'inside ' + G.inside.name : 'outside') + ', ' + (G.peds ? G.peds.length : 0) + ' people, ' + (G.cars ? G.cars.length : 0) + ' cars, ' + ri.render.calls + ' calls, ' + (G.player && G.player.car ? 'driving ' + Math.round(G.player.car.v || 0) : 'on foot') + ', shapes ' + ri.memory.geometries + ', stars ' + G.stars); } }
  if (playing && !G.qManual && (G.autoQ || 0) < 2 && G.quality !== 'low') {   // steady slowness: one step down in quality (at most twice); F6 sets it by hand and stops this
    G.playT = (G.playT || 0) + dt; const gapMs = G.lastGap || 0;
    if (G.playT > 25) { G.slowT = (G.slowT || 0) + (gapMs > 28 && gapMs < 250 ? .033 : -.02); if (G.slowT < 0) G.slowT = 0; }   // not in the first seconds, and a single freeze does not count
    if (G.slowT > 7) { G.autoQ = (G.autoQ || 0) + 1; G.slowT = 0; G.playT = 0; const q = QORDER[QORDER.indexOf(G.quality) - 1]; applyQuality(q, true); say('Slow PC: graphics set to ' + QNAME[q] + '. F6 changes it', 6); }
  }
  const P = G.perf; P.sim += (t1 - t0 - P.sim) * .05; P.draw += (t2 - t1 - P.draw) * .05; P.gpu += (t3 - t2 - P.gpu) * .05; P.frame += (dt * 1000 - P.frame) * .05;
  if (G.perfOn) perfPanel(); else if (perfBox) { perfBox.remove(); perfBox = null; }
}

/* ---------- F3: live numbers, F4: find out what is slow ---------- */
addEventListener('keydown', e => { if (e.code === 'F3' && !e.repeat) { e.preventDefault(); G.perfOn = !G.perfOn; } if (e.code === 'F4' && !e.repeat) { e.preventDefault(); runBench(); } });
let benching = false;
async function runBench() {
  if (benching || !ready) return; benching = true; G.perfOn = true;
  const sun = []; scene.traverse(o => { if (o.isDirectionalLight && o.castShadow) sun.push(o); });
  const pts = []; scene.traverse(o => { if ((o.isPointLight || o.isSpotLight) && o.visible) pts.push(o); });
  const wasFancy = fancy, wasPR = renderer.getPixelRatio();
  const frames = n => new Promise(res => { let k = 0; const f = () => { if (++k >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const measure = async () => { await frames(40); const a = performance.now(); await frames(90); return (performance.now() - a) / 90; };   // let it settle, then time 90 frames
  const steps = [
    ['everything as you play now', () => { }, () => { }],
    ['fine graphics OFF', () => { fancy = false; }, () => { fancy = wasFancy; }],
    ['fine graphics off + shadows off', () => { fancy = false; for (const l of sun) l.castShadow = false; }, () => { fancy = wasFancy; for (const l of sun) l.castShadow = true; }],
    ['fine graphics off + street and car lights off', () => { fancy = false; for (const l of pts) l.visible = false; }, () => { fancy = wasFancy; for (const l of pts) l.visible = true; }],
    ['fine graphics off + half the pixels', () => { fancy = false; renderer.setPixelRatio(wasPR / 2); }, () => { fancy = wasFancy; renderer.setPixelRatio(wasPR); }],
  ];
  const out = []; let base = 0;
  for (const [name, on, off] of steps) {
    G.benchNote = 'Testing: ' + name + ' ...'; on(); const ms = await measure(); off(); if (!base) base = ms;
    out.push(name + ': ' + (1000 / ms).toFixed(0) + ' frames/s (' + ms.toFixed(1) + ' ms)');
  }
  await frames(20); G.benchText = out.join('\n'); G.benchNote = ''; benching = false;
  if (G.showReport) G.showReport();
}
G.hitches = []; G.perf = { sim: 0, draw: 0, gpu: 0, frame: 16 }; G.perfOn = false; let perfBox = null, perfT = 0;
function perfPanel() {
  if (!perfBox) { perfBox = document.createElement('pre'); perfBox.style.cssText = 'position:fixed;left:8px;top:8px;z-index:55;margin:0;padding:8px 10px;background:rgba(0,0,0,.72);color:#9fe7a6;font:12px ui-monospace,Consolas,monospace;border-radius:8px;pointer-events:none;white-space:pre'; document.body.appendChild(perfBox); }
  if (G.time - perfT < .4) return; perfT = G.time; const P = G.perf, i = renderer.info.render;
  perfBox.textContent = 'F3 performance\n' + (1000 / Math.max(1, P.frame)).toFixed(0) + ' frames/s  (' + P.frame.toFixed(1) + ' ms per frame)\nGame logic: ' + P.sim.toFixed(1) + ' ms\nDrawing, sent: ' + P.draw.toFixed(1) + ' ms\nGraphics card wait: ' + P.gpu.toFixed(1) + ' ms\nDraw calls ' + i.calls + ', triangles ' + (i.triangles / 1000).toFixed(0) + 'k\nFine graphics (K): ' + (fancy && composer ? 'ON' : 'off') + '\n' + (G.benchNote || 'F4 = test what is slow');
}
function sim(dt) {
  G.time += dt; G.hour = (G.hour + dt / 60) % 24; frameN++;
  if (bustedT > 0) { bustedT -= dt; if (bustedT <= 0) finishBusted(); }
  else if (playing) { readInput(); if (menuOpen) { inp.mx = inp.my = 0; inp.run = inp.jump = inp.enter = inp.punch = false; } updatePlayer(dt); }
  G.camYaw = camYaw; G.camPitch = camPitch;
  if (mapOpen) { mapT += dt; if (mapT > .4) { mapT = 0; drawBigMap(); mapUI(); } }
  // only the part of the city around the camera is drawn; the fog hides where it ends
  cullT -= dt; if (cullT <= 0) { cullT = .3; const cx = camera.position.x, cz = camera.position.z, hi = Math.max(0, camera.position.y - 60) * 2; for (const c of G.cells) c.m.visible = Math.hypot(c.x - cx, c.z - cz) - c.r < (c.v || VIEW) + hi; 
    // only people and cars near you cast shadows: far ones are outside the shadow area anyway, and each one costs several draw calls
    { const SR = (MOBILE ? 38 : 52) * 1.2, px = G.player.x, pz = G.player.z, setC = (root, on) => { if (root.userData.shOn === on) return; root.userData.shOn = on; root.traverse(o => { if (o.isMesh) o.castShadow = on; }); };
      for (const q of G.peds) setC(q.h, (q.x - px) ** 2 + (q.z - pz) ** 2 < SR * SR);
      for (const c of G.cars) setC(c.g, (c.x - px) ** 2 + (c.z - pz) ** 2 < (SR + 6) * (SR + 6)); } }
  if (playing) { streamWorld(dt); areaTick(dt); }
  updateRoomLight();
  updateFx(dt); updateBreaks(dt); updateDemolish(dt); updateWater(dt); updateBrigade(dt); updateBlastFx(dt); updateLights(); updateExtras(dt); if (playing) updateNet(dt); updateEstates(dt); updateGps(dt); updateNature(G.player.x, G.player.z, dt, G.Q.nat, G.Q.natS); if (playing) updateMore(dt, camera); updateCars(dt); updatePhysics(dt); if (playing) { updateJobs(dt); updateLair(dt); updateEscape(dt); } { const p = G.player, c = p.car; if (c && c.phys && !p.passenger) { p.x = c.x; p.z = c.z; p.y = c.py || 0; p.speed = c.v; } } updatePeds(dt); updateCraft(dt); updateNPCs(dt); updatePuffs(dt); updateGangs(dt); updateCops(dt); updateTrain(dt); if (playing) { updatePolice(dt); updateCash(dt); updateMarkers(dt); updateMissions(dt); updateTracers(dt); saveT += dt; if (saveT > 20) { saveT = 0; saveGame(); } } animPlayer(dt);
  updateCamera(dt);
  if (G.tipsy > G.time) { const k = Math.min(1, (G.tipsy - G.time) / 40); camera.rotateZ(Math.sin(G.time * 1.1) * .045 * k); camera.rotateY(Math.sin(G.time * .7) * .03 * k); }   /* a drink too many */
  G.skyUpdate(dt, G.hour, tgt, camera); if (!MOBILE || frameN % 2 === 0) G.seaUpdate(G.time); G.wheelUpdate(dt);
  if (playing) {
    const p = G.player;
    if (hintT > 0) { hintT -= dt; if (hintT <= 0) say(''); }
    else if (!p.car && !p.ride) { const c = nearestCar(3.7) || nearestOf(G.boats, 6.5) || nearestOf(G.helis, 5); let t = c ? (MOBILE ? 'Tap the car button to get in' : 'Press F to get in') : '';
      if (!t && !p.swim && !G.inside && p.y < .6) { const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw); if (inWater(p.x + hx * 2.4, p.z + hz * 2.4) && !inWater(p.x, p.z) && !swimBlocked(p.x + hx * 1.8, p.z + hz * 1.8)) t = MOBILE ? 'Jump button: dive in and swim' : 'Press Space to dive in and swim'; }   /* at the edge of a quay */ if (hint.textContent !== t) { hint.textContent = t; hint.style.opacity = t ? 1 : 0; } }
    else if (hint.textContent) { hint.textContent = ''; hint.style.opacity = 0; }
    if (frameN % 3 === 0) {
      drawMap(); const h = Math.floor(G.hour), m = Math.floor((G.hour - h) * 60); clockEl.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      const veh = p.car || p.ride; speedEl.style.opacity = veh ? 1 : 0; if (veh) speedEl.textContent = Math.round(veh.v * 3.6) + ' km/h' + (veh.heli ? '  ' + Math.round(veh.y) + ' m' : '');
      const fl = G.stars > 0 && G.lostT > 0 && Math.floor(G.time * 3) % 2 === 0; $('stars').classList.toggle('flash', fl);
    }
  }
}
frame();

/* ---------- start-up ---------- */
async function boot() {
  const bar = $('bar'), status = $('status');
  const models = await loadModels(f => { bar.style.width = Math.round(f * 80) + '%'; });
  status.textContent = 'Building the city'; await new Promise(r => setTimeout(r, 30));
  buildWorld(scene, models); buildSea(scene); buildWheel(scene); buildSky(scene, renderer);
  bar.style.width = '90%'; await new Promise(r => setTimeout(r, 30));
  const saved = loadGame(); applySave(saved); if (!saved) G.money = 300;
  prepPeople(models);
  G.look = cleanLook(saved && saved.look ? saved.look : (saved ? defaultLook(saved.sex) : null));
  makePlayer(G.look); setupShops(); setupMissions(); setupCraft(scene); setupTrain(scene);
  // if your account holds a newer save than this device (you played somewhere else), take that one
  initCloud().then(remote => {
    const local = loadGame(); if (!remote || (remote.at || 0) <= ((local && local.at) || 0)) return;
    storeLocal(remote); applySave(remote); G.look = cleanLook(remote.look ? remote.look : defaultLook(remote.sex)); makePlayer(G.look);
    if (!hasGun(G.weapon)) G.weapon = 'fist'; if (G.onMoney) G.onMoney(); if (G.onWeapon) G.onWeapon(); say('Loaded your save from your account', 4);
  });
  G.enterRoom = enterRoom; G.setCam = (y, pt) => { camYaw = y; camPitch = pt; };
  G.openBuilder = openBuilder; setupInteriors(scene, { gun: gunMenu, bed: bedMenu, wardrobe: openBuilder, food: foodMenu, clinic: clinicMenu, desk: deskMenu, armoury: armouryMenu, bar: barMenu, cloth: clothMenu });
  setupGangs(MOBILE ? 5 : 9, MOBILE);   // the Iron Wolves, always armed, in the old army base
  if (saved) { $('play').textContent = 'Continue'; $('look').textContent = 'Change your look'; $('wipe').style.display = 'inline'; }
  makeTraffic(MOBILE ? 12 : 48, MOBILE ? 20 : 70); makePeds(MOBILE ? 18 : 100);
  { const t = newCar('tank'); t.x = -140; t.z = 357.5; t.h = 0; t.g.position.set(t.x, 0, t.z); G.dockTank = t; }   // an army tank left in the docks, yours if you find it
  setupEscape(); setupLair(scene); setupEstates(scene);   // Victor, the old bridge and the hide-out under it (before the physics, so its walls are solid there too)
  status.textContent = 'Starting the physics'; await initPhysics(); setupJobs(scene);
  { let q = null; try { q = localStorage.getItem('papillon.quality'); let old = localStorage.getItem('papillon.fancy'); if (!q && old === '0') q = 'med'; } catch (e) { } applyQuality(QUAL[q] ? q : MOBILE ? 'low' : 'high', false); }
  status.textContent = 'Preparing the graphics'; await new Promise(r => setTimeout(r, 30));
  try {   // draw everything once, even what is out of view, so nothing has to be sent to the graphics card in the middle of the game
    sim(.001);   // one step first: the fire, flash and headlamp lights are created in it, and they must exist before the programs are made
    const undo = warmUpActors(), undoNat = warmNature(), cul = [], hid = []; scene.traverse(o => { if (o.frustumCulled) { cul.push(o); o.frustumCulled = false; } });
    for (const c of G.cells) if (!c.m.visible) { hid.push(c.m); c.m.visible = true; }   // the far parts of the city too: they are hidden until you get near, and would freeze the game when they first show
    if (fancy && !composer) { try { buildComposer(); } catch (e) { fancy = false; } }
    const t = performance.now(); renderer.info.reset(); renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);   // the plain way of drawing (used when fine graphics are off, or get switched off)
    if (fancy && composer) { renderer.shadowMap.needsUpdate = true; composer.render(.016); }
    for (const o of cul) o.frustumCulled = true; for (const o of hid) o.visible = false; undo(); undoNat(); G.warmMs = Math.round(performance.now() - t);
  } catch (e) { console.warn('warm-up failed', e); }
  bar.style.width = '100%'; ready = true; G.ready = true;
  status.textContent = ''; $('load').style.display = 'none'; $('choose').style.display = 'flex';
}
/* ---------- character builder ---------- */
let builderOpen = false;
const bEl = $('builder'), nice = n => /^x[mf]\d+$/.test(n) ? 'Person' : n.replace(/_(Head|Body|Legs|Pants|Feet)$/, '').replace('Formad', 'Formal').replace(/(\d)/, ' $1');
function refreshBuilder() {
  const L = G.look, o = lookOptions(L.sex);
  if (G.PT && G.PT.xm0) bEl.querySelectorAll('.brow').forEach(r => { if (!r.querySelector('.seg') && r.dataset.cat !== 'head') { const sw = r.querySelector('.sw'); r.style.display = sw && (sw.dataset.k === 'top' || sw.dataset.k === 'bottom') ? '' : 'none'; } else if (r.dataset.cat === 'head') r.querySelector('span').textContent = 'Person'; });
  bEl.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.sex === L.sex));
  bEl.querySelectorAll('.brow[data-cat]').forEach(r => { const c = r.dataset.cat, i = o[c].indexOf(L[c]); r.querySelector('b').textContent = nice(L[c]) + '  (' + (i + 1) + '/' + o[c].length + ')'; });
  bEl.querySelectorAll('.sw').forEach(sw => { const k = sw.dataset.k; sw.querySelectorAll('i').forEach(i => i.classList.toggle('on', (i.dataset.v === 'null' ? null : +i.dataset.v) === L[k])); });
}
function setLook(fn) { fn(G.look); makePlayer(G.look); refreshBuilder(); }
bEl.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { if (b.dataset.sex !== G.look.sex) { const keep = G.look; G.look = defaultLook(b.dataset.sex); G.look.skin = keep.skin; G.look.hair = keep.hair; G.look.top = keep.top; G.look.bottom = keep.bottom; makePlayer(G.look); refreshBuilder(); } }));
bEl.querySelectorAll('.brow[data-cat]').forEach(r => r.querySelectorAll('.arr').forEach(a => a.addEventListener('click', () => setLook(L => { const c = r.dataset.cat, o = lookOptions(L.sex)[c], i = o.indexOf(L[c]); L[c] = o[(i + (+a.dataset.d) + o.length) % o.length]; }))));
bEl.querySelectorAll('.sw').forEach(sw => {
  const k = sw.dataset.k, list = k === 'skin' ? SKINS : k === 'hair' ? HAIRS : [null].concat(CLOTHS);
  for (const v of list) { const i = document.createElement('i'); i.dataset.v = String(v); if (v === null) { i.className = 'orig'; i.title = 'Original colours'; } else i.style.background = '#' + v.toString(16).padStart(6, '0'); i.addEventListener('click', () => setLook(L => { L[k] = v; })); sw.appendChild(i); }
});
$('bRandom').addEventListener('click', () => setLook(L => { const o = lookOptions(L.sex), r = a => a[Math.floor(Math.random() * a.length)]; L.head = r(o.head); L.body = r(o.body); L.legs = r(o.legs); L.feet = r(o.feet); L.skin = r(SKINS); L.hair = r(HAIRS); L.top = r([null].concat(CLOTHS)); L.bottom = r([null].concat(CLOTHS)); }));
function openBuilder() {
  builderOpen = true; $('start').style.display = 'none'; bEl.style.display = 'block'; camYaw = G.player.yaw + Math.PI + .5;
  if (playing) { menuOpen = true; try { document.exitPointerLock(); } catch (e) { } }
  $('bPlay').textContent = playing ? 'Done' : 'Play';
  camera.setViewOffset(innerWidth, innerHeight, -innerWidth * .17, 0, innerWidth, innerHeight); refreshBuilder();
}
$('look').addEventListener('click', openBuilder);
$('bPlay').addEventListener('click', () => startGame());
function startGame() {
  if (builderOpen) { builderOpen = false; bEl.style.display = 'none'; camera.clearViewOffset(); }
  if (playing) { menuOpen = false; camPitch = .25; G.onHealth(); saveGame(); return; }
  const home = homeSpot(); if (home) { G.player.x = home.x; G.player.z = home.z; }
  if (!hasGun(G.weapon)) G.weapon = 'fist'; G.onWeapon(); G.onMoney(0); G.onHealth();
  initSound(); saveGame(); startNet();
  playing = true; camYaw = -Math.PI / 2; camPitch = .3; $('start').style.display = 'none'; document.body.classList.add('playing');
  if (!MOBILE) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
  say(MOBILE ? 'Left thumb moves, right thumb looks around' : 'WASD to walk, Shift to run (Caps Lock = always run), Space to jump', 6);
}
$('play').addEventListener('click', () => startGame());
$('wipe').addEventListener('click', () => { wipeGame(); G.money = 300; G.inv.pistol = false; G.inv.guns.length = 0; G.inv.ammo = 0; G.inv.rockets = 0; G.inv.grenades = 0; G.inv.armour = 0; G.inv.flats.length = 0; G.inv.garage.length = 0; G.hour = 9; $('wipe').textContent = 'Saved game cleared'; $('play').textContent = 'Play'; $('look').textContent = 'Create your character'; try { location.reload(); } catch (e) { } });
boot().catch(e => { console.error(e); $('status').textContent = 'Something went wrong while loading: ' + (e && e.message ? e.message : e); });
renderer.info.autoReset = false; G.camera = camera; G.renderer = renderer; initCarEnv(renderer); G.isFancy = () => fancy && !!composer;
G.takeCar = takeCar;
G.debug = { get playing() { return playing; }, setCam(y, p) { camYaw = y; camPitch = p; }, aim(v) { aimHeld = v; }, step(n, dt) { for (let i = 0; i < n; i++) sim(dt || 1 / 60); }, keys, inp };
G.THREE = T; G.roofPushDBG = roofPush; G.solidHeightDBG = solidHeight; window.PAP = G; G.landHDBG = landHeight; G.zoneDBG = zoneAt; G.solidAtDBG = solidAt; G.boatBlockedDBG = boatBlocked; G.HARBDBG = HARB; G.inWaterDBG = inWater; G.markersDBG = markers; G.RAILDBG = RAIL; G.knockPed = knockPed; G.shootDBG = shoot; G.staggerDBG = staggerPed; G.dentDBG = dentCar;
