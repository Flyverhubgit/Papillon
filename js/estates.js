// Papillon - two walled estates with armed guards, and the stealable super yacht.
//  1) the Syndicate's villa on the south coast: high walls, a gate with guard booths, a pool, and a 28 m yacht at the quay
//  2) the presidential residence in the east: a white pillared mansion behind iron railings, guards and attack dogs
// The guards themselves are gang members (see gangs.js). The dogs are in this file.
import * as T from 'three';
import { G, rr, rnd, landHeight, addBox, addCircle, solidAt, COAST } from './world.js';
import { mergeStatic } from './merge.js';
import { makeYacht, makeAttackHeli } from './craft.js';
import { addCrate, addMarker } from './shops.js';
import { clearLine, newCar } from './actors.js';

const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .8 }, o || {}));
const mats = {
  stucco: M(0xe8e0d0), stone: M(0xb9b2a4), conc: M(0x8e9094), concD: M(0x5d6064), white: M(0xf4f4f0, { roughness: .5 }), black: M(0x15161a, { roughness: .5 }), iron: M(0x1c1d22, { roughness: .4, metalness: .6 }),
  glass: M(0x1c2b42, { roughness: .08, metalness: .3 }), grass: M(0x4f8a3c), asphalt: M(0x33363b, { roughness: .95 }), pave: M(0xcfc8b6), teak: M(0xa77b4a), water: M(0x2aa7d8, { roughness: .1, metalness: .1 }),
  steel: M(0xcfd5db, { roughness: .3, metalness: .6 }), gold: M(0xd6a928, { roughness: .35, metalness: .7 }), red: M(0xb02a2a), olive: M(0x4a5a2c), trunk: M(0x6b4a2b), leaf: M(0x2f7a3a), hedge: M(0x2c6b30), lawn2: M(0x5a9a45), roof: M(0x2a2d33), flag: M(0xc8302f)
};
const geoBox = new T.BoxGeometry(1, 1, 1), geoCyl = new T.CylinderGeometry(1, 1, 1, 14), geoSph = new T.SphereGeometry(1, 14, 10), geoCone = new T.ConeGeometry(1, 1, 10);
// a box from corner to corner (x0..x1, z0..z1) standing on y0 with height h
function blk(g, mat, x0, z0, x1, z1, y0, h, solid) {
  const m = new T.Mesh(geoBox, mat); m.scale.set(Math.abs(x1 - x0), h, Math.abs(z1 - z0)); m.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2); m.castShadow = true; m.receiveShadow = true; g.add(m);
  if (solid) addBox(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y0 + h);
  return m;
}
function cyl(g, mat, x, z, r, y0, h, seg) { const m = new T.Mesh(geoCyl, mat); m.scale.set(r, h, r); m.position.set(x, y0 + h / 2, z); m.castShadow = true; g.add(m); return m; }
function sph(g, mat, x, y, z, r, sy) { const m = new T.Mesh(geoSph, mat); m.scale.set(r, r * (sy || 1), r); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; }
function palm(g, x, z, hgt) {
  hgt = hgt || rr(5, 8); const t = cyl(g, mats.trunk, x, z, .22, 0, hgt); t.rotation.z = rr(-.08, .08);
  for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283, f = new T.Mesh(geoBox, mats.leaf); f.scale.set(3.2, .08, .7); f.position.set(x + Math.cos(a) * 1.5, hgt + .2, z + Math.sin(a) * 1.5); f.rotation.y = -a; f.rotation.z = -.35; f.castShadow = true; g.add(f); }
}
function tree(g, x, z, s) { s = s || 1; cyl(g, mats.trunk, x, z, .25 * s, 0, 2.2 * s); sph(g, mats.leaf, x, 3.6 * s, z, 1.9 * s, 1.1); sph(g, mats.hedge, x + .6 * s, 4.4 * s, z - .4 * s, 1.3 * s, 1.0); addCircle(x, z, .35 * s); }
// a straight iron fence made of bars; solid = the whole run is a wall for people and cars
function fence(g, x0, z0, x1, z1, h, bar, solid) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / .55)), ang = Math.atan2(z1 - z0, x1 - x0);
  for (let i = 0; i <= n; i++) { const t = i / n, m = new T.Mesh(geoBox, mats.iron); m.scale.set(.05, h, .05); m.position.set(x0 + (x1 - x0) * t, h / 2, z0 + (z1 - z0) * t); g.add(m); }
  for (const yy of [.25, h - .15]) { const m = new T.Mesh(geoBox, mats.iron); m.scale.set(L, .07, .07); m.position.set((x0 + x1) / 2, yy, (z0 + z1) / 2); m.rotation.y = -ang; g.add(m); }
  if (solid) addBox(Math.min(x0, x1) - .15, Math.min(z0, z1) - .15, Math.max(x0, x1) + .15, Math.max(z0, z1) + .15, h);
}

