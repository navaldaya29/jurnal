// Server sinkronisasi Jurnal — tanpa dependensi (Node >= 18)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const ALLOWED_KEYS = new Set(['trades', 'config', 'compound_interest_v1', 'broker_balance_v1']);
const MAX_BODY = 5 * 1024 * 1024;

if (!APP_PASSWORD) { console.error('APP_PASSWORD belum di-set. Isi dulu di environment variable.'); process.exit(1); }
fs.mkdirSync(DATA_DIR, { recursive: true });

let db = {};
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { db = {}; }

function persist() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}
// Backup harian (simpan 14 terakhir)
function dailyBackup() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const f = path.join(DATA_DIR, 'backup-' + new Date().toISOString().slice(0, 10) + '.json');
    if (!fs.existsSync(f)) fs.copyFileSync(DATA_FILE, f);
    const old = fs.readdirSync(DATA_DIR).filter(n => /^backup-.*\.json$/.test(n)).sort().slice(0, -14);
    old.forEach(n => fs.unlinkSync(path.join(DATA_DIR, n)));
  } catch (e) { console.error('backup gagal', e.message); }
}
dailyBackup(); setInterval(dailyBackup, 6 * 3600 * 1000);

const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const authed = req => crypto.timingSafeEqual(sha(req.headers['x-app-key'] || ''), sha(APP_PASSWORD));

// pembatas percobaan login gagal per IP
const fails = new Map();
function ipOf(req) { return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
function blocked(ip) { const f = fails.get(ip); return f && f.n >= 10 && Date.now() - f.t < 15 * 60 * 1000; }
function noteFail(ip) { const f = fails.get(ip); if (!f || Date.now() - f.t > 15 * 60 * 1000) fails.set(ip, { n: 1, t: Date.now() }); else { f.n++; f.t = Date.now(); } }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function send(res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Cache-Control': 'no-store', ...(isObj ? { 'Content-Type': 'application/json' } : {}), ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    if (p === '/health') return send(res, 200, 'ok');

    if (p.startsWith('/api/')) {
      const ip = ipOf(req);
      if (blocked(ip)) return send(res, 429, { error: 'terlalu banyak percobaan, coba lagi nanti' });
      if (!authed(req)) { noteFail(ip); return send(res, 401, { error: 'unauthorized' }); }

      if (p === '/api/ping') return send(res, 200, { ok: true });
      if (p === '/api/versions') {
        const v = {}; for (const k of Object.keys(db)) v[k] = db[k].version; return send(res, 200, v);
      }
      if (p === '/api/export') {
        return send(res, 200, JSON.stringify(db, null, 2), { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="jurnal-backup.json"' });
      }
      const m = p.match(/^\/api\/data\/([\w.-]+)$/);
      if (m) {
        const key = m[1];
        if (!ALLOWED_KEYS.has(key)) return send(res, 400, { error: 'key tidak dikenal' });
        if (req.method === 'GET') {
          return db[key] ? send(res, 200, db[key]) : send(res, 404, { error: 'kosong' });
        }
        if (req.method === 'PUT') {
          const body = JSON.parse(await readBody(req));
          if (typeof body.value !== 'string') return send(res, 400, { error: 'value harus string' });
          const version = (db[key] ? db[key].version : 0) + 1;
          db[key] = { value: body.value, version, updatedAt: new Date().toISOString() };
          persist();
          return send(res, 200, { version });
        }
      }
      return send(res, 404, { error: 'not found' });
    }

    // file statis
    let rel = p === '/' ? '/index.html' : p;
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found');
    const cache = rel === '/sw.js' || rel === '/index.html' ? 'no-cache' : 'public, max-age=86400';
    send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server error' });
  }
}).listen(PORT, () => console.log('Jurnal sync jalan di port ' + PORT));
