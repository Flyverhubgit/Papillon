// Papillon - real physics (Rapier). Cars get suspension, weight and momentum: they jump, roll over and tumble.
// Parked cars and wrecks are free bodies, traffic turns into one when it is rammed hard, broken street furniture flies and lands,
// and people who are hit tumble as bodies. If the engine cannot be loaded the game keeps its old, simple driving.
import * as T from 'three';
import { G, MOBILE, COLS, BIGS, HILLS, landHeight, BRG, propsNear, inHedge, SLABL } from './world.js';
import { releaseAI, crime, toughOf, dentCar } from './actors.js';

let R = null, world = null, ok = false, acc = 0;
const STEP = 1 / 60, tmpQ = new T.Quaternion(), tmpV = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
const GALL = 0xffffffff, GK = (2 << 16) | (0xffff & ~4), GP = (4 << 16) | (0xffff & ~2);
const cars = new Map();   // game car -> its body. kind 'kin' = follows the game (traffic on its lane), 'dyn' = a free body; vc = wheels and engine
const RAD = MOBILE ? 55 : 90;
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const yawQ = h => tmpQ.setFromAxisAngle(UP, h);

export async function initPhysics() {
  try { const mod = await import('rapier'); R = mod.default && mod.default.init ? mod.default : mod; await R.init(); } catch (e) { console.warn('physics engine not available, using simple driving', e); return false; }
  world = new R.World({ x: 0, y: -14, z: 0 }); world.timestep = STEP;   // a little more than real gravity: cars feel planted, jumps stay short
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
  const add = (desc, x, y, z, fr) => world.createCollider(desc.setTranslation(x, y, z).setFriction(fr === undefined ? .9 : fr), fixed);
  add(R.ColliderDesc.cuboid(4000, 2, 4000), 0, -2, 0, 1);   // the ground
  for (const s of SLABL) { const hh = s.top / 2 + .5; add(R.ColliderDesc.cuboid((s.x1 - s.x0) / 2, hh, (s.z1 - s.z0) / 2), (s.x0 + s.x1) / 2, s.top - hh, (s.z0 + s.z1) / 2, 1); }   // roads, pavements and squares at their real height: a car now climbs the kerb
  for (const q of HILLS) {   // hills and islands: the same triangles that are drawn
    if (!q.hs) continue; const n = q.seg, n1 = n + 1, s = q.R * 2.2 / n, v = new Float32Array(n1 * n1 * 3), idx = new Uint32Array(n * n * 6);
    for (let iz = 0; iz < n1; iz++) for (let ix = 0; ix < n1; ix++) { const k = (ix + n1 * iz) * 3; v[k] = q.cx + ix * s - q.R * 1.1; v[k + 1] = q.hs[ix + n1 * iz] - .3; v[k + 2] = q.cz + iz * s - q.R * 1.1; }
    let o = 0; for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) { const a = ix + n1 * iz, b = ix + n1 * (iz + 1), c = ix + 1 + n1 * (iz + 1), d = ix + 1 + n1 * iz; idx[o++] = a; idx[o++] = b; idx[o++] = d; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
    world.createCollider(R.ColliderDesc.trimesh(v, idx).setFriction(1), fixed);
  }
  for (const it of COLS) {   // every building, wall, tree trunk and post
    if (it.nophys) continue;
    if (it.b) { const cx = (it.x0 + it.x1) / 2, cz = (it.z0 + it.z1) / 2, base = Math.max(0, landHeight(cx, cz) - 1), h = Math.max(1, it.h || 14); it.pc = add(R.ColliderDesc.cuboid((it.x1 - it.x0) / 2, h / 2 + .5, (it.z1 - it.z0) / 2), cx, base + h / 2 - .5, cz, .6); }
    else { const base = landHeight(it.x, it.z), hh = it.prop ? 1.6 : 2.5; it.pc = add(R.ColliderDesc.cylinder(hh, Math.max(.12, it.r)), it.x, base + hh, it.z, .5); }
  }
  for (const it of BIGS) add(R.ColliderDesc.cuboid((it.x1 - it.x0) / 2, 30, (it.z1 - it.z0) / 2), (it.x0 + it.x1) / 2, 28, (it.z0 + it.z1) / 2, .3);   // the sea, the harbour basin, the edges of the world
  for (const b of BRG.phys) {   // the big road bridge: ramps (solid wedges), deck and crash barriers
    if (b.hull) world.createCollider(R.ColliderDesc.convexHull(b.hull).setFriction(1), fixed);
    else { const d = R.ColliderDesc.cuboid(b.h[0], b.h[1], b.h[2]).setTranslation(b.c[0], b.c[1], b.c[2]).setFriction(b.fr === undefined ? 1 : b.fr); if (b.rz) d.setRotation({ x: 0, y: 0, z: Math.sin(b.rz / 2), w: Math.cos(b.rz / 2) }); world.createCollider(d, fixed); }
  }
  ok = true; G.phys = true; return true;
}
// a broken lamp or bin no longer stands in the way
G.physDropBox = it => { if (!ok || !it.pc) return; world.removeCollider(it.pc, false); it.pc = null; };   // a building that has been brought down
G.physDropProp = pr => { if (!ok) return; for (const it of pr.its) if (it.pc) { world.removeCollider(it.pc, false); it.pc = null; } };

