// Papillon - rooms you can walk into: the gun shop and your flat
import * as T from 'three';
import { G, addBox, collide } from './world.js';
import { makeNPC, playAnim, copKey, dressUp } from './actors.js';
import { addMarker, markers, bankMenu, vaultUse } from './shops.js';

const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .85 }, o || {}));
function box(g, w, h, d, mat, x, y, z, solid) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
  if (solid) addBox(g.position.x + x - w / 2, g.position.z + z - d / 2, g.position.x + x + w / 2, g.position.z + z + d / 2, 3);
  return m;
}
const ROOMS = []; let RL = null;
export function updateRoomLight() {
  if (!RL) return; const p = G.player;
  if (!G.inside) { RL.intensity = 0; return; }
  let b = null, bd = 1e9; for (const g of ROOMS) { const d = (g.position.x - p.x) ** 2 + (g.position.z - p.z) ** 2; if (d < bd) { bd = d; b = g; } }
  if (b) { RL.position.set(b.position.x, 2.8, b.position.z); RL.intensity = 26; }
}
// an empty room: floor, ceiling, four walls, a lamp; local origin is the middle of the floor
function room(scene, cx, cz, w, d, wall, floor) {
  const g = new T.Group(); g.position.set(cx, 0, cz); scene.add(g);
  const H = 3.3, wm = M(wall), t = .4;
  box(g, w, .2, d, M(floor), 0, -.1, 0);
  const c = box(g, w + 1, .2, d + 1, M(0xf2efe6), 0, H + .1, 0); c.castShadow = true;
  box(g, w + 2 * t, H, t, wm, 0, H / 2, -d / 2 - t / 2, true); box(g, w + 2 * t, H, t, wm, 0, H / 2, d / 2 + t / 2, true);
  box(g, t, H, d, wm, -w / 2 - t / 2, H / 2, 0, true); box(g, t, H, d, wm, w / 2 + t / 2, H / 2, 0, true);
  box(g, w, .12, .06, M(0xe9e2d0), 0, .06, -d / 2 + .03); box(g, w, .12, .06, M(0xe9e2d0), 0, .06, d / 2 - .03);
  ROOMS.push(g); if (!RL) { RL = new T.PointLight(0xfff0d8, 0, 16, 1.6); scene.add(RL); }   // one lamp for all rooms: it moves to the room you are in (every lamp that exists costs on every surface in the city)
  box(g, .5, .08, .5, M(0xfff6dc, { emissive: 0xffe9b0, emissiveIntensity: 1.2 }), 0, H - .05, 0);
  // door frame on the south wall where the exit is
  box(g, 1.3, 2.3, .08, M(0x5a3b25), 0, 1.15, d / 2 - .02);
  return g;
}

G.rooms = {}; G.inside = null;
export function enterRoom(name, out) {
  const r = G.rooms[name], p = G.player; if (!r) return;
  G.inside = { name, out: { x: out.x, z: out.z } };
  p.x = r.spawn.x; p.z = r.spawn.z; p.y = 0; p.yaw = Math.PI; p.speed = 0; G.setCam(Math.PI, .25);
  for (let k = 0; k < 4; k++) collide(p, .45);   // never arrive inside a bed, a counter or a wall
  for (const m of r.markers) m.inside = Math.hypot(m.x - p.x, m.z - p.z) < 3.2;   // a ring you arrive standing in (the exit) does not fire until you have stepped out of it
  G.say(r.title, 3); if (G.sfx) G.sfx.door();
}
export function leaveRoom() {
  const p = G.player, i = G.inside; if (!i) return;
  G.inside = null; p.x = i.out.x; p.z = i.out.z; p.y = 0; p.speed = 0; if (G.sfx) G.sfx.door();
  for (const m of markers) if (!m.indoor && Math.hypot(m.x - p.x, m.z - p.z) < 2.6) m.inside = true;   // you come out standing in the door ring: it must not pull you straight back in
}

