// Papillon - sound made in the browser (no audio files): engine, siren, shots, hits, cash
import { G } from './world.js';

let ctx = null, master, engOsc, engGain, sirOsc, sirGain, noise, scrGain = null, rainGain = null, stepT = 0, lastX = 0, lastZ = 0;
// a steady hiss shaped by a filter: tyres squealing (narrow, high) and rain (wide, soft)
function hiss(type, freq, q) { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start(); return g; }
export function initSound() {
  if (ctx) return;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
  master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination);
  engOsc = ctx.createOscillator(); engOsc.type = 'sawtooth'; engOsc.frequency.value = 50;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  engGain = ctx.createGain(); engGain.gain.value = 0; engOsc.connect(lp); lp.connect(engGain); engGain.connect(master); engOsc.start();
  sirOsc = ctx.createOscillator(); sirOsc.type = 'triangle'; sirGain = ctx.createGain(); sirGain.gain.value = 0; sirOsc.connect(sirGain); sirGain.connect(master); sirOsc.start();
  const n = ctx.sampleRate * .5; noise = ctx.createBuffer(1, n, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  scrGain = hiss('bandpass', 1500, 9); rainGain = hiss('highpass', 2600, .4);
  G.sfx = sfx;
}
export function updateSound() {
  if (!ctx) return; const p = G.player, veh = p.car || p.ride, t = ctx.currentTime, v = veh ? veh.v : 0;
  let g = 0, f = 45;
  if (veh) { if (veh.heli) { g = .2 * (veh.spin || 0); f = 34 + (veh.spin || 0) * 20; } else if (veh.boat) { g = veh.sail ? 0 : .05 + Math.min(.08, v * .005); f = 48 + v * 3; } else { g = .045 + Math.min(.08, v * .004); f = 52 + v * 4.4; } }
  engGain.gain.setTargetAtTime(g, t, .12); engOsc.frequency.setTargetAtTime(f, t, .08);
  // tyres: sliding sideways, or the handbrake on at speed
  { let scr = 0; const c = p.car; if (c && !c.spec.bike && !c.spec.tank && c.v > 5 && (c.up === undefined || c.up > .6) && !(G.physAir && G.physAir(c))) { const side = Math.abs(-c.vx * -Math.sin(c.h) + c.vz * Math.cos(c.h)) ; const lat = Math.abs(c.vx * Math.sin(c.h) + c.vz * Math.cos(c.h)); scr = Math.min(1, Math.max(0, (lat - 3.5) / 7)); if (G.debug && G.debug.keys && G.debug.keys.Space) scr = Math.max(scr, Math.min(1, c.v / 14)); }
    scrGain.gain.setTargetAtTime(scr * .09, t, .06); }
  rainGain.gain.setTargetAtTime(G.inside ? 0 : (G.wet || 0) * .05, t, .4);   // rain
  // footsteps: a soft tap every stride while you walk or run
  if (!p.car && !p.ride && !p.swim && !(p.flung > 0)) { const moved = Math.hypot(p.x - lastX, p.z - lastZ); if (moved < 3) stepT += moved; if (stepT > (p.speed > 3 ? 1.5 : .85) && !p.air) { stepT = 0; burst(.05, p.pont ? 420 : 240, 1.2, p.speed > 3 ? .07 : .04); } } lastX = p.x; lastZ = p.z;
  let near = 1e9; if (G.stars > 0) for (const c of G.police) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < near) near = d; }
  sirGain.gain.setTargetAtTime(near < 110 ? .07 * (1 - near / 110) : 0, t, .15);
  sirOsc.frequency.setTargetAtTime(Math.floor(G.time * 2.2) % 2 ? 880 : 660, t, .03);
  radioTick(!!p.car);
}
/* ---------- car radio: three made-up stations, generated note by note ---------- */
const ST = [
  { name: 'Radio off' },
  { name: 'Harbour FM', bpm: 112, scale: [0, 2, 4, 7, 9], root: 57, bass: [0, 0, 5, 7], wave: 'square', pat: [1, 0, 1, 1, 0, 1, 0, 1] },
  { name: 'Night Drive', bpm: 86, scale: [0, 3, 5, 7, 10], root: 52, bass: [0, -4, -7, -2], wave: 'sawtooth', pat: [1, 0, 0, 1, 0, 0, 1, 0] },
  { name: 'Sol Radio', bpm: 124, scale: [0, 2, 3, 7, 8], root: 55, bass: [0, 3, 7, 3], wave: 'triangle', pat: [1, 1, 0, 1, 0, 1, 1, 0] }
];
let station = 1, step = 0, nextT = 0, radioGain = null, radioLp = null;
const mf = m => 440 * Math.pow(2, (m - 69) / 12);
function note(freq, t, dur, gain, wave) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = wave; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(radioLp); o.start(t); o.stop(t + dur + .03);
}
function radioTick(on) {
  if (!ctx) return;
  if (!radioGain) { radioLp = ctx.createBiquadFilter(); radioLp.type = 'lowpass'; radioLp.frequency.value = 2400; radioGain = ctx.createGain(); radioGain.gain.value = 0; radioLp.connect(radioGain); radioGain.connect(master); }
  const t = ctx.currentTime, s = ST[station]; radioGain.gain.setTargetAtTime(on && station ? .8 : 0, t, .25);
  if (!on || !station) { nextT = 0; return; }
  const spb = 60 / s.bpm / 2; if (nextT < t) nextT = t + .06;
  while (nextT < t + .25) {
    const i = step % 8, bar = Math.floor(step / 8) % 4, phrase = Math.floor(step / 32);
    if (i % 2 === 0) note(mf(s.root - 12 + s.bass[bar]), nextT, spb * 1.7, .16, 'triangle');
    if (s.pat[i]) { const k = (i * 3 + bar * 2 + phrase * 5 + (i > 3 ? bar : 0)) % s.scale.length; note(mf(s.root + 12 + s.bass[bar] + s.scale[k]), nextT, spb * .95, .045, s.wave); }
    if (i % 4 === 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, nextT); o.frequency.exponentialRampToValueAtTime(45, nextT + .12); g.gain.setValueAtTime(.3, nextT); g.gain.exponentialRampToValueAtTime(.001, nextT + .16); o.connect(g); g.connect(radioGain); o.start(nextT); o.stop(nextT + .2); }
    if (i % 2 === 1) { const n = ctx.createBufferSource(); n.buffer = noise; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000; const g = ctx.createGain(); g.gain.setValueAtTime(.05, nextT); g.gain.exponentialRampToValueAtTime(.001, nextT + .05); n.connect(hp); hp.connect(g); g.connect(radioGain); n.start(nextT); n.stop(nextT + .07); }
    nextT += spb; step++;
  }
}
/* ---------- spoken lines: what people shout at you is said out loud, with the voices the computer already has ---------- */
let voiceOn = true, lastSpoke = 0, voices = null; try { voiceOn = localStorage.getItem('papillon.voice') !== '0'; } catch (e) { }
export function speak(text) {
  if (!voiceOn || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return; const now = performance.now(); if (now - lastSpoke < 1500) return; lastSpoke = now;
  try {
    if (!voices || !voices.length) voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    const u = new SpeechSynthesisUtterance(text.replace(/["“”]/g, '')); let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;   // the same line always gets the same voice
    if (voices.length) u.voice = voices[Math.abs(h) % voices.length]; u.lang = 'en-GB'; u.pitch = .7 + (Math.abs(h >> 3) % 9) * .1; u.rate = 1.05 + (Math.abs(h >> 7) % 4) * .06; u.volume = .8;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) { }
}
export function voiceToggle() { voiceOn = !voiceOn; try { localStorage.setItem('papillon.voice', voiceOn ? '1' : '0'); } catch (e) { } if (!voiceOn && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); return voiceOn; }
export function radioNext() { station = (station + 1) % ST.length; step = 0; nextT = 0; return ST[station].name; }

function burst(dur, freq, q, gain) {
  if (!ctx) return; const s = ctx.createBufferSource(); s.buffer = noise;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = ctx.createGain(), t = ctx.currentTime; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(bp); bp.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .02);
}
function tone(freq, dur, gain, when) {
  if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + (when || 0);
  o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
}
const sfx = {
  shot(far) { burst(.16, 1500, .8, far ? .18 : .5); burst(.09, 200, .7, far ? .1 : .35); },
  punch() { burst(.09, 240, 1, .5); },
  horn(big) { const f = big ? 220 : 370 + Math.random() * 90; tone(f, .32, .16); tone(f * 1.26, .32, .13); },
  crash(v) { burst(.28, 350, .6, Math.min(.6, .12 + v * .03)); if (v > 7) burst(.22, 4200, 1.5, Math.min(.25, v * .012)); if (v >= 18) { burst(.9, 90, .5, .7); burst(.5, 55, .7, .6); } },   // metal, then breaking glass on a hard one, and a deep boom for an explosion
  splash() { burst(.35, 900, .5, .35); burst(.5, 300, .6, .25); },
  cash() { tone(990, .09, .2); tone(1480, .14, .2, .08); },
  door() { burst(.07, 700, 2, .25); },
  star() { tone(520, .12, .18); tone(390, .2, .18, .12); }
};
