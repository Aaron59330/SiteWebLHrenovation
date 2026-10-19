'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Database = require('better-sqlite3');

const {
  PORT = 3000, NODE_ENV, SITE_URL = '', JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD,
  SMTP_HOST, SMTP_PORT = 465, SMTP_USER, SMTP_PASS, NOTIFY_TO,
} = process.env;
const PROD = NODE_ENV === 'production';

if (!JWT_SECRET || JWT_SECRET.length < 32) { console.error('JWT_SECRET manquant ou trop court (32 caractères minimum) : voir .env.example'); process.exit(1); }
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 10) { console.error('ADMIN_EMAIL / ADMIN_PASSWORD (10 caractères minimum) manquants : voir .env.example'); process.exit(1); }

/* ---------- Base de données ---------- */
const dataDir = path.join(__dirname, '..', 'data');
const uploadDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const db = new Database(path.join(dataDir, 'lh.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS reviews(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL, work_type TEXT, comment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS realisations(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, work_type TEXT, description TEXT,
  images TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS content(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quotes(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, work_type TEXT, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT (datetime('now')));
`);

/* ---------- E-mails ---------- */
const mailer = SMTP_HOST && SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({ host: SMTP_HOST, port: +SMTP_PORT, secure: +SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null;
async function notify(subject, text, replyTo) {
  if (!mailer) { console.warn('[mail] SMTP non configuré, e-mail non envoyé :', subject); return; }
  try {
    await mailer.sendMail({ from: `"Site L.H Rénovation" <${SMTP_USER}>`, to: NOTIFY_TO || ADMIN_EMAIL, subject, text, replyTo: replyTo || undefined });
  } catch (e) { console.error('[mail] échec :', e.message); }
}

/* ---------- Utilitaires ---------- */
const WORK_TYPES = ['Peinture', 'Rénovation complète', 'Plâtrerie', 'Sols / carrelage', 'Salle de bain', 'Cuisine', 'Autre'];
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const emailOk = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e);
const publicName = (n) => { const p = n.split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0].toUpperCase()}.` : p[0]; };
const adminPasswordHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
const cookieOpts = { httpOnly: true, sameSite: 'strict', secure: PROD, maxAge: 7 * 24 * 3600 * 1000, path: '/' };
const sign = (payload, exp = '7d') => jwt.sign(payload, JWT_SECRET, { expiresIn: exp });
function readToken(req, name) { try { return jwt.verify(req.cookies[name], JWT_SECRET); } catch { return null; } }

/* ---------- Application ---------- */
const app = express();
if (PROD) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"],
    objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
    upgradeInsecureRequests: PROD ? [] : null,
  } },
}));
const smallJson = express.json({ limit: '20kb' });
const bigJson = express.json({ limit: '25mb' });
const smallJsonBig = express.json({ limit: '300kb' });
app.use((req, res, next) => (req.path.startsWith('/api/admin/realisations') || req.path === '/api/admin/content' ? next() : smallJson(req, res, next)));
app.use(cookieParser());

// Protection CSRF : cookies SameSite=Strict + JSON obligatoire + origine vérifiée
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.method !== 'DELETE' && !req.is('application/json')) return res.status(415).json({ error: 'Requête invalide.' });
  const origin = req.get('origin');
  if (origin) {
    let ok = false;
    try { const o = new URL(origin); ok = o.host === req.get('host') || (SITE_URL && o.origin === new URL(SITE_URL).origin); } catch {}
    if (!ok) return res.status(403).json({ error: 'Origine non autorisée.' });
  }
  next();
});
const limiter = (windowMin, max, msg) => rateLimit({ windowMs: windowMin * 60000, max, standardHeaders: true, legacyHeaders: false, message: { error: msg } });
const authLimiter = limiter(15, 15, 'Trop de tentatives, réessayez dans quelques minutes.');
const quoteLimiter = limiter(60, 6, 'Trop de demandes envoyées, réessayez plus tard.');
const reviewLimiter = limiter(60, 5, 'Trop d\'avis envoyés, réessayez plus tard.');

