// Papillon - actors: people, cars, traffic, police
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { smoothNormals } from './merge.js';
import { G, MOBILE, inHedge, rnd, rr, pick, nodes, slots, doors, loops, loopPoint, loopParam, collide, solidAt, NODE_R, LANE, PARK_LAT, nearestNode, landHeight, ROUTES, BUS_LEGS, onRing, onRoad, lightGreen, benches, kerbH, wallAt, inWater } from './world.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/* ================= models ================= */
const loader = new GLTFLoader();
async function loadGLB(name) {
  const mod = await import('../models/' + name + '.js');
  const bin = atob(mod.default), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Promise((res, rej) => loader.parse(buf.buffer, '', g => res(g), rej));
}
export async function loadModels(onProgress) {
  // phones skip the detailed downtown kit buildings (d1-d3 and their textures) to stay light
  const names = ['pm', 'pw', 'b1', 'b2', 'b3', 'b4', 'b5', 'nat'].concat(MOBILE ? [] : ['d1', 'd2', 'd3']), data = ['am', 'aw', 'guns', 'cars', 'psx'].concat(peopleStyle() === 'real' ? ['xp'] : peopleStyle() === 'new' ? ['ub'] : []).concat(MOBILE ? [] : ['dtex']), out = {}, tot = names.length + data.length; let n = 0;
  await Promise.all(names.map(async nm => { const g = await loadGLB(nm); out[nm] = g.scene; out[nm + '_anim'] = g.animations; onProgress(++n / tot); })
    .concat(data.map(async nm => { out[nm] = (await import('../models/' + nm + '.js')).default; onProgress(++n / tot); })));
  CM = out.cars; PX = out.psx;
  if (out.ub) { try { out.ub = await parseUB(out.ub); } catch (e) { console.warn('new people failed', e); out.ub = null; } }
  return out;
}
let PX = null;   // the retro textured cars (models/psx.js): one body each, several paint jobs as pictures
const psxMats = {};
function psxMat(k, v) { const id = k + v; if (psxMats[id]) return psxMats[id]; const t = new T.TextureLoader().load(PX[k].tex[v]); t.colorSpace = T.SRGBColorSpace; t.magFilter = T.NearestFilter; t.minFilter = T.NearestMipmapLinearFilter; return psxMats[id] = new T.MeshStandardMaterial({ map: t, roughness: .75, metalness: 0 }); }
function psxGeo(k) {
  const d = PX[k], g = new T.BufferGeometry(), p = new Int16Array(unb64(d.p).buffer), nr = new Int8Array(unb64(d.nr).buffer), uv = new Uint16Array(unb64(d.uv).buffer), P = new Float32Array(p.length), N = new Float32Array(nr.length), U = new Float32Array(uv.length);
  for (let i = 0; i < p.length; i++) { P[i] = p[i] / 1000; N[i] = nr[i] / 127; } for (let i = 0; i < uv.length; i++) U[i] = uv[i] / 10000;
  g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('normal', new T.BufferAttribute(N, 3)); g.setAttribute('uv', new T.BufferAttribute(U, 2));
  const lights = { p: [], n: [], c: [] }, brake = { p: [], n: [], c: [] }, L = d.L, W = d.W, ly = .62;
  for (const s of [1, -1]) { collect(lights, B(.1, .14, .32), tr(L / 2 - .02, ly, s * (W / 2 - .4)), cHead); collect(lights, B(.1, .13, .32), tr(-L / 2 + .02, ly + .04, s * (W / 2 - .4)), cTail); collect(brake, B(.1, .14, .34), tr(-L / 2 + .01, ly + .04, s * (W / 2 - .4)), C(0xff2018)); }
  const empty = new T.BufferGeometry(); empty.setAttribute('position', new T.Float32BufferAttribute([], 3));
  return { paint: g, rest: empty, lights: finish(lights), glass: null, seat: { x: L * .06, y: d.H * .42, top: d.H * .95, z: W / 2 - .5 }, wheels: empty, brake: finish(brake), wpos: [], wr: .34, psx: k };
}
let CM = null;   // the ready-made low-poly car bodies (models/cars.js), converted into the game's own parts

/* ================= people ================= */
// Ready-made figures from the Quaternius modular packs (CC0). Every outfit part shares one skeleton,
// so a person is a mix of head, body, legs and feet, recoloured, moving with the pack's own animations.
const PT = {}; G.PT = PT;
// library clip -> the name the game uses for it (same names as the old pack, so they simply replace those)
const NEWNAME = { Idle_Loop: 'Idle', Walk_Loop: 'Walk', Jog_Fwd_Loop: 'Run', Sprint_Loop: 'Sprint', Punch_Cross: 'Punch_Right', Punch_Jab: 'Punch_Left', Pistol_Idle_Loop: 'Idle_Gun', Pistol_Shoot: 'Gun_Shoot', Death01: 'Death', Jump_Loop: 'Jump', Driving_Loop: 'Drive', Sitting_Idle_Loop: 'Sit', Idle_Talking_Loop: 'Talk', Swim_Fwd_Loop: 'Swim', Swim_Idle_Loop: 'Swim_Idle', Dance_Loop: 'Dance', Hit_Chest: 'Hit', Melee_Hook: 'Hook' };
const PARTRE = /^([A-Za-z0-9]+)_(Head|Body|Legs|Pants|Feet)$/;
const GRIP = { x: -.01, y: -.035, z: .045 };
export function prepPeople(models) {
  // the guns (Quaternius, CC0): one small mesh each, later hung on every person's right hand
  const gunGeo = {}, gunMat = new T.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: .6, name: 'Metal' });
  if (models.guns) for (const k in models.guns) {
    const g = models.guns[k], n = g.i.length, col = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) { const c = g.pal[g.i[t]]; for (let v = 0; v < 3; v++) col.set(c, t * 9 + v * 3); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(g.p), 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3)); geo.computeVertexNormals(); gunGeo[k] = geo;
  }
  {  // the rocket launcher is not in the pack: a simple tube with a grip and a wider back end
    const arr = { p: [], n: [], c: [] }, gr = new T.Color(0x3d4a2c), dk = new T.Color(0x1a1c1e);
    collect(arr, new T.CylinderGeometry(.055, .055, 1.05, 10).rotateZ(Math.PI / 2), tr(.12, .06, 0), gr);
    collect(arr, new T.CylinderGeometry(.08, .065, .16, 10).rotateZ(Math.PI / 2), tr(-.42, .06, 0), dk);
    collect(arr, new T.CylinderGeometry(.07, .07, .08, 10).rotateZ(Math.PI / 2), tr(.62, .06, 0), dk);
    collect(arr, B(.05, .14, .04), tr(0, -.05, 0), dk); collect(arr, B(.1, .05, .03), tr(.2, .13, 0), dk);
    gunGeo.rocket = finish(arr);
    const bat = { p: [], n: [], c: [] }, wd = new T.Color(0xb98a4e);   // a baseball bat, held upright in the fist
    collect(bat, new T.CylinderGeometry(.045, .025, .85, 10), tr(0, .32, 0), wd); collect(bat, new T.CylinderGeometry(.03, .03, .04, 8), tr(0, -.12, 0), dk);
    gunGeo.bat = finish(bat);
  }
  for (const key of ['pm', 'pw']) {
    const scene = models[key], clips = {}; for (const c of models[key + '_anim']) clips[c.name] = c;
    // the natural-looking animations, moved over from the Universal Animation Library (Quaternius, CC0)
    const lib = models[key === 'pw' ? 'aw' : 'am'];
    // the model loads in a twisted pose; put the bones back into the straight pose the new animations were made against
    if (lib && lib.rest) scene.traverse(o => { const r = o.isBone && lib.rest[o.name]; if (r) { o.quaternion.set(r[0], r[1], r[2], r[3]); o.position.set(r[4], r[5], r[6]); } });
    if (lib) for (const src in lib.clips) {
      const c = lib.clips[src], times = new Float32Array(c.n); for (let i = 0; i < c.n; i++) times[i] = Math.min(c.dur, i / lib.fps);
      const tracks = [];
      for (const b in c.q) tracks.push(new T.QuaternionKeyframeTrack(b + '.quaternion', c.q[b].length === 4 ? [0] : times, new Float32Array(c.q[b])));   // 4 numbers = a bone that stays still
      for (const b in c.p) tracks.push(new T.VectorKeyframeTrack(b + '.position', times, new Float32Array(c.p[b])));
      clips[NEWNAME[src] || src] = new T.AnimationClip(NEWNAME[src] || src, c.dur, tracks);
    }
    // moving while aiming: legs from the walk or run, upper body held in the aiming pose
    const mix = (legs, arms, name) => {
      const A = clips[legs], Bc = clips[arms]; if (!A || !Bc || !lib) return; const low = /^(Body|UpperLeg|LowerLeg|Foot)/, tr2 = A.tracks.filter(t => low.test(t.name)).map(t => t.clone());
      for (const t of Bc.tracks) if (!low.test(t.name)) tr2.push(new t.constructor(t.name, [0], Array.from(t.values.slice(0, t.getValueSize()))));
      clips[name] = new T.AnimationClip(name, A.duration, tr2);
    };
    // One-handed gun handling. Carrying: the normal animation with the right hand closed around the grip.
    // Aiming: the right arm straight out in front with the gun tilted a little, gangster style.
    scene.updateMatrixWorld(true);
    const FING = /^(Index|Middle|Ring|Pinky|Thumb)\dR$/, fist = {}, pc = clips.Punch_Right, ua = scene.getObjectByName('UpperArmR');
    if (pc && lib) for (const t of pc.tracks) { const b = t.name.split('.')[0]; if (FING.test(b)) { const n = t.times.length, i = Math.min(n - 1, Math.round(n * .35)); fist[b] = Array.from(t.values.slice(i * 4, i * 4 + 4)); } }
    // which way is right and forward for this model, measured in the straight pose
    const la0 = scene.getObjectByName('LowerArmR'), d0 = ua && la0 ? la0.getWorldPosition(new T.Vector3()).sub(ua.getWorldPosition(new T.Vector3())).setY(0).normalize() : new T.Vector3(-1, 0, 0), f0 = new T.Vector3(0, 1, 0).cross(d0).normalize();
    const bw0 = ua ? ua.getWorldQuaternion(new T.Quaternion()) : new T.Quaternion(), CHAIN = ['Body', 'Abdomen', 'Torso', 'Chest', 'ShoulderR'];
    // local rotation of the upper arm that points it forward (up = radians above level), given how the base animation holds the shoulder
    const armQ = (up, base) => {
      const keep = {}; for (const t of clips[base].tracks) { const [b, prop] = t.name.split('.'); if (prop !== 'quaternion' || !CHAIN.includes(b)) continue; const o = scene.getObjectByName(b); if (!o) continue; keep[b] = o.quaternion.clone(); o.quaternion.fromArray(t.values, 0); }
      scene.updateMatrixWorld(true); const pw = ua.parent.getWorldQuaternion(new T.Quaternion());
      for (const b in keep) scene.getObjectByName(b).quaternion.copy(keep[b]); scene.updateMatrixWorld(true);
      const R = new T.Quaternion().setFromAxisAngle(d0, up).multiply(new T.Quaternion().setFromAxisAngle(f0, 1.05)).multiply(new T.Quaternion().setFromUnitVectors(d0, f0));
      return pw.invert().multiply(R).multiply(bw0).toArray();
    };
    const ARM = ['UpperArmR', 'LowerArmR', 'WristR'];
    // while aiming on the move the back, shoulders and head stay as in the standing pose (only the legs and hips bounce), so the gun does not swing about
    const UPPER = /^(Body|Abdomen|Torso|Chest|ShoulderR|ShoulderL|Neck|Head)\.quaternion$/;
    const calm = (A, base) => {
      const I = clips.Idle; if (base === 'Idle' || !I) return A.tracks.map(t => t.clone());
      const out = A.tracks.filter(t => !UPPER.test(t.name)).map(t => t.clone());
      for (const t of I.tracks) if (UPPER.test(t.name)) out.push(new T.QuaternionKeyframeTrack(t.name, [0], Array.from(t.values.slice(0, 4))));
      return out;
    };
    const gunClip = (base, name, arm) => {
      const A = clips[base]; if (!A || !lib || !ua) return;
      const tr2 = (arm ? calm(A, base) : A.tracks.map(t => t.clone())).filter(t => { const b = t.name.split('.')[0]; return !FING.test(b) && !(arm && ARM.includes(b)); });
      for (const b in fist) tr2.push(new T.QuaternionKeyframeTrack(b + '.quaternion', [0], fist[b]));
      if (arm === 'kick') tr2.push(new T.QuaternionKeyframeTrack('UpperArmR.quaternion', [0, .07, .28], armQ(.04, 'Idle').concat(armQ(.3, 'Idle'), armQ(.04, 'Idle'))));
      else if (arm) tr2.push(new T.QuaternionKeyframeTrack('UpperArmR.quaternion', [0], armQ(.04, 'Idle')));
      if (arm) for (const b of ['LowerArmR', 'WristR']) { const o = scene.getObjectByName(b); if (o) tr2.push(new T.QuaternionKeyframeTrack(b + '.quaternion', [0], o.quaternion.toArray())); }   // straight arm: the forearm and wrist as in the straight pose
      clips[name] = new T.AnimationClip(name, A.duration, tr2);
    };
    // Long guns are held with both hands: right elbow bent with the forearm forward, left arm reaching across to the barrel.
    const Q = () => new T.Quaternion(), UPV = new T.Vector3(0, 1, 0), nd0 = d0.clone().negate(), B = n => scene.getObjectByName(n);
    const uaL = B('UpperArmL'), laR = B('LowerArmR'), laL = B('LowerArmL'), bwUL = uaL ? uaL.getWorldQuaternion(Q()) : Q(), bwFR = laR ? laR.getWorldQuaternion(Q()) : Q(), bwFL = laL ? laL.getWorldQuaternion(Q()) : Q();
    const dirV = (r, f, u) => new T.Vector3().addScaledVector(d0, r).addScaledVector(f0, f).addScaledVector(UPV, u).normalize();
    const mk = (bw, bind, dir, roll) => Q().setFromAxisAngle(dir, roll).multiply(Q().setFromUnitVectors(bind, dir)).multiply(bw);
    const FINGL = /^(Index|Middle|Ring|Pinky|Thumb)\dL$/, fistL = {}; if (pc && lib) for (const t of pc.tracks) { const b = t.name.split('.')[0]; if (FINGL.test(b)) { const n = t.times.length, i = Math.min(n - 1, Math.round(n * .35)); fistL[b] = Array.from(t.values.slice(i * 4, i * 4 + 4)); } }
    const ARM2 = ['UpperArmR', 'LowerArmR', 'WristR', 'UpperArmL', 'LowerArmL', 'WristL'];
    const rifleClip = (base, name) => {
      const A0 = clips[base]; if (!A0 || !lib || !ua || !uaL || !laR || !laL) return;
      const A = { tracks: calm(A0, base), duration: A0.duration };
      const keep = {}; for (const t of A.tracks) { const [b, prop] = t.name.split('.'); if (prop !== 'quaternion' || !(CHAIN.includes(b) || b === 'ShoulderL')) continue; const o = B(b); if (!o) continue; keep[b] = o.quaternion.clone(); o.quaternion.fromArray(t.values, 0); }
      scene.updateMatrixWorld(true); const pR = ua.parent.getWorldQuaternion(Q()), pL = uaL.parent.getWorldQuaternion(Q());
      for (const b in keep) B(b).quaternion.copy(keep[b]); scene.updateMatrixWorld(true);
      // right arm exactly as in the one-handed aim (straight out, gun level); the left arm reaches across to steady it
      const aim = dirV(.5, .86, .02), WuL = mk(bwUL, nd0, aim, -1.1), WfL = mk(bwFL, nd0, aim, -1.1);
      const loc = { UpperArmR: Q().fromArray(armQ(.04, 'Idle')), LowerArmR: B('LowerArmR').quaternion, WristR: B('WristR').quaternion, UpperArmL: pL.invert().multiply(WuL), LowerArmL: WuL.clone().invert().multiply(WfL), WristL: B('WristL').quaternion };
      const tr2 = A.tracks.filter(t => { const b = t.name.split('.')[0]; return !FING.test(b) && !FINGL.test(b) && !ARM2.includes(b); }).map(t => t.clone());
      for (const b in fist) tr2.push(new T.QuaternionKeyframeTrack(b + '.quaternion', [0], fist[b])); for (const b in fistL) tr2.push(new T.QuaternionKeyframeTrack(b + '.quaternion', [0], fistL[b]));
      for (const b in loc) tr2.push(new T.QuaternionKeyframeTrack(b + '.quaternion', [0], loc[b].toArray()));
      clips[name] = new T.AnimationClip(name, A.duration, tr2);
    };
    rifleClip('Idle', 'Aim2'); rifleClip('Walk', 'Walk_Aim2'); rifleClip('Run', 'Run_Aim2');
    for (const b of ['Idle', 'Walk', 'Run', 'Sprint']) gunClip(b, b + '_Hold', false);
    gunClip('Idle', 'Aim1', true); gunClip('Idle', 'Aim1_Shoot', 'kick'); gunClip('Walk', 'Walk_Aim', true); gunClip('Run', 'Run_Aim', true);
    scene.updateMatrixWorld(true);
    // in the straight pose the right arm points along -x with the thumb forward: barrel away from the body, top of the gun towards the thumb
    const wr = scene.getObjectByName('WristR');
    if (wr) {
      // the grip sits in the fist: half way between the wrist and the knuckles, a little into the palm, with the barrel line on the thumb side
      const wp = new T.Vector3().setFromMatrixPosition(wr.matrixWorld), kn = scene.getObjectByName('Middle2R'), kp = kn ? new T.Vector3().setFromMatrixPosition(kn.matrixWorld) : wp.clone().add(new T.Vector3(-.09, 0, 0));
      const gw = new T.Matrix4().makeBasis(new T.Vector3(-1, 0, 0), new T.Vector3(0, 0, 1), new T.Vector3(0, 1, 0));
      gw.setPosition((wp.x + kp.x) / 2 + GRIP.x, (wp.y + kp.y) / 2 + GRIP.y, (wp.z + kp.z) / 2 + GRIP.z);
      const hold = new T.Group(); hold.name = 'gunhold'; wr.matrixWorld.clone().invert().multiply(gw).decompose(hold.position, hold.quaternion, hold.scale); wr.add(hold);
      for (const k in gunGeo) { const gm = new T.Mesh(gunGeo[k], gunMat); gm.name = 'gun_' + k; gm.visible = false; hold.add(gm); }
    }
    const parts = { Head: [], Body: [], Legs: [], Feet: [] }, box = new T.Box3();
    scene.traverse(o => { const m = PARTRE.exec(o.name); if (!m) return; parts[m[2] === 'Pants' ? 'Legs' : m[2]].push(o.name); if (m[1] === 'Casual') box.expandByObject(o); });
    const h = box.max.y - box.min.y;
    smoothNormals(scene);   // soft, rounded figures
    PT[key] = { scene, clips, parts, k: (key === 'pw' ? 1.68 : 1.8) / h, y: -box.min.y };
  }
  try { buildXP(peopleStyle() === 'new' ? models.ub : models.xp, gunGeo, gunMat); } catch (e) { console.warn('realistic people failed', e); XP.m.length = XP.f.length = XP.c.length = 0; }
}
// ---- the realistic people (Mixamo-rigged, models/xp.js): they borrow every animation of the older figures
const XP = { m: [], f: [], c: [] };
const MXMAP = {};
{ const pairs = [['Hips', 'Hips'], ['Spine', 'Abdomen'], ['Spine1', 'Torso'], ['Spine2', 'Chest'], ['Neck', 'Neck'], ['Head', 'Head']];
  for (const sd of ['Left', 'Right']) { const L = sd[0]; pairs.push(['' + sd + 'Shoulder', 'Shoulder' + L], ['' + sd + 'Arm', 'UpperArm' + L], ['' + sd + 'ForeArm', 'LowerArm' + L], ['' + sd + 'Hand', 'Wrist' + L], ['' + sd + 'UpLeg', 'UpperLeg' + L], ['' + sd + 'Leg', 'LowerLeg' + L], ['' + sd + 'Foot', 'Foot' + L]); }
  for (const [a, b] of pairs) MXMAP['mixamorig' + a] = b; }