/* ======================================================== 1. the Syndicate's villa ======================================================== */
const VX0 = -189, VX1 = -60, VZ0 = 908, VZ1 = 1064, GATEZ = 986;   // the compound; the gate is in the east wall
export const VILLA = { x: -125, z: 986, quay: { x: COAST - 4.3, z: 986 }, yacht: null };
function buildVilla(scene) {
  const g = new T.Group(); scene.add(g);
  // ground: lawn, the drive, the pool deck
  blk(g, mats.grass, VX0, VZ0, VX1, VZ1, 0, .03);
  blk(g, mats.asphalt, -150, GATEZ - 4, -56, GATEZ + 4, .03, .03); blk(g, mats.asphalt, -118, GATEZ - 12, -100, GATEZ + 12, .03, .03);
  blk(g, mats.pave, -188, 948, -146, 1024, .03, .05);
  // high walls with a fence on top, towers at the corners, a gate gap in the east wall
  const WH = 4.4, T2 = .8, wall = (x0, z0, x1, z1) => { blk(g, mats.stucco, x0, z0, x1, z1, 0, WH, true); blk(g, mats.conc, Math.min(x0, x1) - .12, Math.min(z0, z1) - .12, Math.max(x0, x1) + .12, Math.max(z0, z1) + .12, WH, .25); };
  wall(VX0, VZ0 - T2, VX1 + T2, VZ0); wall(VX0, VZ1, VX1 + T2, VZ1 + T2);
  wall(VX1, VZ0, VX1 + T2, GATEZ - 5); wall(VX1, GATEZ + 5, VX1 + T2, VZ1);
  fence(g, VX0, VZ0 - T2 / 2, VX1, VZ0 - T2 / 2, 1.3, 0, false); fence(g, VX0, VZ1 + T2 / 2, VX1, VZ1 + T2 / 2, 1.3, 0, false);
  for (const z of [VZ0 - T2 / 2, VZ1 + T2 / 2]) { const y0 = WH + .25; for (let x = VX0 + 2; x < VX1; x += 6) { const c = new T.Mesh(geoBox, mats.black); c.scale.set(.5, .3, .6); c.position.set(x, y0 + .15, z); g.add(c); } }   // security cameras along the top
  for (const z of [VZ0 - 1.5, VZ1 + 1.5]) { blk(g, mats.conc, VX1 - 3, z - 2, VX1 + 3.6, z + 2, 0, 7.5, true); blk(g, mats.glass, VX1 - 2.4, z - 1.4, VX1 + 3, z + 1.4, 7.5, 1.6); blk(g, mats.roof, VX1 - 3.4, z - 2.4, VX1 + 4, z + 2.4, 9.1, .3); }   // the corner towers
  // the gate: two pillars, a sliding gate (open), a barrier arm, two guard booths
  for (const dz of [-5, 5]) { blk(g, mats.stone, VX1 - .6, GATEZ + dz - .7, VX1 + 1.4, GATEZ + dz + .7, 0, 5.2, true); cyl(g, mats.gold, VX1 + .4, GATEZ + dz, .35, 5.2, .5); }
  blk(g, mats.iron, VX1 + .2, GATEZ - 5, VX1 + .4, GATEZ - 1.3, 3.8, .3); blk(g, mats.black, VX1 + .2, GATEZ - 5, VX1 + .4, GATEZ - 4.7, 0, 3.8);
  for (const dz of [-8, 8]) { blk(g, mats.conc, VX1 - 8, GATEZ + dz - 1.6, VX1 - 4.4, GATEZ + dz + 1.6, 0, 3, true); blk(g, mats.glass, VX1 - 8.05, GATEZ + dz - 1.2, VX1 - 7.9, GATEZ + dz + 1.2, 1.2, 1.2); blk(g, mats.roof, VX1 - 8.4, GATEZ + dz - 2, VX1 - 4, GATEZ + dz + 2, 3, .25); }
  // the villa: two storeys of white concrete and dark glass, a flat roof that overhangs, a stone wall behind the front door
  const X0 = -152, X1 = -108, Z0 = 952, Z1 = 1020;
  blk(g, mats.white, X0, Z0, X1, Z1, 0, 4.3, true); blk(g, mats.glass, X1 - .05, Z0 + 4, X1 + .15, Z1 - 4, .35, 3.4); blk(g, mats.glass, X0 - .15, Z0 + 4, X0 + .05, Z1 - 4, .35, 3.4);
  blk(g, mats.white, X0 + 4, Z0 + 3, X1 + 6, Z1 - 3, 4.3, 3.8); blk(g, mats.glass, X1 + 6 - .05, Z0 + 7, X1 + 6.15, Z1 - 7, 4.7, 2.8); blk(g, mats.glass, X0 + 3.85, Z0 + 7, X0 + 4.05, Z1 - 7, 4.7, 2.8);
  blk(g, mats.black, X0 - 1.5, Z0 - 1.5, X1 + 8, Z1 + 1.5, 8.2, .35); blk(g, mats.stone, X1 - .2, GATEZ - 3, X1 + 1.6, GATEZ + 3, 0, 4.3);
  for (const dz of [-1, 1]) cyl(g, mats.white, X1 + 4, GATEZ + dz * 9, .3, 0, 4.3);   // two columns carrying the porch roof
  blk(g, mats.black, X1 - .5, GATEZ - 12, X1 + 5, GATEZ + 12, 4.3, .3);
  blk(g, mats.pave, X1 + 0, GATEZ - 12, X1 + 5, GATEZ + 12, .03, .06);
  // the pool, loungers, umbrellas, palms
  blk(g, mats.water, -184, 966, -158, 1006, .0, .1); blk(g, mats.stone, -185, 965, -157, 966, 0, .2); blk(g, mats.stone, -185, 1006, -157, 1007, 0, .2); blk(g, mats.stone, -185, 966, -184, 1006, 0, .2); blk(g, mats.stone, -158, 966, -157, 1006, 0, .2);
  for (let i = 0; i < 6; i++) { const z = 955 + i * 2.2, l = blk(g, mats.white, -156.2, z, -154, z + .9, 0, .35); const bk = blk(g, mats.white, -154.2, z, -153.7, z + .9, .2, .55); bk.rotation.z = .5; }
  for (let i = 0; i < 4; i++) { const z = 1011 + i * 2.2; blk(g, mats.white, -156.2, z, -154, z + .9, 0, .35); }
  for (const z of [958, 1014]) { cyl(g, mats.iron, -150.5, z, .06, 0, 2.6); const u = new T.Mesh(geoCone, mats.red); u.scale.set(2, .5, 2); u.position.set(-150.5, 2.85, z); u.castShadow = true; g.add(u); }
  for (const [x, z] of [[-186, 955], [-186, 1016], [-125, 925], [-125, 1050], [-90, 960], [-90, 1012], [-72, 930], [-72, 1040], [-100, 925], [-100, 1048], [-160, 1040], [-160, 925]]) palm(g, x, z);
  for (let x = -100; x < -62; x += 8) for (const dz of [-6.5, 6.5]) { palm(g, x, GATEZ + dz, 6); }   // palms lining the drive
  // the garage: a long low building in the north-east corner with three doors, a gold sports car parked outside
  blk(g, mats.conc, -108, 916, -70, 934, 0, 4.6, true); for (let i = 0; i < 3; i++) blk(g, mats.black, -104 + i * 11.6, 933.9, -96 + i * 11.6, 934.1, 0, 3.4); blk(g, mats.roof, -109, 915, -69, 935, 4.6, .3);
  // the quay on the shore: a deck and bollards, white lights; the yacht lies alongside
  blk(g, mats.teak, COAST - 3.2, 972, COAST + 1.2, 1000, 0, .15);
  for (let z = 974; z <= 998; z += 6) cyl(g, mats.steel, COAST - 2.6, z, .15, 0, .5);
  mergeStatic(g);
}

