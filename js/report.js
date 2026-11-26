// Papillon - problem report. Press F2 (or use the Statistics menu) when something looks wrong:
// the game writes down what it knows about itself at that moment, so the problem can be found without guessing.
import { G, MOBILE } from './world.js';
export const BUILD = '2026-11-25 e';

// things that went wrong since the game started (kept short)
const errs = [], note = (kind, t) => { if (errs.length < 40) errs.push(Math.round(performance.now() / 1000) + 's ' + kind + ': ' + String(t).slice(0, 300)); };
addEventListener('error', e => note('error', (e.message || '') + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno));
addEventListener('unhandledrejection', e => note('promise', e.reason && e.reason.message || e.reason));
for (const k of ['warn', 'error']) { const old = console[k]; console[k] = (...a) => { note(k, a.map(v => v && v.message ? v.message : v).join(' ')); old.apply(console, a); }; }
addEventListener('webglcontextlost', () => note('graphics', 'the graphics card dropped the game (context lost)'), true);
addEventListener('webglcontextrestored', () => note('graphics', 'graphics came back (context restored)'), true);

// how smoothly it runs: frames in the last ten seconds
const frames = []; let lastT = performance.now(), hidden = 0;
(function tick() { const t = performance.now(); frames.push(t - lastT); lastT = t; if (frames.length > 600) frames.shift(); requestAnimationFrame(tick); })();
document.addEventListener('visibilitychange', () => { hidden++; });

function gpuName() {
  try { const gl = G.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) { return 'unknown'; }
}
function brokenThings() {   // anything in the scene whose place or size is not a real number (that draws as black boxes or flicker)
  const out = []; let n = 0;
  if (G.scene) G.scene.traverse(m => { n++; const p = m.position, s = m.scale, q = m.quaternion; if (!isFinite(p.x + p.y + p.z + s.x + s.y + s.z + q.x + q.y + q.z + q.w) && out.length < 10) out.push(m.type + ' ' + (m.name || (m.geometry && m.geometry.type) || '')); });
  return { n, out };
}
export function makeReport() {
  const L = [], p = G.player || {}, c = p.car, r1 = v => (typeof v === 'number' ? +v.toFixed(1) : v), add = (k, v) => L.push(k + ': ' + v);
  const fs = frames.slice(-600), avg = fs.reduce((a, b) => a + b, 0) / (fs.length || 1), worst = Math.max(0, ...fs), slow = fs.filter(f => f > 50).length;
  L.push('PAPILLON PROBLEM REPORT'); add('Build', BUILD); add('When', new Date().toString());
  add('Opened from', location.protocol === 'file:' ? 'a file on this computer' : location.host);
  L.push(''); L.push('-- computer --');
  add('Browser', navigator.userAgent); add('Graphics card', gpuName());
  add('Window', innerWidth + ' x ' + innerHeight + ', pixel ratio ' + devicePixelRatio + (MOBILE ? ', phone layout' : ''));
  add('Memory (GB, as the browser reports it)', navigator.deviceMemory || 'not told'); add('Processor threads', navigator.hardwareConcurrency || 'not told');
  L.push(''); L.push('-- how it runs --');
  add('Frames per second (last ' + fs.length + ' frames)', (1000 / avg).toFixed(0)); add('Longest frame', worst.toFixed(0) + ' ms'); add('Frames longer than 50 ms', slow);
  add('Window lost focus / was hidden', hidden + ' times');
  add('Fine graphics (K)', G.isFancy ? (G.isFancy() ? 'ON' : 'off') : 'unknown');
  try { const i = G.renderer.info; add('In graphics memory', i.memory.geometries + ' shapes, ' + i.memory.textures + ' textures'); } catch (e) { }
  try { add('Graphics lost right now', G.renderer.getContext().isContextLost() ? 'YES' : 'no'); } catch (e) { }
  add('Physics', G.physInfo ? JSON.stringify(G.physInfo()) : 'not loaded (simple driving)');
  { const P = G.perf || {}, ri = G.renderer && G.renderer.info; L.push(''); L.push('-- what costs time (F3 shows it live, F4 tests it) --');
    add('Per frame (smoothed)', 'game logic ' + (P.sim || 0).toFixed(1) + ' ms, sending the drawing ' + (P.draw || 0).toFixed(1) + ' ms, graphics card wait ' + (P.gpu || 0).toFixed(1) + ' ms (card wait only counts while F3 is open)');
    if (ri) { add('Last frame', ri.render.calls + ' draw calls, ' + Math.round(ri.render.triangles / 1000) + 'k triangles, ' + ri.memory.geometries + ' shapes in memory'); }
    if (G.scene) { let lights = 0, casters = 0, skinned = 0; G.scene.traverse(o => { if (o.isLight && o.visible && (o.isPointLight || o.isSpotLight)) lights++; if (o.isMesh && o.castShadow) casters++; if (o.isSkinnedMesh) skinned++; }); add('Scene', lights + ' point/spot lights on, ' + casters + ' things that cast shadows, ' + skinned + ' animated body parts'); }
    add('Pixel ratio / canvas', (G.renderer ? G.renderer.getPixelRatio() + ' / ' + G.renderer.domElement.width + ' x ' + G.renderer.domElement.height : '?'));
    if (G.sess && G.sess.n) add('Whole session', Math.round(G.sess.t / 1000) + ' s played, average ' + (1000 * G.sess.n / G.sess.t).toFixed(0) + ' frames/s, ' + G.sess.over + ' freezes over 70 ms, ' + (G.sess.lost / 1000).toFixed(1) + ' s lost in freezes' + (G.warmMs ? ', start-up graphics warm-up took ' + G.warmMs + ' ms' : ''));
    L.push(G.hitches && G.hitches.length ? 'Freezes (frames over 70 ms):\n' + G.hitches.join('\n') : 'Freezes (frames over 70 ms): none recorded');
    L.push(G.benchText ? 'Speed test (F4):\n' + G.benchText : 'Speed test (F4): not run yet'); }
  L.push(''); L.push('-- the game right now --');
  add('Game clock', (G.hour || 0).toFixed(2) + ' h, night ' + r1(G.night || 0) + ', weather ' + (G.getWeather ? G.getWeather() : '?') + ', wet ' + r1(G.wet || 0));
  add('Played this session', Math.round(G.time || 0) + ' s'); add('Wanted stars', G.stars);
  add('You', 'x ' + r1(p.x) + ', z ' + r1(p.z) + ', height ' + r1(p.y) + ', health ' + r1(p.health) + ', speed ' + r1(p.speed) + (p.swim ? ', swimming' : '') + (p.flung > 0 ? ', knocked down ' + r1(p.flung) : '') + (p.doll ? ', tumbling body' : '') + (p.ride ? ', in a boat/heli/train' : ''));
  add('Indoors', G.inside ? G.inside.name : 'no'); add('Weapon', G.weapon + (G.aim ? ' (aiming)' : ''));
  add('Camera', G.camera ? 'x ' + r1(G.camera.position.x) + ', y ' + r1(G.camera.position.y) + ', z ' + r1(G.camera.position.z) + ', turn ' + r1(G.camYaw) + ', tilt ' + r1(G.camPitch) : '?');
  if (c) add('Your car', c.type + ', health ' + r1(c.hp) + ', speed ' + r1(c.v) + ', upright ' + r1(c.up === undefined ? 1 : c.up) + ', ' + (c.phys ? (c.phys.vc ? 'real physics with wheels' : 'real physics') : 'simple driving') + (G.physCar && c.phys ? ' ' + JSON.stringify(G.physCar(c)) : ''));
  add('In the world', (G.cars ? G.cars.length : 0) + ' cars (' + (G.aiCount || 0) + ' driving), ' + (G.peds ? G.peds.length : 0) + ' people, ' + (G.police ? G.police.length : 0) + ' police cars, ' + (G.cops ? G.cops.length : 0) + ' officers on foot');
  const b = brokenThings(); add('Things in the scene', b.n); add('Broken things (bad numbers)', b.out.length ? b.out.join(' | ') : 'none');
  { let bad = 0; for (const q of (G.cars || [])) if (!isFinite(q.x + q.z + q.h)) bad++; for (const q of (G.peds || [])) if (!isFinite(q.x + q.z)) bad++; add('Cars or people with a bad position', bad); }
  L.push(''); L.push('-- things that went wrong since the start (' + errs.length + ') --'); L.push(errs.length ? errs.join('\n') : 'nothing recorded');
  if (G.lastSays && G.lastSays.length) { L.push(''); L.push('-- last messages on screen --'); L.push(G.lastSays.join('\n')); }
  return L.join('\n');
}

