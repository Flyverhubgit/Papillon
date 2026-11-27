// Papillon - jobs. Walk into a yellow JOB marker, pick a job, do it before the clock runs out, get paid.
import { G, rr, pick, doors, JAIL } from './world.js';
import { addMarker, markers, saveGame } from './shops.js';
import { newCar, makeNPC } from './actors.js';
import { GANGS } from './gangs.js';

const YEL = 0xf2c21a, GRN = 0x35c46a;
const SPOTS = [[150, 130], [-100, -130], [220, 390], [-100, 260], [80, -325], [220, -390], [-20, 195], [150, -260], [-20, 325], [220, 0],
  [650, 0], [650, -640], [1000, -640], [1000, 0], [1000, 390], [650, 390], [830, 260], [570, 640], [1430, 640], [1430, -890], [1430, 0], [1090, 130], [830, -260], [1000, -260], [650, -890], [1000, 890], [150, 640], [-20, 640], [480, 195]];   // crossroads used as drop-offs and checkpoints
const GIVERS = [/* the job point by the harbour (70, -20) was taken out */ { x: -92, z: 203, vx: -84, vz: 197.2, vh: 0 }, { x: -12, z: -203, vx: -4, vz: -192.8, vh: 0 },
  ...[[650, 0], [1000, 130], [830, 390], [1000, -640], [1430, -890], [1430, 640]].map(([X, Z]) => ({ x: X - 8.4, z: Z - 20, vx: X + 2.2, vz: Z - 30, vh: -Math.PI / 2 }))];   // one job giver in each part of the big city, and in two towns
let jobEl = null, M = null;   // M = the running job
const fmt = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const here = () => { const p = G.player; return p.car ? p.car : p.ride ? p.ride : p; };
const far = (x, z, min, max) => { const o = SPOTS.filter(s => { const q = Math.hypot(s[0] - x, s[1] - z); return q > min && q < (max || 1e9); }); return pick(o.length ? o : SPOTS); };
function dropMarker(m) { if (!m) return; G.scene.remove(m.mesh, m.sprite); const i = markers.indexOf(m); if (i >= 0) markers.splice(i, 1); }
function goal(x, z, text) { return addMarker({ x, z, car: true, type: 'goal', icon: '!', text, color: GRN, onEnter: () => { } }); }

function end(win, why) {
  if (!M) return; const m = M; M = null; (m.marks || []).forEach(dropMarker); if (jobEl) jobEl.style.display = 'none';
  if (win) { G.inv.done = G.inv.done || {}; G.inv.done[m.name] = (G.inv.done[m.name] || 0) + 1; G.money += m.pay; G.onMoney(m.pay); if (m.story !== undefined) { G.inv.story = m.story + 1; if (G.banner) G.banner('MISSION PASSED', '#f2c21a'); G.say('Mission passed: ' + m.name + '  +$' + m.pay + (STORY[m.story + 1] ? '.  Marcel has more work for you.' : '.  That was the last of Marcel\'s jobs.'), 7); } else G.say('Job done: ' + m.name + '  +$' + m.pay, 5); saveGame(); if (G.sfx) G.sfx.cash(); }
  else G.say((m.story !== undefined ? 'Mission failed: ' : 'Job failed: ') + (why || 'out of time') + (m.story !== undefined ? '. Go back to Marcel to try again.' : ''), 5);
}
G.failMission = why => end(false, why);