/* ======================================================== 2. the presidential residence ======================================================== */
const PX0 = 1240, PX1 = 1400, PZ0 = -500, PZ1 = -360, PGZ = -430, PCX = 1340;
export const RESIDENCE = { x: PCX, z: PGZ };
function buildResidence(scene) {
  const g = new T.Group(); scene.add(g);
  blk(g, mats.lawn2, PX0, PZ0, PX1, PZ1, 0, .03);
  for (let z = PZ0 + 4; z < PZ1 - 4; z += 8) blk(g, mats.grass, PX0 + 2, z, PX1 - 2, z + 4, .03, .01);   // mown stripes
  // the drive from the gate round a fountain to the front steps
  blk(g, mats.asphalt, PX0 - 4, PGZ - 4, 1310, PGZ + 4, .04, .03); blk(g, mats.asphalt, 1284, PGZ - 11, 1314, PGZ + 11, .04, .03);
  cyl(g, mats.lawn2, 1299, PGZ, 9, .05, .04); cyl(g, mats.stone, 1299, PGZ, 4.6, .05, .5); cyl(g, mats.water, 1299, PGZ, 4.1, .5, .05); cyl(g, mats.white, 1299, PGZ, .6, .5, 1.8); sph(g, mats.white, 1299, 2.5, PGZ, .9, 1); addCircle(1299, PGZ, 4.7);
  blk(g, mats.asphalt, 1314, PGZ - 7, 1324, PGZ + 7, .04, .03);
  // iron railings on a stone plinth all round, stone pillars every 8 m, a wide gate opening in the west side
  const FH = 2.7, GZ = 7;
  const run = (x0, z0, x1, z1) => { blk(g, mats.stone, Math.min(x0, x1) - .2, Math.min(z0, z1) - .2, Math.max(x0, x1) + .2, Math.max(z0, z1) + .2, 0, .6); fence(g, x0, z0, x1, z1, FH, 0, true); };
  run(PX0, PZ0, PX1, PZ0); run(PX0, PZ1, PX1, PZ1); run(PX1, PZ0, PX1, PZ1); run(PX0, PZ0, PX0, PGZ - GZ); run(PX0, PGZ + GZ, PX0, PZ1);
  const pil = (x, z) => { blk(g, mats.stone, x - .5, z - .5, x + .5, z + .5, 0, 3.3); blk(g, mats.white, x - .62, z - .62, x + .62, z + .62, 3.3, .22); sph(g, mats.white, x, 3.75, z, .38, 1); };
  for (let x = PX0; x <= PX1; x += 16) { pil(x, PZ0); pil(x, PZ1); } for (let z = PZ0; z <= PZ1; z += 14) pil(PX1, z); pil(PX0, PZ0); pil(PX0, PZ1);
  for (const dz of [-GZ, GZ]) { blk(g, mats.stone, PX0 - 1, PGZ + dz - 1.2, PX0 + 1, PGZ + dz + 1.2, 0, 4.4, true); cyl(g, mats.gold, PX0, PGZ + dz, .5, 4.4, .6); sph(g, mats.gold, PX0, 5.3, PGZ + dz, .45, 1); }
  blk(g, mats.gold, PX0 - .1, PGZ - GZ + 1.2, PX0 + .1, PGZ + GZ - 1.2, 4.0, .35);   // the crest bar over the gate
  for (const dz of [-12, 12]) { blk(g, mats.stone, PX0 + 5, PGZ + dz - 2, PX0 + 9, PGZ + dz + 2, 0, 3, true); blk(g, mats.glass, PX0 + 4.95, PGZ + dz - 1.5, PX0 + 5.05, PGZ + dz + 1.5, 1.2, 1.2); blk(g, mats.roof, PX0 + 4.6, PGZ + dz - 2.4, PX0 + 9.4, PGZ + dz + 2.4, 3, .25); }
  // the mansion: a pillared centre block with a pediment, two long wings, a roof balustrade and a little dome
  const CX0 = 1332, CX1 = 1352, CZ0 = PGZ - 22, CZ1 = PGZ + 22;
  blk(g, mats.white, CX0, CZ0, CX1, CZ1, 0, 11, true); blk(g, mats.stone, CX0 - 1, CZ0 - 1, CX1 + 1, CZ1 + 1, 0, .5);
  for (const [z0, z1] of [[CZ0 - 30, CZ0], [CZ1, CZ1 + 30]]) { blk(g, mats.white, CX0 + 2, z0, CX1 - 2, z1, 0, 8.4, true); blk(g, mats.roof, CX0 + 1.6, z0, CX1 - 1.6, z1, 8.4, .5); for (let i = 0; i < 6; i++) for (const lv of [1.6, 5]) { const z = z0 + 3 + i * ((z1 - z0 - 6) / 5); blk(g, mats.glass, CX0 + 1.9, z - .8, CX0 + 2.1, z + .8, lv, 2.2); } }
  for (let i = 0; i < 8; i++) for (const lv of [1.7, 5.9]) { const z = CZ0 + 3 + i * 5.4; if (Math.abs(z - PGZ) < 4) continue; blk(g, mats.glass, CX0 - .1, z - .8, CX0 + .1, z + .8, lv, 2.6); }
  blk(g, mats.stone, CX0 - 6, PGZ - 20, CX0, PGZ + 20, 0, .8); blk(g, mats.stone, CX0 - 9, PGZ - 8, CX0 - 6, PGZ + 8, 0, .4);   // the steps
  for (let i = 0; i < 6; i++) { const z = PGZ - 15 + i * 6; cyl(g, mats.white, CX0 - 3.5, z, .65, .8, 9.6); blk(g, mats.stone, CX0 - 4.3, z - .9, CX0 - 2.7, z + .9, 10.4, .4); }
  blk(g, mats.white, CX0 - 5, PGZ - 18.5, CX0 + .5, PGZ + 18.5, 10.8, 1.2);
  { const sh = new T.Shape(); sh.moveTo(-19, 0); sh.lineTo(19, 0); sh.lineTo(0, 4.6); sh.closePath(); const pg = new T.Mesh(new T.ExtrudeGeometry(sh, { depth: 5.4, bevelEnabled: false }), mats.white); pg.rotation.y = Math.PI / 2; pg.position.set(CX0 - 5, 12, PGZ); pg.castShadow = true; g.add(pg); }
  blk(g, mats.stone, CX0 - 1, CZ0, CX1 + 1, CZ1, 11, .5);
  for (let z = CZ0; z <= CZ1; z += 1.6) { blk(g, mats.white, CX0 - .9, z - .08, CX0 - .75, z + .08, 11.5, .9); }
  cyl(g, mats.white, 1342, PGZ, 4.6, 11.5, 2.4); sph(g, mats.white, 1342, 13.9, PGZ, 4.4, .75);
  cyl(g, mats.iron, 1342, PGZ, .08, 17.5, 5.5); blk(g, mats.flag, 1342, PGZ - 1.6, 1342.06, PGZ, 21.2, 1.7); blk(g, mats.white, 1342, PGZ, 1342.07, PGZ + 1.6, 21.2, .6);
  // flag poles by the steps, hedges along the drive, flower beds, trees, a helicopter pad
  for (const dz of [-24, 24]) { cyl(g, mats.iron, 1318, PGZ + dz, .08, 0, 9); blk(g, mats.flag, 1318, PGZ + dz - 1.5, 1318.05, PGZ + dz, 7.2, 1.7); blk(g, mats.white, 1318, PGZ + dz, 1318.06, PGZ + dz + 1.5, 7.2, .6); }
  for (const dz of [-9, 9]) for (let x = PX0 + 8; x < 1284; x += 2.4) { sph(g, mats.hedge, x, .6, PGZ + dz, .8, .75); }
  for (const dz of [-30, 30]) blk(g, mats.hedge, 1270, PGZ + dz - 2, 1314, PGZ + dz + 2, 0, 1.2);
  for (const [x, z] of [[1270, -480], [1270, -380], [1310, -490], [1310, -372], [1380, -480], [1380, -380], [1360, -492], [1360, -370], [1255, -480], [1255, -380], [1390, -430], [1370, -455], [1370, -405]]) tree(g, x, z, 1.1);
  cyl(g, mats.concD, 1310, -470, 7, .04, .06); cyl(g, mats.white, 1310, -470, 6, .1, .05); blk(g, mats.concD, 1309, -473, 1309.8, -467, .15, .04); blk(g, mats.concD, 1311.2, -473, 1312, -467, .15, .04); blk(g, mats.concD, 1309.8, -470.4, 1311.2, -469.6, .15, .04);
  mergeStatic(g);
}