/* ---------- cars ---------- */
function carBody(c, kind, wheels) {
  let e = cars.get(c);
  if (e) { if (e.kind === kind && (!wheels || e.vc)) return e; dropCar(c); }
  const sp = c.spec, hx = sp.L / 2 - .06, hz = sp.W / 2 - .04, hy = Math.max(.3, (sp.top - .5) * .36), q = yawQ(c.h), gy = c.g.position.y > .01 ? c.g.position.y : landHeight(c.x, c.z);
  const r = sp.wr || .33, rest = .26, conn = -hy + .12, rideY = wheels ? -conn + rest * .7 + r : hy + .34;
  const desc = (kind === 'kin' ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic()).setTranslation(c.x, gy + rideY + .02, c.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  if (kind !== 'kin') desc.setLinvel(c.vx || 0, 0, c.vz || 0).setLinearDamping(.05).setAngularDamping(wheels ? .5 : .8).setCcdEnabled(true);
  const body = world.createRigidBody(desc), m = sp.bike ? 230 : sp.L * sp.W * 150 * (sp.tank ? 6 : 1);   // a motorbike is light, a tank weighs as much as six cars
  if (sp.bike && wheels) { body.setEnabledRotations(false, true, false, true); body.setAngularDamping(3); }   // with somebody on it a motorbike is held upright (the lean you see is drawn on top); left alone it can fall over
  const col = wheels ? R.ColliderDesc.cuboid(hx, hy, hz) : R.ColliderDesc.cuboid(hx, hy + .17, hz).setTranslation(0, -.17, 0);   // without wheels the box reaches down to the road
  // traffic on its lane and cars standing untouched in their parking place pass through each other: a driver squeezing past must not shove a parked car into the road
  const parked = kind === 'dyn' && !!(c.slot && c.slot.car === c && !c.used);
  col.setCollisionGroups(kind === 'kin' ? GK : parked ? GP : GALL);
  const cl = world.createCollider(col.setFriction(wheels ? .3 : .45).setRestitution(.1).setMassProperties(m, { x: 0, y: -hy * .45, z: 0 }, { x: m * (hy * hy + hz * hz) / 3 * 2.2, y: m * (hx * hx + hz * hz) / 3, z: m * (hx * hx + hy * hy) / 3 * 1.4 }, { x: 0, y: 0, z: 0, w: 1 }), body);
  e = { body, kind, rideY, m, cl, parked, vc: null, pv: { x: c.vx || 0, y: 0, z: c.vz || 0 }, flipT: 0, driven: -9, steer: 0 };
  if (wheels) {
    const vc = world.createVehicleController(body); vc.indexUpAxis = 1; vc.setIndexForwardAxis = 0;
    const xs = sp.wheels && sp.wheels.length === 2 ? [Math.max(...sp.wheels), Math.min(...sp.wheels)] : [sp.L / 2 - (sp.bike ? .35 : .78), -(sp.L / 2 - (sp.bike ? .35 : .78))], wz = sp.bike ? .12 : sp.W / 2 - .14;
    for (const [wx, s] of [[xs[0], -1], [xs[0], 1], [xs[1], -1], [xs[1], 1]]) vc.addWheel({ x: wx, y: conn, z: s * wz }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, rest, r);
    for (let i = 0; i < 4; i++) { vc.setWheelSuspensionStiffness(i, 46); vc.setWheelSuspensionCompression(i, 3.4); vc.setWheelSuspensionRelaxation(i, 4.6); vc.setWheelMaxSuspensionTravel(i, .22); vc.setWheelMaxSuspensionForce(i, m * 60); vc.setWheelFrictionSlip(i, 2.2); vc.setWheelSideFrictionStiffness(i, 1); }
    e.vc = vc;
  }
  c.phys = e; cars.set(c, e); mark(c, e); return e;
}
function dropCar(c) { const e = cars.get(c); if (!e) return; if (e.vc) world.removeVehicleController(e.vc); world.removeRigidBody(e.body); cars.delete(c); c.phys = null; }
const mark = (c, e) => { e.sx = c.x; e.sz = c.z; e.sh = c.h; e.svx = c.vx || 0; e.svz = c.vz || 0; };   // what the physics last told the game, to notice when the game moves a car itself
// copy what the physics says back to the car as the rest of the game knows it
function syncCar(c, e) {
  const t = e.body.translation(), r = e.body.rotation(), v = e.body.linvel();
  tmpQ.set(r.x, r.y, r.z, r.w); tmpV.set(1, 0, 0).applyQuaternion(tmpQ); c.x = t.x; c.z = t.z; if (Math.abs(tmpV.y) < .97) c.h = Math.atan2(-tmpV.z, tmpV.x); c.vx = v.x; c.vz = v.z; c.v = Math.hypot(v.x, v.z);
  c.g.quaternion.copy(tmpQ); tmpV.set(0, -e.rideY, 0).applyQuaternion(tmpQ); c.g.position.set(t.x + tmpV.x, t.y + tmpV.y, t.z + tmpV.z); c.up = -tmpV.y / e.rideY; c.py = t.y - e.rideY; mark(c, e);
  if (c.spec.bike && e.vc) { c.g.rotation.order = 'YXZ'; c.lean = (c.lean || 0) + ((G.time - e.driven < .2 ? c.leanT || 0 : 0) - (c.lean || 0)) * .14; c.g.rotation.x = c.lean; }
}
// someone at the wheel (the player, a police driver): thr -1..1, steer -1..1, handbrake. Returns how hard the car has just hit something,
// or -1 when this car is not on real physics (too far away) and the old driving should be used
G.physDrive = (c, thr, steer, hb, dt) => {
  if (!ok) return -1; const pl = G.player, far = Math.hypot(c.x - pl.x, c.z - pl.z) > RAD && c !== pl.car;
  if (far && !cars.has(c)) return -1;
  const e = carBody(c, 'dyn', true), vc = e.vc, sp = c.spec, v = e.body.linvel(), r = e.body.rotation();
  tmpQ.set(r.x, r.y, r.z, r.w); tmpV.set(1, 0, 0).applyQuaternion(tmpQ); const fwd = v.x * tmpV.x + v.y * tmpV.y + v.z * tmpV.z, av = Math.abs(fwd);
  let engine = 0, brake = 0; thr = Math.max(-1, Math.min(1.4, thr));
  if (thr > 0) { if (fwd < -1) brake = e.m * .03; engine = thr * e.m * sp.acc * 1.2 * Math.max(0, 1 - Math.pow(av / (sp.max * 1.03), 2)); }
  else if (thr < 0) { if (fwd > 1.5) brake = e.m * .03 * -thr; else engine = thr * e.m * sp.acc * .8 * Math.max(0, 1 - av / (sp.max * .3)); }
  else brake = e.m * .009;
  const ang = -steer * (sp.bike ? .42 / (1 + av * .16) : .6 / (1 + av * .085));   // less lock the faster you go, and a motorbike turns by leaning more than by steering
  e.steer += (ang - e.steer) * Math.min(1, dt * 8); vc.setWheelSteering(0, e.steer); vc.setWheelSteering(1, e.steer);
  const wet = 1 - .3 * (G.wet || 0);
  for (let i = 0; i < 4; i++) { const rear = i >= 2; vc.setWheelEngineForce(i, rear ? engine * .5 * ENG : 0); vc.setWheelBrake(i, rear && hb ? e.m * .05 : brake); vc.setWheelFrictionSlip(i, (rear ? (hb ? 1.0 : 2.0) : 2.3) * wet); }
  if (sp.bike) c.leanT = steer * Math.min(1, av / 14) * .5;   // a motorbike leans into the bend
  if (sp.tank && Math.abs(steer) > .1) { const w = e.body.angvel(); e.body.setAngvel({ x: w.x, y: -steer * (fwd < -.5 ? -1 : 1) * 1.0, z: w.z }, true); }   // a tank turns on its tracks, even standing still
  e.driven = G.time; if (e.body.isSleeping()) e.body.wakeUp();
  const imp = c.physImp || 0; c.physImp = 0; return imp;
};
let ENG = 1;   // sign of "forwards" for the engine (checked by a test)
G.physEngSign = s => { ENG = s; };
G.physKick = (c, vx, vy, vz, spin) => { const e = cars.get(c); if (!e || e.kind === 'kin') return; const v = e.body.linvel(); e.body.setLinvel({ x: v.x + vx, y: v.y + vy, z: v.z + vz }, true); if (spin) e.body.setAngvel({ x: (Math.random() - .5) * spin, y: (Math.random() - .5) * spin, z: (Math.random() - .5) * spin }, true); e.svx = c.vx; e.svz = c.vz; };

/* ---------- loose things: bits of broken street furniture ---------- */
const loose = [];
const SHAPES = { lamp: [.09, 2.8, .09, 0x222428, 60], sign: [.05, 1.3, .05, 0x8d9299, 15], bin: [.25, .4, .25, 0x3d5a48, 12], hydrant: [.16, .36, .16, 0xc8352b, 40], postbox: [.25, .58, .21, 0xe0b21c, 30], newsbox: [.23, .45, .2, 0x2f62b5, 20], bench: [.95, .28, .25, 0x8a5a33, 30], shelter: [2.2, .07, .85, 0x1f8a8a, 50] };
G.physDebris = (kind, x, z, vx, vz) => {
  if (!ok) return false; const S = SHAPES[kind]; if (!S) return false;
  if (loose.length >= (MOBILE ? 10 : 28)) { const o = loose.shift(); world.removeRigidBody(o.body); G.scene.remove(o.mesh); o.mesh.geometry.dispose(); }
  const [hx, hy, hz, col, mass] = S, sp = Math.hypot(vx, vz), gy = landHeight(x, z), top = kind === 'shelter' ? 2.3 : 0;
  const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x + vx * .03, gy + top + hy + .12, z + vz * .03).setLinvel(vx * .75 + (Math.random() - .5), 1.2 + sp * .2, vz * .75 + (Math.random() - .5)).setAngvel({ x: (Math.random() - .5) * 3 + vz * .3, y: (Math.random() - .5) * 3, z: (Math.random() - .5) * 3 - vx * .3 }).setAngularDamping(.4));
  world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setMass(mass).setFriction(.7).setRestitution(.2), body);
  const mesh = new T.Mesh(new T.BoxGeometry(hx * 2, hy * 2, hz * 2), new T.MeshLambertMaterial({ color: col })); mesh.castShadow = true; G.scene.add(mesh); loose.push({ body, mesh, t: 45 }); return true;
};

