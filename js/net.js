// Multiplayer: other players, shooting each other, kill messages.
import * as T from 'three';
import { G } from './world.js';
import { newPerson, newCar, playAnim } from './actors.js';

const HOME = 'wss://papillon-game.onrender.com/ws';   // used when the game is opened as a single file
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

let ws = null, myId = 0, started = false, sendT = 0, retry = 0, wasDead = false;
const others = new Map();     // id -> remote player
const badCar = {};            // car types that could not be built
let last = { from: 0, t: -99, w: '' };   // who hurt me last
export const net = { get on() { return !!ws && ws.readyState === 1; }, get count() { return others.size; } };

function wsUrl() { return /^https?:/.test(location.protocol) ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws' : HOME; }
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

function tag(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 7; x.strokeStyle = 'rgba(0,0,0,.8)'; x.strokeText(name, 128, 34); x.fillStyle = '#ffd34a'; x.fillText(name, 128, 34);
  const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.6, .4, 1); s.renderOrder = 10; return s;
}

function addRemote(id, name, look, st) {
  if (others.has(id)) return;
  const sex = look && look.sex === 'w' ? 'pw' : 'pm';
  let p; try { p = newPerson(sex, Object.assign({ sex: sex === 'pw' ? 'w' : 'm' }, look || {})); } catch (e) { console.warn('net: person', e); return; }
  const tg = tag(name); tg.position.set(0, 2.3, 0); p.h.add(tg);
  const r = { id, name, p, tag: tg, x: 0, y: 0, z: 0, yaw: 0, tx: 0, ty: 0, tz: 0, tyaw: 0, hp: 100, w: 'fist', a: 'Idle', sp: 0, car: null, cobj: null, ctype: '', cs: null, got: false, shootT: 0, dead: false, runCd: 0 };
  // a proxy in G.targets lets the normal shooting, punching, run-over and rocket code hurt this player
  r.tgt = {
    get x() { return r.x; }, get z() { return r.z; }, get y() { return r.y; },
    get top() { return r.cobj ? 1.8 : 2; }, get r() { return r.cobj ? 1.3 : .5; },
    get car() { return !!r.cobj; }, get person() { return !r.cobj; },
    alive: () => r.got && r.hp > 0 && r.p.h.parent !== null,
    hit: (d, dx, dz) => send({ t: 'hit', to: id, d: Math.round(d), dx: dx || 0, dz: dz || 0, w: G.weapon })
  };
  G.targets.push(r.tgt);
  if (st) applyState(r, st, true);
  others.set(id, r);
}
function dropRemote(id) {
  const r = others.get(id); if (!r) return;
  const i = G.targets.indexOf(r.tgt); if (i >= 0) G.targets.splice(i, 1);
  G.scene.remove(r.p.h); if (r.cobj) G.scene.remove(r.cobj.g);
  others.delete(id);
}

function applyState(r, s, snap) {
  r.tx = s.x; r.ty = s.y; r.tz = s.z; r.tyaw = s.yaw; r.hp = s.hp; r.w = s.w || 'fist'; r.a = s.a || 'Idle'; r.sp = s.sp || 0; r.cs = s.c || null;
  if (!r.got || snap) { r.x = s.x; r.y = s.y; r.z = s.z; r.yaw = s.yaw; r.got = true; }
}

function setCar(r) {
  const c = r.cs;
  if (!c) { if (r.cobj) { G.scene.remove(r.cobj.g); r.cobj = null; r.ctype = ''; } return; }
  if (r.ctype !== c.k) {
    if (r.cobj) { G.scene.remove(r.cobj.g); r.cobj = null; }
    r.ctype = c.k;
    if (!badCar[c.k]) {
      try { const o = newCar(c.k); const i = G.cars.indexOf(o); if (i >= 0) G.cars.splice(i, 1); o.g.position.set(c.x, c.y, c.z); r.cobj = o; }
      catch (e) { badCar[c.k] = 1; r.cobj = null; }
    }
  }
}

function onMsg(m) {
  if (m.t === 'hello') {
    myId = m.id; for (const o of m.others) addRemote(o.id, o.name, o.look, o.st);
    send({ t: 'join', name: myName(), look: myLook() });
  } else if (m.t === 'join') addRemote(m.id, m.name, m.look);
  else if (m.t === 'bye') { const r = others.get(m.id); if (r && G.say) G.say(r.name + ' left', 3); dropRemote(m.id); }
  else if (m.t === 's') { const r = others.get(m.id); if (r) applyState(r, m); }
  else if (m.t === 'shot') {
    const r = others.get(m.id); if (!r || !m.a || !m.b) return; r.shootT = .5;
    G.tracer(m.a[0], m.a[1], m.a[2], m.b[0], m.b[1], m.b[2]);
    const p = G.player, d = Math.hypot(m.a[0] - p.x, m.a[2] - p.z); if (G.sfx && d < 90) G.sfx.shot(d > 25);
  } else if (m.t === 'hit') {
    last = { from: m.from, t: G.time, w: m.w };
    G.hurt(m.d);
    if (G.player.health > 0 && Math.hypot(m.dx, m.dz) > 0 && m.d >= 60 && G.fling) G.fling(m.dx * 6, m.dz * 6);
  } else if (m.t === 'kill') {
    if (G.say) G.say(m.by ? m.byName + ' killed ' + m.name : m.name + ' died', 5);
  } else if (m.t === 'chat') { if (G.say) G.say(m.name + ': ' + m.msg, 6); }
}