const MXALIAS = { UpperArmL: 'mixamorigLeftArm', UpperArmR: 'mixamorigRightArm', LowerArmL: 'mixamorigLeftForeArm', LowerArmR: 'mixamorigRightForeArm', UpperLegL: 'mixamorigLeftUpLeg', UpperLegR: 'mixamorigRightUpLeg', LowerLegL: 'mixamorigLeftLeg', LowerLegR: 'mixamorigRightLeg', Head: 'mixamorigHead', Neck: 'mixamorigNeck', Chest: 'mixamorigSpine2', Abdomen: 'mixamorigSpine' };
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
function unb64b(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
// the FBX loader prints one warning for every vertex with too many bone weights (thousands per character): that floods the console and makes the game stutter. Drop that one message while loading.
function quietParse(fn) { const w = console.warn; console.warn = (...a) => { if (typeof a[0] === 'string' && a[0].indexOf('skinning weights') >= 0) return; w.apply(console, a); }; try { return fn(); } finally { console.warn = w; } }
// which people the game uses: the original figures (default) or the realistic ones; the choice is kept in the browser and changed in the Statistics menu
export function peopleStyle() { try { const v = localStorage.getItem('papillon.people3'); return v === 'real' || v === 'classic' ? v : 'new'; } catch (e) { return 'new'; } }   // new key: earlier saved choices no longer count
export function togglePeople() { try { const c = peopleStyle(); localStorage.setItem('papillon.people3', c === 'new' ? 'classic' : c === 'classic' ? 'real' : 'new'); } catch (e) { } }
function buildXP(xp, gunGeo, gunMat) {
  if (!xp || peopleStyle() === 'classic') return;
  const NEW = peopleStyle() === 'new', mgr = new T.LoadingManager(), clipsOf = {}; mgr.setURLModifier(() => PIXEL);
  if (NEW) xp = ubSpecs(xp);
  const mk = NEW ? mkUB : (e, sex, key) => {
    const scene = quietParse(() => new FBXLoader(mgr).parse(unb64b(e.fbx).buffer, '')), tex = new T.TextureLoader().load(e.tex); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new T.MeshStandardMaterial({ map: tex, roughness: .85, metalness: 0 });
    scene.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = true; o.frustumCulled = false; } });
    scene.animations = []; scene.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(scene), h = box.max.y - box.min.y;
    return { key, sex, scene, mat, h, k: (sex === 'f' ? 1.68 : 1.8) / h, y: -box.min.y };
  };
  const done = [];
  for (const sex of ['m', 'f']) {
    const list = MOBILE && !NEW ? xp[sex].slice(0, 5) : xp[sex];
    list.forEach((e, i) => { const r = mk(e, sex, 'x' + sex + i); XP[sex].push(r); done.push(r); });
  }
  (xp.c || []).forEach((e, i) => { const r = mk(e, e.s, 'xc' + i); XP.c.push(r); done.push(r); });
  const holdOf = {};
  for (const sex of ['m', 'f']) { const ref = XP[sex][0]; if (ref) { const o = retargetXP(ref, PT[sex === 'f' ? 'pw' : 'pm']); clipsOf[sex] = o.clips; holdOf[sex] = o.hold; } }
  for (const r of done) if (clipsOf[r.sex]) {
    PT[r.key] = { scene: r.scene, clips: clipsOf[r.sex], x: true, mat: r.mat, k: r.k, y: r.y, ub: r.ubSpec || null, ubBody: r.ubBody };
    // the guns hang on the right hand, where the old figures held them
    const hand = r.scene.getObjectByName('mixamorigRightHand'), hd = holdOf[r.sex];
    if (hand && hd && gunGeo) { const hold = new T.Group(); hold.name = 'gunhold'; hold.position.fromArray(hd.p); hold.quaternion.fromArray(hd.q); hold.scale.setScalar(hd.s); hand.add(hold);
      for (const k in gunGeo) { const gm = new T.Mesh(gunGeo[k], gunMat); gm.name = 'gun_' + k; gm.visible = false; hold.add(gm); } }
  }
  XP.c = XP.c.filter(r => PT[r.key]);
}
// ---- the new people (Quaternius Universal Base Characters, models/ub.js): their bones are renamed to the Mixamo names so they use the same animation copying as the realistic ones.
// Clothes are painted into a copy of the skin picture (by which bone moves each triangle), so one person = one body mesh, eyes and hair.
const UBMAP = { pelvis: 'mixamorigHips', spine_01: 'mixamorigSpine', spine_02: 'mixamorigSpine1', spine_03: 'mixamorigSpine2', neck_01: 'mixamorigNeck', Head: 'mixamorigHead' };
for (const [a, S] of [['l', 'Left'], ['r', 'Right']]) Object.assign(UBMAP, { ['clavicle_' + a]: 'mixamorig' + S + 'Shoulder', ['upperarm_' + a]: 'mixamorig' + S + 'Arm', ['lowerarm_' + a]: 'mixamorig' + S + 'ForeArm', ['hand_' + a]: 'mixamorig' + S + 'Hand', ['thigh_' + a]: 'mixamorig' + S + 'UpLeg', ['calf_' + a]: 'mixamorig' + S + 'Leg', ['foot_' + a]: 'mixamorig' + S + 'Foot' });
const ubParse = (str) => new Promise((res, rej) => loader.parse(str, '', g => res(g), rej));
const ubImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function parseUB(raw) {
  const out = { eye: await ubImg(raw.eye), hair: {} };
  for (const sex of ['m', 'f']) {
    const g = await ubParse(raw[sex].gltf), scene = g.scene; let body = null;
    scene.traverse(o => { if (o.isSkinnedMesh && /^MI_Superhero/.test(o.material.name) ) body = o; });
    const geo = body.geometry, names = body.skeleton.bones.map(b => b.name), si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, n = geo.attributes.position.count, W = new Float32Array(n * 4);   // per vertex: skin, shirt, trousers, shoes
    const pi = names.indexOf('pelvis'), waistY = new T.Vector3().setFromMatrixPosition(body.skeleton.boneInverses[pi].clone().invert()).y + .09, sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let v = 0; v < n; v++) {
      const t = sstep(waistY - .012, waistY + .012, geo.attributes.position.getY(v));   // above this height the torso bones are the shirt, below it the trousers
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w <= 0) continue; const nm = names[si.getComponent(v, k)];
        if (/^(spine_0|clavicle|upperarm)/.test(nm)) { W[v * 4 + 1] += w * t; W[v * 4 + 2] += w * (1 - t); } else if (nm === 'pelvis') { W[v * 4 + 1] += w * t; W[v * 4 + 2] += w * (1 - t); }
        else if (/^(thigh|calf)/.test(nm)) W[v * 4 + 2] += w; else if (/^(foot|ball)/.test(nm)) W[v * 4 + 3] += w; else W[v * 4] += w; }
    }
    // paint a map of what each pixel of the skin picture is (skin / shirt / trousers / shoes), smooth along the cloth edges
    const S = 512, lab = new Uint8Array(S * S).fill(255), uv = geo.attributes.uv, idx = geo.index.array;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2], ax = uv.getX(a) * S, ay = uv.getY(a) * S, bx = uv.getX(b) * S, by = uv.getY(b) * S, cx = uv.getX(c) * S, cy = uv.getY(c) * S;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by, cy)));
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + .5, py = y + .5, l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, l3 = 1 - l1 - l2;
        if (l1 < -.02 || l2 < -.02 || l3 < -.02) continue;
        let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = l1 * W[a * 4 + k] + l2 * W[b * 4 + k] + l3 * W[c * 4 + k]; if (w > bw) { bw = w; best = k; } }
        lab[y * S + x] = best;
      }
    }
    for (let pass = 0; pass < 3; pass++) { const cp = lab.slice(); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { if (cp[y * S + x] !== 255) continue; const nb = [x > 0 ? cp[y * S + x - 1] : 255, x < S - 1 ? cp[y * S + x + 1] : 255, y > 0 ? cp[(y - 1) * S + x] : 255, y < S - 1 ? cp[(y + 1) * S + x] : 255].filter(q => q !== 255); if (nb.length) lab[y * S + x] = nb.find(q => q > 0) || 0; } }   // spread a little past the edges of the picture's islands, so no skin shows at the seams
    const kind = lab;
    scene.traverse(o => { if (o.isBone && UBMAP[o.name]) o.name = UBMAP[o.name]; });
    out[sex] = { scene, body, kind, skin: await Promise.all(raw[sex].skin.map(ubImg)), skinURL: raw[sex].skin };
  }
  for (const k in raw.hair) { const g = await ubParse(raw.hair[k]); let m = null; g.scene.traverse(o => { if (o.isSkinnedMesh) m = o; }); out.hair[k] = m.geometry; }
  return out;
}
const UBHAIR = [0x16110d, 0x2a1c12, 0x4a2f1a, 0x7a5430, 0xc9a24a, 0xb04a1e, 0x8a8a8a, 0x0e0e10];
const UBSHIRT = [0xc0392b, 0x2c4a7a, 0xe8e8e8, 0x2f2f33, 0x3f7a4a, 0xd0a020, 0x7a2c6a, 0xd9d2c0, 0x1f6f8b, 0xe07a5f, 0x5a5a8a, 0x8b5a2b];
const UBPANTS = [0x2d3f63, 0x1d1d22, 0x6b5a3e, 0x4a4a50, 0x3a4a3a, 0x7a6a50, 0x23304a, 0xcfc7b0];
const UBSHOE = [0xf0f0f0, 0x151517, 0x5a3a22, 0x8a8a90];
function ubSpecs(ub) {
  let seed = 12345; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }, pk = a => a[Math.floor(r() * a.length)];   // own random numbers: the city's own sequence is left alone
  const out = { m: [], f: [], c: [] };
  for (const sex of ['m', 'f']) for (let i = 0; i < (MOBILE ? 12 : 28); i++) out[sex].push({ ub, sex, skin: r() < .3 ? 1 : 0, shirt: pk(UBSHIRT), pants: pk(UBPANTS), shoe: pk(UBSHOE), hairC: pk(UBHAIR), hair: sex === 'm' ? pk(['Hair_SimpleParted', 'Hair_SimpleParted', 'Hair_Buzzed', 'Hair_Buzzed']) : pk(['Hair_Long', 'Hair_Buns', 'Hair_BuzzedFemale']), beard: sex === 'm' && r() < .3 });
  for (let i = 0; i < 4; i++) { const sex = i % 2 ? 'f' : 'm'; out.c.push({ ub, sex, s: sex, skin: r() < .3 ? 1 : 0, shirt: 0x1f2d4a, pants: 0x161d2e, shoe: 0x151517, hairC: pk(UBHAIR.slice(0, 3)), hair: sex === 'm' ? 'Hair_Buzzed' : 'Hair_BuzzedFemale', beard: false, cop: true }); }
  return out;
}
const bakeCache = new Map();
function ubBake(ub, sex, skin, shirt, pants, shoe) {
  const key = sex + skin + '|' + shirt + '|' + pants + '|' + shoe; if (bakeCache.has(key)) return bakeCache.get(key);
  const d = ub[sex], img = d.skin[skin], S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); g.drawImage(img, 0, 0, S, S);
  const im = g.getImageData(0, 0, S, S), p = im.data, cols = [null, new T.Color(shirt), new T.Color(pants), new T.Color(shoe)].map(c => c && [c.r, c.g, c.b].map(v => Math.round(Math.pow(v, 1 / 2.2) * 255)));   // the picture is sRGB
  for (let i = 0; i < S * S; i++) { const k = d.kind[i]; if (k > 0 && k < 4) { const c = cols[k]; p[i * 4] = c[0]; p[i * 4 + 1] = c[1]; p[i * 4 + 2] = c[2]; } }
  g.putImageData(im, 0, 0);
  const tex = new T.CanvasTexture(cv); tex.flipY = false; tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new T.MeshStandardMaterial({ map: tex, roughness: .85, metalness: 0 }); bakeCache.set(key, mat); return mat;
}
function mkUB(e, sex, key) {
  const ub = e.ub, d = ub[sex], root = SkeletonUtils.clone(d.scene); let body = null, eyes = null; const brows = [];
  root.traverse(o => { if (!o.isSkinnedMesh) return; const mn = o.material.name; if (/^MI_Superhero/.test(mn)) body = o; else if (/^MI_Eyes/.test(mn)) eyes = o; else brows.push(o); });
  const hairMat = new T.MeshStandardMaterial({ color: e.hairC, roughness: .7, metalness: 0, side: T.DoubleSide });
  body.material = ubBake(ub, sex, e.skin, e.shirt, e.pants, e.shoe); const eyeTex = new T.Texture(ub.eye); eyeTex.needsUpdate = true; eyeTex.colorSpace = T.SRGBColorSpace; eyeTex.flipY = false;
  eyes.material = new T.MeshStandardMaterial({ map: eyeTex, roughness: .35, metalness: 0 }); for (const b of brows) b.material = hairMat;
  const addHair = nm => { const m = new T.SkinnedMesh(ub.hair[nm], hairMat); m.bind(body.skeleton, body.bindMatrix); body.parent.add(m); m.name = 'hair'; };
  addHair(e.hair); if (e.beard) { addHair('Hair_Beard'); body.parent.children[body.parent.children.length - 1].name = 'beard'; }
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  root.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(body), h = box.max.y - box.min.y;
  return { key, sex, scene: root, mat: body.material, h, k: (sex === 'f' ? 1.68 : 1.8) / h, y: -box.min.y, ubSpec: e, ubBody: body };
}
// copy an animation from the old skeleton to the Mixamo one: every bone turns by the same amount (in world space) as its partner
const NOSH = /Shoulder$/;
function retargetXP(ref, srcT) {
  const tgt = ref.scene, src = SkeletonUtils.clone(srcT.scene); src.updateMatrixWorld(true); tgt.updateMatrixWorld(true);
  const sb = {}, tOrder = []; src.traverse(o => { if (o.isBone) sb[o.name] = o; }); tgt.traverse(o => { if (o.isBone) tOrder.push(o); });
  const Q = () => new T.Quaternion(), wq = o => o.getWorldQuaternion(Q()), W0 = {}, L0 = {}, S0 = {}, names = Object.keys(MXMAP);
  for (const o of tOrder) { W0[o.name] = wq(o); L0[o.name] = o.quaternion.clone(); }
  for (const n of names) if (sb[MXMAP[n]]) S0[n] = wq(sb[MXMAP[n]]);
  // the new people stand with their arms out; the old animations were made for arms-down. Bring each bone's rest direction in line with its partner's first
  const FIX = {}, CHILD = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head' }, FALL = { Head: 'Neck', LeftHand: 'LeftForeArm', RightHand: 'RightForeArm', LeftFoot: 'LeftLeg', RightFoot: 'RightLeg' };
  for (const sd of ['Left', 'Right']) { CHILD[sd + 'Arm'] = sd + 'ForeArm'; CHILD[sd + 'ForeArm'] = sd + 'Hand'; CHILD[sd + 'UpLeg'] = sd + 'Leg'; CHILD[sd + 'Leg'] = sd + 'Foot'; }
  const tbn = {}; for (const o of tOrder) tbn[o.name] = o;
  const dirOf = (a, b) => b.getWorldPosition(new T.Vector3()).sub(a.getWorldPosition(new T.Vector3())).normalize();
  for (const full of names) { const n = full.slice(9), c = CHILD[n]; if (!c || !sb[MXMAP[full]] || !sb[MXMAP['mixamorig' + c]]) continue; FIX[full] = Q().setFromUnitVectors(dirOf(tbn[full], tbn['mixamorig' + c]), dirOf(sb[MXMAP[full]], sb[MXMAP['mixamorig' + c]])); }
  for (const full of names) { const n = full.slice(9); if (!FIX[full] && FALL[n]) FIX[full] = (FIX['mixamorig' + FALL[n]] || Q()).clone(); }
  for (const full of names) if (FIX[full] && W0[full]) W0[full] = FIX[full].clone().multiply(W0[full]);
  const hipT = tOrder.find(o => o.name === 'mixamorigHips'), hipS = sb.Body, hipTP = hipT.parent, PW = hipTP.matrixWorld.clone(); PW.setPosition(0, 0, 0); const PWi = PW.clone().invert();
  const hipRest = hipS.getWorldPosition(new T.Vector3()), ratio = srcT.k / ref.k, restP = hipT.position.clone();
  // where the gun sits in the hand (same place, same direction, same size as on the old figure)
  let hold = null;
  { const wr = sb.WristR, gh = wr && wr.getObjectByName('gunhold'), hb = tbn.mixamorigRightHand;
    if (gh && hb) {
      const gp = new T.Vector3(), gq = Q(), gs = new T.Vector3(); gh.updateWorldMatrix(true, false); gh.matrixWorld.decompose(gp, gq, gs);
      const wp = wr.getWorldPosition(new T.Vector3()), f = srcT.k / ref.k, hp = hb.getWorldPosition(new T.Vector3()), hs = new T.Vector3().setFromMatrixScale(hb.matrixWorld);
      const Mh = new T.Matrix4().compose(hp, W0.mixamorigRightHand, hs), want = new T.Matrix4().compose(hp.clone().add(gp.clone().sub(wp).multiplyScalar(f)), gq, new T.Vector3(1, 1, 1).multiplyScalar(gs.x * f));
      const loc = Mh.invert().multiply(want), lp2 = new T.Vector3(), lq = Q(), ls = new T.Vector3(); loc.decompose(lp2, lq, ls); hold = { p: lp2.toArray(), q: lq.toArray(), s: ls.x };
    } }
  const ABD = {}, ABDA = .14; { const hx = hipT.getWorldPosition(new T.Vector3()).x; for (const sd of ['Left', 'Right']) for (const p of ['Arm', 'ForeArm', 'Hand']) { const b = tbn['mixamorig' + sd + p]; if (!b) continue; const sg = Math.sign(tbn['mixamorig' + sd + 'Arm'].getWorldPosition(new T.Vector3()).x - hx) || 1; ABD[b.name] = Q().setFromAxisAngle(new T.Vector3(0, 0, 1), sg * ABDA); } }
  const out = {}, mx = new T.AnimationMixer(src), parentW0 = {}; for (const o of tOrder) parentW0[o.name] = o.parent && !o.parent.isBone ? wq(o.parent) : null;
  for (const name in srcT.clips) {
    const clip = srcT.clips[name], n = Math.max(2, Math.ceil(clip.duration * 30) + 1), times = new Float32Array(n), vals = {}, pos = new Float32Array(n * 3);
    for (const o of tOrder) if (MXMAP[o.name] && sb[MXMAP[o.name]] && !NOSH.test(o.name)) vals[o.name] = new Float32Array(n * 4);   // the collar bones stay as modelled: driving them made the shoulders cave in
    mx.stopAllAction(); mx.uncacheClip(clip); const act = mx.clipAction(clip); act.play();
    const WF = {}, tmp = new T.Vector3();
    for (let i = 0; i < n; i++) {
      const t = Math.min(clip.duration, i / 30); times[i] = t; mx.setTime(t); src.updateMatrixWorld(true);
      for (const o of tOrder) {
        const s = sb[MXMAP[o.name]], pw = o.parent && o.parent.isBone ? WF[o.parent.name] : parentW0[o.name];
        let W; if (s && S0[o.name] && !NOSH.test(o.name)) { W = wq(s).multiply(S0[o.name].clone().invert()).multiply(W0[o.name]); } else W = (pw || Q()).clone().multiply(L0[o.name]);
        if (ABD[o.name]) W = ABD[o.name].clone().multiply(W);   // arms held a little away from the body, so the sleeves and shoulders do not pinch in
        WF[o.name] = W;
        if (vals[o.name]) { const l = (pw || Q()).clone().invert().multiply(W); l.toArray(vals[o.name], i * 4); }
      }
      tmp.copy(hipS.getWorldPosition(new T.Vector3())).sub(hipRest).multiplyScalar(ratio).applyMatrix4(PWi).add(restP).toArray(pos, i * 3);
    }
    const tracks = []; for (const k in vals) tracks.push(new T.QuaternionKeyframeTrack(k + '.quaternion', times, vals[k]));
    tracks.push(new T.VectorKeyframeTrack('mixamorigHips.position', times, pos));
    out[name] = new T.AnimationClip(name, clip.duration, tracks);
  }
  return { clips: out, hold };
}
export const xpKeys = sex => XP[sex === 'w' || sex === 'f' ? 'f' : 'm'].map(e => e.key);
G.smoothDBG = r => smoothNormals(r); G.dressDBG = (n, k) => dressUp(n, k); G.lookOptionsDBG = s => lookOptions(s); G.syncOccDBG = c => syncOcc(c); G.newPersonDBG = (k, l) => newPerson(k, l); G.animDBG = (p, n, o, t) => anim(p, n, o, t); G.xpKeysDBG = sx => xpKeys(sx); G.copKeyDBG = () => copKey();
// uniforms for the classic figures: a cap or helmet and a badge, so police, fire crews and soldiers are easy to tell apart
export function copLook() { const o = lookOptions('m'), f = a => a.find(n => n.startsWith('Suit_')) || a.find(n => n.startsWith('Casual_')) || a[0]; return { head: f(o.head), body: f(o.body), legs: f(o.legs), feet: f(o.feet), skin: pick([0xf1c9a5, 0xc68642, 0x8d5524, 0xe0ac7e]), hair: pick([0x1c1410, 0x4a2f1a, 0x101010]), top: 0x3d78e6, bottom: 0x1a2a5c }; }
const uMat = {}, uM = (c, rough) => uMat[c] || (uMat[c] = new T.MeshStandardMaterial({ color: c, roughness: rough === undefined ? .6 : rough, metalness: .1 }));
export function dressUp(n, kind) {
  if (!n || !n.h || n.dressed || (n.h.getObjectByName('mixamorigHips') && !n.ub)) return; n.dressed = kind;
  let head = n.h.getObjectByName('Head'), chest = n.h.getObjectByName('Chest') || n.h.getObjectByName('Torso');
  if (n.ub) {   // the new people: hats hang in an upright holder on the head bone (whose own axes are turned)
    n.h.updateMatrixWorld(true); const holder = bone => { if (!bone) return null; const g = new T.Group(); bone.add(g); g.quaternion.copy(bone.getWorldQuaternion(new T.Quaternion()).invert().multiply(n.h.getWorldQuaternion(new T.Quaternion()))); return g; };
    head = holder(n.h.getObjectByName('mixamorigHead')); chest = holder(n.h.getObjectByName('mixamorigSpine2'));
  }
  if (!head) return;
  if (n.ub && (kind === 'fire' || kind === 'army')) n.m.traverse(o => { if (o.name === 'hair') o.visible = false; });   // the helmet covers the hair
  n.h.updateMatrixWorld(true); const ws = head.getWorldScale(new T.Vector3()).x || 1, u = 1 / ws;   // bones carry the figure's own scale: build in metres
  const add = (par, mesh, x, y, z) => { const pu = 1 / (par.getWorldScale(new T.Vector3()).x || 1), hs = n.ub ? .82 : 1; mesh.scale.multiplyScalar(pu * hs); mesh.position.set(x * pu * hs, (y + (n.ub ? .0 : 0)) * pu, z * pu * hs); mesh.castShadow = true; par.add(mesh); return mesh; };
  const cyl = (r, h, c, seg) => new T.Mesh(new T.CylinderGeometry(r, r * 1.02, h, seg || 14), uM(c)), box = (w, h, d, c) => new T.Mesh(new T.BoxGeometry(w, h, d), uM(c));
  if (kind === 'police') {
    add(head, cyl(.125, .07, 0xf1f3f7), 0, .21, -.01); add(head, cyl(.13, .02, 0x16224a), 0, .175, -.01); add(head, box(.2, .012, .1, 0x0a0f22), 0, .175, .12); add(head, box(.04, .035, .01, 0xe3b53a), 0, .215, .125);
    if (chest) { add(chest, box(.05, .06, .012, 0xe3b53a), .09, .06, .13); }
  } else if (kind === 'guard') {   // prison guards: pale khaki cap with a red band, silver badge
    add(head, cyl(.125, .07, 0xe6dcb4), 0, .21, -.01); add(head, cyl(.13, .02, 0xc4281f), 0, .175, -.01); add(head, box(.2, .012, .1, 0x2a2418), 0, .175, .12); add(head, box(.04, .035, .01, 0xd0d4da), 0, .215, .125);
    if (chest) { add(chest, box(.05, .06, .012, 0xd0d4da), .09, .06, .13); }
  } else if (kind === 'fire') {
    const dome = new T.Mesh(new T.SphereGeometry(.135, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), uM(0xf2c315)); add(head, dome, 0, .15, -.01); add(head, cyl(.15, .015, 0xf2c315, 16), 0, .15, -.01); add(head, box(.05, .05, .1, 0xd9a60c), 0, .26, -.01);
  } else if (kind === 'army') {
    const dome = new T.Mesh(new T.SphereGeometry(.14, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), uM(0x4a5a2e)); add(head, dome, 0, .15, -.01); add(head, cyl(.155, .015, 0x3c4a25, 16), 0, .15, -.01);
  }
}
export const copKey = () => XP.c.length ? XP.c[Math.floor(rnd() * XP.c.length)].key : 'pm';
export const civKey = () => { const sex = rnd() < .5 ? 'm' : 'f', l = XP[sex]; if (!l.length) return sex === 'm' ? 'pm' : 'pw'; return l[Math.floor(rnd() * l.length)].key; };
const SKIN = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0x6b3f1d, 0xffdbb5, 0xd9a074];
const HAIR = [0x1c1410, 0x3b2516, 0x6a4a2a, 0xb08a4a, 0xd8c89a, 0x8a8a86, 0x7a2f1a, 0x101010];
const CLOTH = [0x2f6fde, 0xc23b3b, 0x2f8f5a, 0xe0b23a, 0xf2f0ea, 0x22242a, 0x7a4fa8, 0xe07a2f, 0x3aa0a8, 0x8a6a4a, 0xd96a9a, 0x4a5a78, 0x9aa7b0];
const KEEPMAT = /^(Eye|White|Black|Gold|Earrings|Metal|Metal_Dark|Visor|Swat|Swat_Black|Worker_Vest|Brown|Brown2|Brown_02|DarkBrown|LightBrown|Beige)$/;
// look: {sex, head, body, legs, feet (part names), skin, hair, top, bottom (colours; null keeps the original)}.
// Without a look the person is a random mix.
// the women: fuller hips and bust with a slimmer waist (the bones are scaled; each one cancels what the bone above it did)
const WE = { Hips: [1.28, 1, 1.2], Abdomen: [.88, 1, 1], Torso: [1, 1, 1.04], Chest: [1.02, 1, 1.2], Neck: [1, 1, 1], Head: [1, 1, 1], ShoulderL: [1, 1, 1], ShoulderR: [1, 1, 1], UpperLegL: [1.05, 1, 1.05], UpperLegR: [1.05, 1, 1.05] };
const WP = { Abdomen: 'Hips', Torso: 'Abdomen', Chest: 'Torso', Neck: 'Chest', ShoulderL: 'Chest', ShoulderR: 'Chest', UpperLegL: 'Hips', UpperLegR: 'Hips' };
function shapeWoman(m) { const bn = {}; m.traverse(o => { if (o.isBone) bn[o.name] = o; }); for (const k in WE) { const b = bn[k]; if (!b) continue; const pe = WP[k] ? WE[WP[k]] : [1, 1, 1], e = WE[k]; b.scale.set(e[0] / pe[0], e[1] / pe[1], e[2] / pe[2]); } }
export function newPerson(key, look) {
  let tint = null;
  if ((key === 'pm' || key === 'pw') && XP.m.length) {   // everybody is one of the realistic people; a coloured top (gang, prisoner) tints the clothes
    const l = XP[key === 'pw' ? 'f' : 'm'], pickd = look && l.find(q => q.key === look.head); key = (pickd || l[Math.floor(rnd() * l.length)]).key;
    if (look && (!pickd || PT[key].ub) && (look.top != null || look.bottom != null)) tint = look.top != null ? look.top : -1;
  }
  const t = PT[key], m = SkeletonUtils.clone(t.scene), keep = {}, mats = {};
  if (key === 'pw') shapeWoman(m);
  if (t.x) {
    const fh = t.ub ? rr(.93, 1.07) : 1, fw = t.ub ? (t.ub.sex === 'm' ? rr(.80, .97) : rr(.93, 1.06)) : 1;   // the male base body is built like a superhero: slim him down   // nobody is quite the same height and build as the next person
    m.scale.set(t.k * fw, t.k * fh, t.k * fw); m.position.y = t.y * t.k * fh; const h = new T.Group(); h.add(m); G.scene.add(h);
    if (tint != null && t.ub) { const sp = t.ub, mat = ubBake(sp.ub, sp.sex, sp.skin, tint >= 0 ? tint : sp.shirt, look && look.bottom != null ? look.bottom : sp.pants, sp.shoe); m.traverse(o => { if (o.isSkinnedMesh && /^MI_Superhero/.test(o.name) === false && o.material === t.mat) o.material = mat; }); }   // a gang or prison top: the shirt is painted in that colour
    else if (tint != null && tint >= 0) { const mat = t.mat.clone(); mat.color.set(0xffffff).lerp(new T.Color(tint), .55); m.traverse(o => { if (o.isMesh) o.material = mat; }); }
    const guns = {}; m.traverse(o => { if (o.name.startsWith('gun_')) guns[o.name.slice(4)] = o; });
    return { h, m, mixer: new T.AnimationMixer(m), clips: t.clips, acts: {}, cur: null, pistol: guns.pistol || null, guns, ub: !!t.ub };
  }
  const CATKEY = { Head: 'head', Body: 'body', Legs: 'legs', Feet: 'feet' };
  for (const cat in t.parts) {
    const want = look && look[CATKEY[cat]];
    if (want && t.parts[cat].includes(want)) keep[want] = cat;
    else { const opts = t.parts[cat].filter(n => look ? n.startsWith('Casual_') : !n.startsWith('Swat_')); keep[opts[Math.floor(rnd() * opts.length)]] = cat; }
  }
  const kill = []; let pistol = null;
  m.traverse(o => { if (PARTRE.test(o.name) && !keep[o.name]) kill.push(o); else if (o.name === 'Pistol') pistol = o; });
  for (const o of kill) o.parent.remove(o);
  if (pistol) pistol.visible = false;
  const guns = {}; m.traverse(o => { if (o.name.startsWith('gun_')) guns[o.name.slice(4)] = o; }); if (guns.pistol) pistol = guns.pistol;
  const skin = look ? look.skin : pick(SKIN), hair = look ? look.hair : pick(HAIR);
  const catOf = o => { for (let q = o; q; q = q.parent) if (keep[q.name]) return keep[q.name]; return ''; };
  m.traverse(o => {
    if (!o.isMesh) return; o.castShadow = true; o.frustumCulled = false;
    const name = o.material.name, cat = catOf(o), key2 = cat + '|' + name; let c = mats[key2];
    if (!c) {
      c = o.material.clone(); c.metalness = 0; c.roughness = .8;
      if (/^Skin/.test(name)) c.color.set(skin); else if (/Hair|Eyebrow|Moustache/.test(name)) c.color.set(hair);
      else if (!KEEPMAT.test(name)) {
        if (!look) c.color.set(pick(CLOTH));
        else if (cat === 'Body' && look.top != null) c.color.set(look.top);
        else if (cat === 'Legs' && look.bottom != null) c.color.set(look.bottom);
      }
      mats[key2] = c;
    }
    o.material = c;
  });
  const hv = look ? 1 : rr(.94, 1.06), k = t.k * hv;
  m.scale.multiplyScalar(k); m.position.y = t.y * k;
  const h = new T.Group(); h.add(m); G.scene.add(h);
  return { h, m, mixer: new T.AnimationMixer(m), clips: t.clips, acts: {}, cur: null, pistol, guns };
}
// switch a person to a named animation, cross-fading from the current one
function anim(p, name, once, ts) {
  if (p.cur === name) { if (ts) p.acts[name].timeScale = ts; return; }
  if (name === 'Death' && p.clips.Death && !p.clips.Death._cut) { const c = p.clips.Death, fr = Math.round(c.duration * 30) - 3; const sc = T.AnimationUtils.subclip(c, 'Death', 0, fr, 30); sc._cut = true; p.clips.Death = sc; }   // the last keyframe of the clip is the standing pose: stop just before it, so the body stays lying
  let a = p.acts[name]; if (!a) { if (!p.clips[name]) return; a = p.acts[name] = p.mixer.clipAction(p.clips[name]); }
  a.reset(); a.timeScale = ts || 1; a.setLoop(once ? T.LoopOnce : T.LoopRepeat, Infinity); a.clampWhenFinished = !!once; if (!once && p.clips[name]) a.time = Math.random() * p.clips[name].duration; a.fadeIn(.22).play();   // looping clips start at a random point, so a crowd doesn't breathe in step
  if (p.cur && p.acts[p.cur]) p.acts[p.cur].fadeOut(.22);
  p.cur = name;
}