const JOBS = [
  { name: 'Delivery run', pay: 450, note: 'drive the van to the drop-off', start(g) {
    const van = newCar('van'); van.x = g.vx; van.z = g.vz; van.h = g.vh; van.g.position.set(van.x, 0, van.z); van.g.rotation.y = van.h; van.used = true;
    const d = far(g.x, g.z, 220, 560), mk = goal(d[0], d[1], 'DROP OFF');
    return { t: 90 + Math.hypot(d[0] - g.x, d[1] - g.z) / 5, marks: [mk], van, text: () => (G.player.car === van ? 'Drive to the drop-off' : 'Get in the van'), tick() { if (van.dead) return 'the van is wrecked'; if (G.player.car === van && Math.hypot(van.x - d[0], van.z - d[1]) < 7 && van.v < 8) return true; } };
  } },
  { name: 'Cross-town express', pay: 1400, note: 'drive the van right across the map, fast', start(g) {
    const van = newCar('van'); van.x = g.vx; van.z = g.vz; van.h = g.vh; van.g.position.set(van.x, 0, van.z); van.g.rotation.y = van.h; van.used = true;
    const d = far(g.x, g.z, 1000), L = Math.hypot(d[0] - g.x, d[1] - g.z), mk = goal(d[0], d[1], 'DROP OFF');
    return { t: 70 + L / 9, marks: [mk], van, text: () => (G.player.car === van ? 'Drive to the drop-off (see the big map, M)' : 'Get in the van'), tick() { if (van.dead) return 'the van is wrecked'; if (G.player.car === van && Math.hypot(van.x - d[0], van.z - d[1]) < 7 && van.v < 8) return true; } };
  } },
  { name: 'Checkpoint dash', pay: 500, note: 'six checkpoints, any vehicle', start(g) {
    const pts = []; let x = g.x, z = g.z; for (let i = 0; i < 6; i++) { let s; do { s = pick(SPOTS); } while (Math.hypot(s[0] - x, s[1] - z) < 120 || Math.hypot(s[0] - x, s[1] - z) > 330); pts.push(s); x = s[0]; z = s[1]; }
    const job = { t: 190, marks: [goal(pts[0][0], pts[0][1], 'CHECKPOINT 1')], i: 0, text: () => 'Checkpoint ' + (job.i + 1) + ' of 6', tick() {
      const h = here(), c = pts[job.i]; if (Math.hypot(h.x - c[0], h.z - c[1]) < 9) { dropMarker(job.marks.pop()); job.i++; if (G.sfx) G.sfx.cash(); if (job.i >= 6) return true; job.marks.push(goal(pts[job.i][0], pts[job.i][1], 'CHECKPOINT ' + (job.i + 1))); }
    } };
    return job;
  } },
  { name: 'Hot wheels', pay: 650, note: 'steal a sports car and bring it to the docks', start() {
    const d = [-60, 325], mk = goal(d[0], d[1], 'BUYER');
    return { t: 240, marks: [mk], text: () => (G.player.car && G.player.car.type === 'sports' ? 'Bring it to the buyer in the docks' : 'Find and steal a sports car'), tick() { const c = G.player.car; if (c && c.type === 'sports' && Math.hypot(c.x - d[0], c.z - d[1]) < 7 && c.v < 8) { if (c.hp < 45) return 'the car is too damaged'; return true; } } };
  } },
  { name: 'Send a message', pay: 800, note: 'take down three gang members', start() {
    const g = pick(GANGS), mine = G.gang.filter(m => m.g === g), was = new Set(mine.filter(m => m.state === 'down')), mk = goal(g.cx, g.cz, g.name.toUpperCase());
    const job = { t: 300, marks: [mk], n: 0, text: () => g.name + ': ' + job.n + ' of 3 down', tick() { job.n = mine.filter(m => m.state === 'down' && !was.has(m)).length; if (job.n >= 3 || job.n >= mine.length - was.size) return true; } };
    return job;
  } },
  { name: 'Island post', pay: 900, note: 'land the helicopter or plane on the lighthouse island', start() {
    const d = [-330, 330], mk = goal(d[0], d[1] - 20, 'LAND HERE');
    return { t: 360, marks: [mk], text: () => (G.player.ride && G.player.ride.heli ? 'Land on the lighthouse island' : 'Get the helicopter (harbour) or the plane (airport)'), tick() { const r = G.player.ride; if (r && r.heli && !r.air && r.v < 3 && Math.hypot(r.x - d[0], r.z - d[1]) < 55 && r.y > .5) return true; } };
  } }
];