// show it: a box with the text, a button to copy it and one to save it as a file
let box = null;
export function showReport() {
  const text = makeReport(); if (document.pointerLockElement) document.exitPointerLock();
  if (box) box.remove();
  box = document.createElement('div'); box.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(8,10,16,.82);display:flex;align-items:center;justify-content:center;font:14px system-ui,sans-serif;color:#fff';
  const card = document.createElement('div'); card.style.cssText = 'width:min(760px,94vw);max-height:92vh;display:flex;flex-direction:column;gap:10px;background:#161b26;border-radius:14px;padding:16px';
  const h = document.createElement('div'); h.textContent = 'Problem report. Send this text (or the saved file) together with a few words about what you saw.'; h.style.cssText = 'font-weight:700';
  const ta = document.createElement('textarea'); ta.value = text; ta.readOnly = true; ta.style.cssText = 'width:100%;height:52vh;background:#0c0f16;color:#cfe3ff;border:1px solid #2c3446;border-radius:8px;padding:10px;font:12px ui-monospace,Consolas,monospace;resize:none;box-sizing:border-box';
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';
  const btn = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'padding:10px 16px;border:0;border-radius:8px;background:#2f6fe0;color:#fff;font:600 14px system-ui;cursor:pointer'; b.addEventListener('click', fn); row.appendChild(b); return b; };
  const cp = btn('Copy the text', () => { ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { } if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { cp.textContent = 'Copied'; }, () => { cp.textContent = ok ? 'Copied' : 'Select the text and press Ctrl+C'; }); else cp.textContent = ok ? 'Copied' : 'Select the text and press Ctrl+C'; });
  btn('Save as a file', () => { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = 'papillon-report.txt'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { } });
  const close = btn('Close', () => { box.remove(); box = null; G.reportOpen = false; }); close.style.background = '#3a4254';
  card.appendChild(h); card.appendChild(ta); card.appendChild(row); box.appendChild(card); document.body.appendChild(box); G.reportOpen = true; ta.focus();
  for (const ev of ['keydown', 'keyup', 'mousedown', 'mouseup', 'click', 'wheel']) box.addEventListener(ev, e => e.stopPropagation());
}
addEventListener('keydown', e => { if (e.code === 'F2' && !e.repeat) { e.preventDefault(); if (box) { box.remove(); box = null; G.reportOpen = false; } else showReport(); } });
G.makeReport = makeReport; G.showReport = showReport;