/* ---------- people: a hard hit turns someone into a tumbling body ---------- */
const dolls = new Map();
G.physUndoll = who => { const d = dolls.get(who); who.doll = null; if (!d) return; world.removeRigidBody(d.body); dolls.delete(who); };
G.physDoll = (who, x, y, z, vx, vy, vz, yaw) => {
  if (!ok) return null; G.physUndoll(who); if (dolls.size >= (MOBILE ? 5 : 14)) G.physUndoll(dolls.keys().next().value);
  const q = yawQ(yaw), body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x, y + 1, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinvel(vx, vy, vz).setAngvel({ x: vz * .6 + (Math.random() - .5) * 3, y: (Math.random() - .5) * 5, z: -vx * .6 + (Math.random() - .5) * 3 }).setAngularDamping(.9).setLinearDamping(.15).setCcdEnabled(true));
  world.createCollider(R.ColliderDesc.capsule(.55, .3).setMass(70).setFriction(.9).setRestitution(.15), body);
  const d = { body, rest: 0, t: 0 }; dolls.set(who, d); who.doll = d; return d;
};
// where the body is now: turns and places the drawn figure to match and fills out.x, out.y, out.z; true once it has come to rest
G.physDollPose = (who, obj, out) => {
  const d = dolls.get(who); if (!d) return true; const t = d.body.translation(), r = d.body.rotation();
  tmpQ.set(r.x, r.y, r.z, r.w); tmpV.set(0, -.9, 0).applyQuaternion(tmpQ); obj.quaternion.copy(tmpQ); obj.position.set(t.x + tmpV.x, t.y + tmpV.y, t.z + tmpV.z); out.x = t.x; out.z = t.z; out.dy = Math.max(0, t.y - .3); { const w = d.body.angvel(), v = d.body.linvel(); out.dw = Math.hypot(w.x, w.y, w.z) + Math.hypot(v.x, v.y, v.z) * .25; }
  return d.rest > .45 || d.t > 7;
};