// ----- the story: Marcel's jobs, one after the other. Each one opens the next. -----
const SHOW_MARCEL = false;   // Marcel and his story missions were taken out of the game; set this to true to bring him back
const MARCEL = { x: 64, z: -20, vx: 82.2, vz: -30, vh: -Math.PI / 2 };
const van0 = g => { const van = newCar('van'); van.x = g.vx; van.z = g.vz; van.h = g.vh; van.g.position.set(van.x, 0, van.z); van.g.rotation.y = van.h; van.used = true; return van; };
const STORY = [
  { name: 'The errand', pay: 400, brief: '"New in town? Prove you can drive. Take my van to the warehouse in the docks. Do not scratch it."', start(g) {
    const van = van0(g), d = [-60, 325], mk = goal(d[0], d[1], 'WAREHOUSE');
    return { t: 200, marks: [mk], text: () => (G.player.car === van ? 'Drive the van to the warehouse in the docks' : 'Get in Marcel\'s van'), tick() { if (van.dead) return 'the van is wrecked'; if (G.player.car === van && Math.hypot(van.x - d[0], van.z - d[1]) < 7 && van.v < 8) return van.hp < 60 ? 'you wrecked half the van' : true; } };
  } },
  { name: 'Collection day', pay: 600, brief: '"Three shops owe me this week. Go round and collect. Be quick, they close early."', start(g) {
    const pts = [[150, 130], [-20, 195], [-100, -130]], job = { t: 240, marks: [goal(pts[0][0], pts[0][1], 'COLLECT 1')], i: 0, text: () => 'Collect the money: shop ' + (job.i + 1) + ' of 3', tick() {
      const h = here(), c = pts[job.i]; if (Math.hypot(h.x - c[0], h.z - c[1]) < 9 && (h.v || 0) < 6) { dropMarker(job.marks.pop()); job.i++; if (G.sfx) G.sfx.cash(); if (job.i >= 3) return true; job.marks.push(goal(pts[job.i][0], pts[job.i][1], 'COLLECT ' + (job.i + 1))); } } };
    return job;
  } },
  { name: 'Hot property', pay: 900, brief: '"A buyer in the docks wants a sports car. Any sports car. He is not fussy about where it comes from, only about dents."', start() {
    const d = [-60, 325], mk = goal(d[0], d[1], 'BUYER');
    return { t: 300, marks: [mk], text: () => (G.player.car && G.player.car.type === 'sports' ? 'Bring it to the buyer in the docks' : 'Find and steal a sports car'), tick() { const c = G.player.car; if (c && c.type === 'sports' && Math.hypot(c.x - d[0], c.z - d[1]) < 7 && c.v < 8) return c.hp < 50 ? 'the car is too damaged' : true; } };
  } },
  { name: 'Wolf hunt', pay: 1500, brief: '"The Iron Wolves have taken the old army base up the hill. Go there and put four of them on the ground. Bring a good gun, they all have one."', start() {
    const g = GANGS[0], mine = G.gang.filter(m => m.g === g), was = new Set(mine.filter(m => m.state === 'down')), mk = goal(g.cx, g.cz, 'THE IRON WOLVES');
    const job = { t: 360, marks: [mk], n: 0, text: () => 'The Iron Wolves: ' + job.n + ' of 4 down', tick() { job.n = mine.filter(m => m.state === 'down' && !was.has(m)).length; if (job.n >= 4 || job.n >= mine.length - was.size) return true; } };
    return job;
  } },
  { name: 'Visiting hours', pay: 2200, brief: '"My cousin left a parcel hidden in the prison yard. Get out to Prison Island, walk into the yard and bring it back. The guards will not like it."', start() {
    const mk = goal(JAIL.x - 6, JAIL.z + 2, 'THE PARCEL'), job = { t: 600, marks: [mk], got: false, text: () => (job.got ? 'Bring the parcel back to the city' : 'Get into the prison yard on Prison Island'), tick() {
      const p = G.player; if (!job.got && !p.ride && Math.hypot(p.x - (JAIL.x - 6), p.z - (JAIL.z + 2)) < 5) { job.got = true; dropMarker(job.marks.pop()); job.marks.push(goal(-100, 195, 'MARCEL\'S MAN')); if (G.sfx) G.sfx.cash(); G.say('You have the parcel. Now get back to the docks alive.', 5); }
      if (job.got) { const h = here(); if (Math.hypot(h.x + 100, h.z - 195) < 9) return true; } } };
    return job;
  } },
  { name: 'The big one', pay: 6000, brief: '"The Savings Bank. Walk in, tell the teller, empty the vault, and then lose every policeman in Papillon. Do that and you never work for small change again."', start() {
    const t0 = G.time, bank = markers.find(m => m.type === 'bank'), mk = goal(bank.x, bank.z, 'THE BANK'), job = { t: 900, marks: [mk], done: false, text: () => (job.done ? (G.stars > 0 ? 'Lose the police: ' + G.stars + ' stars to go' : 'Clear!') : 'Rob the Savings Bank (press E at the teller)'), tick() {
      if (!job.done && G.lastHeist > t0) { job.done = true; dropMarker(job.marks.pop()); } if (job.done && G.stars === 0 && !G.inside) return true; } };
    return job;
  } }
];
function storyMenu() {
  if (M) { G.menu('Marcel', M.story !== undefined ? '"You are still on my job. Finish it."' : '"Finish what you are doing first."', M.story !== undefined ? [{ label: 'Give up this mission', fn: () => { end(false, 'you gave up'); return true; } }, { label: 'Keep going', fn: () => true }] : [{ label: 'Leave', fn: () => true }]); return; }
  const i = G.inv.story || 0, s = STORY[i];
  if (!s) { G.menu('Marcel', '"You did everything I asked. The city is yours now. Go and enjoy it."', [{ label: 'Leave', fn: () => true }]); return; }
  G.menu('Marcel  -  mission ' + (i + 1) + ' of ' + STORY.length + ': ' + s.name, s.brief, [{ label: 'Take the job  $' + s.pay, fn: () => { M = Object.assign(s.start(MARCEL), { name: s.name, pay: s.pay, story: i }); G.say(s.name + ' started', 4); return true; } }, { label: 'Not now', fn: () => true }]);
}