export const SKINS = SKIN, HAIRS = HAIR, CLOTHS = CLOTH;
export function lookOptions(sex) { if (XP.m.length) return { head: xpKeys(sex), body: [''], legs: [''], feet: [''] }; const t = PT[sex === 'w' ? 'pw' : 'pm']; return { head: t.parts.Head.slice().sort(), body: t.parts.Body.slice().sort(), legs: t.parts.Legs.slice().sort(), feet: t.parts.Feet.slice().sort() }; }
export function defaultLook(sex) {
  if (XP.m.length) return { sex: sex === 'w' ? 'w' : 'm', head: xpKeys(sex)[0], body: '', legs: '', feet: '', skin: 0xe0ac7e, hair: 0x2a1c14, top: null, bottom: null };
  const o = lookOptions(sex), f = a => a.find(n => n.startsWith('Casual_')) || a[0];
  return { sex: sex === 'w' ? 'w' : 'm', head: f(o.head), body: f(o.body), legs: f(o.legs), feet: f(o.feet), skin: 0xe0ac7e, hair: 0x2a1c14, top: null, bottom: null };
}
// make sure a saved look only names parts that exist
export function cleanLook(l) {
  if (!l || (l.sex !== 'm' && l.sex !== 'w')) return defaultLook('m');
  if (XP.m.length) { const d = defaultLook(l.sex); return Object.assign(d, { head: xpKeys(l.sex).includes(l.head) ? l.head : d.head }); }
  const o = lookOptions(l.sex), d = defaultLook(l.sex), num = (v, dflt) => typeof v === 'number' ? v : dflt;
  return { sex: l.sex, head: o.head.includes(l.head) ? l.head : d.head, body: o.body.includes(l.body) ? l.body : d.body, legs: o.legs.includes(l.legs) ? l.legs : d.legs, feet: o.feet.includes(l.feet) ? l.feet : d.feet,
    skin: num(l.skin, d.skin), hair: num(l.hair, d.hair), top: l.top == null ? null : num(l.top, null), bottom: l.bottom == null ? null : num(l.bottom, null) };
}
export function makePlayer(look) {
  const old = G.player; if (old) G.scene.remove(old.h);
  const p = newPerson(look.sex === 'w' ? 'pw' : 'pm', look);
  Object.assign(p, { x: 65, z: 6, y: 0, vy: 0, yaw: -Math.PI / 2, car: null, speed: 0, health: 100, sex: look.sex, punchT: 0 });
  if (old) { p.x = old.x; p.z = old.z; p.yaw = old.yaw; p.y = old.y; p.health = old.health; }
  G.player = p; return p;
}
// people who stand in one place, such as shop staff
G.npcs = [];
export function makeNPC(key, look, x, z, yaw) {
  const p = newPerson(key, Object.assign({ sex: key === 'pw' ? 'w' : 'm' }, look));
  p.h.position.set(x, 0, z); p.h.rotation.y = yaw; anim(p, 'Idle'); G.npcs.push(p); return p;
}
export { anim as playAnim, clearLine };
const npcCp = { x: 0, z: 0 };
const npcFixed = n => n.cur === 'Sit' || n.h.position.y > .3;   // someone in a bed or on a chair stays there
// people standing about are solid: you cannot walk through them
export function pushNPCs(p) {
  for (const n of G.npcs) { if (!n.h.visible || n.dead || npcFixed(n)) continue; const dx = p.x - n.h.position.x, dz = p.z - n.h.position.z, d = Math.hypot(dx, dz); if (d < .62 && d > .001) { p.x += dx / d * (.62 - d); p.z += dz / d * (.62 - d); } }
}
// you hit somebody who works or waits in a shop or the hospital: he stumbles, and after a few more blows fights back. The police are called either way.
G.hitNPC = (n, dmg) => {
  if (n.dead || npcFixed(n)) return false;
  n.hp = (n.hp === undefined ? 40 : n.hp) - dmg; n.hitT = .55; anim(n, 'HitRecieve', true, 1.3); n.cur = null;
  if (n.hp <= 0) { n.dead = true; anim(n, 'Death', true, 1.3); if (G.blood) G.blood(n.h.position.x, 1.1, n.h.position.z, 6); crime(3, false); }
  else { if (n.hp <= 28) n.fight = true; crime(1, false); if (G.blood) G.blood(n.h.position.x, 1.2, n.h.position.z, 2); }
  return true;
};
export function updateNPCs(dt) {
  const pl = G.player;
  for (const n of G.npcs) {
    const near = (n.h.position.x - pl.x) ** 2 + (n.h.position.z - pl.z) ** 2 < (n.far ? 10000 : 900); n.h.visible = near; if (!near) continue;
    if (n.hitT > 0) n.hitT -= dt;
    else if (n.fight && !n.dead && G.inside && pl.health > 0) {
      const dx = pl.x - n.h.position.x, dz = pl.z - n.h.position.z, d = Math.hypot(dx, dz) || .01;
      n.h.rotation.y += wrapA(Math.atan2(dx, dz) - n.h.rotation.y) * Math.min(1, dt * 8);
      if (d > 1.05) { npcCp.x = n.h.position.x + dx / d * 3 * dt; npcCp.z = n.h.position.z + dz / d * 3 * dt; collide(npcCp, .35); n.h.position.x = npcCp.x; n.h.position.z = npcCp.z; anim(n, 'Run', false, 1.1); }
      else { anim(n, 'Punch_Right', false, 1.2); n.pcd = (n.pcd === undefined ? .5 : n.pcd) - dt; if (n.pcd <= 0) { n.pcd = 1.1; G.hurt(5); if (G.sfx) G.sfx.punch(); } }
    }
    n.mixer.update(dt);
  }
}
const BIKE_SEAT = { back: .2, y: .06 }, LONG = { smg: 1, shotgun: 1, rifle: 1, sniper: 1, rocket: 1 };
const BEND_AX = new T.Vector3(), BEND_P = new T.Quaternion(), BEND_R = new T.Quaternion(), BEND_Q = new T.Quaternion();
// a rider sits on the seat, feet on the pegs and hands on the bars: each limb is bent to reach its spot (works on the classic figures)
const IK = [0, 0, 0, 0, 0, 0, 0].map(() => new T.Vector3()), IKQ = new T.Quaternion(), IKQ2 = new T.Quaternion();
function ikAim(bone, child, tgt) {
  bone.updateWorldMatrix(true, false); child.updateWorldMatrix(true, false); bone.getWorldPosition(IK[0]); child.getWorldPosition(IK[1]);
  IK[1].sub(IK[0]).normalize(); IK[2].subVectors(tgt, IK[0]).normalize(); IKQ.setFromUnitVectors(IK[1], IK[2]);
  bone.getWorldQuaternion(IKQ2).premultiply(IKQ); bone.parent.getWorldQuaternion(IKQ); bone.quaternion.copy(IKQ.invert().multiply(IKQ2)); bone.updateMatrix(); bone.updateMatrixWorld(true);
}
function ikLimb(a, b, c, tgt, pole) {
  a.updateWorldMatrix(true, false); b.updateWorldMatrix(true, false); c.updateWorldMatrix(true, false);
  const p0 = IK[3].setFromMatrixPosition(a.matrixWorld), l1 = IK[4].setFromMatrixPosition(b.matrixWorld).distanceTo(p0), l2 = IK[5].setFromMatrixPosition(c.matrixWorld).distanceTo(IK[4]);
  const u = IK[6].subVectors(tgt, p0), d = Math.min(Math.max(u.length(), .05), l1 + l2 - .002); u.normalize();
  const x = (d * d + l1 * l1 - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x)), pp = pole.clone().addScaledVector(u, -pole.dot(u)).normalize();
  const mid = p0.clone().addScaledVector(u, x).addScaledVector(pp, h), end = p0.clone().addScaledVector(u, d);
  ikAim(a, b, mid); ikAim(b, c, end);
}
const PEG = new T.Vector3(), POLE = new T.Vector3(), BIKEMX = { FootL: 'mixamorigLeftFoot', FootR: 'mixamorigRightFoot', WristL: 'mixamorigLeftHand', WristR: 'mixamorigRightHand' };
export function bikePose(n, chop) {
  if (!n.ik) { const f = k => n.h.getObjectByName(k) || n.h.getObjectByName(MXALIAS[k] || BIKEMX[k]), L = ['UpperLegL', 'LowerLegL', 'FootL', 'UpperArmL', 'LowerArmL', 'WristL', 'UpperLegR', 'LowerLegR', 'FootR', 'UpperArmR', 'LowerArmR', 'WristR'].map(f); n.ik = L.every(Boolean) ? L : 'no'; }
  if (n.ik === 'no') return; const q = n.ik; n.h.updateMatrixWorld(true);
  for (const sd of [1, -1]) {
    const o = sd > 0 ? 0 : 6, w = (x, y, z) => n.h.localToWorld(PEG.set(x, y, z)).clone(), dir = (x, y, z) => POLE.set(x, y, z).transformDirection(n.h.matrixWorld).clone();
    ikLimb(q[o], q[o + 1], q[o + 2], w(sd * .2, chop ? .22 : .26, chop ? .8 : .38), dir(sd * .5, .1, 1));
    ikLimb(q[o + 3], q[o + 4], q[o + 5], w(sd * (chop ? .3 : .34), chop ? 1.38 : 1.0, chop ? .52 : .62), dir(sd * .6, -.4, -.3));
  }
}
export function animPlayer(dt) {
  const p = G.player;
  if (p.car && p.car.spec.bike) {   // on a motorbike you sit in the open and lean with it
    const c = p.car; p.h.visible = true; p.h.rotation.order = 'YXZ'; p.h.position.set(c.x - Math.cos(c.h) * BIKE_SEAT.back, BIKE_SEAT.y, c.z + Math.sin(c.h) * BIKE_SEAT.back); p.h.rotation.y = c.h + Math.PI / 2; p.h.rotation.z = c.lean || 0;
    for (const k in p.guns) p.guns[k].visible = false; anim(p, 'Drive'); p.mixer.update(dt); p.h.position.y += c.g.position.y; bikePose(p, c.type === 'chopper'); return;
  }
  if (p.ride && p.ride.boat && p.ride.seat) {   // in a boat you sit at the wheel, in the open
    const b = p.ride, s = b.seat, ch = Math.cos(b.h), sh = Math.sin(b.h); p.h.visible = true; p.h.rotation.order = 'YXZ';
    p.h.position.set(b.x + ch * s.x + sh * s.z, b.g.position.y + s.y, b.z - sh * s.x + ch * s.z); p.h.rotation.y = b.h + Math.PI / 2; p.h.rotation.x = 0; p.h.rotation.z = b.roll || 0;
    for (const k in p.guns) p.guns[k].visible = false; anim(p, 'Drive'); p.mixer.update(dt); return;
  }
  if (p.car || p.ride) { p.h.visible = false; return; }
  p.h.visible = true; p.h.position.set(p.x, p.y, p.z); p.h.rotation.order = 'YXZ'; p.h.rotation.y = p.yaw;
  { let dy = p.yaw - (p.lyaw === undefined ? p.yaw : p.lyaw); while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; p.lyaw = p.yaw;
    const want = p.swim || p.flung > 0 || G.aim ? 0 : clamp(-dy / Math.max(dt, .001) * p.speed * .011, -.2, .2); p.lean = (p.lean || 0) + (want - (p.lean || 0)) * Math.min(1, dt * 6); p.h.rotation.z = p.lean; }
  const armed = G.weapon !== 'fist' && G.weapon !== 'bat'; for (const k in p.guns) p.guns[k].visible = G.weapon !== 'fist' && k === G.weapon;
  p.h.rotation.x = p.flung > 0 && p.air ? p.flSpin : 0;
  if (p.doll && !(p.flung > 0)) { G.physUndoll(p); p.h.rotation.set(0, p.yaw, 0); }   // no longer knocked down (woke up in hospital, arrested, went swimming): the tumbling body is dropped
  if (p.doll && G.physDollPose) G.physDollPose(p, p.h, p);   // tumbling as a physics body
  if (p.flung > 0) { for (const k in p.guns) p.guns[k].visible = false; if (p.doll) anim(p, 'Idle'); else anim(p, 'Death', true, 1.5); }
  else if (p.swim) { for (const k in p.guns) p.guns[k].visible = false; anim(p, p.speed > .4 ? 'Swim' : 'Swim_Idle', false, p.speed > .4 ? clamp(p.speed / 1.5, .8, 1.6) : 1); }
  else if (p.punchT > 0) anim(p, p.punchClip || 'Punch_Right', true, p.punchTs || 1.5);
  else if (armed && LONG[G.weapon] && (p.shootT > 0 || G.aim)) { if (p.speed > 2) anim(p, 'Run_Aim2', false, clamp(p.speed / 2.9, .8, 1.5)); else if (p.speed > .3) anim(p, 'Walk_Aim2', false, clamp(p.speed / 1.05, .8, 1.5)); else anim(p, 'Aim2'); }
  else if (armed && (p.shootT > 0 || G.aim)) { if (p.speed > 2) anim(p, 'Run_Aim', false, clamp(p.speed / 2.9, .8, 1.5)); else if (p.speed > .3) anim(p, 'Walk_Aim', false, clamp(p.speed / 1.05, .8, 1.5)); else if (p.shootT > 0 && p.kick) { p.kick = false; if (p.cur === 'Aim1_Shoot') p.acts.Aim1_Shoot.reset(); anim(p, 'Aim1_Shoot', true, 1); } else if (p.cur !== 'Aim1_Shoot' || p.shootT <= 0) anim(p, 'Aim1'); }
  else if (p.air) anim(p, 'Jump');
  else if (armed) { if (p.speed < .3) anim(p, 'Idle_Hold'); else if (p.speed < 2.0) anim(p, 'Walk_Hold', false, clamp(p.speed / 1.05, .8, 1.5)); else if (p.speed < 4.2) anim(p, 'Run_Hold', false, clamp(p.speed / 2.9, .8, 1.4)); else anim(p, 'Sprint_Hold', false, clamp(p.speed / 5, .8, 1.3)); }
  else if (p.speed < .3) anim(p, 'Idle');
  else if (p.speed < 2.0) anim(p, 'Walk', false, clamp(p.speed / 1.05, .8, 1.5));  // the walk clip is made for about 1 m/s
  else if (p.speed < 4.2) anim(p, 'Run', false, clamp(p.speed / 2.9, .8, 1.4));     // the jog clip is made for about 2.9 m/s
  else anim(p, 'Sprint', false, clamp(p.speed / 5, .8, 1.3));                        // the sprint clip is made for about 5 m/s
  p.mixer.update(dt);
  if (p.doll) limp(p, dt); else if (p.limp) unlimp(p);
  // aiming up or down: the upper body (and with it the arms, the gun and the head) tips to follow the crosshair
  { const armedAim = armed && (G.aim || p.shootT > 0) && !p.swim && !(p.flung > 0), want = G.debug && G.debug.bend != null ? G.debug.bend : armedAim ? clamp(-(G.camPitch || 0) + .1, -.75, .5) : 0;
    p.aimBend = (p.aimBend || 0) + (want - (p.aimBend || 0)) * Math.min(1, dt * 12);
    if (Math.abs(p.aimBend) > .005 || p.bent) {
      // a third of it comes from the chest (so the head follows), the rest from the gun arm; with a long gun the other arm goes along.
      // The animation only rewrites a bone when its pose changes, so the pose it last wrote is remembered and the tilt is put on top of that each frame
      if (!p.bendBones) p.bendBones = [['Chest', .35, 0], ['UpperArmR', .65, 0], ['UpperArmL', .65, 1]].map(([n, w, long]) => ({ b: p.h.getObjectByName(n) || p.h.getObjectByName(MXALIAS[n]), w, long, base: new T.Quaternion(), last: new T.Quaternion(), has: false })).filter(q => q.b);
      BEND_AX.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw)); p.bent = Math.abs(p.aimBend) > .005;
      for (const q of p.bendBones) {
        const bn = q.b; if (q.has && bn.quaternion.equals(q.last)) bn.quaternion.copy(q.base); else q.base.copy(bn.quaternion);
        if (p.bent && !(q.long && !LONG[G.weapon])) { bn.parent.getWorldQuaternion(BEND_P); BEND_R.setFromAxisAngle(BEND_AX, -p.aimBend * q.w); bn.quaternion.premultiply(BEND_Q.copy(BEND_P).invert().multiply(BEND_R).multiply(BEND_P)); }
        q.last.copy(bn.quaternion); q.has = true;
      }
    } }
}