/* ======================================================== 3. the army base on the airfield ======================================================== */
// the north side of the airport apron, between the runway and the edge of the world: barracks, HQ, ammo bunkers, a motor pool with tanks and jeeps, helipads with attack helicopters
export const ARMY = { x0: -170, x1: 222, z0: -609, z1: -563 };
function buildArmy(scene) {
  const g = new T.Group(); scene.add(g);
  const { x0, x1, z0, z1 } = ARMY, Y = .07, OL = M(0x4f5a34), OLD = M(0x3a4326), SAND = M(0xb9a77a), HAZ = M(0xe0b020), NET = M(0x5b6b3e, { roughness: 1 });
  const wall = (ax, az, bx, bz) => fence(g, ax, az, bx, bz, 2.6, 0, true);
  // chain-link fence on the runway side with two gates, and the two ends; the north side is the edge of the world
  wall(x0, z1, -125, z1); wall(-115, z1, 145, z1); wall(155, z1, x1, z1); wall(x0, z0, x0, z1); wall(x1, z0, x1, z1);
  for (let x = x0; x <= x1; x += 12) { if (Math.abs(x + 120) < 7 || Math.abs(x - 150) < 7) continue; cyl(g, mats.iron, x, z1, .08, 0, 2.9); }
  for (const gx of [-120, 150]) { for (const dx of [-5, 5]) blk(g, mats.conc, gx + dx - .5, z1 - .5, gx + dx + .5, z1 + .5, 0, 3.2, true); blk(g, HAZ, gx - 5, z1 - .1, gx - 1.2, z1 + .1, 2.9, .25); blk(g, mats.black, gx - 5.4, z1 - .3, gx - 4.6, z1 + .3, 0, 3.1);
    blk(g, mats.conc, gx + 7, z1 - 5, gx + 10.5, z1 - 1.5, 0, 3, true); blk(g, mats.glass, gx + 6.95, z1 - 4.5, gx + 7.05, z1 - 2, 1.2, 1.2); blk(g, mats.roof, gx + 6.6, z1 - 5.4, gx + 10.9, z1 - 1.1, 3, .25); }
  // watch towers at the corners and in the middle of the fence
  for (const [tx, tz] of [[x0 + 4, z1 - 3], [x1 - 4, z1 - 3], [x0 + 4, z0 + 5], [x1 - 4, z0 + 5], [15, z1 - 3]]) { for (const sx of [-1.1, 1.1]) for (const sz of [-1.1, 1.1]) cyl(g, mats.iron, tx + sx, tz + sz, .12, 0, 7.5); blk(g, OL, tx - 1.7, tz - 1.7, tx + 1.7, tz + 1.7, 7.5, 1.7); blk(g, mats.glass, tx - 1.75, tz - 1.2, tx - 1.6, tz + 1.2, 8, .8); blk(g, OLD, tx - 2.1, tz - 2.1, tx + 2.1, tz + 2.1, 9.2, .3); addCircle(tx, tz, 1.8); }
  // barracks: three long huts with a dark roof and a row of windows
  for (const bx of [-158, -122, -86]) { blk(g, OL, bx, -604, bx + 30, -594, Y, 4.2, true); blk(g, OLD, bx - .6, -604.6, bx + 30.6, -593.4, Y + 4.2, .3); for (let i = 0; i < 7; i++) blk(g, mats.glass, bx + 2 + i * 4, -593.95, bx + 3.6 + i * 4, -593.85, Y + 1.5, 1.2); blk(g, mats.black, bx + 13, -594.05, bx + 15.2, -593.9, Y, 2.2); }
  // headquarters with a radar dish and a mast
  blk(g, OL, -52, -606, -22, -586, Y, 7.2, true); blk(g, OLD, -52.6, -606.6, -21.4, -585.4, Y + 7.2, .4); for (let i = 0; i < 6; i++) for (const lv of [1.5, 4.7]) blk(g, mats.glass, -50 + i * 4.8, -586.05, -47.6 + i * 4.8, -585.95, Y + lv, 1.5);
  cyl(g, mats.iron, -30, -596, .15, Y + 7.6, 2); { const dish = sph(g, mats.white, -30, Y + 10.2, -596, 2.2, .35); dish.rotation.x = -.5; }
  cyl(g, mats.iron, -44, -600, .12, Y + 7.6, 12); blk(g, mats.flag, -44, -600.1, -43.95, -598.5, Y + 17.2, 1.4); blk(g, OLD, -44, -598.5, -43.95, -597, Y + 17.2, .6);
  // three ammunition bunkers: concrete walls, a mound of earth on top, a steel door and crates of weapons out in front
  const kinds = [['ammo', 'rifle'], ['rockets', 'grenades'], ['armour', 'ammo']];
  [0, 1, 2].forEach(i => { const bx = 2 + i * 26; blk(g, mats.conc, bx, -606, bx + 18, -592, Y, 3.6, true); const m = sph(g, SAND, bx + 9, Y + 3.2, -599, 11, .28); m.scale.set(11, 3.6, 8.6); blk(g, mats.iron, bx + 6.5, -592.1, bx + 11.5, -591.9, Y, 2.7); blk(g, HAZ, bx + 6.3, -592.2, bx + 6.7, -591.8, Y, 2.7); blk(g, HAZ, bx + 11.3, -592.2, bx + 11.7, -591.8, Y, 2.7);
    kinds[i].forEach((k, j) => { const cx = bx + 3 + j * 8.5, cz = -587.5; blk(g, OL, cx - .75, cz - .5, cx + .75, cz + .5, Y, .9, true); blk(g, mats.black, cx - .78, cz - .52, cx + .78, cz + .52, Y + .9, .08); addCrate(cx, cz, Y + .9, k); }); });
  // two fuel tanks and a pipe
  for (const fx of [88, 104]) { cyl(g, mats.steel, fx, -598, 5, Y, 6); sph(g, mats.steel, fx, Y + 6, -598, 5, .25); addCircle(fx, -598, 5.2); } blk(g, mats.iron, 88, -592, 104, -591.5, Y + .5, .4);
  // helipads with the attack helicopters
  for (const hx of [30, 62]) { cyl(g, mats.concD, hx, -573, 9, Y, .06); cyl(g, mats.white, hx, -573, 7.8, Y + .06, .03); blk(g, mats.concD, hx - 2, -576, hx - 1.2, -570, Y + .1, .03); blk(g, mats.concD, hx + 1.2, -576, hx + 2, -570, Y + .1, .03); blk(g, mats.concD, hx - 1.2, -573.4, hx + 1.2, -572.6, Y + .1, .03); }
  // the motor pool: a paved yard with tanks in a row, jeeps and trucks, camouflage nets
  blk(g, mats.concD, 112, -608, 220, -566, Y, .04);
  for (let i = 0; i < 3; i++) { const nx = 118 + i * 34; blk(g, NET, nx, -607, nx + 28, -598, Y + 3.6, .08); for (const [px, pz] of [[nx + 1, -606.5], [nx + 27, -606.5], [nx + 1, -598.5], [nx + 27, -598.5]]) cyl(g, mats.iron, px, pz, .1, Y, 3.7); }
  for (let x = 108; x <= 220; x += 3.5) { /* sandbag wall along the yard's south edge */ }
  mergeStatic(g);
  // vehicles: tanks and jeeps you can take, and the helicopters
  const park = (type, x, z, h, hex) => { try { const c = newCar(type, hex); c.x = x; c.z = z; c.h = h; c.vx = c.vz = 0; c.g.position.set(x, Y, z); c.g.rotation.set(0, h, 0); return c; } catch (e) { return null; } };
  [128, 160, 192].forEach(x => park('tank', x, -602.5, -Math.PI / 2));
  [120, 128, 136, 144].forEach(x => park('jeep', x, -576, -Math.PI / 2, 0x4a5a2c)); [172, 182, 192, 202].forEach(x => park('army', x, -578, -Math.PI / 2));
  makeAttackHeli(30, -573, Math.PI / 2); makeAttackHeli(62, -573, Math.PI / 2);
}