function myName() { try { let n = localStorage.getItem('papillon.name'); if (!n) { n = (window.prompt('Your name for multiplayer:', '') || '').trim().slice(0, 16); if (n) localStorage.setItem('papillon.name', n); } return n || ''; } catch (e) { return ''; } }
function myLook() { const l = G.look || {}; return { sex: l.sex, head: l.head, skin: l.skin, hair: l.hair, top: l.top, bottom: l.bottom }; }

function connect() {
  try { ws = new WebSocket(wsUrl()); } catch (e) { return; }
  ws.onopen = () => { retry = 0; };
  ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch (err) { console.warn('net', err); } };
  ws.onclose = () => {
    for (const id of [...others.keys()]) dropRemote(id);
    ws = null; retry = Math.min(retry + 1, 6); setTimeout(connect, 1500 * retry);
  };
  ws.onerror = () => { };
}

export function startNet() {
  if (started) return; started = true;
  G.netShot = (x0, y0, z0, x1, y1, z1) => send({ t: 'shot', a: [x0, y0, z0].map(v => +v.toFixed(2)), b: [x1, y1, z1].map(v => +v.toFixed(2)), w: G.weapon });
  G.netDBG = others; connect();
}

export function sendChat(msg) { send({ t: 'chat', msg }); }

export function updateNet(dt) {
  if (!started) return;
  const p = G.player;
  // my own state, 12 times a second
  sendT -= dt;
  if (sendT <= 0 && net.on && p) {
    sendT = 1 / 12;
    const v = p.car || p.ride, s = { t: 's', x: +p.x.toFixed(2), y: +(p.y || 0).toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2), a: p.cur || 'Idle', sp: +(p.speed || 0).toFixed(2), w: G.weapon, hp: Math.round(p.health) };
    if (v && v.g && v.type) s.c = { k: v.type, x: +v.g.position.x.toFixed(2), y: +v.g.position.y.toFixed(2), z: +v.g.position.z.toFixed(2), h: +v.g.rotation.y.toFixed(2), rx: +v.g.rotation.x.toFixed(2), rz: +v.g.rotation.z.toFixed(2) };
    send(s);
  }
  // my death: tell everybody who got me
  if (p) {
    if (p.health <= 0 && !wasDead) { wasDead = true; send({ t: 'kill', by: G.time - last.t < 10 ? last.from : 0, w: last.w }); }
    else if (p.health > 0) wasDead = false;
  }
  // the others
  const k = 1 - Math.exp(-dt * 12);
  for (const r of others.values()) {
    if (!r.got) continue;
    const far = Math.hypot(r.tx - r.x, r.tz - r.z) > 15;
    if (far) { r.x = r.tx; r.y = r.ty; r.z = r.tz; r.yaw = r.tyaw; }
    else { r.x += (r.tx - r.x) * k; r.y += (r.ty - r.y) * k; r.z += (r.tz - r.z) * k; r.yaw += wrapA(r.tyaw - r.yaw) * k; }
    setCar(r);
    const h = r.p.h, dead = r.hp <= 0;
    if (r.cobj) {
      const c = r.cs, g = r.cobj.g; g.visible = true; g.rotation.order = 'YXZ';
      g.position.set(r.x, c.y, r.z); g.rotation.set(c.rx || 0, c.h || 0, c.rz || 0);
      r.cobj.x = r.x; r.cobj.z = r.z; r.cobj.h = c.h || 0;
      h.visible = false;
    } else {
      h.visible = true; h.position.set(r.x, r.y, r.z); h.rotation.y = r.yaw;
      r.shootT = Math.max(0, r.shootT - dt);
      const armed = r.w !== 'fist' && r.w !== 'bat';
      for (const g in r.p.guns) r.p.guns[g].visible = armed && g === r.w && !dead;
      if (dead) playAnim(r.p, 'Death', true, 1.5);
      else playAnim(r.p, r.a, /^(Death|Punch)/.test(r.a), /^Run/.test(r.a) ? clamp(r.sp / 2.9, .8, 1.5) : /^Walk/.test(r.a) ? clamp(r.sp / 1.05, .8, 1.5) : undefined);
      r.p.mixer.update(dt);
    }
    r.tag.visible = !dead;
  }
}