/* ---------- pedestrians ---------- */
const lp = {};
// Crossing the road. Each corner of a block's pavement is looked up by its place, so a walker who reaches a corner can
// carry straight on over the zebra to the corner of the next block and join the pavement there.
const crossers = []; let cornerMap = null;
function cornerAt(x, z) {
  if (!cornerMap) { cornerMap = new Map(); for (const L of loops) { const w = L.x1 - L.x0, h = L.z1 - L.z0; for (const [cx, cz, u] of [[L.x0, L.z1, 0], [L.x1, L.z1, w], [L.x1, L.z0, w + h], [L.x0, L.z0, 2 * w + h]]) cornerMap.set(Math.round(cx) + '|' + Math.round(cz), { L, u, x: cx, z: cz }); } }
  return cornerMap.get(Math.round(x) + '|' + Math.round(z));
}
function tryCross(p, dx, dz) {   // dx, dz = the way the walker was going when they reached the corner
  const L = p.loop, cx = dx > 0 ? L.x1 : dx < 0 ? L.x0 : (Math.abs(p.x - L.x0) < Math.abs(p.x - L.x1) ? L.x0 : L.x1), cz = dz > 0 ? L.z1 : dz < 0 ? L.z0 : (Math.abs(p.z - L.z0) < Math.abs(p.z - L.z1) ? L.z0 : L.z1);
  const c = cornerAt(cx + dx * 16.4, cz + dz * 16.4); if (!c || !c.L.doors.length || c.L === L) return false;
  if (!lightGreen(Math.abs(dx) > .5)) return false;   // walk when the traffic going the same way has green (the road being crossed then has red)
  if (p.target && p.target.car && p.target.car.reserved === p) p.target.car.reserved = null;
  p.state = 'cross'; p.cx = c; p.t = 30; crossers.push(p); return true;
}
function endCross(p) { const i = crossers.indexOf(p); if (i >= 0) crossers.splice(i, 1); }
function pedSetTarget(p) {
  const L = p.loop; p.target = null;
  const wantCar = rnd() < (G.aiCount < G.AI_TARGET ? .55 : .03);
  if (wantCar) {
    const cs = L.slots.filter(s => { const c = s.car; return c && c.slot === s && !c.reserved && !c.ai && !c.driver && c !== G.player.car && !c.police && !c.used && !c.spec.bike; });
    if (cs.length) { const s = pick(cs), c = s.car; c.reserved = p; p.target = { car: c, slot: s, u: s.u, x: s.px, z: s.pz }; }
  }
  if (!p.target) { const d = pick(L.doors); p.target = { door: d, u: d.u, x: d.x, z: d.z }; }
  const du = ((p.target.u - p.u) % L.P + L.P) % L.P; p.dir = du < L.P / 2 ? 1 : -1; p.left = p.dir > 0 ? du : L.P - du; p.state = 'walk';
}
function pedSpawnAtDoor(p) {
  const pl = G.player; let d = null; p.carIn = null;
  for (let i = 0; i < 14; i++) { const c = pick(doors); if (!c.ok) continue; const dd = Math.hypot(c.x - pl.x, c.z - pl.z); if (dd > 14 && dd < 120) { d = c; break; } if (!d) d = c; }
  p.loop = d.loop; p.u = d.u; p.x = d.x; p.z = d.z; p.state = 'on'; p.h.visible = true; p.lat = rr(-.7, .7); p.speed = rr(1.15, 1.75);
}
export function makePeds(n) {
  for (const L of loops) { L.doors = []; L.slots = []; }
  for (const d of doors) if (d.ok) d.loop.doors.push(d);
  for (const s of slots) s.loop.slots.push(s);
  G.peds = [];
  for (let i = 0; i < n; i++) {
    const p = newPerson(civKey());
    let L; do { L = pick(loops); } while (!L.doors.length);
    Object.assign(p, { loop: L, u: rnd() * L.P, lat: rr(-.7, .7), speed: rr(.95, 1.35), x: 0, z: 0, yaw: 0, t: 0 });
    loopPoint(L, p.u, lp); p.x = lp.x; p.z = lp.z;
    pedSetTarget(p); G.peds.push(p);
  }
}
function pedFace(p, dx, dz, dt) { const want = Math.atan2(dx, dz); p.yaw += wrapA(want - p.yaw) * Math.min(1, dt * 8); }
function pedGoto(p, tx, tz, dt, sp) { const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz); if (d < .25) return true; const st = Math.min(d, sp * dt); p.x += dx / d * st; p.z += dz / d * st; pedFace(p, dx, dz, dt); return false; }
export function knockPed(p, vx, vz) {
  if (p.state === 'down' || p.state === 'inside' || p.state === 'driving') return false;
  const sp = Math.hypot(vx, vz); p.state = 'down'; p.t = rr(4, 7); if (p.target && p.target.car) p.target.car.reserved = null;
  if (sp > 3) {   // a hard hit (a car, a blast): thrown through the air, tumbling, with blood. Very hard and they do not get up again
    p.kx = vx * 1.0; p.kz = vz * 1.0; p.fy = .05; p.fvy = Math.min(11, 2.5 + sp * .5); p.spin = 0; p.spinV = rr(4, 9) * (rnd() < .5 ? -1 : 1);
    if (G.physDoll && p.h.visible) G.physDoll(p, p.x, p.gy || 0, p.z, p.kx * 1.1, p.fvy * .8, p.kz * 1.1, p.yaw);   // real physics: the body tumbles, bounces off cars and walls
    if (G.blood) G.blood(p.x, 1, p.z, sp > 11 ? 10 : 5, vx, vz); if (sp > 5) { p.dead = true; p.t = 16; if (G.stat) G.stat('kills'); }
  } else { p.kx = vx * .35; p.kz = vz * .35; }
  return true;
}
// a lighter hit: the person reels for a moment, then runs away. Returns false when they cannot be hit
// A body that has been knocked flying goes limp: arms, legs, head and back flop about as it tumbles, and sprawl where it comes to rest.
// who.dw (from the physics) says how hard it is being thrown about. Called after the figure's animation has been advanced.
const LIMBS = [['UpperArmL', 1.25, 1.1], ['UpperArmR', 1.25, 1.1], ['LowerArmL', .2, 1.0], ['LowerArmR', .2, 1.0], ['UpperLegL', .9, .5], ['UpperLegR', .9, .5], ['LowerLegL', 1.0, .15], ['LowerLegR', 1.0, .15], ['Head', .5, .5], ['Neck', .3, .3], ['Chest', .35, .3], ['Abdomen', .3, .25]];
const limpQ = new T.Quaternion(), limpE = new T.Euler();
function limp(who, dt) {
  if (!who.limp) who.limp = LIMBS.map(([n, ax, az], i) => ({ b: who.h.getObjectByName(n) || who.h.getObjectByName(MXALIAS[n]), ax, az, ph: rnd() * 6.28, ph2: rnd() * 6.28, f: rr(.8, 1.4), s1: rr(-1, 1), s2: rr(-1, 1), base: new T.Quaternion(), last: new T.Quaternion(), has: false, lower: n.startsWith('Lower') })).filter(q => q.b);
  const w = Math.min(1, (who.dw || 0) / 5); who.limpT = (who.limpT || 0) + dt * (2 + (who.dw || 0) * 1.6); who.limpK = (who.limpK === undefined ? 0 : who.limpK) + (1 - (who.limpK || 0)) * Math.min(1, dt * 8);
  for (const q of who.limp) {
    if (!q.has || !q.b.quaternion.equals(q.last)) { q.base.copy(q.b.quaternion); q.has = true; }   // the animation wrote this bone afresh (it only does so when the value changes)
    let x = (Math.sin(who.limpT * q.f + q.ph) * w + q.s1 * .55 * (1 - w)) * q.ax, z = (Math.sin(who.limpT * q.f * .8 + q.ph2) * w + q.s2 * .55 * (1 - w)) * q.az;
    if (q.lower) x = Math.abs(x) * (q.b.name.includes('Leg') ? 1 : -1);   // knees and elbows only bend the one way
    limpQ.setFromEuler(limpE.set(x * who.limpK, 0, z * who.limpK)); q.b.quaternion.copy(q.base).multiply(limpQ); q.last.copy(q.b.quaternion);
  }
}
function unlimp(who) { if (who.limp) for (const q of who.limp) { if (q.has) q.b.quaternion.copy(q.base); q.has = false; } who.limpK = 0; who.limp = null; }
// Not everybody runs. About four in ten stand their ground: hit them, or get in their way for long enough, and they fight you.
const SHOUT = ['"You asked for it!"', '"Right, that does it!"', '"Come here, you!"', '"Big mistake!"'];
export function startFight(p, secs, quiet) {
  if (p.state === 'inside' && !p.h.visible) return false; if (p.target && p.target.car && p.target.car.reserved === p) p.target.car.reserved = null;
  const was = p.state === 'fight'; if (!was) { p.fhp = 36; p.fcd = rr(.3, .7); p.swing = 0; if (!quiet && G.say && !(G.fightSayT > G.time)) { G.fightSayT = G.time + 4; G.say(pick(SHOUT), 2.5); } }
  p.state = 'fight'; p.t = Math.max(was ? p.t || 0 : 0, secs || 18); return true;
}
function endFight(p) {
  const c = p.fcar; p.fcar = null; p.foe = null; p.brawl = 0; p.ally = false;
  if (c && !c.dead && G.cars.includes(c) && c.ai && Math.hypot(c.x - p.x, c.z - p.z) < 14) { p.state = 'inside'; p.t = rr(4, 9); p.h.visible = false; c.bump = Math.min(c.bump || 0, 1.2); c.riderOff = false; return; }   // the driver gets back in (the rider back on) and drives on
  p.state = 'flee'; p.t = 5; const r = nearest(p.x, p.z); p.loop = r.loop; p.u = r.u; p.dir = rnd() < .5 ? 1 : -1;
}
// somebody to play a driver who gets out: a person who is indoors just now, or failing that one walking far out of sight
function sparePed() {
  let p = G.peds.find(q => q.state === 'inside' && !q.h.visible && !q.carIn); if (p) return p; const pl = G.player; let bd = 90;
  for (const q of G.peds) { if (q.state !== 'walk' || q.h.visible || q.doll) continue; const d = Math.hypot(q.x - pl.x, q.z - pl.z); if (d > bd) { bd = d; p = q; } }
  if (p && p.target && p.target.car && p.target.car.reserved === p) p.target.car.reserved = null; return p || null;
}
// a car hits a motorbike hard: the rider is thrown off and the bike slides away
G.bikeCrash = (b, vx, vz) => {
  if (b.dead || !b.spec.bike) return; const had = !!b.ai; if (b.ai) { dropRider(b); releaseAI(b); } b.used = true; b.vx = vx * .7; b.vz = vz * .7; b.v = Math.hypot(b.vx, b.vz); b.hp -= 45;
  if (had) { const p = sparePed(); if (p) { p.x = b.x; p.z = b.z; p.h.visible = true; p.dead = false; p.fy = 0; p.gy = 0; p.state = 'walk'; knockPed(p, vx * .9, vz * .9); } }
  if (G.sfx && G.sfx.crash) G.sfx.crash(Math.hypot(vx, vz));
};
// a driver whose car you hit or blocked climbs out to have it out with you
G.driverOut = car => {
  if (!car.ai || car.dead || car.police || car.spec.tank || car.fightCd > G.time || car.crim) return false;   // everybody but the police: they have their own way of dealing with you
  const p = sparePed(); if (!p) return false; const pl = G.player, px = pl.car ? pl.car.x : pl.x, pz = pl.car ? pl.car.z : pl.z;
  const sx = Math.sin(car.h), sz = Math.cos(car.h), side = ((px - car.x) * sx + (pz - car.z) * sz) >= 0 ? 1 : -1; let x = car.x + sx * 1.6 * side, z = car.z + sz * 1.6 * side; if (solidAt(x, z, .3)) { x = car.x - sx * 1.6 * side; z = car.z - sz * 1.6 * side; if (solidAt(x, z, .3)) return false; }
  car.fightCd = G.time + 70; car.bump = 24;
  if (car.spec.bike) { dropRider(car); car.riderOff = true; car.v = 0; car.leanT = 0; }   // a rider climbs off; the bike waits for him
  p.x = x; p.z = z; p.yaw = Math.atan2(px - x, pz - z); p.h.visible = true; p.dead = false; p.fy = 0; p.gy = 0; p.brave = true; p.state = 'walk'; startFight(p, 22, true); p.fcar = car;
  if (G.say) { G.fightSayT = G.time + 4; G.say(pick(['"Look what you did to my car!"', '"Are you blind?! Get out here!"', '"Hey! You hit me!"', '"Move it, or I will move you!"']), 3); } if (G.sfx && G.sfx.door) G.sfx.door(); return true;
};
// Street fights: now and then two people (sometimes three, rarely four) start hitting each other on the pavement. Hit one of them and he turns on you.
// And when you are in a fight, a passer-by may join in: on his side, or on yours.
let brawlT = 14, brawlId = 0; const brawlSeen = {};
const freeWalker = q => q.h.visible && q.state === 'walk' && !q.doll && !(q.stag > 0);
function startBrawl(near) {
  const pl = G.player, cand = G.peds.filter(q => { if (!freeWalker(q)) return false; const d = Math.hypot(q.x - pl.x, q.z - pl.z); return near ? d < 30 : d > 14 && d < 65; });
  if (cand.length < 2) return false;
  for (let tries = 0; tries < 6; tries++) {
    const a = pick(cand), others = cand.filter(q => q !== a && Math.hypot(q.x - a.x, q.z - a.z) < 24).sort((u, v) => Math.hypot(u.x - a.x, u.z - a.z) - Math.hypot(v.x - a.x, v.z - a.z));
    if (!others.length) continue;
    const r = rnd(), n = r < .6 ? 2 : r < .9 ? 3 : 4, grp = [a, ...others.slice(0, n - 1)], id = ++brawlId;
    grp.forEach((g, i) => { startFight(g, 45, true); g.brawl = id; g.fhp = rr(22, 40); g.foe = grp.length === 4 ? grp[i ^ 1] : grp[(i + 1) % grp.length]; });
    return grp;
  }
  return false;
}
G.brawlDBG = () => startBrawl(true);
function updateBrawls(dt) {
  const pl = G.player; brawlT -= dt;
  if (brawlT <= 0) { brawlT = rr(22, 45); if (!G.inside && !(G.stars >= 2) && !G.peds.some(q => q.state === 'fight' && q.foe)) { if (!startBrawl(false)) brawlT = 6; } }
  for (const q of G.peds) if (q.state === 'fight' && q.foe && q.brawl && !brawlSeen[q.brawl] && Math.hypot(q.x - pl.x, q.z - pl.z) < 20) { brawlSeen[q.brawl] = 1; if (G.say && !G.inside) G.say(pick(['"Fight! Fight!"', 'A street fight! Punch one of them to join in', '"Somebody stop them!"']), 3); }
}
function joinIn(p) {   // you and p are now fighting: people close by may pile in
  let n = 0;
  for (const q of G.peds) { if (q === p || n >= 2 || !freeWalker(q) || Math.hypot(q.x - p.x, q.z - p.z) > 11 || rnd() > .22) continue;
    n++; startFight(q, 16, true); q.fhp = rr(20, 34);
    if (rnd() < .5) { q.foe = null; if (G.say) G.say(pick(['"Leave him alone!"', '"Hey! Two against one now!"']), 2.5); }   // against you
    else { q.foe = p; q.ally = true; q.brawl = p.brawl = p.brawl || ++brawlId; brawlSeen[q.brawl] = 1; if (G.say) G.say(pick(['"I\'m with you!"', '"I\'ve got your back!"']), 2.5); } }   // on your side
}
export function staggerPed(p, x, z) {
  if (p.state === 'down' || p.state === 'inside' || p.state === 'driving') return false;
  const pl = G.player, byYou = !pl.car && Math.hypot(pl.x - x, pl.z - z) < 1 && Math.hypot(pl.x - p.x, pl.z - p.z) < 4;
  if (p.brave === undefined) p.brave = rnd() < .4;
  if (byYou && (p.brave || p.state === 'fight')) {   // he takes the punch and comes back at you; enough punches and he goes down
    const fresh = p.state !== 'fight' || !!p.foe; startFight(p, 18); p.foe = null; p.ally = false; if (fresh) joinIn(p); p.fhp -= 12; p.stag = .35; p.yaw = Math.atan2(x - p.x, z - p.z); if (p.cur === 'Hit_Head') p.acts.Hit_Head.reset();
    if (p.fhp <= 0) { const d = Math.hypot(p.x - x, p.z - z) || 1; p.fcar = null; knockPed(p, (p.x - x) / d * 4, (p.z - z) / d * 4); p.brave = false; }
    return true;
  }
  if (p.target && p.target.car && p.target.car.reserved === p) p.target.car.reserved = null;
  loopPoint(p.loop, p.u, lp); p.dir = (lp.dx * (p.x - x) + lp.dz * (p.z - z)) >= 0 ? 1 : -1; p.state = 'flee'; p.t = rr(6, 10);
  p.stag = .5; p.yaw = Math.atan2(x - p.x, z - p.z); if (p.cur === 'Hit_Head') p.acts.Hit_Head.reset(); return true;
}
// people near a gunshot run away from it
export function panicPeds(x, z, r) {
  for (const p of G.peds) {
    if (p.state === 'fight') p.fcar = null;   // nobody brings fists to a gunfight
    if (p.state !== 'walk' && p.state !== 'on' && p.state !== 'off' && p.state !== 'chat' && p.state !== 'sit' && p.state !== 'tosit' && p.state !== 'fight') continue;
    if ((p.x - x) ** 2 + (p.z - z) ** 2 > r * r) continue;
    if (p.target && p.target.car && p.target.car.reserved === p) p.target.car.reserved = null;
    loopPoint(p.loop, p.u, lp); p.dir = (lp.dx * (p.x - x) + lp.dz * (p.z - z)) >= 0 ? 1 : -1; p.state = 'flee'; p.t = rr(6, 10);
  }
}
export function updatePeds(dt) {
  const pl = G.player;
  for (let i = crossers.length - 1; i >= 0; i--) if (crossers[i].state !== 'cross') crossers.splice(i, 1);
  updateBrawls(dt);
  for (const p of G.peds) {
    let moving = true, sp = p.speed;
    const stag = p.stag > 0; if (stag) p.stag -= dt;
    switch (stag ? 'stag' : p.state) {
      case 'fight': {
        if (p.foe) {   // fighting another person, not you
          let f = p.foe; p.t -= dt; if (p.swing > 0) p.swing -= dt;
          if (f.state !== 'fight' || !f.h.visible) { f = p.foe = G.peds.find(q => q !== p && q.state === 'fight' && q.h.visible && q.brawl && q.brawl === p.brawl && !(p.ally && q.ally) && Math.hypot(q.x - p.x, q.z - p.z) < 16) || null; if (!f) { endFight(p); p.t = 2.5; moving = false; break; } }
          const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz) || 1;
          if (p.t <= 0 || d > 40) { endFight(p); moving = false; break; }
          pedFace(p, dx, dz, dt);
          if (d > 1.15) { sp = 3.2; const nx = p.x + dx / d * sp * dt, nz = p.z + dz / d * sp * dt; if (!solidAt(nx, nz, .3)) { p.x = nx; p.z = nz; } else moving = false; }
          else { moving = false; p.fcd -= dt;
            if (p.fcd <= 0) { p.fcd = rr(.8, 1.5); p.swing = .5; if (p.acts.Punch_Right) p.acts.Punch_Right.reset(); const near = Math.hypot(p.x - pl.x, p.z - pl.z) < 30;
              if (near && G.sfx && G.sfx.punch) G.sfx.punch();
              if (rnd() < .8) { f.fhp -= rr(5, 9); f.stag = .3; f.yaw = Math.atan2(-dx, -dz); if (f.cur === 'Hit_Head') f.acts.Hit_Head.reset(); if (near && G.blood && rnd() < .3) G.blood(f.x, (f.gy || 0) + 1.4, f.z, 2, dx / d * 3, dz / d * 3);
                if (f.fhp <= 0) { f.fcar = null; f.foe = null; f.brawl = 0; f.ally = false; knockPed(f, dx / d * 3.5, dz / d * 3.5); } } } }
          break;
        }
        p.t -= dt; if (p.swing > 0) p.swing -= dt; const tx = pl.car ? pl.car.x : pl.x, tz = pl.car ? pl.car.z : pl.z, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz) || 1, reach = pl.car ? 2.3 : 1.25;
        if (p.t <= 0 || d > 30 || pl.ride || pl.swim || G.inside || pl.health <= 0 || pl.flung > 0 && p.t < 12 || (pl.car && pl.car.v > 6)) { endFight(p); moving = false; break; }
        pedFace(p, dx, dz, dt);
        if (d > reach) { sp = 3.5; const nx = p.x + dx / d * sp * dt, nz = p.z + dz / d * sp * dt; if (!solidAt(nx, nz, .3)) { p.x = nx; p.z = nz; } else moving = false; }
        else { moving = false; p.fcd -= dt;
          if (p.fcd <= 0) { p.fcd = rr(.85, 1.5); p.swing = .5; if (p.acts.Punch_Right) p.acts.Punch_Right.reset(); if (G.sfx && G.sfx.punch) G.sfx.punch();
            if (pl.car) { pl.car.hp -= 1.5; if (G.shake) G.shake(.15); }   // you stay in the car: he thumps on it
            else { G.hurt(rr(5, 9)); if (G.shake) G.shake(.3); if (G.blood && rnd() < .4) G.blood(pl.x, pl.y + 1.4, pl.z, 2, dx / d * 3, dz / d * 3); } } }
        break;
      }
      case 'walk': {
        { const bx = pl.x - p.x, bz = pl.z - p.z, bd = bx * bx + bz * bz;   // you stand in his way
          if (bd < .8 && !pl.car && !pl.ride && !G.inside && !pl.swim) { loopPoint(p.loop, p.u, lp); if ((bx * lp.dx + bz * lp.dz) * p.dir > 0) { p.annoy = (p.annoy || 0) + dt; if (p.brave === undefined) p.brave = rnd() < .4;
              if (p.annoy > 2.2) { p.annoy = 0; if (p.brave) { if (G.say) { G.fightSayT = G.time + 4; G.say(pick(['"Get out of my way!"', '"Move!"', '"What is your problem?"']), 2.5); } startFight(p, 9, true); } else p.lat = clamp((p.lat || 0) + (rnd() < .5 ? 1.3 : -1.3), -2, 2); }   // one shoves, another walks round
              pedFace(p, bx, bz, dt); moving = false; break; } } else if (p.annoy > 0) p.annoy = Math.max(0, p.annoy - dt * .5); }
        if (p.target.car && (p.target.car.ai || p.target.car === pl.car || p.target.car.used || p.target.slot.car !== p.target.car)) { p.target.car.reserved === p && (p.target.car.reserved = null); pedSetTarget(p); }
        const st = sp * dt; p.left -= st; p.u += p.dir * st;
        loopPoint(p.loop, p.u, lp);
        const tx = lp.x - lp.dz * p.lat, tz = lp.z + lp.dx * p.lat;
        if (Math.hypot(tx - p.x, tz - p.z) > 3) pedGoto(p, tx, tz, dt, sp * 1.5); else { p.x = tx; p.z = tz; }
        pedFace(p, lp.dx * p.dir, lp.dz * p.dir, dt);
        if (p.ldx !== undefined && (p.ldx !== lp.dx || p.ldz !== lp.dz) && p.h.visible && rnd() < .45 && tryCross(p, p.ldx * p.dir, p.ldz * p.dir)) { p.ldx = undefined; break; }   // at a corner: maybe cross over
        p.ldx = lp.dx; p.ldz = lp.dz;
        if (p.left <= 0) p.state = 'off';
        p.idleT = (p.idleT || rr(2, 8)) - dt;
        if (p.idleT <= 0 && p.h.visible) {   // now and then: stop for a chat with someone passing, make a phone call, or sit down on a bench
          p.idleT = rr(3, 9); const r = rnd();
          if (r < .22) { let q = null; for (const o of G.peds) if (o !== p && o.state === 'walk' && o.h.visible && (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < 16) { q = o; break; }
            if (q) { const t = rr(6, 15); for (const [a, b] of [[p, q], [q, p]]) { a.state = 'chat'; a.t = t; a.cy = Math.atan2(b.x - a.x, b.z - a.z); } } }
          else if (r < .27) { p.state = 'chat'; p.t = rr(4, 9); p.cy = p.yaw; }
          else if (r < .5) { for (const b of benches) if (!b.pr.gone && (!b.used || b.used.state !== 'sit' && b.used.state !== 'tosit' || b.used.bench !== b) && (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 64) { b.used = p; p.bench = b; p.state = 'tosit'; p.t = 8; break; } }
        }
        break;
      }
      case 'cross': { const c = p.cx; p.t -= dt; if (pedGoto(p, c.x, c.z, dt, sp * 1.15) || p.t <= 0) { endCross(p); p.loop = c.L; p.u = c.u; p.lat = 0; p.x = c.x; p.z = c.z; p.state = 'walk'; pedSetTarget(p); } break; }
      case 'robbed': { moving = false; p.t -= dt; p.yaw += wrapA(p.cy - p.yaw) * Math.min(1, dt * 8); if (p.t <= 0) p.state = 'walk'; break; }   // held at gunpoint
      case 'chat': { moving = false; p.t -= dt; p.yaw += wrapA(p.cy - p.yaw) * Math.min(1, dt * 5); if (p.t <= 0) p.state = 'walk'; break; }
      case 'tosit': { const b = p.bench; p.t -= dt; if (b.pr.gone || p.t <= 0) { p.state = 'walk'; break; } if (pedGoto(p, b.x + Math.sin(b.ry) * .25, b.z + Math.cos(b.ry) * .25, dt, sp)) { p.state = 'sit'; p.t = rr(10, 28); p.yaw = b.ry; } break; }
      case 'sit': { moving = false; p.t -= dt; if (p.bench.pr.gone) { p.state = 'flee'; p.t = 6; p.dir = 1; break; } p.yaw = p.bench.ry; if (p.t <= 0) p.state = 'walk'; break; }
      case 'on': { loopPoint(p.loop, p.u, lp); if (pedGoto(p, lp.x - lp.dz * p.lat, lp.z + lp.dx * p.lat, dt, sp)) pedSetTarget(p); break; }
      case 'off': {
        const tg = p.target;
        if (tg.car && (tg.car.ai || tg.car === pl.car || tg.car.used || tg.slot.car !== tg.car)) { pedSetTarget(p); break; }
        if (pedGoto(p, tg.x, tg.z, dt, sp)) {
          if (tg.car) { p.state = 'inside'; p.h.visible = false; p.carIn = tg.car; p.t = rr(3, 8); tg.car.driver = true; tg.car.reserved = null; tg.car.startT = 1.3; }
          else { p.state = 'inside'; p.h.visible = false; p.t = rr(2, 9); }
        }
        break;
      }
      case 'inside': moving = false; p.t -= dt; if (p.t <= 0) pedSpawnAtDoor(p); break;
      case 'driving': moving = false; break;
      case 'down': {
        moving = false; p.t -= dt;
        if (p.doll) {   // a tumbling body: the physics says where it is
          if (G.physDollPose(p, p.h, p)) { G.physUndoll(p); p.fy = 0; p.kx = p.kz = 0; p.h.rotation.set(0, p.yaw, 0); p.lieNow = true;   // the body has come to rest: it must lie there, not stand up and fall again
           if (G.blood) G.blood(p.x, .3, p.z, 3); }
          else p.fy = Math.max(.01, p.dy);
        } else
        { const nx = p.x + p.kx * dt, nz = p.z + p.kz * dt; if (solidAt(nx, nz, .3)) { p.kx *= -.2; p.kz *= -.2; } else { p.x = nx; p.z = nz; } }   // a wall stops them
        if (p.doll) { /* nothing more to do while it tumbles */ } else if (p.fy > 0) {   // in the air: falls, tumbles, and leaves a stain where it lands
          p.fvy -= 20 * dt; p.fy += p.fvy * dt; p.spin += p.spinV * dt;
          if (p.fy <= 0) { p.fy = 0; p.spin = 0; p.kx *= .45; p.kz *= .45; if (G.blood) G.blood(p.x, .3, p.z, 3); if (G.sfx && G.sfx.punch) G.sfx.punch(); }
        } else { const k = Math.pow(.02, dt); p.kx *= k; p.kz *= k; }
        if (p.t <= 0) {
          if (p.doll) { G.physUndoll(p); p.fy = 0; p.h.rotation.set(0, p.yaw, 0); }
          if (p.dead) { p.dead = false; p.state = 'inside'; p.t = rr(4, 10); p.h.visible = false; }
          else { p.state = 'flee'; p.t = 6; const r = nearest(p.x, p.z); p.loop = r.loop; p.u = r.u; p.dir = rnd() < .5 ? 1 : -1; }
        }
        break;
      }
      case 'flee': {
        sp = 4.6; p.t -= dt; p.u += p.dir * sp * dt; loopPoint(p.loop, p.u, lp);
        pedGoto(p, lp.x, lp.z, dt, sp * 1.3); pedFace(p, lp.dx * p.dir, lp.dz * p.dir, dt);
        if (p.t <= 0) pedSetTarget(p);
        break;
      }
    }
    if (p.state === 'inside' || p.state === 'driving') { p.h.visible = false; continue; }
    const d2 = (p.x - pl.x) ** 2 + (p.z - pl.z) ** 2, far = d2 > ((G.Q && G.Q.ped) || 100) ** 2;
    p.h.visible = !far;
    if (far) continue;
    p.gy = (p.gy || 0) + (kerbH(p.x, p.z) - (p.gy || 0)) * Math.min(1, dt * 9);   // up on the kerb, down on the road
    if (!p.doll) { p.h.position.set(p.x, p.fy > 0 ? p.fy : p.gy, p.z); p.h.rotation.y = p.yaw; p.h.rotation.x = p.fy > 0 ? p.spin : 0; }
    if (d2 < 75 * 75) {
      if (p.doll) anim(p, 'Idle'); else if (p.state === 'down') { anim(p, 'Death', true, 1.2); if (p.lieNow && p.acts.Death) { const a = p.acts.Death; a.time = a.getClip().duration; a.weight = 1; p.mixer.update(.3); p.lieNow = false; } } else if (stag) anim(p, 'Hit_Head', true, 1); else if (p.state === 'fight' && p.swing > 0) anim(p, 'Punch_Right', true, 1.5); else if (p.state === 'chat') anim(p, 'Talk'); else if (p.state === 'sit') anim(p, 'Sit'); else if (!moving) anim(p, 'Idle'); else if (sp > 3) anim(p, 'Run', false, clamp(sp / 2.9, .8, 1.5)); else anim(p, 'Walk', false, clamp(sp / 1.05, .85, 1.3));
      if (d2 < 35 * 35 || p.doll || (p.sk = (p.sk || 0) + 1) % 3 === 0) p.mixer.update(d2 < 35 * 35 || p.doll ? dt : dt * 3);   // far people move at a third of the rate: nobody sees it
      if (p.doll) limp(p, dt); else if (p.limp) unlimp(p);
    }
  }
}
function nearest(x, z) { let best = null, bd = 1e9, bu = 0; for (const L of loops) { if (!L.doors.length) continue; const r = loopParam(L, x, z); if (r.d < bd) { bd = r.d; best = L; bu = r.u; } } return { loop: best, u: bu }; }

/* ---------- cash that knocked-down people drop ---------- */
const cashGeo = new T.BoxGeometry(.46, .1, .24), cashMat = new T.MeshStandardMaterial({ color: 0x3fae5a, roughness: .6, emissive: 0x1a6a2a, emissiveIntensity: .7 });
G.cash = []; G.money = 0;
export function dropCash(x, z) { const m = new T.Mesh(cashGeo, cashMat); m.position.set(x, .35, z); m.castShadow = true; G.scene.add(m); G.cash.push({ m, x, z, v: 20 + Math.floor(rnd() * 10) * 10, t: 45 }); }
export function updateCash(dt) {
  const pl = G.player;
  for (let i = G.cash.length - 1; i >= 0; i--) {
    const c = G.cash[i]; c.t -= dt; c.m.rotation.y += dt * 2.5; c.m.position.y = .35 + Math.sin(G.time * 3 + i) * .08;
    const near = !pl.car && Math.hypot(c.x - pl.x, c.z - pl.z) < 1.2;
    if (near || c.t <= 0) { if (near) { G.money += c.v; if (G.onMoney) G.onMoney(c.v); } G.scene.remove(c.m); G.cash.splice(i, 1); }
  }
}

