const express = require('express'), multer = require('multer'), QR = require('qrcode'), archiver = require('archiver');
const sharp = require('sharp'), heic = require('heic-convert');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const E = process.env;
const PORT = E.PORT || 3000, PUBLIC_URL = E.PUBLIC_URL || 'http://localhost:3000';
const ADMIN_USER = E.ADMIN_USER || 'admin', ADMIN_PASSWORD = E.ADMIN_PASSWORD || 'changeme';
const MAX_MB = +E.MAX_MB || 100, DATA = E.DATA_DIR || '/data', ALBUM_PUBLIC = E.ALBUM_PUBLIC !== 'false';
const nl = (s) => String(s).replace(/\\n/g, '\n');
const cfg = {
  title: E.EVENT_TITLE || 'Anna & Tom', date: E.EVENT_DATE || '', venue: E.EVENT_VENUE || '',
  greeting: E.EVENT_GREETING || '', brand: E.BRAND_NAME || '', brandTag: E.BRAND_TAG || '',
  blurb: nl(E.EVENT_BLURB || 'Thank you for being part of this special moment\\nTwo hearts, one promise, a lifetime of memories.'),
  stories: (E.STORIES || '💄 Getting ready,👰 Bride entrance,🤵 Groom moment,👨‍👩‍👧 Family moment').split(',').map((s) => s.trim()).filter(Boolean),
};

// ---------- storage ----------
const U = path.join(DATA, 'uploads'), C = path.join(DATA, 'cache'), M = path.join(DATA, 'meta.json'), HERO = path.join(DATA, 'hero.jpg');
[U, C].forEach((d) => fs.mkdirSync(d, { recursive: true }));
let db = Object.create(null);
try { Object.assign(db, JSON.parse(fs.readFileSync(M, 'utf8'))); } catch {}
const save = () => { fs.writeFileSync(M + '.tmp', JSON.stringify(db)); fs.renameSync(M + '.tmp', M); };
const isHeic = (f) => /\.(heic|heif)$/i.test(f);
const kindOf = (f) => (/\.(mp4|mov|m4v|webm|3gp)$/i.test(f) ? 'video' : 'photo');
// adopt files uploaded before metadata existed
fs.readdirSync(U).forEach((f) => {
  const id = path.parse(f).name;
  if (db[id] || f.startsWith('.')) return;
  const m = f.match(/^\d+_([^_]+)_/);
  db[id] = { id, file: f, type: kindOf(f), name: m && m[1] !== 'guest' ? m[1].replace(/-/g, ' ') : '', cat: '', time: fs.statSync(path.join(U, f)).mtimeMs, likes: 0 };
});
save();

const clean = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
const okCat = (c) => (cfg.stories.includes(c) ? c : '');
const add = (name, cat, extra) => {
  const id = extra.id || Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  db[id] = { id, name: clean(name), cat: okCat(cat), time: Date.now(), likes: 0, ...extra };
  save(); return db[id];
};
const pub = (e) => ({ id: e.id, type: e.type, name: e.name, cat: e.cat, time: e.time, likes: e.likes, text: e.text, heic: e.file && isHeic(e.file) ? true : undefined });
const feed = () => Object.values(db).sort((a, b) => b.time - a.time).map(pub);

// JPEG rendition (HEIC -> JPEG, or resized thumbnail). Cached on disk.
const pending = new Map();
function jpeg(id, size) {
  const e = db[id];
  if (!e || !e.file) return Promise.resolve(null);
  const src = path.join(U, e.file);
  if (!size && !isHeic(e.file)) return Promise.resolve(src);
  const out = path.join(C, `${id}_${size || 'full'}.jpg`);
  if (fs.existsSync(out)) return Promise.resolve(out);
  if (pending.has(out)) return pending.get(out);
  const p = (async () => {
    let input = src;
    if (isHeic(e.file)) input = Buffer.from(await heic({ buffer: fs.readFileSync(src), format: 'JPEG', quality: 0.9 }));
    let s = sharp(input).rotate();
    if (size) s = s.resize({ width: size, withoutEnlargement: true });
    await s.jpeg({ quality: 82 }).toFile(out);
    return out;
  })().finally(() => pending.delete(out));
  pending.set(out, p);
  return p;
}

// ---------- uploads ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: U,
    filename: (q, f, cb) => {
      const ext = path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
      cb(null, Date.now().toString(36) + crypto.randomBytes(3).toString('hex') + ext);
    },
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (q, f, cb) => cb(null, /^(image|video|audio)\//.test(f.mimetype) || isHeic(f.originalname)),
});
const mem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30e6 } });

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));
const gate = (q, s, n) => (ALBUM_PUBLIC ? n() : s.status(403).json({ error: 'Album is private' }));

app.get('/api/config', (q, s) => res(s, { ...cfg, maxMb: MAX_MB, hasHero: fs.existsSync(HERO) }));
const res = (s, o) => s.json(o);

