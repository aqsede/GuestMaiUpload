const express = require('express');
const multer = require('multer');
const QR = require('qrcode');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  PORT = 3000,
  PUBLIC_URL = 'http://localhost:3000',
  ADMIN_USER = 'admin',
  ADMIN_PASSWORD = 'changeme',
  EVENT_TITLE = 'Our Wedding',
  EVENT_SUBTITLE = 'Share your photos with us',
  MAX_MB = 100,
  UPLOAD_DIR = '/data/uploads',
} = process.env;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const app = express();
app.set('trust proxy', 1);

const slug = (s) => String(s || '').normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'guest';
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, f, cb) => {
      const ext = (path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '')) || '.jpg';
      cb(null, `${Date.now()}_${slug(req.query.name)}_${crypto.randomBytes(3).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) => cb(null, /^(image|video)\//.test(f.mimetype)),
});

const sha = (s) => crypto.createHash('sha256').update(s).digest();
function auth(req, res, next) {
  const [u, ...p] = Buffer.from((req.headers.authorization || '').slice(6), 'base64').toString().split(':');
  if (crypto.timingSafeEqual(sha(u + ':' + p.join(':')), sha(`${ADMIN_USER}:${ADMIN_PASSWORD}`))) return next();
  res.set('WWW-Authenticate', 'Basic realm="Admin"').status(401).send('Login required');
}

// ---- Guest ----
app.get('/api/config', (req, res) => res.json({ title: EVENT_TITLE, subtitle: EVENT_SUBTITLE, maxMb: +MAX_MB }));
app.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(415).json({ error: 'Only photos and videos are allowed' });
    res.json({ ok: true });
  });
});
app.use(express.static(path.join(__dirname, 'public')));

// ---- Admin ----
const files = () => fs.readdirSync(UPLOAD_DIR).filter((f) => !f.startsWith('.'))
  .map((f) => ({ name: f, time: fs.statSync(path.join(UPLOAD_DIR, f)).mtimeMs, video: /\.(mp4|mov|webm|m4v|3gp)$/i.test(f) }))
  .sort((a, b) => b.time - a.time);
const safe = (n) => path.join(UPLOAD_DIR, path.basename(n));

app.use('/admin', auth);
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));
app.get('/admin/api/list', (req, res) => res.json({ title: EVENT_TITLE, files: files() }));
app.get('/admin/api/qr', async (req, res) =>
  res.json({ url: PUBLIC_URL, svg: await QR.toString(PUBLIC_URL, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) }));
app.get('/admin/file/:name', (req, res) => res.sendFile(safe(req.params.name)));
app.delete('/admin/file/:name', (req, res) => { fs.rmSync(safe(req.params.name), { force: true }); res.json({ ok: true }); });
app.get('/admin/zip', (req, res) => {
  res.attachment(`${slug(EVENT_TITLE)}-photos.zip`);
  const z = archiver('zip', { store: true });
  z.pipe(res);
  z.directory(UPLOAD_DIR, false);
  z.finalize();
});

app.listen(PORT, () => console.log(`Listening on :${PORT}  guests -> ${PUBLIC_URL}`));