/* ================= cars ================= */
function roundShape(pts, r) {
  const s = new T.Shape(), n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const va = new T.Vector2(a[0] - p[0], a[1] - p[1]), vb = new T.Vector2(b[0] - p[0], b[1] - p[1]);
    va.setLength(Math.min(r, va.length() / 2)); vb.setLength(Math.min(r, vb.length() / 2));
    if (i) s.lineTo(p[0] + va.x, p[1] + va.y); else s.moveTo(p[0] + va.x, p[1] + va.y);
    s.quadraticCurveTo(p[0], p[1], p[0] + vb.x, p[1] + vb.y);
  }
  s.closePath(); return s;
}
function ext(shape, width, bev) { bev = bev === undefined ? .13 : bev; const g = new T.ExtrudeGeometry(shape, { depth: width - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * .8, bevelSegments: 4, curveSegments: 10 }); g.translate(0, 0, -(width - 2 * bev) / 2); return g; }
const _v = new T.Vector3(), _n = new T.Vector3(), _nm = new T.Matrix3(), ID = new T.Matrix4();
function collect(arr, geo, m4, c) {
  const g = geo.index ? geo.toNonIndexed() : geo; if (!g.attributes.normal) g.computeVertexNormals();
  const P = g.attributes.position, N = g.attributes.normal; m4 = m4 || ID; _nm.getNormalMatrix(m4);
  for (let i = 0; i < P.count; i++) { _v.fromBufferAttribute(P, i).applyMatrix4(m4); _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); arr.p.push(_v.x, _v.y, _v.z); arr.n.push(_n.x, _n.y, _n.z); arr.c.push(c.r, c.g, c.b); }
}
function finish(arr) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(arr.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(arr.n, 3)); g.setAttribute('color', new T.Float32BufferAttribute(arr.c, 3)); return g; }
const tr = (x, y, z) => new T.Matrix4().makeTranslation(x, y, z);
const C = h => new T.Color(h);
const cSeat = C(0x4a3f38), cGlass = C(0x101821), cBlack = C(0x16171b), cTyre = C(0x101014), cHub = C(0xb9bec5), cWhite = C(0xf4f4f0), cHead = C(0xfff6d8), cTail = C(0x8a141c), cBrake = C(0xff2a2a), cPlate = C(0xe6c626), cAmber = C(0xffb62a), cBlue = C(0x1846c8), cHiv = C(0xd9ea1f);
const B = (w, h, d) => new T.BoxGeometry(w, h, d);
// a motorbike: two wheels in line, painted tank and tail, the rider sits on top in the open
function bikeGeo(o) {
  const paint = { p: [], n: [], c: [] }, rest = { p: [], n: [], c: [] }, lights = { p: [], n: [], c: [] }, w1 = C(0xffffff), cEng = C(0x5a5d63);
  const tyre = new T.CylinderGeometry(o.wr, o.wr, .15, 16).rotateX(Math.PI / 2), hub = new T.CylinderGeometry(o.wr * .55, o.wr * .55, .17, 10).rotateX(Math.PI / 2);
  const FX = o.chop ? 1.12 : .72;   // a chopper has a long front end
  for (const x of [-.72, FX]) { collect(rest, tyre, tr(x, o.wr, 0), cTyre); collect(rest, hub, tr(x, o.wr, 0), cHub); }
  collect(paint, ext(roundShape([[-.12, .62], [-.08, .96], [.42, 1.0], [.6, .82], [.45, .62]], .1), .34), null, w1);
  collect(rest, ext(roundShape([[-.82, .8], [-.84, .9], [-.08, .93], [-.08, .8]], .04), .3, .03), null, cBlack);
  collect(paint, B(.46, .07, .2), tr(-.76, .74, 0), w1);
  collect(rest, B(.52, .34, .3), tr(.08, .46, 0), cEng);
  collect(rest, B(.75, .08, .08), tr(-.5, .38, .17), cHub);
  const fk = new T.Matrix4().makeTranslation(o.chop ? .72 : .585, o.chop ? .78 : .7, 0).multiply(new T.Matrix4().makeRotationZ(o.chop ? .7 : .354));
  for (const z of [.1, -.1]) collect(rest, B(.06, o.chop ? 1.15 : .78, .06), fk.clone().multiply(tr(0, 0, z)), cHub);
  if (o.chop) {   // ape-hanger bars, a sissy bar behind the seat and a fat rear tyre
    for (const z of [.3, -.3]) { collect(rest, B(.05, .5, .05), tr(.3, 1.2, z * .8), cHub); collect(rest, B(.05, .05, .3), tr(.3, 1.45, z * .5), cBlack); }
    collect(rest, B(.05, .62, .05), tr(-.88, 1.05, .16), cHub); collect(rest, B(.05, .62, .05), tr(-.88, 1.05, -.16), cHub); collect(rest, B(.05, .05, .36), tr(-.88, 1.36, 0), cHub);
    collect(rest, B(.22, .5, .3), tr(-.72, .32, 0), cTyre);
  } else
  collect(rest, B(.06, .06, .7), tr(.44, 1.1, 0), cBlack);
  collect(rest, B(.5, .05, .05), tr(-.5, .5, 0), cBlack);
  collect(lights, B(.1, .18, .18), tr(o.chop ? .98 : .7, o.chop ? .86 : .98, 0), cHead); collect(lights, B(.05, .08, .16), tr(-1.0, .76, 0), cTail);
  return { paint: finish(paint), rest: finish(rest), lights: finish(lights) };
}
// a tank: tracks, a low hull, a turret and a long barrel pointing forward
function tankGeo(o) {
  const paint = { p: [], n: [], c: [] }, rest = { p: [], n: [], c: [] }, lights = { p: [], n: [], c: [] }, w1 = C(0xffffff), trk = C(0x1c1e20);
  for (const z of [-1.38, 1.38]) { collect(rest, ext(roundShape([[-3.2, .12], [-3.3, .7], [-2.9, .98], [2.9, .98], [3.3, .7], [3.2, .12]], .14), .56), tr(0, 0, z), trk); }
  collect(paint, ext(roundShape([[-3.05, .5], [-3.05, 1.3], [2.2, 1.3], [3.05, .95], [3.05, .5]], .08), 2.2), null, w1);
  collect(paint, B(2.7, .78, 2.0), tr(-.3, 1.68, 0), w1); collect(paint, B(.9, .3, .9), tr(-.7, 2.2, 0), w1);
  collect(rest, new T.CylinderGeometry(.11, .11, 3.7, 10).rotateZ(Math.PI / 2), tr(2.85, 1.72, 0), trk); collect(rest, new T.CylinderGeometry(.16, .16, .5, 10).rotateZ(Math.PI / 2), tr(4.5, 1.72, 0), trk);
  collect(rest, B(.5, .1, 1.6), tr(-2.7, 1.38, 0), trk);
  collect(lights, B(.08, .16, .3), tr(3.06, 1.0, .8), cHead); collect(lights, B(.08, .16, .3), tr(3.06, 1.0, -.8), cHead); collect(lights, B(.06, .12, .3), tr(-3.07, 1.1, .8), cTail); collect(lights, B(.06, .12, .3), tr(-3.07, 1.1, -.8), cTail);
  return { paint: finish(paint), rest: finish(rest), lights: finish(lights) };
}
function carGeo(o) {
  if (o.bike) return bikeGeo(o);
  if (o.tank) return tankGeo(o);
  const paint = { p: [], n: [], c: [] }, rest = { p: [], n: [], c: [] }, lights = { p: [], n: [], c: [] }, glass = { p: [], n: [], c: [] }, L = o.L, W = o.W, w1 = C(0xffffff);
  collect(paint, ext(roundShape(o.hull, .3), W), null, w1);
  collect(paint, ext(roundShape(o.roof, .07), W - .12, .05), null, w1);
  for (const p of (o.pillars || [])) for (const s of [1, -1]) collect(paint, B(p[3] || .1, p[2] - p[1], .06), tr(p[0], (p[1] + p[2]) / 2, s * (W / 2 - .085)), w1);
  collect(glass, ext(roundShape(o.glass, .12), W - .18, .03), null, w1);   // the windows are see-through: their own mesh
  // inside: a dark floor, two front seats and a steering wheel; outside: door seams and handles
  const gx0 = Math.min(...o.glass.map(q => q[0])), gx1 = Math.max(...o.glass.map(q => q[0])), gy0 = Math.min(...o.glass.map(q => q[1])), gy1 = Math.max(...o.glass.map(q => q[1]));
  const long = gx1 - gx0 > 4, sx = long ? gx1 - 1.5 : gx0 + (gx1 - gx0) * .56, seat = { x: sx, y: gy0, top: gy1, z: W / 2 - .5 };
  collect(rest, B(gx1 - gx0 - .5, .04, W - .34), tr((gx0 + gx1) / 2, gy0 + .03, 0), cBlack);
  for (const s of [1, -1]) collect(rest, B(.12, Math.min(.5, gy1 - gy0 - .12), .46), tr(sx - .22, gy0 + .05 + Math.min(.5, gy1 - gy0 - .12) / 2, s * seat.z), cSeat);
  collect(rest, B(.05, .3, .3), tr(sx + .42, gy0 + .16, -seat.z), cBlack);
  const hy0 = o.hull[0][1] + .12, dx0 = sx - .75, dx1 = sx + .55;
  for (const s of [1, -1]) { for (const x of (long ? [dx1] : [dx0 - (gx1 - gx0 > 2.2 ? .95 : 0), dx0, dx1])) collect(rest, B(.025, gy0 - hy0 - .06, .02), tr(x, (gy0 + hy0) / 2, s * (W / 2 + .006)), cBlack);
    collect(rest, B(.16, .04, .03), tr(dx0 + .2, gy0 - .16, s * (W / 2 + .012)), cHub); }
  const tyre = new T.CylinderGeometry(o.wr, o.wr, .24, 14).rotateX(Math.PI / 2), hub = new T.CylinderGeometry(o.wr * .6, o.wr * .6, .26, 10).rotateX(Math.PI / 2), arch = new T.CylinderGeometry(o.wr + .08, o.wr + .08, .03, 14).rotateX(Math.PI / 2);
  const wheelsS = { p: [], n: [], c: [] };   // the wheels as one still piece (for cars far away); near cars get four that really turn
  for (const x of o.wheels) for (const s of [1, -1]) { collect(rest, arch, tr(x, o.wr + .02, s * (W / 2 + .004)), cBlack); collect(wheelsS, tyre, tr(x, o.wr, s * (W / 2 - .07)), cTyre); collect(wheelsS, hub, tr(x, o.wr, s * (W / 2 - .07)), cHub); }
  collect(rest, B(.16, .2, W - .06), tr(L / 2 - .02, .4, 0), cBlack); collect(rest, B(.16, .2, W - .06), tr(-L / 2 + .02, .4, 0), cBlack);
  collect(rest, B(.03, .12, .5), tr(L / 2 + .07, .42, 0), cWhite); collect(rest, B(.03, .12, .5), tr(-L / 2 - .07, .42, 0), cPlate);
  // the small things that make it look like a real car: chrome bumper strips, a grille, wing mirrors, an exhaust and an aerial
  { const chrome = C(0xc7ccd1), dark = C(0x15171a), tallBody = o.top > 2;
    collect(rest, B(.07, .05, W - .24), tr(L / 2 + .05, .52, 0), chrome); collect(rest, B(.07, .05, W - .24), tr(-L / 2 - .05, .52, 0), chrome);
    collect(rest, B(.03, tallBody ? .3 : .15, W * .46), tr(L / 2 + .015, o.lightY - (tallBody ? .06 : .02), 0), dark);
    for (let i = 0; i < 3; i++) collect(rest, B(.035, .018, W * .46), tr(L / 2 + .02, o.lightY - .09 + i * .07, 0), chrome);
    if (!o.bike) for (const sd of [1, -1]) { collect(rest, B(.05, .045, .12), tr(gx1 - .52, gy0 + .06, sd * (W / 2 + .05)), dark); collect(rest, B(.1, .1, .16), tr(gx1 - .55, gy0 + .08, sd * (W / 2 + .13)), dark); }
    collect(rest, new T.CylinderGeometry(.045, .045, .22, 8).rotateZ(Math.PI / 2), tr(-L / 2 - .06, .3, -W / 2 + .32), chrome);
    if (!tallBody && !o.taxi && !o.police && !o.ambulance) collect(rest, B(.012, .55, .012), tr(-L / 2 + .9, o.top + .27, W / 2 - .3), dark);
  }
  const brake = { p: [], n: [], c: [] };
  for (const s of [1, -1]) { collect(lights, B(.1, .16, .36), tr(L / 2 - .03, o.lightY, s * (W / 2 - .36)), cHead); collect(lights, B(.1, .14, .4), tr(-L / 2 + .03, o.lightY + .05, s * (W / 2 - .36)), cTail); collect(brake, B(.1, .15, .42), tr(-L / 2 + .015, o.lightY + .05, s * (W / 2 - .36)), cBrake); }
  if (o.taxi) { collect(lights, B(.26, .16, .56), tr(-.2, o.top + .1, 0), cAmber); }
  if (o.police) {
    for (let i = 0; i < 8; i++) for (const s of [1, -1]) collect(rest, B(.5, .26, .02), tr(-1.75 + i * .5, .74, s * (W / 2 + .012)), i % 2 ? cBlue : cHiv);
    collect(rest, B(.3, .08, 1.2), tr(-.35, o.top + .05, 0), cBlack);
  }
  if (o.ambulance) {
    const red = C(0xd01828);
    for (const s of [1, -1]) { collect(rest, B(3.6, .22, .02), tr(-.5, .78, s * (W / 2 + .012)), red); collect(rest, B(.9, .26, .02), tr(-1.2, 1.6, s * (W / 2 + .012)), red); collect(rest, B(.26, .9, .02), tr(-1.2, 1.6, s * (W / 2 + .014)), red); }
    collect(lights, B(.3, .12, 1.3), tr(.9, o.top + .06, 0), C(0xff3040));
  }
  if (o.spoiler) { collect(rest, B(.3, .045, W - .2), tr(-L / 2 + .13, 1.08, 0), cBlack); for (const z of [.6, -.6]) collect(rest, B(.08, .16, .06), tr(-L / 2 + .15, 1.0, z), cBlack); }
  // shape the whole body: narrower towards nose and tail when seen from above, and the cabin leaning in towards the roof
  const belt = Math.min(...o.glass.map(q => q[1])), tall = o.top > 2, kx = tall ? .05 : .13, ky = tall ? .04 : .11;
  for (const a of [paint, rest, lights, glass, brake]) for (let i = 0; i < a.p.length; i += 3) { const x = a.p[i], y = a.p[i + 1], k = 1 - kx * Math.pow(Math.min(1, Math.abs(x) / (L / 2)), 3) - (y > belt ? ky * Math.min(1, (y - belt) / (o.top - belt)) : 0); a.p[i + 2] *= k; }
  return { paint: finish(paint), rest: finish(rest), lights: finish(lights), glass: finish(glass), seat, wheels: finish(wheelsS), brake: finish(brake), wpos: o.wheels.flatMap(x => [1, -1].map(s => [x, o.wr, s * (W / 2 - .07) * (1 - kx * Math.pow(Math.abs(x) / (L / 2), 3))])), wr: o.wr };
}
// one wheel that can spin and steer: tyre, rim and five spokes (so you can see it turning)
const wheelGeos = {};
function wheelGeo(r) {
  const k = r.toFixed(2); if (wheelGeos[k]) return wheelGeos[k]; const a = { p: [], n: [], c: [] };
  collect(a, new T.CylinderGeometry(r, r, .24, 18).rotateX(Math.PI / 2), null, cTyre); collect(a, new T.CylinderGeometry(r * .64, r * .64, .25, 14).rotateX(Math.PI / 2), null, cHub); collect(a, new T.CylinderGeometry(r * .2, r * .2, .27, 8).rotateX(Math.PI / 2), null, cBlack);
  for (let i = 0; i < 5; i++) collect(a, B(r * .44, .07, .265), new T.Matrix4().makeRotationZ(i * Math.PI * 2 / 5).multiply(tr(r * .38, 0, 0)), cBlack);
  return wheelGeos[k] = finish(a);
}
const SPECS = {
  sedan: { L: 4.5, W: 1.85, wr: .33, lightY: .74, top: 1.56, max: 36, acc: 9, turn: 2.3, hull: [[-2.25, .3], [-2.25, .86], [-2.05, .99], [-1.3, 1.01], [1.0, 1.01], [2.1, .86], [2.25, .7], [2.25, .3]], glass: [[-1.52, .99], [-1.06, 1.5], [.36, 1.5], [1.02, .99]], roof: [[-1.14, 1.48], [-1.06, 1.56], [.34, 1.56], [.47, 1.48]], pillars: [[-.3, 1.0, 1.5, .1]], wheels: [-1.42, 1.42] },
  hatch: { L: 3.9, W: 1.78, wr: .31, lightY: .72, top: 1.52, max: 32, acc: 8.5, turn: 2.5, hull: [[-1.95, .3], [-1.95, .9], [-1.8, 1.0], [.8, 1.0], [1.8, .86], [1.95, .7], [1.95, .3]], glass: [[-1.85, .98], [-1.6, 1.46], [.2, 1.46], [.85, .98]], roof: [[-1.68, 1.44], [-1.6, 1.52], [.18, 1.52], [.3, 1.44]], pillars: [[-.6, 1.0, 1.46, .1]], wheels: [-1.25, 1.25] },
  sports: { L: 4.3, W: 1.86, wr: .33, lightY: .62, top: 1.29, max: 52, acc: 14, turn: 2.6, spoiler: true, hull: [[-2.15, .26], [-2.15, .78], [-1.9, .92], [-.9, .94], [.5, .9], [1.9, .7], [2.15, .56], [2.15, .26]], glass: [[-1.5, .9], [-.9, 1.24], [0, 1.24], [.78, .88]], roof: [[-1.0, 1.22], [-.9, 1.29], [-.02, 1.29], [.12, 1.22]], wheels: [-1.36, 1.38] },
  van: { L: 4.9, W: 1.95, wr: .36, lightY: .8, top: 2.12, max: 30, acc: 7, turn: 2.0, hull: [[-2.45, .32], [-2.45, 1.15], [1.5, 1.15], [2.3, 1.0], [2.45, .8], [2.45, .32]], glass: [[.3, 1.12], [.35, 2.02], [1.25, 2.02], [1.75, 1.12]], roof: [[-2.4, 1.1], [-2.4, 2.12], [1.2, 2.12], [1.45, 2.0], [.4, 2.0], [.3, 1.1]], wheels: [-1.55, 1.6] },
};
SPECS.bus = { L: 10.5, W: 2.5, wr: .48, lightY: .95, top: 3.05, max: 23, acc: 5, turn: 1.25, noPark: true, offs: [4.2, 1.4, -1.4, -4.2], paintCol: 0x1f8a8a,
  hull: [[-5.25, .45], [-5.25, 1.5], [5.25, 1.5], [5.25, .45]], glass: [[-5.12, 1.48], [-5.12, 2.62], [5.05, 2.62], [5.2, 1.48]], roof: [[-5.25, 2.6], [-5.25, 3.05], [5.18, 3.05], [5.25, 2.6]],
  pillars: [-4.4, -2.9, -1.4, .1, 1.6, 3.1, 4.5].map(x => [x, 1.5, 2.62, .14]), wheels: [-3.3, 3.5] };
SPECS.ambulance = Object.assign({}, SPECS.van, { ambulance: true, paintCol: 0xf4f5f7, max: 36, acc: 9 });
SPECS.army = Object.assign({}, SPECS.van, { paintCol: 0x4a5a3a, max: 39, acc: 12, turn: 2.3 });
SPECS.muscle = { L: 4.6, W: 2.01, wr: .388, lightY: .6, top: 1.43, max: 48, acc: 12, turn: 2.5, wheels: [-1.4, 1.4] };
SPECS.psx1 = { psx: 1, L: 4.8, W: 2.0, wr: .34, lightY: .7, top: 1.7, max: 33, acc: 8.5, turn: 2.3, wheels: [] };
SPECS.psx2 = { psx: 1, L: 4.6, W: 2.04, wr: .34, lightY: .7, top: 1.55, max: 44, acc: 11, turn: 2.5, wheels: [] };
SPECS.psx3 = { psx: 1, L: 4.5, W: 2.12, wr: .34, lightY: .7, top: 1.72, max: 34, acc: 9, turn: 2.4, wheels: [] };
SPECS.psx4 = { psx: 1, L: 5.0, W: 2.7, wr: .36, lightY: .85, top: 2.18, max: 29, acc: 7, turn: 2.0, wheels: [] };
SPECS.psx7 = { psx: 1, L: 4.7, W: 1.97, wr: .36, lightY: .8, top: 2.33, max: 31, acc: 8, turn: 2.2, wheels: [] };
SPECS.psx8 = { psx: 1, L: 5.4, W: 2.48, wr: .38, lightY: .9, top: 2.53, max: 27, acc: 6.5, turn: 1.9, wheels: [] };
SPECS.coupe = { L: 4.6, W: 2.1, wr: .38, lightY: .66, top: 1.56, max: 38, acc: 9.5, turn: 2.4, wheels: [] };
SPECS.jeep = { L: 4.2, W: 2.15, wr: .47, lightY: .9, top: 1.92, max: 31, acc: 9, turn: 2.3, wheels: [] };
SPECS.rally = { L: 3.9, W: 1.92, wr: .31, lightY: .62, top: 1.57, max: 42, acc: 12, turn: 2.7, wheels: [] };
SPECS.ghini = { L: 4.5, W: 1.85, wr: .38, lightY: .6, top: 1.3, max: 54, acc: 14, turn: 2.6, wheels: [] };
SPECS.mobil = { L: 4.8, W: 1.94, wr: .35, lightY: .66, top: 1.35, max: 34, acc: 8, turn: 2.1, wheels: [] };
SPECS.italia = { L: 4.6, W: 2.2, wr: .36, lightY: .6, top: 1.18, max: 56, acc: 14, turn: 2.6, wheels: [] };
SPECS.fenyr = { L: 4.5, W: 2.05, wr: .37, lightY: .6, top: 1.2, max: 55, acc: 14, turn: 2.6, wheels: [] };
SPECS.pickup = { L: 5.2, W: 2.14, wr: .373, lightY: .7, top: 1.7, max: 34, acc: 8, turn: 2.2, wheels: [-1.5, 1.5] };
SPECS.taxi = Object.assign({}, SPECS.sedan, { taxi: true });
SPECS.police = Object.assign({}, SPECS.sedan, { police: true, max: 40, acc: 12, turn: 2.5 });
SPECS.truck = { L: 7.6, W: 2.45, wr: .46, lightY: .95, top: 3.25, max: 26, acc: 5.5, turn: 1.5, noPark: true, offs: [3, 1, -1, -3],
  hull: [[-3.8, .5], [-3.8, 1.28], [3.6, 1.28], [3.8, 1.1], [3.8, .5]], glass: [[2.25, 1.26], [2.3, 2.36], [3.3, 2.36], [3.72, 1.26]],
  roof: [[-3.75, 1.25], [-3.75, 3.25], [1.95, 3.25], [1.95, 2.48], [3.25, 2.48], [3.45, 2.34], [2.3, 2.34], [2.2, 1.25]], wheels: [-2.5, 2.7] };