const needUser = (req, res, next) => {
  const t = readToken(req, 'lh_user'); if (!t) return res.status(401).json({ error: 'Connexion requise.' });
  const u = db.prepare('SELECT id,name,email FROM users WHERE id=?').get(t.uid);
  if (!u) return res.status(401).json({ error: 'Connexion requise.' });
  req.user = u; next();
};
const needAdmin = (req, res, next) => {
  const t = readToken(req, 'lh_admin'); if (!t || t.role !== 'admin') return res.status(401).json({ error: 'Accès réservé.' });
  next();
};

/* ----- Comptes clients ----- */
app.post('/api/register', authLimiter, (req, res) => {
  const name = clean(req.body.name, 80), email = clean(req.body.email, 200).toLowerCase(), password = String(req.body.password || '');
  if (name.length < 2) return res.status(400).json({ error: 'Indiquez votre nom.' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
  if (password.length < 8 || password.length > 100) return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum.' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'Un compte existe déjà avec cette adresse.' });
  const id = db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name, email, bcrypt.hashSync(password, 12)).lastInsertRowid;
  res.cookie('lh_user', sign({ uid: id }), cookieOpts).json({ user: { name, email } });
});
app.post('/api/login', authLimiter, (req, res) => {
  const email = clean(req.body.email, 200).toLowerCase(), password = String(req.body.password || '').slice(0, 100);
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  const userOk = bcrypt.compareSync(password, u ? u.password_hash : adminPasswordHash) && !!u; // durée comparable si le compte n'existe pas
  const adminOk = email === ADMIN_EMAIL.toLowerCase() && bcrypt.compareSync(password, adminPasswordHash);
  if (!userOk && !adminOk) return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
  if (userOk) res.cookie('lh_user', sign({ uid: u.id }), cookieOpts);
  if (adminOk) res.cookie('lh_admin', sign({ role: 'admin' }, '12h'), { ...cookieOpts, maxAge: 12 * 3600 * 1000 });
  res.json({ user: userOk ? { name: u.name, email: u.email } : null, admin: adminOk });
});
app.post('/api/logout', (req, res) => { res.clearCookie('lh_user', { path: '/' }); res.clearCookie('lh_admin', { path: '/' }); res.json({ ok: true }); });
app.get('/api/me', (req, res) => {
  const t = readToken(req, 'lh_user'); const u = t && db.prepare('SELECT name,email FROM users WHERE id=?').get(t.uid);
  const a = readToken(req, 'lh_admin');
  res.json({ user: u || null, admin: !!(a && a.role === 'admin') });
});

/* ----- Avis ----- */
app.get('/api/reviews', (req, res) => {
  const rows = db.prepare(`SELECT r.rating,r.work_type,r.comment,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.user_id
    WHERE r.status='approved' ORDER BY r.id DESC LIMIT 50`).all();
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : 0;
  res.json({ average: Math.round(avg * 10) / 10, count: rows.length,
    reviews: rows.map(r => ({ name: publicName(r.name), rating: r.rating, work_type: r.work_type, comment: r.comment, date: r.created_at.slice(0, 10) })) });
});
app.get('/api/my-reviews', needUser, (req, res) => {
  res.json(db.prepare('SELECT id,rating,work_type,comment,status,created_at FROM reviews WHERE user_id=? ORDER BY id DESC').all(req.user.id));
});
app.post('/api/reviews', needUser, reviewLimiter, (req, res) => {
  const rating = parseInt(req.body.rating, 10), comment = clean(req.body.comment, 1500);
  const work = WORK_TYPES.includes(req.body.work_type) ? req.body.work_type : 'Autre';
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Choisissez une note de 1 à 5.' });
  if (comment.length < 10) return res.status(400).json({ error: 'Votre avis est trop court (10 caractères minimum).' });
  db.prepare('INSERT INTO reviews(user_id,rating,work_type,comment) VALUES(?,?,?,?)').run(req.user.id, rating, work, comment);
  notify(`Nouvel avis à valider (${rating}/5) – ${req.user.name}`, `${req.user.name} <${req.user.email}>\nNote : ${rating}/5\nTravaux : ${work}\n\n${comment}\n\nÀ valider dans l'espace admin : ${SITE_URL}/admin.html`, req.user.email);
  res.json({ ok: true, message: 'Merci ! Votre avis sera publié après validation.' });
});

/* ----- Demandes de devis ----- */
app.post('/api/quotes', quoteLimiter, (req, res) => {
  if (req.body.website) return res.json({ ok: true }); // champ piège anti-robots
  const name = clean(req.body.name, 100), phone = clean(req.body.phone, 30), email = clean(req.body.email, 200).toLowerCase();
  const work = WORK_TYPES.includes(req.body.work_type) ? req.body.work_type : 'Autre', message = clean(req.body.message, 3000);
  if (name.length < 2) return res.status(400).json({ error: 'Indiquez votre nom.' });
  if (!/^[0-9 +().-]{8,20}$/.test(phone)) return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
  if (email && !emailOk(email)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });
  if (message.length < 10) return res.status(400).json({ error: 'Décrivez brièvement votre projet.' });
  const t = readToken(req, 'lh_user');
  const uid = t && db.prepare('SELECT id FROM users WHERE id=?').get(t.uid) ? t.uid : null;
  db.prepare('INSERT INTO quotes(user_id,name,phone,email,work_type,message) VALUES(?,?,?,?,?,?)').run(uid, name, phone, email || null, work, message);
  notify(`Nouvelle demande de devis – ${name} (${work})`, `Nom : ${name}\nTéléphone : ${phone}\nE-mail : ${email || '—'}\nTravaux : ${work}\n\n${message}\n\nVoir dans l'espace admin : ${SITE_URL}/admin.html`, email);
  res.json({ ok: true, message: 'Merci ! Votre demande est bien envoyée, nous vous recontactons sous 24h.' });
});