/* ======================================================== 4. the abandoned missile silo ======================================================== */
export const SILO = { x: 905, z: 1012 };
function trefoil() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#d6b323'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#111'; x.translate(128, 128);
  for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 100, -Math.PI / 6 - Math.PI / 2, Math.PI / 6 - Math.PI / 2); x.closePath(); x.fill(); x.rotate(Math.PI * 2 / 3); }
  x.beginPath(); x.arc(0, 0, 18, 0, 7); x.fill(); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
function buildSilo(scene) {
  const g = new T.Group(); scene.add(g); const { x, z } = SILO, Y = .06;
  const RUST = M(0x7a4a2a, { roughness: 1 }), STEEL = M(0x646b73, { roughness: .5, metalness: .5 }), CRACK = M(0x7d7f80, { roughness: 1 }), HAZ = M(0xe0b020);
  // a cracked concrete pad with a tilted slab and weeds
  blk(g, CRACK, x - 26, z - 26, x + 26, z + 26, 0, Y); blk(g, M(0x6f7173, { roughness: 1 }), x - 8, z - 24, x + 4, z - 10, Y, .05);
  // the silo lid: a steel ring, two heavy doors slid half open, a hazard ring, the black hole between them
  cyl(g, M(0x2a2c30), x, z, 7.4, Y, .35); cyl(g, STEEL, x, z, 6.2, Y + .35, .25); for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283, b = new T.Mesh(geoBox, i % 2 ? HAZ : mats.black); b.scale.set(1.1, .3, .5); b.position.set(x + Math.cos(a) * 6.9, Y + .5, z + Math.sin(a) * 6.9); b.rotation.y = -a; g.add(b); }
  cyl(g, mats.black, x, z, 3.1, Y + .6, .02); blk(g, STEEL, x - 6, z - 6, x - .8, z + 6, Y + .6, .3); blk(g, STEEL, x + 3.8, z - 6, x + 6, z + 6, Y + .6, .3);   // the doors; the middle is open
  addCircle(x, z, 7.3);
  { const m = new T.Mesh(new T.PlaneGeometry(6, 6), new T.MeshStandardMaterial({ map: trefoil(), roughness: .8 })); m.rotation.x = -Math.PI / 2; m.position.set(x + 15, Y + .04, z + 14); g.add(m); }
  // the way in: a concrete stair house at the edge of the pad
  blk(g, mats.conc, x + 9, z + 6, x + 15, z + 12, Y, 3.2, true); blk(g, mats.black, x + 11, z + 11.9, x + 13, z + 12.1, Y, 2.2); blk(g, RUST, x + 8.6, z + 5.6, x + 15.4, z + 12.4, Y + 3.2, .3);
  // a ruined guard hut, a vent stack, rusty barrels, a leaning fence ring with gaps, signs
  blk(g, mats.stucco, x - 24, z + 16, x - 18, z + 21, Y, 2.6, true); blk(g, RUST, x - 24.4, z + 15.6, x - 17.6, z + 21.4, Y + 2.6, .2).rotation.z = .05; blk(g, mats.glass, x - 24.05, z + 17, x - 23.95, z + 19.5, 1.2, 1.1);
  cyl(g, STEEL, x - 12, z - 18, 1.0, Y, 9); cyl(g, RUST, x - 12, z - 18, 1.25, Y + 9, .4); addCircle(x - 12, z - 18, 1.1);
  for (const [bx, bz] of [[x + 18, z - 8], [x + 19.2, z - 7.4], [x + 17.6, z - 6.8], [x - 16, z + 10]]) { cyl(g, RUST, bx, bz, .45, Y, 1); addCircle(bx, bz, .5); }
  for (let a = 0; a < 6.28; a += .16) { if ((a > .6 && a < 1.0) || (a > 3.4 && a < 3.9) || (a > 5.0 && a < 5.3)) continue; const fx = x + Math.cos(a) * 31, fz = z + Math.sin(a) * 31, h = 2 + (Math.sin(a * 9) > .6 ? -1.2 : 0); const m = new T.Mesh(geoBox, RUST); m.scale.set(.1, h, .1); m.position.set(fx, h / 2, fz); m.rotation.z = Math.sin(a * 5) * .12; g.add(m); if ((a * 100 | 0) % 2 === 0) { const wire = new T.Mesh(geoBox, mats.iron); wire.scale.set(5, .05, .05); wire.position.set(fx, h * .8, fz); wire.rotation.y = -a - 1.57; g.add(wire); } }
  { const sc = document.createElement('canvas'); sc.width = 512; sc.height = 256; const q = sc.getContext('2d'); q.fillStyle = '#c92b2b'; q.fillRect(0, 0, 512, 256); q.fillStyle = '#fff'; q.font = 'bold 76px Arial'; q.textAlign = 'center'; q.fillText('DANGER', 256, 110); q.font = 'bold 40px Arial'; q.fillText('RESTRICTED AREA', 256, 170); q.fillText('KEEP OUT', 256, 220);
    const t = new T.CanvasTexture(sc); t.colorSpace = T.SRGBColorSpace; for (const [px, pz, ry] of [[x + 31.4, z + 1, -Math.PI / 2], [x - 5, z + 31.4, 0]]) { cyl(g, RUST, px, pz, .06, 0, 2.4); const m = new T.Mesh(new T.PlaneGeometry(2, 1), new T.MeshBasicMaterial({ map: t })); m.position.set(px, 2.3, pz - .1 * Math.cos(ry)); m.rotation.y = ry + Math.PI; g.add(m); } }
  for (const [tx, tz] of [[x - 38, z + 10], [x + 40, z - 22], [x + 36, z + 30]]) { cyl(g, mats.trunk, tx, tz, .18, 0, 2.4); const br = new T.Mesh(geoBox, mats.trunk); br.scale.set(1.6, .1, .1); br.position.set(tx + .6, 2.0, tz); br.rotation.z = .5; g.add(br); }   // dead trees
  mergeStatic(g);
  addMarker({ x: x + 12, z: z + 14.5, type: 'silo', icon: '☢', text: 'THE SILO', color: 0x8a7a3a, onEnter: m => G.enterRoom('silo', { x: m.x, z: m.z + 2.6 }) });
}
/* ======================================================== dogs ======================================================== */
const dogs = [];
const dogMat = M(0x2a2018, { roughness: .9 }), dogMat2 = M(0x6b5a44, { roughness: .9 });
function makeDog(x, z, area) {
  const gp = new T.Group(), col = rnd() < .5 ? dogMat : dogMat2;
  const body = new T.Mesh(geoBox, col); body.scale.set(.95, .38, .36); body.position.set(0, .62, 0); gp.add(body);
  const chest = new T.Mesh(geoBox, col); chest.scale.set(.4, .46, .4); chest.position.set(.38, .66, 0); gp.add(chest);
  const head = new T.Mesh(geoBox, col); head.scale.set(.3, .26, .26); head.position.set(.7, .86, 0); gp.add(head);
  const snout = new T.Mesh(geoBox, dogMat); snout.scale.set(.22, .13, .15); snout.position.set(.9, .8, 0); gp.add(snout);
  for (const s of [-1, 1]) { const ear = new T.Mesh(geoBox, dogMat); ear.scale.set(.08, .16, .07); ear.position.set(.64, 1.03, s * .1); gp.add(ear); }
  const tail = new T.Mesh(geoBox, col); tail.scale.set(.4, .07, .07); tail.position.set(-.62, .78, 0); tail.rotation.z = .5; gp.add(tail);
  const legs = []; for (const [lx, lz] of [[.36, .14], [.36, -.14], [-.36, .14], [-.36, -.14]]) { const pv = new T.Group(); pv.position.set(lx, .48, lz); const l = new T.Mesh(geoBox, col); l.scale.set(.09, .5, .09); l.position.y = -.25; pv.add(l); gp.add(pv); legs.push(pv); }
  gp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  G.scene.add(gp);
  const d = { g: gp, legs, tail, x, z, hx: x, hz: z, area, yaw: rnd() * 6.28, hp: 30, state: 'patrol', tx: x, tz: z, wt: 0, bite: 0, ph: rnd() * 6, dead: 0, y: 0 };
  d.tgt = { get x() { return d.x; }, get z() { return d.z; }, get y() { return d.y; }, top: 1.1, r: .55, car: false, person: true, alive: () => d.state !== 'dead',
    hit: (dmg, dx, dz) => { if (d.state === 'dead') return; d.hp -= dmg; if (G.blood) G.blood(d.x, .7, d.z, 3, (dx || 0) * 4, (dz || 0) * 4); d.state = d.state === 'patrol' ? 'chase' : d.state; if (d.hp <= 0) { d.state = 'dead'; d.dead = 0; d.g.rotation.z = Math.PI / 2; d.g.position.y = .28; if (G.stat) G.stat('kills'); } } };
  G.targets.push(d.tgt); dogs.push(d); return d;
}
export function updateDogs(dt) {
  const pl = G.player, px = pl.x, pz = pl.z; const cp = { x: 0, z: 0 };
  for (const d of dogs) {
    const dx = px - d.x, dz = pz - d.z, dist = Math.hypot(dx, dz);
    if (dist > 160) { d.g.visible = false; if (d.state === 'dead') { d.dead += dt; if (d.dead > 5) { d.state = 'patrol'; d.hp = 30; d.x = d.hx; d.z = d.hz; d.g.rotation.z = 0; } } continue; }
    d.g.visible = true;
    if (d.state === 'dead') { d.dead += dt; if (d.dead > 90) { d.state = 'patrol'; d.hp = 30; d.x = d.hx; d.z = d.hz; d.g.rotation.z = 0; } d.g.position.set(d.x, .28, d.z); continue; }
    let sp = 0, aim = null;
    const seen = !pl.swim && pl.health > 0 && !G.inside && dist < 24 && (dist < 8 || clearLine(d.x, d.z, px, pz));
    if (d.state === 'patrol' && seen) { d.state = 'chase'; if (G.sfx && G.sfx.bark) G.sfx.bark(); }
    if (d.state === 'chase') {
      if (!seen && dist > 34) { d.state = 'patrol'; d.tx = d.hx; d.tz = d.hz; }
      else { aim = { x: px, z: pz }; sp = dist > 1.2 ? 7.2 : 0; d.bite -= dt;
        if (dist < 1.5 && d.bite <= 0 && pl.health > 0) { d.bite = .85; G.hurt(7); if (G.shake) G.shake(.12); } }
    } else {
      d.wt -= dt; if (d.wt <= 0) { d.wt = rr(2, 6); d.tx = d.area[0] + rnd() * (d.area[1] - d.area[0]); d.tz = d.area[2] + rnd() * (d.area[3] - d.area[2]); }
      aim = { x: d.tx, z: d.tz }; sp = Math.hypot(d.tx - d.x, d.tz - d.z) > .8 ? 1.7 : 0;
    }
    if (aim && sp > 0) {
      const ax = aim.x - d.x, az = aim.z - d.z, al = Math.hypot(ax, az) || 1; d.yaw += ((a => { while (a > Math.PI) a -= 6.283; while (a < -Math.PI) a += 6.283; return a; })(Math.atan2(-az, ax) - d.yaw)) * Math.min(1, dt * 9);
      cp.x = d.x + Math.cos(d.yaw) * sp * dt; cp.z = d.z - Math.sin(d.yaw) * sp * dt; if (!solidAt(cp.x, cp.z, .4)) { d.x = cp.x; d.z = cp.z; } else if (d.state === 'patrol') d.wt = 0;
    } else if (aim) d.yaw += ((a => { while (a > Math.PI) a -= 6.283; while (a < -Math.PI) a += 6.283; return a; })(Math.atan2(-(aim.z - d.z), aim.x - d.x) - d.yaw)) * Math.min(1, dt * 9);
    d.ph += dt * (sp > 3 ? 16 : sp > 0 ? 8 : 0);
    const sw = sp > 0 ? Math.sin(d.ph) * (sp > 3 ? .8 : .45) : 0; d.legs[0].rotation.z = sw; d.legs[1].rotation.z = -sw; d.legs[2].rotation.z = -sw; d.legs[3].rotation.z = sw; d.tail.rotation.y = Math.sin(d.ph * .7) * .5;
    d.y = Math.max(0, landHeight(d.x, d.z)); d.g.position.set(d.x, d.y + (sp > 3 ? Math.abs(Math.sin(d.ph)) * .1 : 0), d.z); d.g.rotation.y = d.yaw;
  }
}
/* ======================================================== setup ======================================================== */
export function setupEstates(scene) {
  buildVilla(scene); buildResidence(scene); buildArmy(scene); buildSilo(scene);
  VILLA.yacht = makeYacht(VILLA.quay.x, VILLA.quay.z, -Math.PI / 2);
}
let dogsMade = false;
export function updateEstates(dt) { if (!dogsMade) { dogsMade = true; for (let i = 0; i < 6; i++) makeDog(1255 + rnd() * 135, -495 + rnd() * 130, [1250, 1395, -495, -365]); for (let i = 0; i < 3; i++) makeDog(-150 + rnd() * 80, 925 + rnd() * 120, [-165, -66, 915, 1058]); }
  updateDogs(dt); }
export function _unused(dt) { updateDogs(dt); }
export { makeDog };
