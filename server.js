// Papillon server: serves the game files + a websocket room at /ws
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');

const ROOT = process.env.ROOT || __dirname;
const PORT = process.env.PORT || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.css': 'text/css', '.ico': 'image/x-icon' };
const gz = new Map();   // path -> gzipped buffer cache

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';
  if (url === '/health') { res.writeHead(200); return res.end('ok ' + wss.clients.size); }
  const file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT) || (!process.env.ROOT && /server\.js$|package(-lock)?\.json$|node_modules/.test(file))) { res.writeHead(403); return res.end('no'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(file).toLowerCase();
    const h = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
    const text = ext === '.js' || ext === '.html' || ext === '.json';
    if (text && /gzip/.test(req.headers['accept-encoding'] || '')) {
      const key = file + st.mtimeMs;
      let buf = gz.get(key);
      if (!buf) { buf = zlib.gzipSync(fs.readFileSync(file)); gz.set(key, buf); }
      h['Content-Encoding'] = 'gzip'; h['Content-Length'] = buf.length;
      res.writeHead(200, h); return res.end(buf);
    }
    h['Content-Length'] = st.size;
    res.writeHead(200, h); fs.createReadStream(file).pipe(res);
  });
});

// ---- multiplayer room (one global room) ----
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
let nextId = 1;
const players = new Map();   // id -> { ws, name, look, last }

function send(ws, o) { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }
function toAll(o, except) { const s = JSON.stringify(o); for (const [id, p] of players) if (id !== except && p.ws.readyState === 1) p.ws.send(s); }
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

wss.on('connection', ws => {
  const id = nextId++;
  const me = { ws, name: 'Player' + id, look: {}, st: null, alive: true };
  players.set(id, me);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  send(ws, { t: 'hello', id, others: [...players].filter(([i]) => i !== id).map(([i, p]) => ({ id: i, name: p.name, look: p.look, st: p.st })) });

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'ping') { send(ws, { t: 'pong', n: m.n }); return; }
    if (m.t === 'join') {
      me.name = String(m.name || me.name).slice(0, 16).replace(/[<>]/g, '');
      me.look = m.look && typeof m.look === 'object' ? m.look : {};
      toAll({ t: 'join', id, name: me.name, look: me.look }, id);
    } else if (m.t === 's') {              // state, relayed as is
      m.id = id; me.st = m; toAll(m, id);
    } else if (m.t === 'shot') {           // tracer / gunfire
      toAll({ t: 'shot', id, a: m.a, b: m.b, w: m.w }, id);
    } else if (m.t === 'hit') {            // damage to another player
      const to = players.get(m.to);
      if (to) send(to.ws, { t: 'hit', from: id, d: Math.min(100, Math.max(0, num(m.d, 0))), dx: num(m.dx, 0), dz: num(m.dz, 0), w: m.w });
    } else if (m.t === 'kill') {           // I died; m.by = who hit me last (0 = nobody)
      const k = players.get(m.by);
      toAll({ t: 'kill', id, name: me.name, by: k ? m.by : 0, byName: k ? k.name : '', w: m.w });
    } else if (m.t === 'chat') {
      toAll({ t: 'chat', id, name: me.name, msg: String(m.msg || '').slice(0, 120).replace(/[<>]/g, '') });
    }
  });
  ws.on('close', () => { players.delete(id); toAll({ t: 'bye', id }); });
  ws.on('error', () => {});
});

setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 20000);

server.listen(PORT, () => console.log('Papillon on :' + PORT));