/* ---------- every frame ---------- */
export function updatePhysics(dt) {
  if (!ok) return; const pl = G.player, hx = pl.car ? pl.car.x : pl.x, hz = pl.car ? pl.car.z : pl.z;
  // which cars are in the physics world, and how
  for (const c of G.cars) {
    const d = Math.hypot(c.x - hx, c.z - hz), e = cars.get(c);
    if (d > RAD + 25 && c !== pl.car) { if (e) dropCar(c); continue; }
    if (!e && d > RAD) continue;
    const kind = c.ai ? 'kin' : 'dyn';
    if (!e || e.kind !== kind) carBody(c, kind, false);
  }
  for (const [c, e] of cars) {
    if (c.gonePhys || G.cars.indexOf(c) < 0) { dropCar(c); continue; }
    if (e.kind === 'kin' && ramComing(c, pl.car)) { const vx = Math.cos(c.h) * c.v, vz = -Math.sin(c.h) * c.v; if (c.spec.bike && G.bikeCrash) G.bikeCrash(c, pl.car.vx, pl.car.vz); releaseAI(c); c.vx = vx; c.vz = vz; c.used = true; c.driver = null; c.startT = 0; carBody(c, 'dyn', false); continue; }
    if (e.kind === 'kin') { const q = yawQ(c.h); e.body.setNextKinematicTranslation({ x: c.x, y: c.g.position.y + e.rideY, z: c.z }); e.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); continue; }
    // the game itself moved this car (a mission put it somewhere, a garage, an explosion stopped it): follow
    if (Math.abs(c.x - e.sx) + Math.abs(c.z - e.sz) > .02 || Math.abs(wrap(c.h - e.sh)) > .02) { const q = yawQ(c.h); e.body.setTranslation({ x: c.x, y: landHeight(c.x, c.z) + e.rideY + .05, z: c.z }, true); e.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true); e.body.setAngvel({ x: 0, y: 0, z: 0 }, true); e.body.setLinvel({ x: c.vx || 0, y: 0, z: c.vz || 0 }, true); e.pv.x = c.vx || 0; e.pv.y = 0; e.pv.z = c.vz || 0; }
    else if (Math.abs((c.vx || 0) - e.svx) + Math.abs((c.vz || 0) - e.svz) > .02) { const v = e.body.linvel(); e.body.setLinvel({ x: c.vx || 0, y: v.y, z: c.vz || 0 }, true); e.pv.x = c.vx || 0; e.pv.z = c.vz || 0; }
    if (e.vc && G.time - e.driven > .15) for (let i = 0; i < 4; i++) { e.vc.setWheelEngineForce(i, 0); e.vc.setWheelBrake(i, e.m * .02); e.vc.setWheelSteering(i, 0); }   // nobody at the wheel: brakes on
  }
  acc = Math.min(acc + dt, STEP * 4);
  while (acc >= STEP) {
    acc -= STEP;
    for (const [c, e] of cars) if (e.vc && !e.body.isSleeping()) {
      if (G.time - e.driven < .15) breakAhead(c, e);
      e.vc.updateVehicle(STEP);
    }
    world.step();
    for (const d of dolls.values()) { const v = d.body.linvel(); d.t += STEP; if (v.x * v.x + v.y * v.y + v.z * v.z < .2) d.rest += STEP; else d.rest = 0; }
  }
  for (const [c, e] of cars) {
    if (e.kind === 'kin') continue;
    syncCar(c, e);
    if (c.slot && c.slot.car === c && Math.hypot(c.x - c.slot.x, c.z - c.slot.z) > .5) { c.slot.car = null; c.slot = null; c.used = true; c.startT = 0; }   // shoved out of its parking place
    if (e.parked && !(c.slot && c.slot.car === c && !c.used)) { e.parked = false; e.cl.setCollisionGroups(GALL); }
    // a hedge: the car ploughs through, losing a good part of its speed as it goes in and dragging while it is in it
    if (c.v > 1.5) { const fx = Math.cos(c.h) * c.spec.L * .4, fz = -Math.sin(c.h) * c.spec.L * .4, inH = [-1, -.67, -.33, 0, .33, .67, 1].some(t => inHedge(c.x + fx * t, c.z + fz * t));
      if (inH) { const v0 = e.body.linvel(), k = e.hedge ? Math.max(0, 1 - .8 * dt) : .8; e.body.setLinvel({ x: v0.x * k, y: v0.y, z: v0.z * k }, true); e.pv.x *= k; e.pv.z *= k;
        if (!e.hedge && G.debris && Math.hypot(c.x - pl.x, c.z - pl.z) < 80) { G.debris(c.x + fx, .7, c.z + fz, 9, 0x3f7a3a, v0.x * .4, v0.z * .4, .16); G.debris(c.x + fx, .5, c.z + fz, 4, 0x6a4a2a, v0.x * .3, v0.z * .3, .08); if (c === pl.car && G.sfx && G.sfx.crash) G.sfx.crash(3); } }
      e.hedge = inH; } else e.hedge = false;
    const v = e.body.linvel(), dv = Math.hypot(v.x - e.pv.x, v.y - e.pv.y, v.z - e.pv.z); e.pv.x = v.x; e.pv.y = v.y; e.pv.z = v.z;
    e.hv = { x: -(v.x - (e.pv0x === undefined ? v.x : e.pv0x)), z: -(v.z - (e.pv0z === undefined ? v.z : e.pv0z)) }; e.pv0x = v.x; e.pv0z = v.z;   // which way the speed was knocked out of it: that is where it was hit
    if (dv > 2.5) hit(c, e, dv);
    // on its roof or side and going nowhere: the player's car is put back on its wheels after a moment
    if (c === pl.car && c.up < .35 && c.v < 2) { e.flipT += dt; if (e.flipT > 2) { e.flipT = 0; const t = e.body.translation(), q = yawQ(c.h); e.body.setTranslation({ x: t.x, y: landHeight(t.x, t.z) + e.rideY + .6, z: t.z }, true); e.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true); e.body.setAngvel({ x: 0, y: 0, z: 0 }, true); e.body.setLinvel({ x: 0, y: 0, z: 0 }, true); } } else e.flipT = 0;
  }
  // traffic that is rammed hard leaves its lane and becomes a free body; a lighter knock just makes the driver stop
  const p = pl.car, pe = p && cars.get(p);
  if (pe && pe.kind === 'dyn') for (const [c, e] of cars) {
    if (e.kind !== 'kin' || c === p) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d > (c.spec.L + p.spec.L) / 2 + .5) continue;
    const cvx = Math.cos(c.h) * c.v, cvz = -Math.sin(c.h) * c.v, rel = Math.hypot(pe.pvx0 - cvx, pe.pvz0 - cvz);
    if (rel > 2) { c.bump = Math.max(c.bump || 0, 1.5); if (rel > 3 && !(c.outTry > G.time)) { c.outTry = G.time + 8; if (Math.random() < .4 && G.driverOut) G.driverOut(c); } }   // a bump: the driver stops, and some get out to have it out with you
  }
  if (pe && pe.kind === 'dyn') for (const b of G.cars) {   // motorbikes are not physics bodies: a car meeting one is handled here
    if (!b.spec.bike || b === p || b.dead || b.hitCd > G.time || cars.has(b)) continue; const dx = b.x - p.x, dz = b.z - p.z; if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
    const fx = Math.cos(p.h), fz = -Math.sin(p.h), along = dx * fx + dz * fz, side = -dx * fz + dz * fx; if (Math.abs(along) > p.spec.L / 2 + .9 || Math.abs(side) > p.spec.W / 2 + .5) continue;
    const bvx = Math.cos(b.h) * (b.ai ? b.v : 0) + (b.ai ? 0 : b.vx || 0), bvz = -Math.sin(b.h) * (b.ai ? b.v : 0) + (b.ai ? 0 : b.vz || 0), rel = Math.hypot(p.vx - bvx, p.vz - bvz); b.hitCd = G.time + .6;
    if (rel > 5) { G.bikeCrash(b, p.vx, p.vz); p.hp -= 3; dentCar(p, dx, dz, 1); const v = pe.body.linvel(); pe.body.setLinvel({ x: v.x * .93, y: v.y, z: v.z * .93 }, true); if (G.crimeCd <= 0) { G.crimeCd = 4; crime(1, false); } }
    else if (rel > 1.2 && b.ai) { b.bump = Math.max(b.bump || 0, 1.5); if (!(b.outTry > G.time)) { b.outTry = G.time + 8; if (Math.random() < .4 && G.driverOut) G.driverOut(b); } }
    else if (!b.ai) { b.vx = p.vx * .8; b.vz = p.vz * .8; b.v = Math.hypot(b.vx, b.vz); }   // a parked bike is shoved along
  }
  if (pe && p.spec.tank && p.v > 1.2) for (const o of cars.keys()) {   // a tank crushes what it drives into
    if (o === p || o.spec.tank || o.dead || o.crushCd > G.time) continue; const dx = o.x - p.x, dz = o.z - p.z, fx = Math.cos(p.h), fz = -Math.sin(p.h), along = dx * fx + dz * fz, side = -dx * fz + dz * fx;
    if (Math.abs(along) < p.spec.L / 2 + o.spec.L / 2 + .2 && Math.abs(side) < p.spec.W / 2 + o.spec.W / 2 + .2) { o.crushCd = G.time + .5; o.hp -= 55; dentCar(o, -dx, -dz, 3); if (G.sfx && G.sfx.crash) G.sfx.crash(9); if (o.ai) o.bump = 2; } }
  if (pe) { pe.pvx0 = p.vx; pe.pvz0 = p.vz; }
  for (let i = loose.length - 1; i >= 0; i--) { const o = loose[i]; o.t -= dt; const t = o.body.translation(), r = o.body.rotation(); o.mesh.position.set(t.x, t.y, t.z); o.mesh.quaternion.set(r.x, r.y, r.z, r.w); if (o.t <= 0 || t.y < -5) { world.removeRigidBody(o.body); G.scene.remove(o.mesh); o.mesh.geometry.dispose(); loose.splice(i, 1); } }
}
// is the player's car about to ram this traffic car hard? Then it is let go of its lane just before the hit, so the crash is a real one
function ramComing(c, p) {
  if (!p || p === c || !p.phys || c.spec.noPark) return false; const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz), gap = d - (c.spec.L + p.spec.L) / 2; if (gap > 4) return false;
  const cvx = Math.cos(c.h) * c.v, cvz = -Math.sin(c.h) * c.v, closing = ((p.vx - cvx) * dx + (p.vz - cvz) * dz) / (d || 1);
  return closing > (p.spec.tank ? 2.5 : c.spec.bike ? 5 : 8) && gap < closing * .1 + .2;
}
// street furniture right in front of a driven car gives way when it is hit hard enough (before the body meets its solid shape)
function breakAhead(c, e) {
  const v = e.body.linvel(), s = Math.hypot(v.x, v.z); if (s < 2 || !G.breakProp) return;
  const sp = c.spec, dx = v.x / s, dz = v.z / s;
  for (const pr of propsNear(c.x, c.z, sp.L / 2 + 2.2)) {
    const ox = pr.x - c.x, oz = pr.z - c.z, along = ox * dx + oz * dz, side = Math.abs(-ox * dz + oz * dx);
    if (along < 0 || along > sp.L / 2 + .5 + s * STEP * 2 || side > sp.W / 2 + .35 || s < pr.need) continue;
    const big = pr.kind === 'lamp' || pr.kind === 'shelter', k = big ? .8 : .93; G.breakProp(pr, v.x, v.z); e.body.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true); e.pv.x *= k; e.pv.z *= k;
    c.hp -= (big ? 3 : 1) / toughOf(c.spec); c.physImp = Math.max(c.physImp || 0, s * (1 - k) * 3);

  }
}
// a free car has just had its speed changed suddenly by dv metres a second: damage, glass, and who it hit
function hit(c, e, dv) {
  c.physImp = Math.max(c.physImp || 0, dv);
  if (dv > 3 && !c.dead) { c.hp -= (dv > 6 ? (dv - 5) * 2.2 + 2 : (dv - 3) * 1) / toughOf(c.spec);   /* a few hard crashes and it burns; big vehicles take more */ if (G.debris && dv > 7 && Math.hypot(c.x - G.player.x, c.z - G.player.z) < 60) { const fx = Math.cos(c.h), fz = -Math.sin(c.h); G.debris(c.x + fx * 1.8, (c.py || 0) + .7, c.z + fz * 1.8, Math.min(10, dv | 0), 0xbfe3ea, c.vx, c.vz, .1); } }
  let best = null, bd = 99; for (const o of cars.keys()) { if (o === c) continue; const d = Math.hypot(o.x - c.x, o.z - c.z) - (o.spec.L + c.spec.L) / 2; if (d < bd) { bd = d; best = o; } }
  const n = dv > 10 ? 4 : dv > 6 ? 3 : 2;
  if (best && bd < .7) { c.hitCar = best; if (dv > 3.5) { dentCar(c, best.x - c.x, best.z - c.z, n);
      const be = cars.get(best); if (be && be.kind === 'kin' && !best.dead) { best.hp -= dv * 1.8 / toughOf(best.spec); dentCar(best, c.x - best.x, c.z - best.z, n); best.bump = 1.5; } } }   // a car still on its lane does not feel the bump itself, so it is damaged here
  else if (dv > 4.5 && e.hv) dentCar(c, e.hv.x, e.hv.z, n);   // a wall, a tree, a pole: dented where it struck
}
// a solid shape that stays where it is (a stunt ramp): corner points and triangles
G.physAddMesh = (verts, idx) => { if (!ok) return false; world.createCollider(R.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx)).setFriction(1), world.createRigidBody(R.RigidBodyDesc.fixed())); return true; };
// is this car in the air (no wheel on the ground)? null when it is not on real physics
G.physAir = c => { const e = cars.get(c); if (!e || !e.vc) return null; for (let i = 0; i < 4; i++) if (e.vc.wheelIsInContact(i)) return false; return true; };
G.physInfo = () => ({ ok, cars: cars.size, kin: [...cars.values()].filter(e => e.kind === 'kin').length, wheels: [...cars.values()].filter(e => e.vc).length, loose: loose.length, dolls: dolls.size, bodies: world ? world.bodies.len() : 0, colliders: world ? world.colliders.len() : 0 });
G.physCar = c => { const e = cars.get(c); if (!e) return null; const t = e.body.translation(), v = e.body.linvel(); return { kind: e.kind, wheels: !!e.vc, y: t.y, vy: v.y, up: c.up, x: t.x, z: t.z, contact: e.vc ? [0, 1, 2, 3].map(i => e.vc.wheelIsInContact(i)) : null, sleep: e.body.isSleeping() }; };
G.physDbg = { HILLS, landHeight, cars, propsNear, loose, dolls, ground: (x, z) => { if (!ok) return null; const r = world.castRay(new R.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }), 80, true); return r ? 40 - r.timeOfImpact : null; }, lift: (c, y) => { const e = cars.get(c), t = e.body.translation(); e.body.setTranslation({ x: t.x, y: t.y + y, z: t.z }, true); } };
G.inHedgeDBG = inHedge;