app.post('/upload', (q, s) => upload.single('file')(q, s, (err) => {
  if (err) return s.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `File is over ${MAX_MB} MB` : err.message });
  if (!q.file) return s.status(415).json({ error: 'Unsupported file type' });
  const f = q.file, id = path.parse(f.filename).name;
  const type = f.mimetype.startsWith('audio/') ? 'voice' : f.mimetype.startsWith('video/') ? 'video' : 'photo';
  add(q.query.name, q.query.cat, { id, file: f.filename, type });
  if (type === 'photo') setImmediate(() => jpeg(id, 640).catch(() => {}));
  s.json({ ok: true });
}));

app.post('/note', (q, s) => {
  const text = String(q.body.text || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 600);
  if (!text) return s.status(400).json({ error: 'Write something first' });
  add(q.body.name, '', { type: 'note', text });
  s.json({ ok: true });
});

const thumbH = async (q, s) => {
  const e = db[q.params.id];
  if (!e || e.type !== 'photo') return s.status(404).end();
  try { const p = await jpeg(e.id, 640); p ? s.sendFile(p, { maxAge: '7d' }) : s.status(404).end(); } catch { s.status(500).end(); }
};
const mediaH = async (q, s) => {
  const e = db[q.params.id];
  if (!e || !e.file) return s.status(404).end();
  try {
    const p = e.type === 'photo' ? await jpeg(e.id) : path.join(U, e.file);
    if (q.query.dl) return s.download(p, e.id + path.extname(p));
    s.sendFile(p, { maxAge: '1d' });
  } catch { s.status(500).end(); }
};
app.get('/api/feed', gate, (q, s) => s.json(feed()));
app.get('/thumb/:id', gate, thumbH);
app.get('/media/:id', gate, mediaH);
app.post('/like/:id', gate, (q, s) => {
  const e = db[q.params.id];
  if (!e) return s.status(404).end();
  e.likes = Math.max(0, e.likes + (q.body.d === -1 ? -1 : 1)); save();
  s.json({ likes: e.likes });
});
app.get('/hero', (q, s) => (fs.existsSync(HERO) ? s.sendFile(HERO) : s.status(404).end()));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- admin ----------
const sha = (x) => crypto.createHash('sha256').update(x).digest();
app.use('/admin', (q, s, n) => {
  const [u, ...p] = Buffer.from((q.headers.authorization || '').slice(6), 'base64').toString().split(':');
  if (crypto.timingSafeEqual(sha(u + ':' + p.join(':')), sha(`${ADMIN_USER}:${ADMIN_PASSWORD}`))) return n();
  s.set('WWW-Authenticate', 'Basic realm="Admin"').status(401).send('Login required');
});
app.get('/admin', (q, s) => s.sendFile(path.join(__dirname, 'admin', 'index.html')));
app.get('/admin/api/list', (q, s) => s.json({ title: cfg.title, items: feed() }));
app.get('/admin/api/qr', async (q, s) => s.json({ url: PUBLIC_URL, svg: await QR.toString(PUBLIC_URL, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) }));
app.get('/admin/thumb/:id', thumbH);
app.get('/admin/media/:id', mediaH);
app.get('/admin/original/:id', (q, s) => {
  const e = db[q.params.id];
  e && e.file ? s.download(path.join(U, e.file), e.file) : s.status(404).end();
});
app.delete('/admin/item/:id', (q, s) => {
  const e = db[q.params.id];
  if (e) {
    if (e.file) fs.rmSync(path.join(U, e.file), { force: true });
    fs.readdirSync(C).filter((f) => f.startsWith(e.id + '_')).forEach((f) => fs.rmSync(path.join(C, f), { force: true }));
    delete db[e.id]; save();
  }
  s.json({ ok: true });
});
app.post('/admin/hero', mem.single('hero'), async (q, s) => {
  try {
    let b = q.file.buffer;
    if (isHeic(q.file.originalname) || /hei[cf]/.test(q.file.mimetype)) b = Buffer.from(await heic({ buffer: b, format: 'JPEG', quality: 0.9 }));
    await sharp(b).rotate().resize({ width: 1400, withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(HERO);
    s.json({ ok: true });
  } catch { s.status(400).json({ error: 'Could not read that image' }); }
});
app.get('/admin/zip', (q, s) => {
  s.attachment('wedding-memories.zip');
  const z = archiver('zip', { store: true });
  z.pipe(s);
  z.directory(U, 'media');
  const notes = Object.values(db).filter((e) => e.type === 'note').sort((a, b) => a.time - b.time)
    .map((e) => `${new Date(e.time).toISOString()}  ${e.name || 'Guest'}\n${e.text}\n`).join('\n');
  if (notes) z.append(notes, { name: 'notes.txt' });
  z.finalize();
});

app.listen(PORT, () => console.log(`Listening on :${PORT}  guests -> ${PUBLIC_URL}`));