// Working as a taxi driver: press T while driving a taxi. Pick up the fare, bring them where they want to go, repeat.
export function startTaxiShift() {
  if (M) { G.say('Finish your current job first', 2); return; }
  const cab = G.player.car, spots = doors.filter(d => d.ok), road = d => [d.x - d.nx * 9.2, d.z - d.nz * 9.2];
  const next = (x, z, lo, hi) => { const o = spots.filter(d => { const q = Math.hypot(d.x - x, d.z - z); return q > lo && q < hi; }); return road(pick(o.length ? o : spots)); };
  const job = { name: 'Taxi shift', pay: 0, t: 90, marks: [], phase: 'pick', n: 0, earned: 0, text: () => (job.phase === 'pick' ? 'Pick up your fare' : 'Take them to the drop-off') + '   earned $' + job.earned, tick() {
    if (G.player.car !== cab || cab.dead) return { msg: 'Shift over. ' + job.n + ' fares, $' + job.earned + ' earned.' };
    if (Math.hypot(cab.x - job.at[0], cab.z - job.at[1]) < 6 && cab.v < 4) {
      dropMarker(job.marks.pop()); if (G.sfx) G.sfx.door();
      if (job.phase === 'pick') { const d = next(cab.x, cab.z, 140, 420); job.dist = Math.hypot(d[0] - cab.x, d[1] - cab.z); job.at = d; job.phase = 'drop'; job.t = 40 + job.dist / 5; job.marks.push(goal(d[0], d[1], 'DROP OFF')); }
      else { const fare = Math.round(30 + job.dist * .35 + Math.max(0, job.t) * 1.2); G.money += fare; G.onMoney(fare); job.earned += fare; job.n++; saveGame(); const d = next(cab.x, cab.z, 60, 200); job.at = d; job.phase = 'pick'; job.t = 75; job.marks.push(goal(d[0], d[1], 'FARE')); }
    }
  } };
  job.at = next(cab.x, cab.z, 60, 200); job.marks.push(goal(job.at[0], job.at[1], 'FARE')); M = job; G.say('Taxi shift started. Pick up the fare at the green ring. Get out of the taxi to stop.', 6);
}
// Paramedic shift: in an ambulance, fetch the patient and get them to the nearest hospital before the clock runs out
export function startParamedic() {
  if (M) { G.say('Finish your current job first', 2); return; }
  const amb = G.player.car, spots = doors.filter(d => d.ok), road = d => [d.x - d.nx * 9.2, d.z - d.nz * 9.2], hosp = markers.filter(m => m.type === 'clinic');
  const next = (x, z, lo, hi) => { const o = spots.filter(d => { const q = Math.hypot(d.x - x, d.z - z); return q > lo && q < hi; }); return road(pick(o.length ? o : spots)); };
  const job = { name: 'Paramedic shift', pay: 0, t: 80, marks: [], phase: 'pick', n: 0, earned: 0, text: () => (job.phase === 'pick' ? 'Get to the patient' : 'Rush them to the hospital') + '   saved ' + job.n + ', earned $' + job.earned, tick() {
    if (G.player.car !== amb || amb.dead) return { msg: 'Shift over. ' + job.n + ' patients saved, $' + job.earned + ' earned.' };
    if (Math.hypot(amb.x - job.at[0], amb.z - job.at[1]) < (job.phase === 'pick' ? 6 : 13) && amb.v < 4) {
      dropMarker(job.marks.pop()); if (G.sfx) G.sfx.door();
      if (job.phase === 'pick') { let h = hosp[0], bd = 1e9; for (const m of hosp) { const q = Math.hypot(m.x - amb.x, m.z - amb.z); if (q < bd) { bd = q; h = m; } } job.dist = bd; job.at = [h.x, h.z]; job.phase = 'drop'; job.t = 40 + bd / 6; job.marks.push(goal(h.x, h.z, 'HOSPITAL')); }
      else { const fee = Math.round(120 + job.dist * .3 + Math.max(0, job.t) * 2 + job.n * 25); G.money += fee; G.onMoney(fee); job.earned += fee; job.n++; saveGame(); const d = next(amb.x, amb.z, 80, 320); job.at = d; job.phase = 'pick'; job.t = 70; job.marks.push(goal(d[0], d[1], 'PATIENT')); }
    }
  } };
  job.at = next(amb.x, amb.z, 80, 320); job.marks.push(goal(job.at[0], job.at[1], 'PATIENT')); M = job; G.say('Paramedic shift started. Fetch the patient at the green ring. Get out of the ambulance to stop.', 6);
}
function menu(g) {
  if (M) { G.menu('Jobs', 'You are on a job: ' + M.name, [{ label: 'Quit this job', fn: () => { end(false, 'you quit'); return true; } }]); return; }
  G.menu('Jobs', 'Pick one. The clock starts right away.', JOBS.filter(j => G.gang.length || !/gang/i.test(j.note || '')).map(j => ({ label: j.name + '  $' + j.pay, note: j.note, fn: () => { M = Object.assign(j.start(g), { name: j.name, pay: j.pay }); G.say(j.name + ': ' + j.note, 5); return true; } })));
}
// what the map's mission panel shows: the running job, the job points you can walk to, and what you have finished
export function missionInfo() {
  return { active: M ? { name: M.name, pay: M.pay, text: M.text ? M.text() : '', t: M.t, marks: (M.marks || []).map(k => ({ x: k.x, z: k.z, text: k.text })) } : null,
    givers: GIVERS.map(g => ({ x: g.x, z: g.z })), jobs: JOBS.map(j => ({ name: j.name, pay: j.pay, note: j.note })), done: G.inv.done || {} };
}
export function setupMissions() {
  jobEl = document.getElementById('job');
  for (const g of GIVERS) addMarker({ x: g.x, z: g.z, type: 'job', icon: 'J', text: 'JOB', color: YEL, onEnter: () => menu(g) });
  // Marcel, who hands out the story missions, stands on the corner in the old town
  if (SHOW_MARCEL) { const n = makeNPC('pm', { head: 'Suit_Head', body: 'Suit_Body', legs: 'Suit_Legs', feet: 'Suit_Feet', skin: 0xc68642, hair: 0x8a8a8a, top: 0x5a1f1f, bottom: 0x1c1c22 }, MARCEL.x, MARCEL.z, Math.PI / 2); n.h.position.y = .12; n.far = true;
    addMarker({ x: MARCEL.x + .9, z: MARCEL.z, type: 'story', icon: '★', text: 'MARCEL', color: 0xb3261e, onEnter: storyMenu }); }
}
export function updateMissions(dt) {
  if (!M) return;
  M.t -= dt; const r = M.tick();
  if (r === true) return end(true); if (typeof r === 'string') return end(false, r);
  if (r && r.msg) { const m = M; M = null; (m.marks || []).forEach(dropMarker); if (jobEl) jobEl.style.display = 'none'; G.say(r.msg, 5); return; }
  if (M.t <= 0) return M.earned !== undefined ? end(false, 'too slow. You earned $' + M.earned) : end(false);
  if (jobEl) { jobEl.style.display = 'block'; jobEl.textContent = M.text() + '   ' + fmt(M.t); }
}