/* ----- Réalisations (photos + textes gérés par l'administrateur) ----- */
const MAX_IMAGES = 8, MAX_IMG_BYTES = 6 * 1024 * 1024;
const REAL_DEFAULTS = { title: 'Des chantiers qui parlent d\'eux-mêmes', text: 'Un aperçu de nos dernières rénovations.' };
const getSetting = (k, d) => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : d; };
const setSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);
function saveImage(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw Object.assign(new Error('Image invalide (formats acceptés : JPEG, PNG, WebP).'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 100 || buf.length > MAX_IMG_BYTES) throw Object.assign(new Error('Image trop lourde (6 Mo maximum).'), { status: 400 });
  const isJpg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  const isPng = buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]));
  const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  const ext = isJpg ? 'jpg' : isPng ? 'png' : isWebp ? 'webp' : null;       // le contenu réel décide, pas ce que déclare le client
  if (!ext) throw Object.assign(new Error('Fichier image non reconnu.'), { status: 400 });
  const name = crypto.randomBytes(16).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(uploadDir, name), buf);
  return name;
}
const removeImage = (name) => { if (/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) fs.rm(path.join(uploadDir, name), () => {}); };
const imgList = (row) => { try { return JSON.parse(row.images).filter(n => /^[a-f0-9]{32}\.(jpg|png|webp)$/.test(n)); } catch { return []; } };
const realPublic = (r) => ({ id: r.id, title: r.title, work_type: r.work_type, description: r.description, images: imgList(r).map(n => '/uploads/' + n) });
function realFields(b) {
  const title = clean(b.title, 120), description = clean(b.description, 2000), work = WORK_TYPES.includes(b.work_type) ? b.work_type : 'Autre';
  if (title.length < 2) throw Object.assign(new Error('Indiquez un titre.'), { status: 400 });
  return { title, description, work };
}
app.get('/api/realisations', (req, res) => {
  res.json({ intro: { title: getSetting('real_title', REAL_DEFAULTS.title), text: getSetting('real_text', REAL_DEFAULTS.text) },
    items: db.prepare('SELECT * FROM realisations ORDER BY id DESC').all().map(realPublic) });
});