SPECS.tank = { L: 6.4, W: 3.3, wr: .4, lightY: 1.0, top: 2.3, max: 15, acc: 6, turn: 1.4, tank: true, noPark: true, offs: [2, -2], paintCol: 0x4f5d3a, wheels: [] };
// Crash damage you can see: crumpled, scraped patches on the body where it was hit. dx, dz = the direction (in the world) from the
// middle of the car towards whatever it hit; n = how many patches (a harder hit leaves more). At most ten on one car.
// Crash marks: scrapes down to the bare metal and a few dark gouges, drawn on a see-through patch that lies on the paint (not a black plate).
const scrapeTex = seed => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d'); let r = seed * 9301 + 49297; const rnd2 = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 34; i++) { const y = 14 + rnd2() * 100, x0 = 10 + rnd2() * 110, len = 40 + rnd2() * 120, bare = rnd2() < .7; x.strokeStyle = bare ? 'rgba(' + (188 + rnd2() * 40 | 0) + ',' + (190 + rnd2() * 40 | 0) + ',' + (196 + rnd2() * 40 | 0) + ',' + (.55 + rnd2() * .4) + ')' : 'rgba(26,27,30,' + (.5 + rnd2() * .4) + ')'; x.lineWidth = bare ? .8 + rnd2() * 2.6 : 1.5 + rnd2() * 4; x.lineCap = 'round';
    x.beginPath(); x.moveTo(x0, y); x.bezierCurveTo(x0 + len * .3, y + (rnd2() - .5) * 10, x0 + len * .7, y + (rnd2() - .5) * 10, Math.min(246, x0 + len), y + (rnd2() - .5) * 14); x.stroke(); }
  for (let i = 0; i < 60; i++) { x.fillStyle = rnd2() < .5 ? 'rgba(205,208,214,.8)' : 'rgba(24,25,28,.7)'; x.fillRect(20 + rnd2() * 216, 16 + rnd2() * 96, 1 + rnd2() * 3, 1 + rnd2() * 2); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
const dentGeo = new T.PlaneGeometry(1, 1), dentMats = [1, 2, 3].map(sd => new T.MeshStandardMaterial({ map: scrapeTex(sd), transparent: true, depthWrite: false, roughness: .55, metalness: .5, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
// Push the metal in round one spot (lx, lz: where on the body, in the car's own measure). The first time, the car gets its own copy
// of its shape, so only this car bends. The deeper it has already been pushed, the less it gives.
const tmpN = new T.Vector3();
function crumple(c, lx, lz, depth) {
  c.crush = c.crush || 0; if (c.crush > 1.6 || !GEO[c.type] || !GEO[c.type].wheels) return; depth *= Math.max(.25, 1 - c.crush * .5); c.crush += depth;
  const l = Math.hypot(lx, lz) || 1, ix = -lx / l, iz = -lz / l, R = 1.25 + depth * 1.5;
  for (let m = 0; m < 4; m++) { const mesh = c.g.children[m]; if (!mesh || !mesh.isMesh || !mesh.geometry.attributes.position) continue;
    if (!mesh.userData.own) { mesh.userData.orig = mesh.geometry; mesh.geometry = mesh.geometry.clone(); mesh.userData.own = true; }
    const P = mesh.geometry.attributes.position, a = P.array; let moved = false;
    for (let i = 0; i < a.length; i += 3) { const dx = a[i] - lx, dz = a[i + 2] - lz, d = Math.hypot(dx, dz); if (d >= R) continue; const k = (1 - d / R) * (1 - d / R) * depth, hsh = Math.sin(a[i] * 12.9 + a[i + 1] * 78.2 + a[i + 2] * 37.7) * .5;
      a[i] += ix * k * (1 + hsh * .5); a[i + 2] += iz * k * (1 + hsh * .5); a[i + 1] += hsh * k * .45 - (a[i + 1] > .9 ? k * .25 : 0); moved = true; }
    if (moved) { P.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere(); } }
}
// a repaired car: its shape as new, and the scrapes gone
export function fixCar(c) {
  for (const m of c.g.children.slice()) { if (m.userData.dent) c.g.remove(m); else if (m.userData.own) { m.geometry.dispose(); m.geometry = m.userData.orig; m.userData.own = false; } } c.dents = 0; c.crush = 0;
}
// where the body really is (it is pushed in by crashes and the models are not boxes): the decals for scrapes and dents are put on that surface, not on a guessed box
function bodyEdge(c, mode, a, b, y0, y1, sign, fb) {
  let best = null;
  for (let m = 0; m < 2; m++) { const mesh = c.g.children[m]; if (!mesh || !mesh.isMesh || !mesh.geometry.attributes.position) continue; const A = mesh.geometry.attributes.position.array;
    for (let i = 0; i < A.length; i += 3) { const x = A[i], y = A[i + 1], z = A[i + 2];
      if (mode === 'end') { if (Math.abs(z - b) > .3 || y < y0 || y > y1) continue; const v = x * sign; if (best === null || v > best) best = v; }
      else if (mode === 'side') { if (Math.abs(x - a) > .3 || y < y0 || y > y1) continue; const v = z * sign; if (best === null || v > best) best = v; }
      else { if (Math.abs(x - a) > .3 || Math.abs(z - b) > .3) continue; if (best === null || y > best) best = y; } } }
  return best === null ? fb : best;
}
export function dentCar(c, dx, dz, n) {
  if (!c || c.dead || c.spec.tank) return; c.dents = c.dents || 0; if (c.dents >= 10) return; const sp = c.spec, l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  let lx = dx * Math.cos(c.h) - dz * Math.sin(c.h), lz = dx * Math.sin(c.h) + dz * Math.cos(c.h); const k = 1 / Math.max(Math.abs(lx) / (sp.L / 2), Math.abs(lz) / (sp.W / 2), .001); lx *= k; lz *= k;
  crumple(c, lx, lz, .1 + n * .07);   // the body itself is pushed in where it was struck
  n = Math.ceil(n / 2);                // and a few scraped, torn patches on top
  for (let i = 0; i < n && c.dents < 10; i++, c.dents++) {
    const end = Math.abs(lx) > sp.L / 2 - .05, m = new T.Mesh(dentGeo, dentMats[(c.dents + i) % 3]), sx = Math.sign(lx), sz = Math.sign(lz), tall = sp.top > 2, taper = x => 1 - (tall ? .05 : .13) * Math.pow(Math.min(1, Math.abs(x) / (sp.L / 2)), 3);
    if (end && c.dents % 2 === 0) {   // scraped across the bonnet or boot
      const px = lx - sx * rr(.5, .8); const pz = lz * .3 + rr(-.25, .25); m.scale.set(rr(.8, 1.2), rr(.6, sp.W * .6), 1); m.rotation.set(-Math.PI / 2, 0, rr(-.4, .4)); m.position.set(px, bodyEdge(c, 'top', px, pz, 0, 0, 0, Math.min(1.0, sp.top * .64)) + .02, pz);
    } else if (end) {                  // the bumper and the corner
      m.scale.set(rr(.7, sp.W * .7), rr(.3, .5), 1); m.rotation.set(0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, rr(-.15, .15)); { const py = rr(.45, .7), pz = lz * .4 + rr(-.3, .3); m.position.set(sx * (bodyEdge(c, 'end', 0, pz, py - .15, py + .15, sx, Math.abs(lx)) + .02), py, pz); }
    } else {                           // along a door or wing
      const px = clamp(lx + rr(-.5, .5), -sp.L / 2 + .7, sp.L / 2 - .7); m.scale.set(rr(.9, 1.5), rr(.3, .5), 1); m.rotation.set(0, sz > 0 ? 0 : Math.PI, rr(-.08, .08)); { const py = rr(.5, Math.min(.85, sp.top * .55)); m.position.set(px, py, sz * (bodyEdge(c, 'side', px, 0, py - .15, py + .15, sz, (sp.W / 2) * taper(px)) + .02)); }
    }
    m.renderOrder = 1;
    m.userData.dent = true; c.g.add(m);
  }
}
G.dentCar = dentCar;
// How much damage each kind takes before it burns: a motorbike least, then cars, vans, the bus, and the big truck most.
SPECS.bus.tough = 2.4; SPECS.truck.tough = 3.2;
SPECS.garbage = Object.assign({}, SPECS.truck, { paintCol: 0x2f7a4a, max: 21, acc: 4.8, turn: 1.55, top: 3.0, roof: [[-3.75, 1.25], [-3.75, 3.0], [1.95, 3.0], [1.95, 2.48], [3.25, 2.48], [3.45, 2.34], [2.3, 2.34], [2.2, 1.25]], tough: 3.2 });
SPECS.haul = Object.assign({}, SPECS.truck, { paintCol: 0xd86a1c, max: 23, acc: 5, turn: 1.5, top: 2.7, roof: [[-3.75, 1.25], [-3.75, 2.15], [1.95, 2.15], [1.95, 2.48], [3.25, 2.48], [3.45, 2.34], [2.3, 2.34], [2.2, 1.25]], tough: 3.4 });
SPECS.firetruck = Object.assign({}, SPECS.truck, { paintCol: 0xc41a1f, max: 31, acc: 8, turn: 1.7, fire: true });
export const toughOf = sp => (sp.tough || (sp.tank ? 9 : sp.bike ? .5 : sp.top > 2 ? 1.5 : 1)) * .7;   // every vehicle takes about 30% less than before; the order (bike, car, van, bus, truck, tank) is the same
SPECS.bike = { L: 2.1, W: .7, wr: .32, lightY: .98, top: 1.2, max: 50, acc: 17, turn: 3.0, bike: true, offs: [0], wheels: [] };
SPECS.chopper = Object.assign({}, SPECS.bike, { chop: true, L: 2.7, paintCol: 0x14141a, max: 44, acc: 15, turn: 2.6 });
// motorbikes in traffic carry a rider you can see; he disappears with the bike or when the bike is no longer driven
const riders = [];
function dropRider(c) { if (c.rider) { c.rider.h.visible = false; if (c.type !== 'chopper') riders.push(c.rider); c.rider = null; } }
const gangLook = () => Object.assign(defaultLook('m'), { head: pick(xpKeys('m').length ? xpKeys('m') : ['x']), skin: pick([0xf1c9a5, 0xc68642, 0x8d5524, 0xe0ac7e]), hair: pick([0x1c1410, 0x4a2f1a, 0x101010]), top: 0x16161a, bottom: 0x1d2230 });
function rideBike(c) {
  if (c.riderOff) { if (c.rider) dropRider(c); return; }   // the rider has got off to fight
  if (c.ai && !c.rider) { let r = riders.pop(); if (c.type === 'chopper') r = null; if (!r) { r = c.type === 'chopper' ? newPerson('pm', gangLook()) : newPerson(civKey()); r.h.rotation.order = 'YXZ'; } r.h.visible = true; c.rider = r; }
  if (!c.rider) return;
  if (!c.ai || c.dead) { c.rider.h.visible = false; if (c.type !== 'chopper') riders.push(c.rider); c.rider = null; return; }
  const r = c.rider; r.h.position.set(c.x - Math.cos(c.h) * BIKE_SEAT.back, BIKE_SEAT.y + c.g.position.y, c.z + Math.sin(c.h) * BIKE_SEAT.back); r.h.rotation.y = c.h + Math.PI / 2; r.h.rotation.z = c.lean || 0;
  const far = Math.hypot(c.x - G.player.x, c.z - G.player.z) > 150; r.h.visible = !far; if (!far) { anim(r, 'Drive'); r.mixer.update(.016); bikePose(r, c.type === 'chopper'); }
}
// outside the city cars follow the ground: lifted to its height and tipped along the slope
export function groundCar(c) {
  let slope = 0;
  if (c.x < 238) c.g.position.y = 0;
  else { const fx = Math.cos(c.h), fz = -Math.sin(c.h), cy = c.ai ? 99 : c.g.position.y, a = landHeight(c.x + fx * 1.6, c.z + fz * 1.6, cy), b = landHeight(c.x - fx * 1.6, c.z - fz * 1.6, cy); c.g.position.y = (a + b) / 2; slope = Math.atan2(a - b, 3.2); }
  // the body rolls outward in a corner and dips when braking, rises when pulling away (not for bikes: they lean by themselves)
  if (c.spec.bike || c.spec.tank || c.dead) { c.g.rotation.z = slope; return; }
  const dt = .016, fwd = c.vx * Math.cos(c.h) - c.vz * Math.sin(c.h);
  if (c.lh === undefined) { c.lh = c.h; c.lv = fwd; c.roll = 0; c.dip = 0; c.g.rotation.order = 'YXZ'; }
  let dh = c.h - c.lh; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  const tall = c.spec.top > 2 ? 1.5 : 1, rollT = clamp(-dh / dt * fwd * .0022 * tall, -.075 * tall, .075 * tall), dipT = clamp((fwd - c.lv) / dt * .0032 * tall, -.045, .04);
  c.roll += (rollT - c.roll) * .12; c.dip += (dipT - c.dip) * .1; c.lh = c.h; c.lv = fwd;
  c.g.rotation.x = c.roll; c.g.rotation.z = slope + c.dip;
}
const GEO = {};
const paintMats = {}, restMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .5 }), lightMat = new T.MeshBasicMaterial({ vertexColors: true });
const CARCOL = [0xf2f2ee, 0xc9ccd0, 0x30343f, 0xb3261e, 0x2f5f9f, 0x2f7a5a, 0xe0b23a, 0xe07a2f, 0xd8c8a8, 0x7a1f2a, 0x6fa8c8, 0x8a8f96];
const glassMat = new T.MeshStandardMaterial({ color: 0x6f909c, transparent: true, opacity: .4, roughness: .08, metalness: .4, depthWrite: false });
// the people you can see through the windows: a head, hair and shoulders, nothing more
const occGeo = { body: new T.BoxGeometry(.3, .34, .44), head: new T.BoxGeometry(.2, .23, .2), hair: new T.BoxGeometry(.22, .09, .22) }, occMats = {};
const occMat = hex => occMats[hex] || (occMats[hex] = new T.MeshLambertMaterial({ color: hex }));
const OSKIN = [0xf1c9a5, 0xc68642, 0x8d5524, 0xe0ac7e], OHAIR = [0x1c1410, 0x7a2f1a, 0x101010, 0xc9a35a, 0x8a8a8a], OSHIRT = [0x2f5f9f, 0xb3261e, 0xf2f2ee, 0x2f7a5a, 0xe0b23a, 0x30343f, 0x7a3f8f, 0xd98a1f];
function occFigure(shirt) {
  const g = new T.Group(), b = new T.Mesh(occGeo.body, occMat(shirt || pick(OSHIRT))), h = new T.Mesh(occGeo.head, occMat(pick(OSKIN))), hr = new T.Mesh(occGeo.hair, occMat(pick(OHAIR)));
  b.position.y = .17; h.position.y = .46; hr.position.y = .6; g.add(b, h, hr); return g;
}
// real people (seated) for the cars close to you; the blocky figures stay only as a back-up when too many are in use
const occPool = { civ: [], cop: [] }; let occMade = 0;
function takeOcc(cop) {
  const pool = occPool[cop ? 'cop' : 'civ']; let n = pool.pop();
  if (!n) { if (occMade >= 16) return null; occMade++; n = newPerson(cop ? copKey() : civKey(), cop ? copLook() : null); if (cop) dressUp(n, 'police'); n.cop = cop; n.base = n.h.scale.x; n.h.rotation.y = Math.PI / 2; anim(n, 'Drive'); n.mixer.update(.4); }
  return n;
}
function freeOcc(c) { if (!c.occ) return; for (const n of c.occ) { if (n.real) { n.h.visible = false; c.g.remove(n.h); occPool[n.cop ? 'cop' : 'civ'].push(n); } else c.g.remove(n); } c.occ = null; }
// show or hide the driver (and now and then a passenger) of a car
function syncOcc(c) {
  const ge = GEO[c.type]; if (!ge || !ge.seat) return;
  const pl = G.player, mine = pl.car === c, drive = !c.dead && (!!c.ai || (c.chase && !c.cop) || (mine && !pl.passenger)), pass = !c.dead && ((mine && pl.passenger) || (!mine && drive && c.hasPass));
  const near = mine || ((c.x - pl.x) ** 2 + (c.z - pl.z) ** 2 < 2500);
  if (c.occ && (!near || c.dead)) { freeOcc(c); if (!near) return; }   // far away nobody needs to be drawn
  if (!drive && !pass && !c.occ) return; if (!near) return;
  if (!c.occ) {
    const st = ge.seat; c.hasPass = c.hasPass === undefined ? rnd() < .3 : c.hasPass;
    const a = takeOcc(!!c.police), b = takeOcc(!!c.police);
    if (a && b) {
      const sc = .9, hS = Math.max(.5, Math.min(.9, (st.top - .5) / 1.3));   // a little squashed so it sits inside the car: feet on the floor, head under the roof   // head just under the roof line, whatever the car
      for (const [n, z] of [[a, -st.z], [b, st.z]]) { n.real = true; n.h.scale.set(n.base * sc, n.base * hS, n.base * sc); n.h.position.set(st.x - .4, .28, z); c.g.add(n.h);
        if (n.ub) { anim(n, 'Drive'); n.mixer.update(.05); c.g.updateMatrixWorld(true); const hp = c.g.worldToLocal(n.h.getObjectByName('mixamorigHips').getWorldPosition(new T.Vector3())); n.h.position.x += st.x - .42 - hp.x; n.h.position.z += z - hp.z; n.h.position.y += st.y + .16 - hp.y; c.g.updateMatrixWorld(true); const hd = c.g.worldToLocal(n.h.getObjectByName('mixamorigHead').getWorldPosition(new T.Vector3())).y + .17; n.h.position.y += Math.max(-1, Math.min(.2, st.top - .06 - hd)); }   // the new people: seat them by their hips, wherever the pose puts them
      }
      c.occ = [a, b];
    } else { if (a) occPool[a.cop ? 'cop' : 'civ'].push(a); if (b) occPool[b.cop ? 'cop' : 'civ'].push(b);
      const y = Math.min(st.y + .02, st.top - .74), d = occFigure(c.police ? 0x1f2f55 : 0), q = occFigure(0); d.position.set(st.x - .02, y, -st.z); q.position.set(st.x - .02, y, st.z); c.g.add(d, q); c.occ = [d, q]; }
  }
  const o0 = c.occ[0].real ? c.occ[0].h : c.occ[0], o1 = c.occ[1].real ? c.occ[1].h : c.occ[1]; o0.visible = drive; o1.visible = !!pass;
}
// car paint: a glossy clear coat that mirrors the sky. The sky picture is drawn once (a sphere of colour with a sun in it) and shown on every car body
let carEnv = null;
export function initCarEnv(renderer) {
  if (carEnv || !renderer) return;
  const sc = new T.Scene(), geo = new T.SphereGeometry(50, 32, 20), pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new T.Color();
  const top = new T.Color(0x4f86d6), hor = new T.Color(0xf2f1ea), low = new T.Color(0x77736a);
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 50; if (y > 0) c.copy(hor).lerp(top, Math.pow(y, .55)); else c.copy(hor).lerp(low, Math.min(1, -y * 3)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  sc.add(new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
  const sun = new T.Mesh(new T.SphereGeometry(5, 12, 8), new T.MeshBasicMaterial({ color: new T.Color(1, .95, .85).multiplyScalar(18) })); sun.position.set(25, 32, 18); sc.add(sun);
  for (const [x, z, w] of [[-30, -20, 8], [10, -38, 6], [-5, 36, 7]]) { const cl = new T.Mesh(new T.SphereGeometry(w, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff })); cl.scale.y = .35; cl.position.set(x, 24, z); sc.add(cl); }   // a few clouds give the reflections something to bend
  const pm = new T.PMREMGenerator(renderer); carEnv = pm.fromScene(sc, .02).texture; pm.dispose();
  for (const m of Object.values(paintMats)) m.envMap = carEnv; restMat.envMap = carEnv; glassMat.envMap = carEnv;
  restMat.envMapIntensity = .35; glassMat.envMapIntensity = 1.2;
}
function carEnvLevel() { const k = .12 + .88 * (1 - Math.min(1, G.night || 0)); for (const m of Object.values(paintMats)) m.envMapIntensity = k * 1.15; restMat.envMapIntensity = .3 * k; glassMat.envMapIntensity = 1.3 * k; }
function paintMat(hex) { return paintMats[hex] || (paintMats[hex] = new T.MeshPhysicalMaterial({ color: hex, roughness: .34, metalness: .45, clearcoat: 1, clearcoatRoughness: .06, envMap: carEnv, envMapIntensity: 1.1 })); }
// ready-made car bodies: which model each car type wears
const MODEL_OF = { coupe: 'coupe', jeep: 'jeep', rally: 'rally', ghini: 'ghini', mobil: 'mobil', italia: 'italia', fenyr: 'fenyr', sedan: 'sedan', taxi: 'sedan', hatch: 'hatch', sports: 'sports', muscle: 'muscle', pickup: 'pickup', van: 'van', ambulance: 'van', police: 'police', army: 'army' };
const unb64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
function partGeo(pt, lin) {
  const g = new T.BufferGeometry(); if (!pt || !pt.n) { g.setAttribute('position', new T.Float32BufferAttribute([], 3)); return g; }
  const p = new Int16Array(unb64(pt.p).buffer), nr = new Int8Array(unb64(pt.nr).buffer), c8 = unb64(pt.c), P = new Float32Array(p.length), N = new Float32Array(nr.length), Cc = new Float32Array(c8.length);
  for (let i = 0; i < p.length; i++) { P[i] = p[i] / 1000; N[i] = nr[i] / 127; Cc[i] = lin ? Math.pow(c8[i] / 255, 2.2) : c8[i] / 255; }
  g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('normal', new T.BufferAttribute(N, 3)); g.setAttribute('color', new T.BufferAttribute(Cc, 3)); return g;
}
function modelGeo(k) {
  const d = CM[k], paint = partGeo(d.parts.paint), rest = partGeo(d.parts.rest, true); let lights = partGeo(d.parts.lights, true), glass = partGeo(d.parts.glass, true), wg = partGeo(d.parts.wheel, true);
  // wheels as one still piece for cars far away
  const wp = wg.attributes.position, wn = wg.attributes.normal, wc = wg.attributes.color, n = wp.count, wa = { p: [], n: [], c: [] };
  for (const w of d.wheels) for (let i = 0; i < n; i++) { wa.p.push(wp.getX(i) + w[0], wp.getY(i) + w[1], wp.getZ(i) + w[2]); wa.n.push(wn.getX(i), wn.getY(i), wn.getZ(i)); wa.c.push(wc.getX(i), wc.getY(i), wc.getZ(i)); }
  // brake lights: the red tail-light faces, shown bright when braking
  const lp = lights.attributes.position, lc = lights.attributes.color, br = { p: [], n: [], c: [] };
  for (let i = 0; i + 2 < lp.count; i += 3) if (lp.getX(i) < 0 && lc.getX(i) > .3 && lc.getY(i) < .25) for (let j = 0; j < 3; j++) { br.p.push(lp.getX(i + j), lp.getY(i + j), lp.getZ(i + j)); br.n.push(0, 0, -1); br.c.push(1, .12, .1); }
  const fw = Math.max(...d.wheels.map(w => w[0]));
  if (!lp.count) { const lg = { p: [], n: [], c: [] }, ly = d.wr * 1.75; for (const s of [1, -1]) { collect(lg, B(.1, .12, .3), tr(-d.L / 2 + .02, ly + .03, s * (d.W / 2 - .38)), cTail); collect(br, B(.1, .12, .32), tr(-d.L / 2 + .01, ly + .03, s * (d.W / 2 - .38)), C(0xff2018)); } lights = finish(lg); }
  return { paint, rest, lights, glass: glass.attributes.position.count ? glass : null, seat: { x: fw - .95, y: d.H * .5, top: d.H * .97, z: d.W / 2 - .5 }, wheels: finish(wa), brake: finish(br), wgeo: wg, wpos: d.wheels.map(w => [w[0], w[1], w[2]]), wr: d.wr };
}

/* one of every kind of car and person is drawn once while the game starts loading, so the graphics card has everything before you meet it
   (otherwise each new kind freezes the game for a third of a second the first time it comes into view) */
export function warmUpActors() {
  const T0 = G.THREE, made = [], keys = Object.keys(SPECS), pl = G.player || { x: 0, z: 0 };
  for (const k of keys) { try { const c = newCar(k); c.x = pl.x; c.z = pl.z; c.g.position.set(pl.x, 0, pl.z); made.push(['car', c]); } catch (e) { } }
  for (const sex of ['m', 'w']) for (const k of xpKeys(sex)) { try { const n = newPerson(k); G.scene.add(n.h); made.push(['p', n]); } catch (e) { } }
  for (const q of XP.c) { try { const n = newPerson(q.key); G.scene.add(n.h); made.push(['p', n]); } catch (e) { } }
  return () => { for (const [t, o] of made) { if (t === 'car') removeCar(o); else G.scene.remove(o.h); } };
}
export function newCar(type, hex) {
  if (!GEO[type]) GEO[type] = PX && PX[type] ? psxGeo(type) : CM && MODEL_OF[type] && CM[MODEL_OF[type]] ? modelGeo(MODEL_OF[type]) : carGeo(SPECS[type]);
  const ge = GEO[type], g = new T.Group();
  const col = type === 'taxi' ? 0xf2c21a : type === 'police' ? 0xf4f5f7 : SPECS[type].paintCol || (hex || pick(CARCOL));
  const vs = ge.psx ? Object.keys(PX[type].tex) : null, pv = vs ? vs[Math.floor(Math.random() * vs.length)] : null;
  const a = new T.Mesh(ge.paint, ge.psx ? psxMat(type, pv) : paintMat(col)), b =new T.Mesh(ge.rest, restMat), c = new T.Mesh(ge.lights, lightMat);
  a.castShadow = b.castShadow = true; a.receiveShadow = true; g.add(a, b, c);
  if (ge.glass) { const w = new T.Mesh(ge.glass, glassMat); w.renderOrder = 1; g.add(w); }
  let wS = null, brk = null; if (ge.wheels) { wS = new T.Mesh(ge.wheels, restMat); wS.castShadow = true; g.add(wS); brk = new T.Mesh(ge.brake, lightMat); brk.visible = false; g.add(brk); }
  const car = { type, spec: SPECS[type], g, x: 0, z: 0, h: 0, vx: 0, vz: 0, ai: null, driver: null, slot: null, reserved: null, police: type === 'police' || type === 'army', used: false, startT: 0, bump: 0, v: 0, hp: 100, dead: false, burnT: 0, smokeT: 0 };
  if (type === 'police') {
    car.bar = [new T.Mesh(B(.26, .11, .5), new T.MeshBasicMaterial({ color: 0x2050ff })), new T.Mesh(B(.26, .11, .5), new T.MeshBasicMaterial({ color: 0xff2030 }))];
    car.bar[0].position.set(-.1, 1.36, .3); car.bar[1].position.set(-.1, 1.36, -.3); g.add(car.bar[0], car.bar[1]);
  }
  if (CM && MODEL_OF[type] && (type === 'taxi' || type === 'ambulance')) {   // the extras the plain model lacks
    if (type === 'taxi') { const s = new T.Mesh(B(.26, .16, .56), new T.MeshBasicMaterial({ color: 0xffb020 })); s.position.set(-.1, ge.seat.top + .12, 0); g.add(s); }
    else { const red = new T.MeshBasicMaterial({ color: 0xd01828 }), W2 = CM.van.W; for (const sd of [1, -1]) { const a = new T.Mesh(B(3.4, .22, .02), red); a.position.set(-.3, .85, sd * (W2 / 2 + .015)); g.add(a); }
      const l = new T.Mesh(B(.3, .12, 1.3), new T.MeshBasicMaterial({ color: 0xff3040 })); l.position.set(.9, ge.seat.top + .1, 0); g.add(l); }
  }
  if (type === 'garbage') {   // a rounded compactor at the back, a bin lift, a white stripe and an orange beacon
    const dk = new T.MeshStandardMaterial({ color: 0x255f3a, roughness: .6 }), wh = new T.MeshStandardMaterial({ color: 0xf0f0ea, roughness: .6 }), ar = new T.MeshStandardMaterial({ color: 0x3a3d42, roughness: .5, metalness: .5 });
    for (const sd of [1, -1]) { const st = new T.Mesh(B(5.6, .22, .02), wh); st.position.set(-.9, 1.6, sd * 1.235); g.add(st); }
    const hump = new T.Mesh(B(1.2, .5, 2.2), dk); hump.position.set(-3.1, 3.05, 0); g.add(hump);
    const lift = new T.Mesh(B(.3, 1.6, 2.3), ar); lift.position.set(-3.95, 2.1, 0); g.add(lift); const arm = new T.Mesh(B(.5, .14, 1.9), ar); arm.position.set(-4.15, 1.2, 0); g.add(arm);
    const bc = new T.Mesh(B(.34, .18, .34), new T.MeshBasicMaterial({ color: 0xffa520 })); bc.position.set(2.6, 2.62, 0); g.add(bc);
  }
  if (type === 'haul') {   // the tipper bed with a heap of gravel, a hinge and hazard stripes
    const dk = new T.MeshStandardMaterial({ color: 0x3a3d42, roughness: .6, metalness: .4 }), gr = new T.MeshStandardMaterial({ color: 0x8c7a5a, roughness: 1, flatShading: true }), hz = new T.MeshStandardMaterial({ color: 0x1a1a1a, roughness: .6 });
    const rim = new T.Mesh(B(5.8, .12, 2.5), dk); rim.position.set(-.9, 2.2, 0); g.add(rim);
    const heap = new T.Mesh(new T.ConeGeometry(1.5, .9, 7), gr); heap.scale.set(1.9, 1, 1.05); heap.position.set(-.9, 2.62, 0); g.add(heap);
    for (let k = 0; k < 5; k++) for (const sd of [1, -1]) { const hs = new T.Mesh(B(.3, .3, .02), hz); hs.position.set(-3.5 + k * .55 + (sd > 0 ? .27 : 0), 1.3, sd * 1.235); hs.rotation.z = .7; g.add(hs); }
    const bc = new T.Mesh(B(.34, .18, .34), new T.MeshBasicMaterial({ color: 0xffa520 })); bc.position.set(2.6, 2.62, 0); g.add(bc);
  }
  if (type === 'firetruck') {   // a ladder on the roof, a water cannon, and flashing red lights
    const lad = new T.MeshStandardMaterial({ color: 0xbfc4c8, roughness: .5, metalness: .6 });
    for (const z of [-.45, .45]) { const r = new T.Mesh(B(5.4, .1, .08), lad); r.position.set(-.8, 3.45, z); g.add(r); }
    for (let i = 0; i < 12; i++) { const r = new T.Mesh(B(.06, .06, .9), lad); r.position.set(-3.4 + i * .45, 3.45, 0); g.add(r); }
    const cn = new T.Mesh(B(.9, .16, .16), lad); cn.position.set(-1.2, 3.75, 0); g.add(cn);
    car.bar = [new T.Mesh(B(.26, .11, .5), new T.MeshBasicMaterial({ color: 0xff2030 })), new T.Mesh(B(.26, .11, .5), new T.MeshBasicMaterial({ color: 0xffffff }))];
    car.bar[0].position.set(2.6, 3.35, .55); car.bar[1].position.set(2.6, 3.35, -.55); g.add(car.bar[0], car.bar[1]);
  }
  if (car.spec.tank) car.hp = 900;
  car.wS = wS; car.brk = brk; car.spin = 0;
  G.scene.add(g); G.cars.push(car); return car;
}
function placeCar(c) { if (c.phys && c.phys.kind !== 'kin') return;   /* a free body: the physics places it */
  c.g.rotation.set(0, 0, 0); c.g.position.set(c.x, 0, c.z); c.g.rotation.y = c.h; groundCar(c); if (c.spec.bike) rideBike(c); if (c.spec.bike) { c.g.rotation.order = 'YXZ'; c.lean = (c.lean || 0) + ((c.leanT || 0) - (c.lean || 0)) * .12; c.g.rotation.x = c.lean; } }
export function removeCar(c) { if (c.rider) { c.rider.h.visible = false; riders.push(c.rider); c.rider = null; } G.scene.remove(c.g); const i = G.cars.indexOf(c); if (i >= 0) G.cars.splice(i, 1); const j = G.police.indexOf(c); if (j >= 0) G.police.splice(j, 1); }
export function repaintCar(c) { if (c.spec.psx) { const vs = Object.keys(PX[c.type].tex); c.g.children[0].material = psxMat(c.type, vs[Math.floor(Math.random() * vs.length)]); return; } if (c.police ||c.type === 'taxi' || c.spec.paintCol) return; c.g.children[0].material = paintMat(CARCOL[Math.floor(Math.random() * CARCOL.length)]); }
const randType = () => { const r = rnd(); return r < .16 ? 'sedan' : r < .3 ? 'hatch' : r < .42 ? 'coupe' : r < .52 ? 'rally' : r < .6 ? 'mobil' : r < .68 ? 'jeep' : r < .75 ? 'muscle' : r < .8 ? 'pickup' : r < .84 ? 'sports' : r < .88 ? 'ghini' : r < .91 ? 'italia' : r < .93 ? 'fenyr' : r < .98 ? 'van' : 'taxi'; };
const roadType = () => { const r = rnd(); return r < .08 ? 'bus' : r < .12 ? 'ambulance' : r < .16 ? 'truck' : r < .185 ? 'garbage' : r < .21 ? 'haul' : r < .26 ? 'bike' : r < .28 ? 'chopper' : randType(); };

/* ---------- traffic on the road graph ---------- */
const legSlots = {};
function legInfo(a, b) { const A = nodes[a], Bn = nodes[b], len = Math.hypot(Bn.x - A.x, Bn.z - A.z), dx = (Bn.x - A.x) / len, dz = (Bn.z - A.z) / len; return { dx, dz, rx: -dz, rz: dx, Lg: len - 2 * NODE_R, px: A.x + dx * NODE_R, pz: A.z + dz * NODE_R }; }
function aiStartLeg(car, a, b, s, lat) {
  const li = legInfo(a, b); car.ai = { a, b, s, lat: lat || 0, latT: 0, phase: 'leg', li, park: null };
  const fs = legSlots[a + '_' + b];
  if (fs && !car.spec.noPark && !car.spec.bike && rnd() < (G.aiCount > G.AI_TARGET ? .5 : G.aiCount > G.AI_TARGET - 3 ? .06 : .015)) { const free = fs.filter(sl => !sl.car && sl.s > s + 22); if (free.length) { const sl = pick(free); sl.car = car; car.ai.park = sl; } }
}
let routeIdx = null;
// put a taxi one block before a crossroads so the ride can be skipped
export function aiWarp(car, goal) { const a = nodes[goal].nb[0], li = legInfo(a, goal); if (car.ai && car.ai.phase === 'turn' && car.ai.turn.locked && car.ai.turn.node.busy === car) car.ai.turn.node.busy = null; aiStartLeg(car, a, goal, Math.max(2, li.Lg - 26), 0); if (car.ai.park) { car.ai.park.car = null; car.ai.park = null; } car.v = 6; }
function aiNext(car) {
  const ai = car.ai, node = nodes[ai.b], opts = node.nb.filter(n => n !== ai.a); let nx;
  if (car.type === 'bus' && !car.route) {   // every bus joins the nearer of the two bus lines and then keeps to it
    if (!routeIdx) routeIdx = ROUTES.map(r => r.map(q => nearestNode(q[0], q[1])));
    let bd = 1e9; routeIdx.forEach(r => r.forEach((n, i) => { const d = Math.hypot(nodes[n].x - car.x, nodes[n].z - car.z); if (d < bd) { bd = d; car.route = r; car.ri = i; } }));
  }
  if (car.goal != null && car.goal !== ai.b) nx = bfsNext(ai.b, car.goal);                 // a taxi taking you somewhere
  else if (car.route) { if (ai.b === car.route[car.ri]) car.ri = (car.ri + 1) % car.route.length; nx = bfsNext(ai.b, car.route[car.ri]); }
  else nx = opts.length ? pick(opts) : ai.a;
  const l1 = ai.li, l2 = legInfo(ai.b, nx);
  const p0 = { x: l1.px + l1.dx * l1.Lg + l1.rx * LANE, z: l1.pz + l1.dz * l1.Lg + l1.rz * LANE }, p1 = { x: l2.px + l2.rx * LANE, z: l2.pz + l2.rz * LANE };
  let c; if (l1.dx * l2.dx + l1.dz * l2.dz > .9) c = { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 }; else { const t = (p1.x - p0.x) * l1.dx + (p1.z - p0.z) * l1.dz; c = { x: p0.x + l1.dx * t, z: p0.z + l1.dz * t }; }
  ai.phase = 'turn'; ai.turn = { p0, c, p1, t: 0, len: Math.hypot(c.x - p0.x, c.z - p0.z) + Math.hypot(p1.x - c.x, p1.z - c.z), node, nx, locked: false };
}
function blocked(car, fx, fz, gap) {
  const pl = G.player;
  if (!pl.car && !pl.ride) { const dx = pl.x - car.x, dz = pl.z - car.z, f = dx * fx + dz * fz, l = Math.abs(-dx * fz + dz * fx); if (f > 0 && f < gap && l < 1.7) return true; }
  for (const q of crossers) { const dx = q.x - car.x, dz = q.z - car.z, f = dx * fx + dz * fz, l = Math.abs(-dx * fz + dz * fx); if (f > 0 && f < gap + 2 && l < 2.6) return true; }   // someone is crossing in front
  const ai = car.ai;
  for (const o of G.cars) {
    if (o === car || (o.slot && !o.ai)) continue;
    // other traffic only matters when it is on my stretch of road, or on the stretch I am turning into;
    // the junction itself is kept clear by its one-car-at-a-time lock
    if (o.ai && ai && !((o.ai.a === ai.a && o.ai.b === ai.b) || (ai.phase === 'turn' && o.ai.phase === 'leg' && o.ai.a === ai.b && o.ai.b === ai.turn.nx))) continue;
    const dx = o.x - car.x, dz = o.z - car.z; if (Math.abs(dx) > 30 || Math.abs(dz) > 30) continue; const f = dx * fx + dz * fz, l = Math.abs(-dx * fz + dz * fx); if (f > 0 && f < gap + (o.spec.L + car.spec.L) / 2 - 2.3 && l < 1.9) return true; }
  return false;
}
function updateAI(car, dt) {
  const ai = car.ai; let fx, fz, target;
  if (car.bump > 0) { car.bump -= dt; car.v = 0; return; }
  if (car.riderOff) { car.riderOff = false; releaseAI(car); car.used = true; car.vx = car.vz = 0; return; }   // the rider never came back (knocked down, ran off): the bike is left where it stands
  if (ai.phase === 'leg') {
    const li = ai.li; fx = li.dx; fz = li.dz; target = 9.5 * (car.fast || 1) * (onRing(car.x, car.z, 4) ? 1.9 : 1);   // traffic goes nearly twice as fast on the ring road
    if (ai.park) { const d = ai.park.s - ai.s; if (d < 16) { ai.latT = PARK_LAT - LANE; target = clamp(d * .7 + .6, .6, 9.5); } if (d <= .15) { parkCar(car, ai.park); return; } }
    else ai.latT = 0;
    if (car.route) {   // buses pull in at the shelter half way down the block and wait a moment
      if (ai.bus === undefined) ai.bus = BUS_LEGS.has(nodes[ai.a].x + ',' + nodes[ai.a].z + '>' + nodes[ai.b].x + ',' + nodes[ai.b].z) ? li.Lg * .5 : -1;
      const d = ai.bus - ai.s;
      if (ai.bus > 0 && !ai.busDone && d < 20) { ai.latT = 1.5; target = clamp(d * .7 + .4, .4, 9.5); if (d <= .4) { target = 0; car.atStop = true; ai.wait = (ai.wait || 0) + dt; if (ai.wait > 7) { ai.busDone = true; car.atStop = false; } } }
    }
    if (car.stopReq) target = 0;
    if (ai.s > li.Lg - 9) target = Math.min(target, 6);
    if (nodes[ai.b].tl && !car.fast && !car.police && car.type !== 'ambulance' && !lightGreen(Math.abs(li.dx) > .5)) {   // a red light: roll up to the line and wait
      const ds = li.Lg - 1.2 - ai.s; if (ds > -1.5 && ds < 28) target = Math.min(target, ds < .5 ? 0 : clamp(ds * .8, 1.5, 9.5)); }
    if (blocked(car, fx, fz, 5 + car.v * .9)) { target = 0;
      const pl = G.player, ox = (pl.car ? pl.car.x : pl.x) - car.x, oz = (pl.car ? pl.car.z : pl.z) - car.z, ahead = ox * fx + oz * fz;   // stuck behind you: they lean on the horn
      if (ahead > 0 && ahead < 9 && Math.abs(ox * fz - oz * fx) < 2.2) { car.hornT = (car.hornT || 0) + dt; if (car.hornT > 1.6) { car.hornT = -rr(1.5, 4); if (G.sfx && G.sfx.horn) G.sfx.horn(car.type === 'bus' || car.type === 'truck'); car.honks = (car.honks || 0) + 1; if (car.honks >= 3 && car.v < .5 && ahead < 7 && rnd() < .5) { car.honks = 0; G.driverOut(car); } } } }   // hooted three times and you still have not moved: some drivers get out
    car.v += clamp(target - car.v, -11 * dt, 4 * dt); if (car.v < 0) car.v = 0;
    ai.s += car.v * dt; ai.lat += clamp(ai.latT - ai.lat, -1.4 * dt, 1.4 * dt);
    if (ai.s >= li.Lg && !ai.park) { ai.s = li.Lg; aiNext(car); }
    const lt = LANE + ai.lat; car.x = li.px + li.dx * ai.s + li.rx * lt; car.z = li.pz + li.dz * ai.s + li.rz * lt;
    const swerve = car.v > .5 ? -clamp(ai.latT - ai.lat, -1, 1) * .22 : 0;
    car.h += wrapA(Math.atan2(-fz, fx) + swerve - car.h) * Math.min(1, dt * 6);
  } else {
    const tn = ai.turn;
    if (!tn.locked) { if (tn.node.busy && tn.node.busy !== car) { car.v = 0; return; } tn.node.busy = car; tn.locked = true; }
    const t = tn.t, it = 1 - t, tx = 2 * it * (tn.c.x - tn.p0.x) + 2 * t * (tn.p1.x - tn.c.x), tz = 2 * it * (tn.c.z - tn.p0.z) + 2 * t * (tn.p1.z - tn.c.z), tl = Math.hypot(tx, tz) || 1;
    fx = tx / tl; fz = tz / tl; target = blocked(car, fx, fz, 4 + car.v * .8) ? 0 : 6 * (car.fast ? 1.3 : 1);
    car.v += clamp(target - car.v, -11 * dt, 4 * dt); if (car.v < 0) car.v = 0;
    tn.t += car.v * dt / tn.len;
    if (tn.t >= 1) { tn.node.busy = null; aiStartLeg(car, ai.b, tn.nx, 0, 0); car.x = tn.p1.x; car.z = tn.p1.z; return; }
    const u = tn.t, iu = 1 - u; car.x = iu * iu * tn.p0.x + 2 * iu * u * tn.c.x + u * u * tn.p1.x; car.z = iu * iu * tn.p0.z + 2 * iu * u * tn.c.z + u * u * tn.p1.z;
    car.h += wrapA(Math.atan2(-fz, fx) - car.h) * Math.min(1, dt * 8);
  }
  car.vx = fx * car.v; car.vz = fz * car.v;
}
export function releaseAI(car) { const ai = car.ai; if (!ai) return; if (ai.phase === 'turn' && ai.turn.locked && ai.turn.node.busy === car) ai.turn.node.busy = null; if (ai.park && ai.park.car === car) ai.park.car = null; car.ai = null; G.aiCount--; }
function parkCar(car, sl) {
  car.ai = null; G.aiCount--; car.slot = sl; sl.car = car; car.x = sl.x; car.z = sl.z; car.h = sl.h; car.v = 0; car.vx = car.vz = 0;
  car.driver = null;
  const p = G.peds.find(q => q.state === 'inside' && (q.carIn === car || !q.carIn));
  if (p && sl.loop.doors.length) { p.loop = sl.loop; p.u = sl.u; p.x = sl.px; p.z = sl.pz; p.state = 'on'; p.h.visible = true; }
}
export function makeTraffic(nAI, nParked) {
  for (const s of slots) (legSlots[s.a + '_' + s.b] = legSlots[s.a + '_' + s.b] || []).push(s);
  G.aiCount = 0; G.AI_TARGET = nAI; G.PARK_TARGET = nParked;
  const legs = []; nodes.forEach((A, a) => A.nb.forEach(b => legs.push([a, b])));
  for (let i = 0; i < nAI; i++) { const lg = legs[Math.floor(rnd() * legs.length)], li = legInfo(lg[0], lg[1]), car = newCar(roadType()); aiStartLeg(car, lg[0], lg[1], rr(4, li.Lg - 14), 0); if (car.ai.park) { car.ai.park.car = null; car.ai.park = null; } G.aiCount++; car.v = 8; updateAI(car, .016); car.h = Math.atan2(-li.dz, li.dx); placeCar(car); }
  const free = slots.filter(s => !s.car);
  for (let i = 0; i < nParked && free.length; i++) { const k = Math.floor(rnd() * free.length), s = free.splice(k, 1)[0]; const car = newCar(rnd() < .16 ? 'bike' : randType()); car.slot = s; s.car = car; car.x = s.x; car.z = s.z; car.h = s.h; placeCar(car); }
}

/* ---------- driving physics (player and police) ---------- */
const cp = { x: 0, z: 0 }, OFFS = [1.25, -1.25];
export function driveCar(car, thr, steer, hb, dt) {
  const sp = car.spec;
  if (G.physDrive) { const r = G.physDrive(car, thr, steer, hb, dt); if (r >= 0) return r; }   // real physics when it is loaded and the car is near
  let fx = Math.cos(car.h), fz = -Math.sin(car.h);
  let vf = car.vx * fx + car.vz * fz, vl = -car.vx * fz + car.vz * fx;
  if (thr > 0) vf += sp.acc * thr * dt * (vf < 0 ? 2 : 1) * (1 - clamp(vf / sp.max, 0, 1) * .6);
  else if (thr < 0) vf -= (vf > 1 ? 20 : sp.acc * .55) * (-thr) * dt;
  vf -= vf * (.12 + (hb ? 1.6 : 0)) * dt; if (thr === 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt);
  vf = clamp(vf, -sp.max * .3, sp.max); vl *= Math.exp(-(hb ? 2 : 7.5 - 3 * (G.wet || 0)) * dt);   // wet roads: the back steps out more easily
  const av = Math.abs(vf); car.h -= steer * sp.turn * Math.min(1, av / 4) / (1 + av * .03) * dt * (vf < 0 ? -1 : 1);
  if (sp.bike) car.leanT = steer * Math.min(1, av / 14) * .5;
  fx = Math.cos(car.h); fz = -Math.sin(car.h);
  car.vx = fx * vf - fz * vl; car.vz = fz * vf + fx * vl;
  if (!sp.tank && (car.x > 238 || car.x < -190)) {   // hills pull a car back: a gentle slope costs nothing, a steep one slows it to a crawl and rolls it back down
    const cy = car.g.position.y, gx = (landHeight(car.x + 1.5, car.z, cy) - landHeight(car.x - 1.5, car.z, cy)) / 3, gz = (landHeight(car.x, car.z + 1.5, cy) - landHeight(car.x, car.z - 1.5, cy)) / 3, m = Math.hypot(gx, gz);
    if (m > .2) { const k = (m - .2) / m * 30 * dt; car.vx -= gx * k; car.vz -= gz * k; }
  }
  { const inH = inHedge(car.x + fx * 1.2, car.z + fz * 1.2) || inHedge(car.x, car.z); if (inH) { const k = car.hedge ? Math.max(0, 1 - .8 * dt) : .8; car.vx *= k; car.vz *= k; if (!car.hedge && G.debris && car === G.player.car) G.debris(car.x + fx, .7, car.z + fz, 8, 0x3f7a3a, car.vx * .4, car.vz * .4, .16); } car.hedge = inH; }   // a hedge slows it
  car.x += car.vx * dt; car.z += car.vz * dt;
  let impact = 0;
  for (const off of (sp.offs || OFFS)) {
    cp.x = car.x + fx * off; cp.z = car.z + fz * off; const ox = cp.x, oz = cp.z, r = collide(cp, sp.bike ? .55 : 1.0);
    if (r.hit) {
      const vn = car.vx * r.nx + car.vz * r.nz, pr = r.prop;
      if (pr && !pr.gone && vn < 0 && (-vn > pr.need || sp.tank) && G.breakProp) {   // street furniture gives way: the car ploughs on, a bit slower and a bit dented
        G.breakProp(pr, car.vx, car.vz); car.x = car.x; const lose = sp.tank ? 1 : (pr.kind === 'lamp' || pr.kind === 'shelter' ? .72 : .93); car.vx *= lose; car.vz *= lose; impact = Math.max(impact, pr.kind === 'lamp' || pr.kind === 'shelter' ? -vn * (1 - lose) * 3 : 0);
        if (!sp.tank) car.hp -= (pr.kind === 'lamp' || pr.kind === 'shelter' ? 3 : .25) / toughOf(sp); /* knocking over a lamp or a bench no longer brings the police */
      } else { car.x += cp.x - ox; car.z += cp.z - oz; if (vn < 0) { car.vx -= 1.25 * vn * r.nx; car.vz -= 1.25 * vn * r.nz; car.vx *= .94; car.vz *= .94; impact = Math.max(impact, -vn); } }
    }
    for (const o of G.cars) {
      if (o === car) continue; const ddx = o.x - cp.x, ddz = o.z - cp.z; if (Math.abs(ddx) > 4.5 || Math.abs(ddz) > 4.5) continue;
      const ofx = Math.cos(o.h), ofz = -Math.sin(o.h);
      for (const oo of (o.spec.offs || OFFS)) {
        const qx = o.x + ofx * oo, qz = o.z + ofz * oo, dx = cp.x - qx, dz = cp.z - qz, d = Math.hypot(dx, dz);
        const rad = sp.bike || o.spec.bike ? 1.45 : 2.0;
        if (d < rad && d > .001) {
          const nx = dx / d, nz = dz / d, pen = rad - d; car.x += nx * pen; car.z += nz * pen; cp.x += nx * pen; cp.z += nz * pen;
          const vn = (car.vx - o.vx) * nx + (car.vz - o.vz) * nz;
          if (vn < 0) { car.vx -= 1.2 * vn * nx; car.vz -= 1.2 * vn * nz; impact = Math.max(impact, -vn); if (o.ai) o.bump = 1.5; car.hitCar = o; if (sp.tank && -vn > 1.5) o.hp -= 70; else if (-vn > 5) o.hp -= (-vn - 4) * 1.6 / toughOf(o.spec); }
        }
      }
    }
  }
  car.v = Math.hypot(car.vx, car.vz);
  if (impact > 5.5 && !sp.tank) { car.hp -= (impact - 4.5) * 2.5 / toughOf(sp); if (G.debris && impact > 7 && car === G.player.car) { const fx = Math.cos(car.h), fz = -Math.sin(car.h); G.debris(car.x + fx * 1.8, .7, car.z + fz * 1.8, Math.min(10, impact | 0), 0xbfe3ea, car.vx, car.vz, .1); G.debris(car.x + fx * 1.8, .6, car.z + fz * 1.8, 3, 0x2a2c30, car.vx, car.vz, .25); } }
  return impact;
}

/* ---------- smoke, fire and explosions ---------- */
const puffs = [];
// soft, noisy blobs drawn as flat sprites that always face you: smoke (dark, billowing) and fire (white-hot core, glowing edge)
let SMOKE_T = null, FIRE_T = null;
function blobTex(fire) {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N), d = im.data;
  let sd = fire ? 77 : 31; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const G8 = 8, g = new Float32Array(G8 * G8); for (let i = 0; i < g.length; i++) g[i] = rn();
  const sm = (u, v) => { const fx = u * G8, fy = v * G8, x0 = Math.floor(fx) % G8, y0 = Math.floor(fy) % G8, x1 = (x0 + 1) % G8, y1 = (y0 + 1) % G8, tx = fx - Math.floor(fx), ty = fy - Math.floor(fy), sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); return (g[x0 + y0 * G8] * (1 - sx) + g[x1 + y0 * G8] * sx) * (1 - sy) + (g[x0 + y1 * G8] * (1 - sx) + g[x1 + y1 * G8] * sx) * sy; };
  for (let j2 = 0; j2 < N; j2++) for (let i2 = 0; i2 < N; i2++) {
    const u = i2 / N, v = j2 / N, dx = u - .5, dy = v - .5, r = Math.sqrt(dx * dx + dy * dy) * 2, n = sm(u * 1, v * 1) * .55 + sm((u * 2) % 1, (v * 2) % 1) * .3 + rn() * .15;
    let a = Math.max(0, 1 - r * (fire ? 1.05 : 1.0)); a = a * a * (fire ? 1.6 : 1.3) * (.45 + n * .9); a = Math.min(1, a);
    const k = (j2 * N + i2) * 4; const core = fire ? Math.max(0, 1 - r * 1.6) : 0;
    d[k] = 255 * (fire ? 1 : .86 + n * .14); d[k + 1] = 255 * (fire ? (.85 + core * .15) : .86 + n * .14); d[k + 2] = 255 * (fire ? (.55 + core * .45) : .86 + n * .14); d[k + 3] = a * 255;
  }
  x.putImageData(im, 0, 0); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
const FIRE_FROM = new T.Color(), FIRE_MID = new T.Color(0xff6a12), FIRE_END = new T.Color(0x3a0c04), TMPC = new T.Color();
const isFireColor = c => { const r = (c >> 16) & 255, b = c & 255; return r > 200 && b < 120; };   // orange and yellow are flames, anything else is smoke or dust
export function puff(x, y, z, color, size, vy, life) {
  if (puffs.length > 160) return;
  if (!SMOKE_T) { SMOKE_T = blobTex(false); FIRE_T = blobTex(true); }
  const fire = isFireColor(color);
  const m = new T.Sprite(new T.SpriteMaterial({ map: fire ? FIRE_T : SMOKE_T, color: fire ? 0xffffff : color, transparent: true, opacity: .9, depthWrite: false, blending: fire ? T.AdditiveBlending : T.NormalBlending, rotation: rnd() * 6.28, fog: true }));
  m.position.set(x, y, z); m.scale.setScalar(size * 2); G.scene.add(m); FIRE_FROM.setHex(color);
  puffs.push({ m, t: life, life, vy, g: size * 2, fire, spin: (rnd() - .5) * (fire ? 1.2 : .6), c0: FIRE_FROM.getHex(), vx: (rnd() - .5) * .8, vz: (rnd() - .5) * .8 });
}
export function updatePuffs(dt) {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i]; p.t -= dt;
    if (p.t <= 0) { G.scene.remove(p.m); p.m.material.dispose(); puffs.splice(i, 1); continue; }
    const k = p.t / p.life, a = 1 - k; p.m.position.y += p.vy * dt * (p.fire ? 1 : (.4 + k * .6)); p.m.position.x += p.vx * dt * (p.fire ? .5 : 1.6); p.m.position.z += p.vz * dt * (p.fire ? .5 : 1.6); p.m.material.rotation += p.spin * dt;
    if (p.fire) {   // a flame goes from its yellow to orange to red to nothing as it rises
      p.m.scale.setScalar(p.g * (1 - a * .35)); p.m.material.opacity = Math.min(1, k * 1.8) * .72;
      TMPC.setHex(p.c0); if (a < .5) TMPC.lerp(FIRE_MID, a * 2); else TMPC.copy(FIRE_MID).lerp(FIRE_END, (a - .5) * 2); p.m.material.color.copy(TMPC);
    } else { p.m.scale.setScalar(p.g * (1 + a * 1.9)); p.m.material.opacity = Math.min(.85, k * 1.4) * .85; }
  }
}
const wreckMat = new T.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 1 });
// an explosion at a spot (rocket): wrecks cars, flattens people, hurts you if you stand too close
// What a blast leaves behind: a burnt patch on the ground and a blackened, chipped crater on every wall close to it
const scorchTex = (wall, seed) => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); let r = seed * 7919 + 13; const rn = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  const g = x.createRadialGradient(128, 128, 6, 128, 128, 126); g.addColorStop(0, 'rgba(8,8,8,.95)'); g.addColorStop(.35, 'rgba(18,16,14,.8)'); g.addColorStop(.7, 'rgba(30,26,22,.35)'); g.addColorStop(1, 'rgba(30,26,22,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) { const a = rn() * 6.283, l = 40 + rn() * 80; x.strokeStyle = 'rgba(10,10,10,' + (.25 + rn() * .4) + ')'; x.lineWidth = 2 + rn() * 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(128 + Math.cos(a) * 14, 128 + Math.sin(a) * 14); x.lineTo(128 + Math.cos(a) * l, 128 + Math.sin(a) * l); x.stroke(); }   // soot streaks outwards
  if (wall) { for (let i = 0; i < 14; i++) { const a = rn() * 6.283, d = rn() * 60, w = 8 + rn() * 22; x.fillStyle = rn() < .5 ? 'rgba(150,140,128,.9)' : 'rgba(96,90,84,.9)'; x.beginPath(); for (let k = 0; k < 6; k++) { const b = k / 6 * 6.283, rr2 = w * (.55 + rn() * .5); x[k ? 'lineTo' : 'moveTo'](128 + Math.cos(a) * d + Math.cos(b) * rr2, 128 + Math.sin(a) * d + Math.sin(b) * rr2); } x.fill(); }   // plaster knocked off, bare stone under it
    for (let i = 0; i < 9; i++) { let px = 128, py = 128; const a = rn() * 6.283; x.strokeStyle = 'rgba(12,12,12,.85)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 7; k++) { px += Math.cos(a + (rn() - .5) * 1.2) * 15; py += Math.sin(a + (rn() - .5) * 1.2) * 15; x.lineTo(px, py); } x.stroke(); } }   // cracks
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
let scorchMats = null; const scorchGeo = new T.PlaneGeometry(1, 1), scorches = [];
function scorch(x, z, r) {
  if (!G.scene) return; if (!scorchMats) scorchMats = [0, 1, 2, 3].map(i => new T.MeshBasicMaterial({ map: scorchTex(i > 1, i + 1), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: true }));
  const put = (m) => { m.renderOrder = 1; G.scene.add(m); scorches.push(m); if (scorches.length > 60) G.scene.remove(scorches.shift()); };
  if (!inWater(x, z) || landHeight(x, z) > .2) { const m = new T.Mesh(scorchGeo, scorchMats[Math.random() < .5 ? 0 : 1]); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.283; m.scale.setScalar(r * rr(1.0, 1.3)); m.position.set(x, landHeight(x, z) + .04, z); put(m); }
  let n = 0;
  for (let k = 0; k < 16 && n < 4; k++) {   // look round for walls: the first solid thing in each direction
    const a = k / 16 * 6.283, dx = Math.cos(a), dz = Math.sin(a); if (wallAt(x, z)) break; let d = 0; for (d = .4; d <= r + 1; d += .4) if (wallAt(x + dx * d, z + dz * d)) break; if (d > r + 1) continue;
    let lo = d - .4, hi = d; for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; if (wallAt(x + dx * mid, z + dz * mid)) hi = mid; else lo = mid; }
    const hx = x + dx * lo, hz = z + dz * lo, e = .12, xw = wallAt(hx + Math.sign(dx) * e, hz), zw = wallAt(hx, hz + Math.sign(dz) * e); if (xw === zw) continue;   // a corner or a thin post: no flat face to mark
    if (scorches.some(q => q.userData.w && Math.hypot(q.position.x - hx, q.position.z - hz) < 1.6 && q.userData.t === G.time)) continue;   // one mark per stretch of wall
    const m = new T.Mesh(scorchGeo, scorchMats[2 + (n & 1)]), s = Math.max(1.6, (r + 1.5 - lo) * rr(.75, 1)); m.scale.set(s, Math.min(s, 3.4), 1); m.rotation.y = xw ? (dx > 0 ? -Math.PI / 2 : Math.PI / 2) : (dz > 0 ? Math.PI : 0); m.rotation.z = 0;
    m.position.set(hx - (xw ? Math.sign(dx) * .03 : 0), landHeight(hx, hz) + Math.min(s, 3.4) * .5 - .1, hz - (xw ? 0 : Math.sign(dz) * .03)); m.userData.w = true; m.userData.t = G.time; put(m); n++;
  }
}
G.scorchDBG = () => scorches.map(m => [+m.position.x.toFixed(1), +m.position.y.toFixed(1), +m.position.z.toFixed(1), !!m.userData.w]);
export function blast(x, z, r) { if (G.breakNear) G.breakNear(x, z, r * .8); scorch(x, z, r);
  for (let i = 0; i < 16; i++) puff(x + rr(-r * .3, r * .3), .5 + rnd() * 1.8, z + rr(-r * .3, r * .3), i % 3 ? 0xff8a1f : 0xffd24a, rr(1.8, 3.6), rr(1.5, 4), rr(.7, 1.4));
  for (let i = 0; i < 8; i++) puff(x + rr(-1, 1), 1.5 + rnd(), z + rr(-1, 1), 0x2a2a2a, rr(2, 3.6), rr(2, 4), rr(2.4, 4));
  if (G.sfx) { G.sfx.crash(20); G.sfx.shot(); }
  for (const c of G.cars.slice()) { if (c.dead) continue; const d = Math.hypot(c.x - x, c.z - z);
    if (d < r * .75) explode(c);   // right next to it: it blows up
    else if (d < r + 4) { const k = 1 - (d - r * .75) / (r * .25 + 4); c.hp -= (25 + 60 * k) / toughOf(c.spec); dentCar(c, (c.x - x) / d, (c.z - z) / d, 1 + Math.round(k * 3)); } }   // further out: damaged and dented by how close it was
  for (const q of G.peds) { const d = Math.hypot(q.x - x, q.z - z) || .01; if (d < r && q.h.visible && knockPed(q, (q.x - x) / d * 8, (q.z - z) / d * 8)) { q.dead = true; q.t = 16; } }
  const pl = G.player, d = Math.hypot(pl.x - x, pl.z - z); if (d < r && !pl.ride && !pl.car && !G.inside) { G.hurt(90 * (1 - d / r)); if (G.fling && d > .01) G.fling((pl.x - x) / d * 14 * (1 - d / r), (pl.z - z) / d * 14 * (1 - d / r)); }
  if (G.cops) for (const c of G.cops.slice()) if (Math.hypot(c.x - x, c.z - z) < r) G.hitCop(c, 200);
  panicPeds(x, z, 55);
}
function explode(c) {
  const pl = G.player; dropRider(c); c.dead = true; c.burnT = 0; c.hp = 0; c.vx = c.vz = 0; c.v = 0; c.goneT = 50; G.wrecks = (G.wrecks || 0) + 1;
  if (G.physKick) G.physKick(c, rr(-2, 2), rr(5, 8), rr(-2, 2), 6);   // the blast throws the wreck into the air
  if (c.ai) releaseAI(c); if (c.slot) { c.slot.car = null; c.slot = null; } c.reserved = null; c.driver = null;
  if (c.chase) { c.chase = null; const j = G.police.indexOf(c); if (j >= 0) G.police.splice(j, 1); }
  c.g.children.forEach(m => { if (m.isMesh) m.material = wreckMat; }); if (c.bar) c.bar.forEach(b => { b.visible = false; });
  for (let i = 0; i < 14; i++) puff(c.x + rr(-1.5, 1.5), .6 + rnd() * 1.5, c.z + rr(-1.5, 1.5), i % 3 ? 0xff8a1f : 0xffd24a, rr(.8, 1.8), rr(1.5, 4), rr(.5, 1.1));
  for (let i = 0; i < 8; i++) puff(c.x + rr(-1, 1), 1.5 + rnd(), c.z + rr(-1, 1), 0x2a2a2a, rr(1, 2), rr(2, 4), rr(1.5, 2.6));
  if (G.sfx) { G.sfx.crash(20); G.sfx.shot(); }
  if (pl.car === c) G.hurt(400);
  else { const d = Math.hypot(pl.x - c.x, pl.z - c.z); if (d < 9 && !pl.ride && !G.inside) G.hurt(70 * (1 - d / 9)); }
  for (const p of G.peds) if (p.h.visible && (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < 49) { knockPed(p, (p.x - c.x) * 2, (p.z - c.z) * 2); p.dead = true; p.t = 14; }
  for (const o of G.cars) if (o !== c && !o.dead && (o.x - c.x) ** 2 + (o.z - c.z) ** 2 < 36) o.hp -= 55 / toughOf(o.spec);
}
export function spawnTraffic() {
  const pl = G.player, legs = [], far = (MOBILE ? 300 : 420) - 60; nodes.forEach((A, a) => { const d = Math.hypot(A.x - pl.x, A.z - pl.z); if (d > 130 && d < far) A.nb.forEach(b => legs.push([a, b])); });   // new traffic appears out of sight but not far away
  if (!legs.length) return; const lg = legs[Math.floor(rnd() * legs.length)], li = legInfo(lg[0], lg[1]), car = newCar(roadType());
  aiStartLeg(car, lg[0], lg[1], rr(4, li.Lg - 14), 0); if (car.ai.park) { car.ai.park.car = null; car.ai.park = null; } G.aiCount++; car.v = 8; updateAI(car, .016); car.h = Math.atan2(-li.dz, li.dx); placeCar(car);
}
// The city is far too big to fill with cars and people, so they only exist around you: whatever is left far behind is
// taken away, and new traffic, parked cars and walkers appear in the streets near you (out of sight).
let streamT = 0;
export function streamWorld(dt) {
  streamT -= dt; if (streamT > 0) return; streamT = .5;
  const pl = G.player, px = pl.car ? pl.car.x : pl.ride ? pl.ride.x : pl.x, pz = pl.car ? pl.car.z : pl.ride ? pl.ride.z : pl.z, FAR = MOBILE ? 300 : 420;
  let parked = 0;
  for (const c of G.cars.slice()) {
    if (c === pl.car || c.police || c.chase || c.brig || c.used || c.dead || c === G.dockTank) continue;
    const far = Math.hypot(c.x - px, c.z - pz) > FAR;
    if (c.ai) { if (far && !(c.goal != null)) { releaseAI(c); removeCar(c); } }
    else if (c.slot && c.slot.car === c) { if (far && !c.reserved && !c.driver) { c.slot.car = null; c.slot = null; removeCar(c); } else parked++; }
  }
  // keep the number of cars near you steady: moving cars park and parked cars drive off by themselves, so only top up what is missing
  for (let k = 0; k < 4 && G.aiCount < G.AI_TARGET; k++) spawnTraffic();
  if (parked > G.PARK_TARGET + 12) { let cut = parked - G.PARK_TARGET - 12; for (const c of G.cars.slice()) { if (cut <= 0) break; if (c.slot && c.slot.car === c && !c.ai && !c.used && !c.reserved && !c.driver && c !== pl.car && Math.hypot(c.x - px, c.z - pz) > 190) { c.slot.car = null; c.slot = null; removeCar(c); cut--; parked--; } } }
  if (parked < G.PARK_TARGET) {
    const near = []; nodes.forEach((A, a) => { const d = Math.hypot(A.x - px, A.z - pz); if (d > 40 && d < FAR - 40) near.push(a); });
    for (let k = 0, made = 0; k < 30 && made < 6 && near.length && parked + made < G.PARK_TARGET; k++) {
      const a = pick(near), b = pick(nodes[a].nb), ls = legSlots[a + '_' + b]; if (!ls) continue;
      const sl = pick(ls); if (sl.car || Math.hypot(sl.x - px, sl.z - pz) < 85) continue;
      const car = newCar(rnd() < .16 ? 'bike' : randType()); car.slot = sl; sl.car = car; car.x = sl.x; car.z = sl.z; car.h = sl.h; placeCar(car); made++;
    }
  }
  const PF = MOBILE ? 200 : 260; let nearLoops = null;
  for (const p of G.peds) {
    if (p.state !== 'walk' || Math.hypot(p.x - px, p.z - pz) < PF) continue;
    if (!nearLoops) nearLoops = loops.filter(L => L.doors && L.doors.length && Math.abs((L.x0 + L.x1) / 2 - px) < PF - 30 && Math.abs((L.z0 + L.z1) / 2 - pz) < PF - 30 && Math.hypot((L.x0 + L.x1) / 2 - px, (L.z0 + L.z1) / 2 - pz) > 70);
    if (!nearLoops.length) break;
    const L = pick(nearLoops); p.loop = L; p.u = rnd() * L.P; loopPoint(L, p.u, lp); p.x = lp.x; p.z = lp.z; if (p.target && p.target.car && p.target.car.reserved === p) p.target.car.reserved = null; pedSetTarget(p);
  }
}
function damageTick(c, dt) {
  if (c.dead) { c.goneT -= dt; if (c.goneT <= 0 && Math.hypot(c.x - G.player.x, c.z - G.player.z) > 40) { removeCar(c); spawnTraffic(); } else if (rnd() < dt * 2) puff(c.x + rr(-.8, .8), 1.2, c.z + rr(-.8, .8), 0x2a2a2a, rr(.4, .8), rr(1, 2), rr(1.2, 2)); return; }
  if (c.hp <= 0 && c.burnT <= 0) { c.burnT = 6.5; if (G.player.car === c && G.say) G.say('The car is on fire. Get out!', 3); }
  if (c.burnT > 0) { c.burnT -= dt; if (rnd() < dt * 14) puff(c.x + Math.cos(c.h) * 1.4 + rr(-.4, .4), 1 + rnd() * .4, c.z - Math.sin(c.h) * 1.4 + rr(-.4, .4), rnd() < .6 ? 0xff8a1f : 0xffd24a, rr(.3, .6), rr(1.5, 3), rr(.4, .8)); if (c.burnT <= 0) explode(c); }
  else if (c.hp < 40) { c.smokeT -= dt; if (c.smokeT <= 0) { c.smokeT = .12 + c.hp * .012; puff(c.x + Math.cos(c.h) * 1.5, 1.05, c.z - Math.sin(c.h) * 1.5, c.hp < 18 ? 0x2a2a2a : 0x9a9a9a, rr(.25, .45), rr(1.2, 2.2), rr(.8, 1.4)); } }
}

/* ================= police and wanted level ================= */
G.stars = 0; G.lostT = 0; G.crimeCd = 0; G.bustT = 0;
export function crime(level, add) {
  const before = G.stars;
  if (add) G.stars = Math.min(6, Math.max(G.stars + 1, level)); else G.stars = Math.min(6, Math.max(G.stars, level));
  G.lostT = 0; if (G.stars !== before && G.onStars) G.onStars();
}
function bfsNext(from, to) {
  if (from === to) return to; const prev = new Array(nodes.length).fill(-1), q = [to]; prev[to] = to;
  while (q.length) { const n = q.shift(); if (n === from) break; for (const m of nodes[n].nb) if (prev[m] < 0) { prev[m] = n; q.push(m); } }
  return prev[from] < 0 ? to : prev[from];
}
function clearLine(x0, z0, x1, z1) { const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / .45); for (let i = 1; i < n; i++) { const t = i / n; if (solidAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; } return true; }
// drive a car along the streets to a spot (the fire engine): the same way the police find you. Returns how far it still is
export function rideTo(c, ch, gx, gz, stopD, dt) {
  ch.t = (ch.t || 0) - dt; const d = Math.hypot(gx - c.x, gz - c.z);
  if (ch.t <= 0) { ch.t = .35;
    if (d < 60 && clearLine(c.x, c.z, gx, gz)) { ch.tx = gx; ch.tz = gz; ch.node = -1; }
    else { const b = nearestNode(gx, gz); if (ch.node === undefined || ch.node < 0) ch.node = nearestNode(c.x, c.z); const n = nodes[ch.node];
      if (Math.hypot(n.x - c.x, n.z - c.z) < 13) { if (ch.node === b) { ch.tx = gx; ch.tz = gz; } else { ch.node = bfsNext(ch.node, b); ch.tx = nodes[ch.node].x; ch.tz = nodes[ch.node].z; } }
      else { ch.tx = n.x; ch.tz = n.z; } } }
  const want = Math.atan2(-(ch.tz - c.z), ch.tx - c.x), diff = wrapA(want - c.h); let thr = 1, st = clamp(-diff * 2.2, -1, 1), hb = false;
  if (Math.abs(diff) > 1.1 && c.v > 9) thr = -1;
  if (d < stopD) { thr = c.v > 2 ? -1 : 0; hb = c.v < 6; }
  if (ch.rev > 0) { ch.rev -= dt; thr = -1; st = -st; } else if (c.v < 1 && d > stopD + 2) { ch.stuck = (ch.stuck || 0) + dt; if (ch.stuck > 1.4) { ch.rev = 1.2; ch.stuck = 0; } } else ch.stuck = 0;
  driveCar(c, thr, st, hb, dt); placeCar(c); return d;
}
// the fire brigade: an engine appears on a street out of sight and comes for the fire
G.brigade = [];
G.newCar = newCar; G.placeCar = placeCar;
export function sendFireEngine(fire) {
  let best = -1, bd = 1e9; const pl = G.player;
  nodes.forEach((n, i) => { const d = Math.hypot(n.x - fire.x, n.z - fire.z), dp = Math.hypot(n.x - pl.x, n.z - pl.z); if (d > 150 && d < 330 && dp > 70) { const s = Math.abs(d - 220) + rnd() * 40; if (s < bd) { bd = s; best = i; } } });
  if (best < 0) return;
  const n = nodes[best], car = newCar('firetruck'); car.brig = { fire, ch: { t: 0, stuck: 0, rev: 0 }, st: 'go', t: 0 }; fire.truck = car;
  car.x = n.x; car.z = n.z; car.h = Math.atan2(-(fire.z - n.z), fire.x - n.x); car.used = true; placeCar(car); G.brigade.push(car);
  if (G.say) G.say('You hear sirens: the fire brigade is on its way.', 3);
}
function spawnPolice() {
  const pl = G.player, px = pl.car ? pl.car.x : pl.x, pz = pl.car ? pl.car.z : pl.z; let best = -1, bd = 1e9;
  nodes.forEach((n, i) => { const d = Math.hypot(n.x - px, n.z - pz); if (d > 95 && d < 240) { const s = Math.abs(d - 140) + rnd() * 60; if (s < bd) { bd = s; best = i; } } });
  if (best < 0) return;
  const n = nodes[best], car = newCar(G.stars >= 6 ? (rnd() < .3 ? 'tank' : 'army') : 'police'); car.police = true; car.x = n.x; car.z = n.z; car.h = Math.atan2(-(pz - n.z), px - n.x); car.chase = { t: 0, tx: px, tz: pz, stuck: 0, rev: 0 }; placeCar(car); G.police.push(car);
}
G.police = [];
export function updatePolice(dt) {
  const pl = G.player, px = pl.car ? pl.car.x : pl.x, pz = pl.car ? pl.car.z : pl.z, pv = pl.car ? pl.car.v : pl.speed;
  G.crimeCd -= dt;
  const want = G.stars === 0 ? 0 : Math.min(G.stars, MOBILE ? 4 : 6);
  if (G.police.length < want) { G.spawnT = (G.spawnT || 0) - dt; if (G.spawnT <= 0) { spawnPolice(); G.spawnT = 2.5; } }
  let near = false, close = false;
  for (let i = G.police.length - 1; i >= 0; i--) {
    const c = G.police[i], ch = c.chase; if (!ch) { G.police.splice(i, 1); continue; }
    const d = Math.hypot(px - c.x, pz - c.z);
    if (G.stars === 0) { ch.gone = (ch.gone || 0) + dt; driveCar(c, 0, 0, true, dt); placeCar(c); if (ch.gone > 6 && d > 45 || ch.gone > 25) { G.scene.remove(c.g); G.cars.splice(G.cars.indexOf(c), 1); G.police.splice(i, 1); } continue; }
    if (d < 75) near = true; if (d < 6.5) close = true;
    if (c.cop) { driveCar(c, 0, 0, true, dt); placeCar(c); if (c.bar) { const blink = Math.floor(G.time * 6) % 2; c.bar[0].visible = !!blink; c.bar[1].visible = !blink; } continue; }   // parked while its officer is out on foot
    ch.t -= dt;
    if (ch.t <= 0) {
      ch.t = .35;
      if (d < 60 && clearLine(c.x, c.z, px, pz)) { ch.tx = px + (pl.car ? pl.car.vx * .5 : 0); ch.tz = pz + (pl.car ? pl.car.vz * .5 : 0); ch.node = -1; }
      else {
        const b = nearestNode(px, pz);
        if (ch.node === undefined || ch.node < 0) ch.node = nearestNode(c.x, c.z);
        const n = nodes[ch.node];
        if (Math.hypot(n.x - c.x, n.z - c.z) < 13) { if (ch.node === b) { ch.tx = px; ch.tz = pz; } else { ch.node = bfsNext(ch.node, b); ch.tx = nodes[ch.node].x; ch.tz = nodes[ch.node].z; } }
        else { ch.tx = n.x; ch.tz = n.z; }
      }
    }
    const want = Math.atan2(-(ch.tz - c.z), ch.tx - c.x), diff = wrapA(want - c.h);
    let thr = 1, st = clamp(-diff * 2.2, -1, 1), hb = false;
    if (Math.abs(diff) > 1.1 && c.v > 9) thr = -1;
    // below five stars they do not ram you: they pull up, stop and get out. From five stars they come at you with the car
    const stopD = G.stars >= 5 ? 9 : 17, slow = G.stars >= 5 ? 3 : 7;
    if (d < stopD && pv < slow) { thr = c.v > 2 ? -1 : 0; hb = c.v < 6; if (c.v < 2 && !c.spec.tank && !pl.ride && !G.inside && G.copOut) { G.copOut(c); continue; } }
    else if (G.stars < 5 && d < 70) {   // they are police, not a battering ram: come in at a speed they can stop from, and stay off your bumper
      const cap = pl.car ? Math.max(Math.abs(pv) + (d > 16 ? 6 : -1), 5) : Math.max(0, (d - 13) * .85);
      if (c.v > cap) { thr = c.v > cap + 3 ? -1 : 0; hb = hb || (!pl.car && d < 16); }
    }
    if (ch.rev > 0) { ch.rev -= dt; thr = -1; st = -st; }
    else if (c.v < 1 && d > 9) { ch.stuck += dt; if (ch.stuck > 1.2) { ch.rev = 1.1; ch.stuck = 0; } } else ch.stuck = 0;
    const maxMul = 1 + (G.stars - 1) * .06; const imp = driveCar(c, thr * maxMul, st, hb, dt); placeCar(c);
    if (c.hitCar && (c.hitCar === pl.car) && imp > 5 && G.crimeCd <= 0) { G.crimeCd = 6; crime(3, false); } c.hitCar = null;
    if (c.bar) { const blink = Math.floor(G.time * 6) % 2; c.bar[0].visible = !!blink; c.bar[1].visible = !blink; }
    for (const p of G.peds) if (p.h.visible && c.v > 4 && (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < 3.2) knockPed(p, c.vx, c.vz);
    pl.hurtCd = (pl.hurtCd || 0) - dt;
    if (!pl.car && c.v > 5 && d < 2.3 && pl.hurtCd <= 0) { pl.hurtCd = 1; G.copHurt(c.v * (G.stars >= 5 ? 1.4 : .5)); if (G.fling && (G.stars >= 5 || c.v > 9)) G.fling(c.vx, c.vz); }
  }
  if (G.stars > 0) {
    if (near) G.lostT = 0; else { G.lostT += dt; if (G.lostT > 15 + G.stars * 6) { G.stars = 0; G.lostT = 0; if (G.onStars) G.onStars(); } }
  }
}

/* ================= per-frame car update ================= */
// The look of the cars each frame: wheels that roll and steer on the ones near you, brake lights, and headlights after dark.
const beamTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(0, 32, 2, 0, 32, 128); g.addColorStop(0, 'rgba(255,244,214,1)'); g.addColorStop(.35, 'rgba(255,240,205,.5)'); g.addColorStop(1, 'rgba(255,238,200,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(0, 22); x.lineTo(128, 0); x.lineTo(128, 64); x.lineTo(0, 42); x.closePath(); x.fill(); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
const beamMat = new T.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), beamGeo = new T.PlaneGeometry(13, 6.5).rotateX(-Math.PI / 2).translate(6.5, 0, 0);
let headLamp = null;
function carLooks(dt) {
  const pl = G.player, night = G.night || 0, px = pl.car ? pl.car.x : pl.x, pz = pl.car ? pl.car.z : pl.z, NEAR = MOBILE ? 0 : 65; beamMat.opacity = .5 * night;
  for (const c of G.cars) {
    if (!c.wS) continue; const d = Math.hypot(c.x - px, c.z - pz), near = d < NEAR && !c.dead, fwd = c.vx !== undefined && !c.ai ? c.vx * Math.cos(c.h) - c.vz * Math.sin(c.h) : c.v;
    // brake lights: the car is slowing, or standing with a driver in it
    const acc = (fwd - (c.lfwd === undefined ? fwd : c.lfwd)) / Math.max(dt, .001); c.lfwd = fwd; c.brkT = acc < -2.5 || (c.ai && c.v < .3) || (c === pl.car && (G.debug.keys.KeyS || G.debug.keys.Space) && Math.abs(fwd) > .5) ? .25 : (c.brkT || 0) - dt; c.brk.visible = c.brkT > 0 && !c.dead && d < 160;
    // headlights after dark, on cars with somebody in them
    const lit = night > .25 && !c.dead && d < 110 && (!!c.ai || c === pl.car || !!c.chase);
    if (lit && !c.beam) { c.beam = new T.Mesh(beamGeo, beamMat); c.beam.position.set(c.spec.L / 2 - .1, .07, 0); c.beam.renderOrder = 2; c.g.add(c.beam); } if (c.beam) c.beam.visible = lit;
    if (!near) { if (c.wD) for (const w of c.wD) w.visible = false; c.wS.visible = true; continue; }
    if (!c.wD) { const ge = GEO[c.type], geo = ge.wgeo || wheelGeo(ge.wr); c.wD = ge.wpos.map(q => { const w = new T.Mesh(geo, restMat); w.castShadow = true; w.rotation.order = 'YXZ'; w.position.set(q[0], q[1], q[2]); w.home = q; c.g.add(w); return w; }); }
    c.wS.visible = false; c.spin -= fwd * dt / GEO[c.type].wr;
    // steering: the real wheel angle on a physics car, the way it is turning on the others
    let st = 0; if (c.phys && c.phys.vc) st = c.phys.steer || 0; else { let dh = c.h - (c.lh2 === undefined ? c.h : c.lh2); while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; st = clamp(dh / Math.max(dt, .001) * 2.6 / Math.max(Math.abs(fwd), 2.5), -.55, .55) * (fwd < 0 ? -1 : 1); } c.lh2 = c.h; c.stV = (c.stV || 0) + (st - (c.stV || 0)) * Math.min(1, dt * 10);
    for (let i = 0; i < c.wD.length; i++) { const w = c.wD[i]; w.visible = true; w.rotation.set(0, w.home[0] > 0 ? c.stV : 0, c.spin);
      if (c.phys && c.phys.vc && i < 4) { const k = [0, 1, 2, 3][i], len = c.phys.vc.wheelSuspensionLength(k); w.position.y = w.home[1] + (len === null || len === undefined ? 0 : clamp(.18 - len, -.12, .12)); } else w.position.y = w.home[1]; }
  }
  // one real lamp for your own car, so the road ahead is lit
  if (!MOBILE) { if (!headLamp) { headLamp = new T.SpotLight(0xfff0d2, 0, 55, .55, .6, 1.1); G.scene.add(headLamp); G.scene.add(headLamp.target); }
    const c = pl.car; if (c && !c.dead && night > .25 && !c.spec.tank) { const fx = Math.cos(c.h), fz = -Math.sin(c.h), y = c.g.position.y; headLamp.position.set(c.x + fx * (c.spec.L / 2), y + .85, c.z + fz * (c.spec.L / 2)); headLamp.target.position.set(c.x + fx * 30, y - .5, c.z + fz * 30); headLamp.intensity = 90 * night; } else headLamp.intensity = 0; }
}
export function updateCars(dt) {
  carLooks(dt); if (carEnv) carEnvLevel();
  const pl = G.player;
  for (const c of G.cars.slice()) damageTick(c, dt);
  const CARFAR = ((G.Q && G.Q.car) || 320) ** 2, cx0 = G.camera ? G.camera.position.x : pl.x, cz0 = G.camera ? G.camera.position.z : pl.z;
  for (const c of G.cars) {
    c.g.visible = c === pl.car || (c.x - cx0) ** 2 + (c.z - cz0) ** 2 < CARFAR;   // cars far away are not drawn
    syncOcc(c);
    if ((c === pl.car && !pl.passenger) || c.chase || c.brig) continue;
    if (c.startT > 0) { c.startT -= dt; if (c.startT <= 0 && c.driver && c.slot) { const s = c.slot; s.car = null; c.slot = null; G.aiCount++; aiStartLeg(c, s.a, s.b, s.s, PARK_LAT - LANE); if (c.ai.park) { c.ai.park.car = null; c.ai.park = null; } c.v = 0; } }
    if (c.ai) { updateAI(c, dt); placeCar(c); }
    else if (!c.phys && (c.v > .01 || Math.abs(c.vx) + Math.abs(c.vz) > .01)) { driveCar(c, 0, 0, true, dt); placeCar(c); }
  }
}
// the player takes a car: returns true when it worked
export function takeCar(car) {
  const pl = G.player; if (car.dead) return false; if (car.rider && car.v <= 8) dropRider(car);
  // someone is at the wheel: he is pulled out on the driver's side, lands on the street, then gets up and runs
  const throwOut = () => {
    const p = G.peds.find(q => q.state === 'inside' && q.carIn === car) || G.peds.find(q => q.state === 'inside' && !q.carIn); if (!p) return;   // this car's own driver first, never somebody sitting in another car
    p.carIn = null;
    const sx = Math.sin(car.h), sz = Math.cos(car.h), side = ((pl.x - car.x) * sx + (pl.z - car.z) * sz) >= 0 ? 1 : -1;   // the side you are standing on
    p.x = car.x + sx * 1.5 * side; p.z = car.z + sz * 1.5 * side; p.yaw = Math.atan2(sx * side, sz * side); p.h.visible = true; p.state = 'down'; p.dead = false; p.t = 2.2; p.kx = sx * side * 3.5; p.kz = sz * side * 3.5;
    if (G.say) G.say(pick(['"Hey! That is my car!"', '"Help! Thief!"', '"What are you doing?!"']), 2.5); if (G.sfx) G.sfx.punch();
  };
  if (car.ai) { if (car.v > 8) return false; releaseAI(car); car.driver = null; throwOut(); crime(1, false); }
  else if (car.driver) { car.driver = null; car.startT = 0; throwOut(); crime(1, false); }
  if (car.chase) { car.chase = null; crime(3, false); }
  else if (car.police) crime(2, false);
  if (car.slot) { car.slot.car = null; car.slot = null; }
  if (car.reserved) car.reserved = null;
  car.used = true; car.bump = 0; pl.car = car; return true;
}