// a person lying on his back on a bed: tipped over from the feet, so the head lands on the pillow (the head end is towards the back wall)
function lieOn(n, x, y, z, dz) { playAnim(n, 'Idle'); n.h.rotation.order = 'YXZ'; n.h.rotation.x = -Math.PI / 2; n.h.position.set(x, y, z); }
export function setupInteriors(scene, menus) {
  /* ----- gun shop ----- */
  {
    const cx = 3000, cz = 0, w = 9, d = 8, g = room(scene, cx, cz, w, d, 0x5d6358, 0x2f2a26);
    const wood = M(0x6a4a2e), dark = M(0x1d1f23), steel = M(0x8a9098, { roughness: .35, metalness: .5 }), red = M(0xa3261e), peg = M(0x3b3f45), glass = M(0xbfe3f2, { transparent: true, opacity: .25, roughness: .05 }), velvet = M(0x6a1620);
    const prop = (w2, h, d2, mat, x, y, z, ry) => { const m = new T.Mesh(new T.BoxGeometry(w2, h, d2), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.receiveShadow = true; g.add(m); return m; };
    const pipe = (r, len, mat, x, y, z, rz) => { const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 8), mat); m.rotation.z = Math.PI / 2 + (rz || 0); m.position.set(x, y, z); g.add(m); return m; };
    // a long gun lying flat on the wall, seen from the front: kind 0 rifle with scope, 1 shotgun, 2 assault rifle
    const longGun = (x, y, z, kind, flip) => {
      const k = flip ? -1 : 1, grp = new T.Group(); grp.position.set(x, y, z); grp.scale.x = k; g.add(grp);
      const add = (w2, h, d2, mat, px, py) => { const m = new T.Mesh(new T.BoxGeometry(w2, h, d2), mat); m.position.set(px, py, 0); grp.add(m); };
      const cy = (r, len, mat, px, py) => { const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 8), mat); m.rotation.z = Math.PI / 2; m.position.set(px, py, 0); grp.add(m); };
      if (kind === 1) { add(.36, .09, .05, wood, -.5, -.02); add(.34, .06, .05, dark, -.2, .02); cy(.016, .7, steel, .3, .03); cy(.014, .62, steel, .27, -.01); add(.32, .07, .05, wood, .15, -.03); }
      else if (kind === 2) { add(.3, .08, .04, dark, -.5, -.03); add(.4, .08, .05, dark, -.15, .02); add(.06, .16, .03, dark, -.05, -.09); cy(.012, .5, steel, .3, .03); add(.3, .06, .05, dark, .1, .0); add(.1, .1, .03, dark, .0, .1); }
      else { add(.34, .09, .05, wood, -.5, -.02); add(.34, .06, .05, dark, -.2, .02); add(.05, .12, .03, dark, -.1, -.07); cy(.011, .66, steel, .28, .03); cy(.018, .26, dark, -.12, .075); }
    };
    const pistol = (x, y, z, ry) => { const grp = new T.Group(); grp.position.set(x, y, z); grp.rotation.y = ry || 0; g.add(grp); const a = (w2, h, d2, mat, px, py) => { const m = new T.Mesh(new T.BoxGeometry(w2, h, d2), mat); m.position.set(px, py, 0); grp.add(m); }; a(.18, .04, .03, steel, 0, .05); a(.04, .1, .03, dark, -.06, -.01); a(.07, .03, .025, dark, .03, .01); };
    // the wall of guns: a pegboard with long guns on rails, three rows
    prop(w - .4, 2.3, .06, peg, 0, 1.85, -d / 2 + .05);
    for (let r = 0; r < 4; r++) { const y = 1.0 + r * .55; prop(w - .6, .04, .06, wood, 0, y - .1, -d / 2 + .12); for (let k = 0; k < 4; k++) longGun(-3.1 + k * 2.05, y, -d / 2 + .13, (r + k) % 3, k % 2); }
    // the long counter: a glass case full of handguns on red velvet, a till on top
    prop(6.2, .9, .8, wood, 0, .45, -1.6).castShadow = true; addBox(cx - 3.1, cz - 2.0, cx + 3.1, cz - 1.2, 3);
    prop(6.3, .05, .9, M(0x2a2c30), 0, .93, -1.6); prop(5.4, .3, .7, glass, -.3, 1.1, -1.6); prop(5.2, .02, .6, velvet, -.3, .96, -1.6);
    for (let k = 0; k < 8; k++) pistol(-2.6 + k * .68, 1.0, -1.6, (k % 2) * .25);
    prop(.5, .3, .4, M(0x3a3d44), 2.7, 1.1, -1.6); prop(.35, .12, .3, M(0x7ad6a0, { emissive: 0x7ad6a0, emissiveIntensity: .6 }), 2.7, 1.28, -1.62);
    // ammo shelves on both side walls: boxes in red, yellow and green
    for (const sd of [-1, 1]) {
      const wx = sd * (w / 2 - .3); prop(.45, 2.0, 3.0, M(0x4a4d53), wx, 1.0, 1.3).castShadow = true; addBox(cx + wx - .25, cz - .2, cx + wx + .25, cz + 2.8, 3);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) prop(.14, .1, .2, M([0xc9a227, 0xb3362e, 0x3f7a4a, 0x2f5f9f][(r + k + (sd > 0 ? 1 : 0)) % 4]), wx - sd * .2, .45 + r * .42, .2 + k * .45);
    }
    // paper targets pinned to the walls, a licence on the wall, a camera in the corner, a safe
    const targetTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'); c.fillStyle = '#efe9d6'; c.fillRect(0, 0, 128, 128); [[60, '#1b1d22'], [46, '#efe9d6'], [32, '#b3362e'], [18, '#efe9d6'], [8, '#b3362e']].forEach(([r, col]) => { c.fillStyle = col; c.beginPath(); c.arc(64, 64, r, 0, 7); c.fill(); }); c.fillStyle = '#1b1d22'; for (const [x, y] of [[64, 60], [70, 66], [58, 70], [66, 52]]) { c.beginPath(); c.arc(x, y, 2, 0, 7); c.fill(); } const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return t; })();
    for (const [z0, y0] of [[2.9, 1.9], [1.3, 2.2]]) { const tg = new T.Mesh(new T.PlaneGeometry(.7, .7), new T.MeshBasicMaterial({ map: targetTex })); tg.position.set(cx + w / 2 - .02, y0, cz + z0 - 2); tg.rotation.y = -Math.PI / 2; scene.add(tg); }
    const lic = new T.Mesh(new T.PlaneGeometry(1.2, .8), new T.MeshBasicMaterial({ map: text('LICENSED DEALER', '#efe9d6', '#2a2f3a') })); lic.position.set(cx - w / 2 + .02, 2.1, cz + .2); lic.rotation.y = Math.PI / 2; scene.add(lic);
    prop(.9, 1.2, .8, M(0x2f3a30, { metalness: .4, roughness: .5 }), w / 2 - .7, .6, -d / 2 + .6, 0).castShadow = true; addBox(cx + w / 2 - 1.15, cz - d / 2 + .2, cx + w / 2 - .25, cz - d / 2 + 1.0, 3);   // the safe
    prop(.3, .2, .2, dark, -w / 2 + .5, 3.0, d / 2 - .4); pipe(.05, .2, dark, -w / 2 + .6, 3.0, d / 2 - .55);
    const sign = new T.Mesh(new T.PlaneGeometry(4.2, .8), new T.MeshBasicMaterial({ map: text('ANCHOR ARMS', '#1b1d22', '#e0b85a') })); sign.position.set(cx, 2.85, cz - d / 2 + .1); scene.add(sign);
    makeNPC('pm', { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', skin: 0xd9a074, hair: 0x3b2516, top: 0x4a5a3a, bottom: 0x2a2a2e }, cx, cz - 2.6, 0);   // the clerk in an olive shirt
    makeNPC('pm', { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', skin: 0x8d5524, hair: 0x101010, top: 0x7a2f1f, bottom: 0x2f3a4a }, cx - 2.6, cz + 1.2, Math.PI / 2);   // a customer looking at the rifles
    const mk = [
      addMarker({ x: cx, z: cz - .4, type: 'in', icon: '', text: 'BUY', color: 0xc9423a, indoor: true, onEnter: menus.gun }),
      addMarker({ x: cx, z: cz + d / 2 - 1, type: 'in', icon: '', text: 'EXIT', color: 0x4a5568, indoor: true, onEnter: leaveRoom })
    ];
    G.rooms.gun = { title: 'Anchor Arms', spawn: { x: cx + 1.6, z: cz + 1.6 }, markers: mk };
  }
  /* ----- cafe ----- */
  {
    const cx = 3000, cz = 120, w = 10, d = 8, g = room(scene, cx, cz, w, d, 0xe9d9b8, 0x8a5a3a);
    const wood = M(0x7a5232), dark = M(0x2a2c30), cream = M(0xf2efe6), red = M(0xb3362e), steel = M(0x9aa0a8, { roughness: .35, metalness: .4 });
    box(g, 6, 1.05, .8, wood, -1, .52, -2, true); box(g, 6.1, .06, .9, cream, -1, 1.08, -2); box(g, .7, .6, .5, steel, -3, 1.4, -2); box(g, 1.6, .5, .6, M(0xcfe6f2, { roughness: .1 }), .6, 1.36, -2);
    for (let i = 0; i < 2; i++) box(g, w - 1, .08, .4, wood, 0, 1.7 + i * .6, -d / 2 + .22);
    for (let k = -5; k <= 5; k++) box(g, .16, .3, .16, k % 2 ? red : cream, k * .8, 1.9, -d / 2 + .22);
    for (const [tx, tz] of [[3, .5], [3, 2.6], [-3.2, 1.6]]) { box(g, .9, .06, .9, wood, tx, .76, tz, true); box(g, .1, .74, .1, dark, tx, .37, tz); for (const s2 of [-1, 1]) { box(g, .42, .05, .42, red, tx + s2 * .85, .36, tz); box(g, .05, .36, .05, dark, tx + s2 * .85, .18, tz); } }
    const sign = new T.Mesh(new T.PlaneGeometry(4.6, .8), new T.MeshBasicMaterial({ map: text('HARBOUR CAFE', '#3a2416', '#f2d9a0') })); sign.position.set(cx, 2.85, cz - d / 2 + .02); scene.add(sign);
    makeNPC('pw', { skin: 0xe0ac7e, hair: 0x4a2f1a, top: 0xb3362e, bottom: null }, cx - 1, cz - 3, 0);
    for (const [sx, sz, yaw, look] of [[3 + .85, .5, -Math.PI / 2, { skin: 0xf1c9a5, hair: 0x7a2f1a, top: 0x2f5f9f }], [3 - .85, .5, Math.PI / 2, { skin: 0x8d5524, hair: 0x101010, top: 0xe0b23a }], [-3.2 + .85, 1.6, -Math.PI / 2, { skin: 0xe0ac7e, hair: 0x8a8a8a, top: 0x30343f }]]) {   // customers at the tables
      const n = makeNPC(sx > 0 && yaw > 0 ? 'pw' : 'pm', Object.assign({ bottom: null }, look), cx + sx, cz + sz, yaw); playAnim(n, 'Sit'); }
    const mk = [addMarker({ x: cx - 1, z: cz - .8, type: 'in', icon: '', text: 'ORDER', color: 0xe08a1f, indoor: true, onEnter: menus.food }), addMarker({ x: cx, z: cz + d / 2 - 1, type: 'in', icon: '', text: 'EXIT', color: 0x4a5568, indoor: true, onEnter: leaveRoom })];
    G.rooms.cafe = { title: 'Harbour Cafe', spawn: { x: cx + 1.6, z: cz + 1.4 }, markers: mk };
  }
  /* ----- hospital ----- */
  {
    const cx = 3000, cz = 180, w = 10, d = 8, g = room(scene, cx, cz, w, d, 0xeef2f0, 0xbfd0d0);
    const white = M(0xf6f6f2), teal = M(0x3f9a9a), dark = M(0x2a2c30), red = M(0xd9463c);
    box(g, 4.4, 1.05, .8, white, 1.8, .52, -2, true); box(g, 4.5, .06, .9, teal, 1.8, 1.08, -2);
    for (const bx of [-3.6, -3.6]) { box(g, 1.1, .5, 2.2, white, bx, .35, -1.6, true); box(g, 1.0, .12, .6, teal, bx, .66, -2.3); }
    box(g, 1.1, .5, 2.2, white, -3.6, .35, 1.3, true); box(g, 1.0, .12, .6, teal, -3.6, .66, .6);
    for (let k = 0; k < 4; k++) { box(g, .5, .36, .5, teal, 4.05, .18, .2 + k * .7);   /* low and set back, so the legs of someone sitting hang in front */ }
    box(g, .9, .22, .06, red, 0, 2.5, -d / 2 + .03); box(g, .22, .9, .06, red, 0, 2.5, -d / 2 + .03);
    makeNPC('pw', { skin: 0xc68642, hair: 0x101010, top: 0xf2f2ee, bottom: 0xf2f2ee }, cx + 1.8, cz - 3, 0);
    // hospital staff and patients: a doctor by the beds, a nurse crossing the room, someone in a bed, people waiting
    makeNPC('pm', { skin: 0xe0ac7e, hair: 0x8a8a8a, top: 0xf6f6f2, bottom: 0x3f6f8f }, cx - 2.4, cz - 1.2, -Math.PI / 2);
    makeNPC('pw', { skin: 0x8d5524, hair: 0x1c1410, top: 0x6fc0c0, bottom: 0x6fc0c0 }, cx - .6, cz + .9, Math.PI * .75);
    { const n = makeNPC('pm', { skin: 0xf1c9a5, hair: 0x7a2f1a, top: 0xbfd0d0, bottom: 0xbfd0d0 }, cx - 3.6, cz + 1.7, 0); lieOn(n, cx - 3.6, .76, cz + 2.3, .6); }   // lying on the bed, head on the pillow
    for (const k of [0, 2]) { const n = makeNPC(k ? 'pw' : 'pm', { skin: k ? 0xc68642 : 0xf1c9a5, hair: 0x101010, top: k ? 0xd98a1f : 0x30343f, bottom: null }, cx + 3.82, cz + .2 + k * .7, -Math.PI / 2); playAnim(n, 'Sit'); }
    const mk = [addMarker({ x: cx + 1.8, z: cz - .8, type: 'in', icon: '', text: 'TREATMENT', color: 0xd9463c, indoor: true, onEnter: menus.clinic }), addMarker({ x: cx, z: cz + d / 2 - 1, type: 'in', icon: '', text: 'EXIT', color: 0x4a5568, indoor: true, onEnter: leaveRoom })];
    G.rooms.clinic = { title: 'Papillon Hospital', spawn: { x: cx - 1.6, z: cz + 1.6 }, markers: mk };
  }
  /* ----- police hospital: the guarded ward at the police station, where you wake up when the police shot you ----- */
  {
    const cx = 3000, cz = 540, w = 9, d = 7, g = room(scene, cx, cz, w, d, 0xdfe6ee, 0x9fb0c2);
    const white = M(0xf6f6f2), navy = M(0x1f3f8a), steel = M(0x8a9199, { metalness: .6, roughness: .4 }), dark = M(0x2a2c30), sheet = M(0xcfe0ee);
    box(g, w, .5, .05, navy, 0, 1.25, -d / 2 + .03); box(g, .05, .5, d, navy, -w / 2 + .03, 1.25, 0); box(g, .05, .5, d, navy, w / 2 - .03, 1.25, 0);   // the blue police stripe round the walls
    box(g, .9, .22, .06, navy, 0, 2.5, -d / 2 + .04); box(g, .22, .9, .06, navy, 0, 2.5, -d / 2 + .04);                                         // a blue cross
    for (const bx of [-3.2, -1.1, 1.0]) { box(g, 1.0, .45, 2.1, white, bx, .32, -2.0, true); box(g, .95, .1, 1.5, sheet, bx, .6, -1.75); box(g, .9, .12, .5, white, bx, .63, -2.75); box(g, 1.0, .9, .06, steel, bx, .7, -3.05); box(g, .04, 1.7, .04, steel, bx + .62, .85, -2.7); box(g, .3, .04, .04, steel, bx + .5, 1.7, -2.7); }   // three beds with a drip stand each
    for (let k = 0; k < 7; k++) box(g, .05, 1.3, .05, steel, 3.0 + k * .16, 1.9, -d / 2 + .06); box(g, 1.2, .06, .08, steel, 3.48, 1.25, -d / 2 + .06); box(g, 1.2, .06, .08, steel, 3.48, 2.55, -d / 2 + .06); box(g, 1.1, 1.3, .02, M(0x9fd0ee, { emissive: 0x6fa8d0, emissiveIntensity: .5 }), 3.48, 1.9, -d / 2 + .03);   // a barred window
    box(g, 1.6, .75, .7, dark, 3.3, .38, 1.6, true); box(g, .5, .36, .5, navy, 3.3, .18, 2.5);                                               // the guard's desk and chair
    dressUp(makeNPC(copKey(), { skin: 0xe0ac7e, hair: 0x3a2a1a, top: 0x1b2a55, bottom: 0x1b2a55 }, cx + 1.3, cz + 2.4, -Math.PI / 2), 'police');                 // an officer on guard by the door
    makeNPC('pw', { skin: 0xc68642, hair: 0x101010, top: 0xf2f2ee, bottom: 0xf2f2ee }, cx - 2.1, cz - .6, Math.PI / 2);                   // the doctor
    { const n = makeNPC('pm', { skin: 0xf1c9a5, hair: 0x101010, top: 0xcfe0ee, bottom: 0xcfe0ee }, cx + 1.0, cz - 2.3, 0); lieOn(n, cx + 1.0, .78, cz - 1.2, 1.1); }   // somebody else they brought in, lying in the bed
    const mk = [addMarker({ x: cx, z: cz + d / 2 - 1, type: 'in', icon: '', text: 'EXIT', color: 0x4a5568, indoor: true, onEnter: leaveRoom })];
    G.rooms.ward = { title: 'Police Hospital', spawn: { x: cx - 1.1, z: cz - .3 }, markers: mk };
  }
  /* ----- the bar ----- */
  {
    const cx = 3000, cz = 420, w = 11, d = 8, g = room(scene, cx, cz, w, d, 0x4a2f2a, 0x2e2420);
    const wood = M(0x5a3a22), dark = M(0x1f2024), brass = M(0xc9a35a, { roughness: .35, metalness: .5 }), green = M(0x2f5a3a), red = M(0x8a2a2a);
    box(g, 7, 1.1, .8, wood, -1, .55, -2, true); box(g, 7.2, .07, 1, dark, -1, 1.13, -2); box(g, 7, .06, .06, brass, -1, .3, -1.56);           // the counter with its brass foot rail
    for (let i = 0; i < 3; i++) box(g, w - 1.5, .07, .35, wood, -.3, 1.6 + i * .55, -d / 2 + .2);                                                   // shelves of bottles behind it
    for (let i = 0; i < 3; i++) for (let k = -8; k <= 7; k++) box(g, .12, .34, .12, [green, red, brass, M(0x8a6a2a), M(0xdfe6ee, { roughness: .1 })][(k + i * 2 + 16) % 5], k * .55 - .2, 1.8 + i * .55, -d / 2 + .2);
    for (let k = 0; k < 5; k++) { box(g, .36, .06, .36, red, -3.6 + k * 1.3, .72, -1.15); box(g, .06, .72, .06, dark, -3.6 + k * 1.3, .36, -1.15); }   // bar stools
    for (const [tx, tz] of [[3.6, .8], [3.6, 2.6], [-3.6, 2.4]]) { box(g, .9, .06, .9, wood, tx, .74, tz, true); box(g, .1, .72, .1, dark, tx, .36, tz); for (const s2 of [-1, 1]) { box(g, .42, .05, .42, red, tx + s2 * .85, .36, tz); box(g, .05, .36, .05, dark, tx + s2 * .85, .18, tz); } }
    box(g, 1.3, 1.3, .08, M(0x16171b), 4.2, 1.9, -d / 2 + .06); for (const r of [.5, .34, .18]) box(g, r * 2, r * 2, .02, r === .34 ? M(0xd8d2c0) : red, 4.2, 1.9, -d / 2 + .11 + (.5 - r) * .02);   // a dartboard
    box(g, 1.1, 1.5, .7, M(0x2a3f8a), -w / 2 + .5, .75, .2, true); box(g, .9, .6, .05, M(0xf2c21a, { emissive: 0xf2c21a, emissiveIntensity: .5 }), -w / 2 + .87, 1.15, .2);   // a jukebox
    const sign = new T.Mesh(new T.PlaneGeometry(4.6, .8), new T.MeshBasicMaterial({ map: text('THE RUSTY ANCHOR', '#2a1a14', '#e0b85a') })); sign.position.set(cx, 2.85, cz - d / 2 + .02); scene.add(sign);
    makeNPC('pm', { skin: 0xe0ac7e, hair: 0x8a8a8a, top: 0x1f2024, bottom: null }, cx - 1, cz - 3, 0);                                             // the barman
    { const n = makeNPC('pm', { skin: 0x8d5524, hair: 0x101010, top: 0x7a3f2a, bottom: null }, cx - 2.3, cz - 1.05, Math.PI); playAnim(n, 'Sit'); n.h.position.y = .34; }
    { const n = makeNPC('pw', { skin: 0xf1c9a5, hair: 0x7a2f1a, top: 0x2f5f9f, bottom: null }, cx + 3.6 + .8, cz + .8, -Math.PI / 2); playAnim(n, 'Sit'); }
    { const n = makeNPC('pm', { skin: 0xc68642, hair: 0x1c1410, top: 0x30343f, bottom: null }, cx + 3.6 - .8, cz + .8, Math.PI / 2); playAnim(n, 'Sit'); }
    makeNPC('pw', { skin: 0xe0ac7e, hair: 0xc9a35a, top: 0xb3362e, bottom: null }, cx + 3.3, cz - 2.4, Math.PI * .1);                              // somebody at the dartboard
    const mk = [addMarker({ x: cx - 1, z: cz - .8, type: 'in', icon: '', text: 'ORDER', color: 0xc9a35a, indoor: true, onEnter: menus.bar }), addMarker({ x: cx, z: cz + d / 2 - 1, type: 'in', icon: '', text: 'EXIT', color: 0x4a5568, indoor: true, onEnter: leaveRoom })];
    G.rooms.bar = { title: 'The Rusty Anchor', spawn: { x: cx + 1.4, z: cz + 1.8 }, markers: mk };
  }
  /* ----- the clothes shop ----- */
  {
    const cx = 3000, cz = 480, w = 10, d = 8, g = room(scene, cx, cz, w, d, 0xf2ece0, 0xb89a72);
    const wood = M(0xb08a5a), dark = M(0x2a2c30), steel = M(0xb9c0c8, { roughness: .3, metalness: .5 }), cols = [0xb3362e, 0x2f5f9f, 0xe0b23a, 0x2f7a5a, 0xf2f2ee, 0x30343f, 0x7a3f8f, 0xd98a1f].map(c => M(c));
    box(g, 3, 1, .8, wood, 2.6, .5, -2, true); box(g, 3.1, .06, .9, M(0xf2efe6), 2.6, 1.03, -2); box(g, .5, .35, .4, dark, 3.4, 1.25, -2);              // the till
    for (const rx of [-3.2, -1]) { box(g, .06, 1.6, .06, steel, rx, .8, -1.2); box(g, .06, 1.6, .06, steel, rx, .8, 1.2); box(g, .05, .05, 2.4, steel, rx, 1.6, 0); for (let k = 0; k < 8; k++) box(g, .5, .75, .08, cols[(k + (rx < -2 ? 0 : 3)) % 8], rx, 1.2, -1 + k * .28); }   // two rails of clothes
    for (let i = 0; i < 3; i++) { box(g, 4, .06, .45, wood, -2.6, .9 + i * .6, -d / 2 + .25); for (let k = 0; k < 6; k++) box(g, .5, .16, .36, cols[(k * 3 + i) % 8], -4.2 + k * .65, 1.02 + i * .6, -d / 2 + .25); }   // folded things on shelves
    box(g, 1.2, 2.1, .06, M(0xcfe6f2, { roughness: .05, metalness: .6 }), w / 2 - .05, 1.15, 1.4); box(g, 1.3, 2.2, .04, wood, w / 2 - .03, 1.15, 1.4);       // a mirror
    box(g, 1.3, 2.3, 1.3, M(0x7a4f8a), w / 2 - .75, 1.15, -2.9, true);                                                                                   // the changing room
    const sign = new T.Mesh(new T.PlaneGeometry(4.2, .8), new T.MeshBasicMaterial({ map: text('PAPILLON MODE', '#f2ece0', '#30343f') })); sign.position.set(cx - 1.5, 2.85, cz - d / 2 + .02); scene.add(sign);
    makeNPC('pw', { skin: 0xc68642, hair: 0x101010, top: 0xf2f2ee, bottom: 0x30343f }, cx + 2.6, cz - 2.9, 0);
    makeNPC('pw', { skin: 0xf1c9a5, hair: 0x7a2f1a, top: 0xd98a1f, bottom: null }, cx - 2, cz + .3, -Math.PI / 2);
    const mk = [addMarker({ x: cx + 2.6, z: cz - .8, type: 'in', icon: '', text: 'CLOTHES', color: 0x7a4f8a, indoor: true, onEnter: menus.cloth }), addMarker({ x: cx, z: cz + d / 2 - 1, type: 'in', icon: '', text: 'EXIT', color: 0x4a5568, indoor: true, onEnter: leaveRoom })];
    G.rooms.cloth = { title: 'Papillon Mode', spawn: { x: cx + 1.2, z: cz + 1.8 }, markers: mk };
  }
  /* ----- police station ----- */
  {
    const cx = 3000, cz = 240, w = 10, d = 8, g = room(scene, cx, cz, w, d, 0xc9d2de, 0x5a6470);
    const navy = M(0x1b2a55), wood = M(0x6a4a2e), dark = M(0x23252a), steel = M(0x8a9098, { roughness: .4, metalness: .3 });
    box(g, 6, 1.1, .9, navy, 0, .55, -1.8, true); box(g, 6.1, .06, 1, wood, 0, 1.13, -1.8); box(g, .7, .5, .1, dark, -1.6, 1.42, -1.8); box(g, .7, .5, .1, dark, 1.6, 1.42, -1.8);
    for (let k = 0; k < 7; k++) box(g, .08, 3.2, .08, steel, w / 2 - 2.6 + k * .4, 1.6, 1.2);
    box(g, 2.6, .08, .08, steel, w / 2 - 1.4, 3.1, 1.2); box(g, 1.6, .36, .5, wood, w / 2 - 1.2, .18, 3.1, true);
    for (let k = 1; k < 8; k++) box(g, .08, 3.2, .08, steel, w / 2 - 2.6, 1.6, 1.2 + k * .4); box(g, .08, .08, 2.8, steel, w / 2 - 2.6, 3.1, 2.6);   // the side of the cell: he really is locked in
    addBox(cx + w / 2 - 2.66, cz + 1.14, cx + w / 2, cz + 1.26, 3); addBox(cx + w / 2 - 2.66, cz + 1.14, cx + w / 2 - 2.54, cz + d / 2, 3);
    for (let k = 0; k < 3; k++) box(g, .5, .36, .5, navy, -w / 2 + .4, .18, .4 + k * .7, true);
    const sign = new T.Mesh(new T.PlaneGeometry(4.6, .8), new T.MeshBasicMaterial({ map: text('PAPILLON POLICE', '#17409a', '#ffffff') })); sign.position.set(cx, 2.85, cz - d / 2 + .02); scene.add(sign);
    makeNPC('pm', { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', skin: 0xe0ac7e, hair: 0x1c1410, top: 0x1b2a55, bottom: 0x141c33 }, cx, cz - 2.9, 0);
    // the armoury: steel lockers in the corner by the door
    box(g, 2.2, 2.3, .6, steel, -w / 2 + 1.6, 1.15, d / 2 - .45, true); for (let k = 0; k < 3; k++) box(g, .62, 2.1, .04, dark, -w / 2 + .9 + k * .7, 1.15, d / 2 - .77); box(g, .5, .16, .05, M(0xe2bd2a), -w / 2 + 1.6, 2.1, d / 2 - .8);
    { const n = makeNPC('pm', { skin: 0xc68642, hair: 0x1c1410, top: 0x7a3f2a, bottom: null }, cx - w / 2 + .63, cz + 1.1, Math.PI / 2); playAnim(n, 'Sit'); }   // someone waiting on the bench
    // officers: one by the cells, one near the lockers, one walking a report over; and somebody locked up
    const COP = { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', top: 0x1b2a55, bottom: 0x141c33 };
    makeNPC('pm', Object.assign({ skin: 0x8d5524, hair: 0x101010 }, COP), cx + w / 2 - 3.1, cz + 2.2, Math.PI / 2);
    makeNPC('pw', Object.assign({ skin: 0xf1c9a5, hair: 0xc9a35a }, COP), cx - 2.6, cz + .2, Math.PI * .2);
    makeNPC('pm', Object.assign({ skin: 0xe0ac7e, hair: 0x3b2516 }, COP), cx + 2.2, cz - .4, -Math.PI * .6);
    { const n = makeNPC('pm', { skin: 0xf1c9a5, hair: 0x1c1410, top: 0xd9731f, bottom: 0xd9731f }, cx + w / 2 - 1.2, cz + 2.87, Math.PI); playAnim(n, 'Sit'); }
    const mk = [addMarker({ x: cx - w / 2 + 1.6, z: cz + d / 2 - 1.7, type: 'in', icon: '', text: 'ARMOURY', color: 0xe2bd2a, indoor: true, onEnter: menus.armoury }), addMarker({ x: cx, z: cz - .5, type: 'in', icon: '', text: 'FRONT DESK', color: 0x2f5fd0, indoor: true, onEnter: menus.desk }), addMarker({ x: cx, z: cz + d / 2 - 1, type: 'in', icon: '', text: 'EXIT', color: 0x4a5568, indoor: true, onEnter: leaveRoom })];
    G.rooms.desk = { title: 'Police station', spawn: { x: cx + 1.2, z: cz + 1.4 }, markers: mk };
  }
  /* ----- bank ----- */
  {
    const cx = 3000, cz = 360, w = 12, d = 9, g = room(scene, cx, cz, w, d, 0xe9e2d0, 0x6a5a4a);
    const marble = M(0xd9d4c8), wood = M(0x5a3a22), brass = M(0xc9a23a, { roughness: .3, metalness: .6 }), steel = M(0x8a9098, { roughness: .35, metalness: .5 }), dark = M(0x23252a), glass = M(0xbfe3ea, { roughness: .05, transparent: true, opacity: .35 }), green = M(0x2f7a4a);
    box(g, 7.4, 1.1, .9, wood, -2, .55, -2, true); box(g, 7.5, .06, 1, marble, -2, 1.13, -2); box(g, 7.4, 1, .05, glass, -2, 1.66, -2.3);   // the counter with its glass screen
    for (const k of [-4.6, -2, .6]) box(g, .5, .04, .3, brass, k, 1.18, -1.9);
    box(g, 3, 3.2, .5, steel, 4.2, 1.6, -d / 2 + .3, true); box(g, 1.9, 1.9, .2, dark, 4.2, 1.5, -d / 2 + .62); box(g, .9, .12, .12, brass, 4.2, 1.5, -d / 2 + .76); box(g, .12, .9, .12, brass, 4.2, 1.5, -d / 2 + .76);   // the vault door
    for (const k of [-1, 1]) { box(g, .1, 1, .1, brass, 1.6 + k * 1.2, .5, 1.6); } box(g, 2.5, .05, .05, M(0x8a1f1f), 1.6, .95, 1.6);   // a queue rope
    for (let k = 0; k < 2; k++) { box(g, .5, .36, 1.6, green, -w / 2 + .4, .18, .6 + k * 1.9, true); }
    box(g, 2.2, 1.3, .1, M(0x1c3a2a), -3.6, 2.3, -d / 2 + .06); const sign = new T.Mesh(new T.PlaneGeometry(5.2, .8), new T.MeshBasicMaterial({ map: text('PAPILLON SAVINGS BANK', '#1c3a2a', '#e9d9a0') })); sign.position.set(cx - 1, 2.85, cz - d / 2 + .02); scene.add(sign);
    makeNPC('pw', { skin: 0xe0ac7e, hair: 0x3b2516, top: 0x1c3a2a, bottom: null }, cx - 2, cz - 3.1, 0);                                             // the teller
    makeNPC('pm', { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', skin: 0x8d5524, hair: 0x101010, top: 0x1b2a55, bottom: 0x141c33 }, cx + w / 2 - 1.2, cz + 2.6, -Math.PI / 2);   // the guard by the door
    makeNPC('pm', { skin: 0xf1c9a5, hair: 0x8a8a8a, top: 0x7a5a3a, bottom: null }, cx + .2, cz - .6, Math.PI); makeNPC('pw', { skin: 0xc68642, hair: 0x1c1410, top: 0xb3362e, bottom: null }, cx + 1.4, cz + .5, Math.PI * .9);   // customers
    { const n = makeNPC('pm', { skin: 0xe0ac7e, hair: 0x101010, top: 0x30343f, bottom: null }, cx - w / 2 + .63, cz + .6, Math.PI / 2); playAnim(n, 'Sit'); }
    const mk = [addMarker({ x: cx - 2, z: cz - .9, type: 'in', icon: '', text: 'TELLER', color: 0x2f7a4a, indoor: true, onEnter: bankMenu }), addMarker({ x: cx, z: cz + d / 2 - 1, type: 'in', icon: '', text: 'EXIT', color: 0x4a5568, indoor: true, onEnter: leaveRoom }),
      addMarker({ x: cx + 4.2, z: cz - d / 2 + 1.7, type: 'in', icon: '', text: 'VAULT', color: 0xc9a23a, indoor: true, onEnter: vaultUse })];
    G.rooms.bank = { title: 'Papillon Savings Bank', spawn: { x: cx + 1.5, z: cz + 1.9 }, markers: mk };
  }
  /* ----- your flat ----- */
  {
    const cx = 3000, cz = 60, w = 9, d = 7.5, g = room(scene, cx, cz, w, d, 0xe8dcc0, 0x9a7650);
    const wood = M(0x7a5232), white = M(0xf2efe6), blue = M(0x3f6f9f), dark = M(0x23252a), green = M(0x4f7f5f);
    box(g, 2.0, .45, 2.9, wood, -w / 2 + 1.2, .22, -d / 2 + 1.7, true); box(g, 1.9, .22, 2.8, white, -w / 2 + 1.2, .55, -d / 2 + 1.7); box(g, 1.9, .16, 1.9, blue, -w / 2 + 1.2, .68, -d / 2 + 2.1); box(g, 1.2, .16, .5, white, -w / 2 + 1.2, .74, -d / 2 + .7);
    box(g, 2.4, .45, .95, green, 2.2, .3, -d / 2 + .7, true); box(g, 2.4, .7, .25, green, 2.2, .75, -d / 2 + .3);
    box(g, 1.3, .06, .8, wood, 2.2, .45, -d / 2 + 2.2, true); for (const a of [[-.55, -.3], [.55, -.3], [-.55, .3], [.55, .3]]) box(g, .07, .42, .07, wood, 2.2 + a[0], .21, -d / 2 + 2.2 + a[1]);
    box(g, 1.6, 2.2, .6, wood, w / 2 - 1.2, 1.1, d / 2 - .5, true); box(g, .04, 2.0, .02, dark, w / 2 - 1.2, 1.1, d / 2 - .81);
    box(g, 1.5, .9, .08, dark, -2.4, 1.6, d / 2 - .06); box(g, 3.2, .02, 2.2, M(0xb3423a), 1.2, .012, .2);
    box(g, .5, .9, .5, M(0x6a4a2e), -w / 2 + .5, .45, 1.5, true); box(g, .5, .7, .5, M(0x3f8f4a), -w / 2 + .5, 1.25, 1.5);
    const mk = [
      addMarker({ x: cx - w / 2 + 2.9, z: cz - d / 2 + 2.2, type: 'in', icon: '', text: 'SLEEP AND SAVE', color: 0x3a9a5a, indoor: true, onEnter: menus.bed }),
      addMarker({ x: cx + w / 2 - 1.2, z: cz + d / 2 - 2.0, type: 'in', icon: '', text: 'WARDROBE', color: 0x7a4fa8, indoor: true, onEnter: menus.wardrobe }),
      addMarker({ x: cx, z: cz + d / 2 - 1, type: 'in', icon: '', text: 'EXIT', color: 0x4a5568, indoor: true, onEnter: leaveRoom })
    ];
    G.rooms.flat = { title: 'Home', spawn: { x: cx - 1.2, z: cz + 1.2 }, markers: mk };
  }
  dressRooms(scene);
  /* ----- the old missile silo: a hide-out under the desert ----- */
  {
    const cx = 3000, cz = 600, w = 13, d = 9, g = room(scene, cx, cz, w, d, 0x5d6268, 0x34373b);
    const steel = M(0x7b838c, { roughness: .35, metalness: .5 }), rust = M(0x7a4a2a, { roughness: .9 }), dark = M(0x1c1e22), green = M(0x35563a), screen = M(0x7fffb0, { emissive: 0x3fe08a, emissiveIntensity: 1.4 }), amber = M(0xffb020, { emissive: 0xff9a10, emissiveIntensity: 1.1 }), olive = M(0x4a5a2c), canvas = M(0x6b6a52);
    box(g, 2.0, .4, 3.0, steel, -w / 2 + 1.3, .2, -d / 2 + 1.9, true); box(g, 1.9, .2, 2.9, canvas, -w / 2 + 1.3, .5, -d / 2 + 1.9); box(g, 1.2, .16, .6, M(0xe8e4d6), -w / 2 + 1.3, .66, -d / 2 + .7); box(g, 1.9, .16, 1.9, olive, -w / 2 + 1.3, .64, -d / 2 + 2.3);   // a steel bunk with an army blanket
    box(g, 4.4, .9, .9, steel, 1.6, .45, -d / 2 + .7, true); box(g, 4.5, .06, 1.0, dark, 1.6, .92, -d / 2 + .7); for (const x of [-.2, 1.5, 3.2]) { box(g, 1.2, .8, .06, dark, 1.6 + (x - 1.5), 1.55, -d / 2 + .12); box(g, 1.1, .7, .02, screen, 1.6 + (x - 1.5), 1.55, -d / 2 + .16); }   // the control desk and three glowing screens
    box(g, .5, .08, .5, amber, 4.4, 1.0, -d / 2 + .7);
    for (let i = 0; i < 3; i++) { box(g, 1.3, 2.2, .5, green, w / 2 - 1.0 - i * 1.4, 1.1, d / 2 - .4, true); box(g, .05, 1.8, .02, dark, w / 2 - 1.0 - i * 1.4, 1.1, d / 2 - .66); }   // lockers along the south wall
    box(g, 2.6, .5, .9, rust, -1.8, .25, d / 2 - 1.0, true); for (let i = 0; i < 3; i++) box(g, .8, .5, .6, olive, -2.6 + i * .8, .75, d / 2 - 1.0);   // crates
    for (const b of [[w / 2 - .7, 0], [w / 2 - .7, 1.0]]) { const dr = new T.Mesh(new T.CylinderGeometry(.34, .34, .95, 12), rust); dr.position.set(b[0], .48, b[1]); g.add(dr); }
    box(g, 3.4, .02, 2.4, M(0x6b3b2a), 0, .012, .4);   // a worn rug
    box(g, 2.2, 1.5, .05, M(0x2d4a3a), -w / 2 + .05, 1.7, 1.2).rotation.y = Math.PI / 2;   // a map on the wall
    const mk = [
      addMarker({ x: cx - w / 2 + 2.9, z: cz - d / 2 + 2.3, type: 'in', icon: '', text: 'SLEEP AND SAVE', color: 0x3a9a5a, indoor: true, onEnter: menus.bed }),
      addMarker({ x: cx + w / 2 - 2.0, z: cz + d / 2 - 1.5, type: 'in', icon: '', text: 'WARDROBE', color: 0x7a4fa8, indoor: true, onEnter: menus.wardrobe }),
      addMarker({ x: cx, z: cz + d / 2 - 1, type: 'in', icon: '', text: 'CLIMB OUT', color: 0x4a5568, indoor: true, onEnter: leaveRoom })
    ];
    G.rooms.silo = { title: 'The silo: your hide-out', spawn: { x: cx, z: cz + 2.2 }, markers: mk };
  }
}

// ---- extra dressing for the rooms: screens, papers, posters, plants, lamps (small props that make a room look lived in) ----
const pM = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .8 }, o || {}));
function dressRooms(scene) {
  const mk = (cx, cz) => {
    const g = new T.Group(); g.position.set(cx, 0, cz); scene.add(g);
    const p = (w, h, d, mat, x, y, z, ry) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; g.add(m); return m; };
    const cyl = (r, h, mat, x, y, z) => { const m = new T.Mesh(new T.CylinderGeometry(r, r, h, 12), mat); m.position.set(x, y, z); g.add(m); return m; };
    const pl = (map, w, h, x, y, z, ry) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map })); m.position.set(x, y, z); m.rotation.y = ry || 0; g.add(m); return m; };
    const screen = (x, y, z, ry) => { p(.5, .34, .04, pM(0x1c1d21), x, y, z, ry); const s = p(.45, .29, .01, pM(0x7ec4f0, { emissive: 0x4a9ad0, emissiveIntensity: .9 }), x, y, z + .025 * Math.cos(ry || 0), ry); p(.06, .14, .06, pM(0x1c1d21), x, y - .22, z); p(.2, .02, .12, pM(0x2a2b30), x, y - .3, z + .12 * Math.cos(ry || 0)); };
    const plant = (x, z, hgt) => { cyl(.22, .4, pM(0x8a5a3a), x, .2, z); const f = new T.Mesh(new T.IcosahedronGeometry(.34 * (hgt || 1), 1), pM(0x3f7a3f)); f.position.set(x, .75 * (hgt || 1) + .1, z); g.add(f); const f2 = f.clone(); f2.scale.set(.7, .8, .7); f2.position.set(x + .1, .55, z - .08); g.add(f2); };
    const clock = (x, y, z, ry) => { const c = cyl(.22, .04, pM(0xf2efe6), x, y, z); c.rotation.x = Math.PI / 2; c.rotation.z = ry || 0; };
    const lamp = (x, z, col) => { cyl(.015, .7, pM(0x2a2b30), x, 3.0, z); const sh = new T.Mesh(new T.CylinderGeometry(.12, .3, .26, 12, 1, true), pM(col || 0x2a2b30, { side: T.DoubleSide })); sh.position.set(x, 2.55, z); g.add(sh); p(.14, .04, .14, pM(0xfff2c8, { emissive: 0xffe9b0, emissiveIntensity: 1.4 }), x, 2.5, z); };
    return { g, p, cyl, pl, screen, plant, clock, lamp };
  };
  const tex = (t, bg, fg, h) => { const c = document.createElement('canvas'); c.width = 256; c.height = h || 128; const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 256, c.height); x.fillStyle = fg; x.font = 'bold 30px Georgia,serif'; x.textAlign = 'center'; t.split('\n').forEach((ln, i, a) => x.fillText(ln, 128, c.height / 2 + (i - (a.length - 1) / 2) * 36 + 10)); const m = new T.CanvasTexture(c); m.colorSpace = T.SRGBColorSpace; return m; };
  // ---- police station (cz 240): screens and papers on the desk, wanted posters, workstations, filing cabinets, flag, clock
  { const r = mk(3000, 240), { p, screen, plant, clock, pl } = r;
    screen(-1.6, 1.42, -1.62, 0); screen(1.6, 1.42, -1.62, 0); screen(.1, 1.42, -2.0, 0);
    for (const x of [-2.6, -.6, .9, 2.6]) { p(.3, .02, .22, pM(0xf2efe6), x, 1.17, -1.75); p(.28, .02, .2, pM(0xe8e2d0), x + .03, 1.19, -1.77, .2); }
    p(.14, .12, .14, pM(0x2a3f8a), -.4, 1.2, -1.95); p(.2, .1, .1, pM(0x2a2b30), 2.2, 1.18, -1.75);   // a lamp base and a radio
    for (let k = 0; k < 4; k++) pl(tex(['WANTED\n$ 5000', 'WANTED\n$ 12000', 'MISSING', 'WANTED\n$ 800'][k], k === 2 ? '#d9dde4' : '#e8d8a8', '#2a1a10', 128), .55, .7, -4.7 + k * .62, 2.0, -3.93, 0);
    p(2.7, 1.1, .05, pM(0x6a4a2e), -3.45, 2.0, -3.96);
    pl(tex('PAPILLON\nPOLICE', '#17409a', '#ffffff', 128), .9, .6, 3.4, 2.35, -3.95, 0); clock(-1.2, 2.55, -3.94, 0);
    for (const x of [-4.8, -4.2, -3.6]) { p(.5, 1.4, .55, pM(0x8a9098, { metalness: .4, roughness: .5 }), x, .7, -3.6); for (let k = 0; k < 3; k++) p(.4, .02, .03, pM(0x2a2c30), x, .35 + k * .4, -3.31); }
    p(1.5, .06, .7, pM(0x6a4a2e), 3.9, .74, -3.4); p(.06, .74, .6, pM(0x2a2c30), 3.2, .37, -3.4); p(.06, .74, .6, pM(0x2a2c30), 4.6, .37, -3.4); screen(3.9, 1.0, -3.55, 0);
    plant(-4.6, 3.3); p(.4, 1.0, .4, pM(0xd8e6f2, { transparent: true, opacity: .7 }), 4.6, .5, 3.35); }
  // ---- hospital (cz 180): curtains, monitors, IV stands, reception computer, first-aid cabinet, wheelchair
  { const r = mk(3000, 180), { p, cyl, screen, plant, clock, pl } = r;
    for (const bz of [-1.6, 1.3]) { p(.05, .45, .6, pM(0x1c1d21), -4.78, 1.2, bz - .6); p(.04, .36, .5, pM(0x6aff9a, { emissive: 0x3acf6a, emissiveIntensity: 1 }), -4.75, 1.2, bz - .6); cyl(.015, 1.9, pM(0xc9ced4), -2.6, .95, bz - .9); p(.12, .2, .04, pM(0xcfe6f2, { transparent: true, opacity: .8 }), -2.6, 1.8, bz - .9); }
    p(.04, 1.9, 2.4, pM(0x7fc4c4, { transparent: true, opacity: .55 }), -3.7, 1.15, -.15, Math.PI / 2);
    screen(2.4, 1.42, -2.0, 0); p(.1, .1, .1, pM(0xd9463c), 1.2, 1.15, -1.8);
    pl(tex('RECEPTION', '#3f9a9a', '#ffffff', 64), 1.6, .4, 1.8, 2.3, -3.94, 0); clock(-.9, 2.5, -3.94, 0);
    p(.8, .9, .3, pM(0xf6f6f2), -1.3, 1.5, -3.8); p(.3, .06, .02, pM(0xd9463c), -1.3, 1.5, -3.64); p(.06, .3, .02, pM(0xd9463c), -1.3, 1.5, -3.64);   // first-aid cabinet
    cyl(.28, .05, pM(0x2a2c30), 4.2, .3, -1.6).rotation.z = Math.PI / 2; p(.5, .06, .5, pM(0x1f3f8a), 4.2, .5, -1.6); p(.5, .5, .05, pM(0x1f3f8a), 4.45, .75, -1.6);   // wheelchair
    plant(4.5, -3.3); plant(-4.6, 3.3, 1.2);
    p(.3, 1.9, .02, pM(0x6fc0c0), 0, .02, 1.0, 0).scale.set(1, .01, 1); p(.3, .01, 4.6, pM(0x6fc0c0), 0, .01, 1.3); }
  // ---- bank (cz 360): screens at every window, brass grille, ATMs, cash stacks, pillars, pendant lamps, portraits
  { const r = mk(3000, 360), { p, screen, plant, lamp, pl, clock } = r;
    for (const k of [-4.6, -2, .6]) screen(k, 1.4, -2.1, 0);
    for (let k = 0; k < 15; k++) p(.025, .9, .025, pM(0xc9a23a, { metalness: .6, roughness: .3 }), -5.6 + k * .5, 1.65, -2.3); p(7.4, .05, .05, pM(0xc9a23a, { metalness: .6, roughness: .3 }), -2, 2.12, -2.3);
    for (const z of [-2.8, -1.5]) { p(.5, 1.9, .7, pM(0x2f3a45, { metalness: .3, roughness: .5 }), -5.7, .95, z); p(.04, .4, .5, pM(0x7ad6a0, { emissive: 0x3aa070, emissiveIntensity: 1 }), -5.43, 1.4, z); }
    for (let k = 0; k < 5; k++) for (let j = 0; j < 3; j++) p(.45, .14 + j * .02, .3, pM(0x4f8a56), 2.4 + (k % 2) * .5, .1 + j * .17, -3.5 + (k > 1 ? .6 : 0) * 0, 0).visible = k < 2;
    for (const x of [-1.2, 1.4]) { r.cyl(.28, 3.3, pM(0xe4dfd2), x + 4.2, 1.65, 1.2); }
    for (const x of [-3, 0, 3]) lamp(x, 0.6, 0xc9a23a);
    for (let k = 0; k < 3; k++) pl(tex(['FOUNDER', 'MAYOR', 'GOVERNOR'][k], '#3a2a1a', '#e9d9a0', 128), .6, .8, -6 + .02, 2.0, -2.6 + k * 1.9, Math.PI / 2);
    clock(-5.4, 2.7, -4.44, 0); plant(5.4, 3.7, 1.3); plant(-5.4, 3.7); }
  // ---- cafe (cz 120): menu board, pendant lamps, cups, plants on the tables, pastries
  { const r = mk(3000, 120), { p, cyl, plant, lamp, pl } = r;
    pl(tex('MENU\nCoffee  3\nCroissant  4\nTea  2', '#232a26', '#f2f2ee', 192), 1.5, 1.2, 3.4, 2.1, -3.94, 0);
    for (const [x, z] of [[3, .5], [3, 2.6], [-3.2, 1.6]]) { lamp(x, z, 0xb3362e); cyl(.04, .06, pM(0xf2efe6), x - .2, .82, z + .1); cyl(.07, .05, pM(0x3f7a3f), x + .2, .83, z - .15); }
    for (let k = 0; k < 6; k++) cyl(.05, .07, pM(0xf2efe6), -3.5 + k * .35, 1.15, -1.9);
    for (let k = 0; k < 5; k++) { const c = cyl(.12, .04, pM(0xd9a066), .0 + k * .2, 1.25, -2.0); c.scale.set(1, 1, 1); }
    plant(-4.6, 3.3); plant(4.6, 3.3, 1.2);
    for (let k = 0; k < 5; k++) { cyl(.16, .05, pM(0xb3362e), -3.7 + k * .9, .72, -1.3); cyl(.025, .7, pM(0x2a2c30), -3.7 + k * .9, .36, -1.3); } }
  // ---- bar (cz 420): taps, neon, glasses on the counter, bottle mirror
  { const r = mk(3000, 420), { p, cyl, pl, plant } = r;
    p(8.6, 1.5, .03, pM(0xc9d6e0, { metalness: .8, roughness: .1 }), -.3, 2.05, -3.93);
    for (let k = 0; k < 3; k++) { cyl(.03, .3, pM(0xc9a35a, { metalness: .6, roughness: .3 }), -3 + k * .45, 1.3, -2.15); p(.04, .04, .14, pM(0xc9a35a), -3 + k * .45, 1.42, -2.05); }
    for (let k = 0; k < 7; k++) cyl(.04, .1, pM(0xdfe6ee, { transparent: true, opacity: .6 }), -3.6 + k * .55, 1.2, -1.75);
    const neon = new T.Mesh(new T.PlaneGeometry(1.4, .5), new T.MeshBasicMaterial({ map: tex('OPEN', '#14090a', '#ff4a5a', 64) })); neon.position.set(3.8, 2.9, -3.94); r.g.add(neon);
    const neon2 = new T.Mesh(new T.PlaneGeometry(1.4, .5), new T.MeshBasicMaterial({ map: tex('COLD BEER', '#14090a', '#4ad6ff', 64) })); neon2.position.set(-4.6, 2.5, -3.94); r.g.add(neon2);
    plant(4.8, 3.3); }
  // ---- clothes shop (cz 480): mannequins in the window corner, a shoe wall, hangers
  { const r = mk(3000, 480), { p, cyl, plant, pl } = r;
    for (const [x, z, col] of [[-4.2, 2.8, 0xb3362e], [-3.4, 3.0, 0x2f5f9f], [-2.6, 2.8, 0xe0b23a]]) { cyl(.2, .05, pM(0x2a2c30), x, .03, z); cyl(.02, .8, pM(0x2a2c30), x, .45, z); p(.34, .5, .2, pM(col), x, 1.1, z); const h = new T.Mesh(new T.SphereGeometry(.1, 10, 8), pM(0xe8d9c4)); h.position.set(x, 1.5, z); r.g.add(h); p(.2, .6, .16, pM(0x30343f), x, .55, z).visible = false; }
    for (let k = 0; k < 6; k++) for (let j = 0; j < 3; j++) p(.24, .09, .1, pM([0xf2f2ee, 0x30343f, 0xb3362e, 0x2f5f9f, 0xd98a1f][(k + j) % 5]), -4.9, .6 + j * .45, -1.6 + k * .32, 0);
    p(.05, 1.6, 2.2, pM(0x6a4a2e), -4.97, 1.0, -.7); plant(4.6, 3.3, 1.2);
    pl(tex('NEW\nSEASON', '#f2ece0', '#7a3f8f', 128), 1.2, .8, 3.0, 2.3, -3.95, 0); }
}
function text(t, bg, fg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 512, 96); x.fillStyle = fg; x.font = 'bold 56px Georgia,serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, 256, 52, 490);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; return tex;
}