/* ----- Textes du site modifiables par l'administrateur ----- */
const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
app.get('/api/content', (req, res) => {
  const out = {}; db.prepare('SELECT key,value FROM content').all().forEach(r => { out[r.key] = r.value; });
  res.set('Cache-Control', 'no-cache').json(out);
});

/* ----- Espace administrateur ----- */
app.post('/api/admin/login', authLimiter, (req, res) => {
  const email = clean(req.body.email, 200).toLowerCase(), password = String(req.body.password || '').slice(0, 100);
  const okEmail = email === ADMIN_EMAIL.toLowerCase();
  const okPass = bcrypt.compareSync(password, adminPasswordHash);
  if (!(okEmail && okPass)) return res.status(401).json({ error: 'Identifiants incorrects.' });
  res.cookie('lh_admin', sign({ role: 'admin' }, '12h'), { ...cookieOpts, maxAge: 12 * 3600 * 1000 }).json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie('lh_admin', { path: '/' }).json({ ok: true }); });
app.get('/api/admin/session', (req, res) => { const t = readToken(req, 'lh_admin'); res.json({ admin: !!(t && t.role === 'admin') }); });

const admin = express.Router();
admin.use(needAdmin);
admin.get('/summary', (req, res) => res.json({
  newQuotes: db.prepare("SELECT COUNT(*) c FROM quotes WHERE status='new'").get().c,
  pendingReviews: db.prepare("SELECT COUNT(*) c FROM reviews WHERE status='pending'").get().c,
  users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
}));
admin.get('/quotes', (req, res) => res.json(db.prepare('SELECT * FROM quotes ORDER BY id DESC').all()));
admin.patch('/quotes/:id', (req, res) => {
  if (!['new', 'done'].includes(req.body.status)) return res.status(400).json({ error: 'Statut invalide.' });
  db.prepare('UPDATE quotes SET status=? WHERE id=?').run(req.body.status, +req.params.id); res.json({ ok: true });
});
admin.delete('/quotes/:id', (req, res) => { db.prepare('DELETE FROM quotes WHERE id=?').run(+req.params.id); res.json({ ok: true }); });
admin.get('/reviews', (req, res) => res.json(db.prepare(`SELECT r.*,u.name AS user_name,u.email AS user_email FROM reviews r JOIN users u ON u.id=r.user_id ORDER BY r.id DESC`).all()));
admin.patch('/reviews/:id', (req, res) => {
  if (!['pending', 'approved', 'rejected'].includes(req.body.status)) return res.status(400).json({ error: 'Statut invalide.' });
  db.prepare('UPDATE reviews SET status=? WHERE id=?').run(req.body.status, +req.params.id); res.json({ ok: true });
});
admin.delete('/reviews/:id', (req, res) => { db.prepare('DELETE FROM reviews WHERE id=?').run(+req.params.id); res.json({ ok: true }); });
admin.get('/users', (req, res) => res.json(db.prepare('SELECT id,name,email,created_at FROM users ORDER BY id DESC').all()));
admin.delete('/users/:id', (req, res) => { db.prepare('DELETE FROM users WHERE id=?').run(+req.params.id); res.json({ ok: true }); });

admin.put('/realisations-text', smallJson, (req, res) => {
  setSetting('real_title', clean(req.body.title, 150) || REAL_DEFAULTS.title);
  setSetting('real_text', clean(req.body.text, 500)); res.json({ ok: true });
});
admin.get('/realisations', (req, res) => res.json(db.prepare('SELECT * FROM realisations ORDER BY id DESC').all().map(realPublic)));
admin.post('/realisations', bigJson, (req, res) => {
  const f = realFields(req.body), add = Array.isArray(req.body.add) ? req.body.add : [];
  if (!add.length || add.length > MAX_IMAGES) return res.status(400).json({ error: 'Ajoutez entre 1 et ' + MAX_IMAGES + ' photos.' });
  const names = []; try { add.forEach(d => names.push(saveImage(d))); } catch (e) { names.forEach(removeImage); return res.status(e.status || 500).json({ error: e.message }); }
  const id = db.prepare('INSERT INTO realisations(title,work_type,description,images) VALUES(?,?,?,?)').run(f.title, f.work, f.description, JSON.stringify(names)).lastInsertRowid;
  res.json({ ok: true, id });
});
admin.put('/realisations/:id', bigJson, (req, res) => {
  const row = db.prepare('SELECT * FROM realisations WHERE id=?').get(+req.params.id);
  if (!row) return res.status(404).json({ error: 'Introuvable.' });
  const f = realFields(req.body), current = imgList(row);
  const keep = (Array.isArray(req.body.keep) ? req.body.keep : []).map(u => String(u).replace('/uploads/', '')).filter(n => current.includes(n));
  const add = Array.isArray(req.body.add) ? req.body.add : [];
  if (keep.length + add.length < 1 || keep.length + add.length > MAX_IMAGES) return res.status(400).json({ error: 'Une réalisation doit avoir entre 1 et ' + MAX_IMAGES + ' photos.' });
  const added = []; try { add.forEach(d => added.push(saveImage(d))); } catch (e) { added.forEach(removeImage); return res.status(e.status || 500).json({ error: e.message }); }
  current.filter(n => !keep.includes(n)).forEach(removeImage);
  db.prepare('UPDATE realisations SET title=?,work_type=?,description=?,images=? WHERE id=?').run(f.title, f.work, f.description, JSON.stringify(keep.concat(added)), row.id);
  res.json({ ok: true });
});
admin.delete('/realisations/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM realisations WHERE id=?').get(+req.params.id);
  if (row) { imgList(row).forEach(removeImage); db.prepare('DELETE FROM realisations WHERE id=?').run(row.id); }
  res.json({ ok: true });
});

admin.put('/content', smallJsonBig, (req, res) => {
  const v = req.body.values; if (!v || typeof v !== 'object' || Array.isArray(v)) return res.status(400).json({ error: 'Requête invalide.' });
  const keys = Object.keys(v); if (keys.length > 300) return res.status(400).json({ error: 'Trop de modifications d\'un coup.' });
  const up = db.prepare('INSERT INTO content(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const del = db.prepare('DELETE FROM content WHERE key=?');
  db.transaction(() => keys.forEach(k => {
    if (!KEY_RE.test(k)) return;
    const t = clean(v[k], 3000).replace(/\s*\n\s*/g, ' ');
    t ? up.run(k, t) : del.run(k);
  }))();
  res.json({ ok: true });
});
admin.post('/content/reset', (req, res) => {
  const keys = Array.isArray(req.body.keys) ? req.body.keys.filter(k => KEY_RE.test(String(k))) : [];
  const del = db.prepare('DELETE FROM content WHERE key=?'); db.transaction(() => keys.forEach(k => del.run(k)))();
  res.json({ ok: true });
});
app.use('/api/admin', admin);
app.use('/api', (req, res) => res.status(404).json({ error: 'Introuvable.' }));

/* ----- Pages du site ----- */
app.use((req, res, next) => { if (req.path === '/admin.html') res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
app.use('/uploads', express.static(uploadDir, { dotfiles: 'ignore', index: false, immutable: true, maxAge: '30d',
  setHeaders: (res) => res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox") }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  extensions: ['html'], dotfiles: 'ignore',
  // pages, scripts et styles : le navigateur revérifie à chaque visite (mises à jour visibles tout de suite)
  setHeaders: (res, file) => { res.setHeader('Cache-Control', /\.(png|jpe?g|webp|svg|ico|woff2?)$/i.test(file) ? 'public, max-age=86400' : 'no-cache'); },
}));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.use((err, req, res, next) => {
  const st = err.status || 500;
  if (st >= 500) console.error(err);
  const msg = err.type === 'entity.too.large' ? 'Fichier trop volumineux (réduisez le nombre ou la taille des photos).' : st < 500 && err.expose !== false && !err.type ? err.message : st < 500 ? 'Requête invalide.' : 'Erreur serveur.';
  res.status(st).json({ error: msg });
});

app.listen(PORT, '127.0.0.1', () => console.log(`L.H Rénovation sur http://127.0.0.1:${PORT}`));
