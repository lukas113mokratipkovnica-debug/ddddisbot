// Platform-level storage: customers, their bots, dashboard sessions.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const config = require('./config');
const plans = require('./plans');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'platform.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  avatar TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  application_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  token TEXT NOT NULL,
  template TEXT NOT NULL,
  modules TEXT NOT NULL,
  presence TEXT NOT NULL DEFAULT '{}',
  autostart INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expires INTEGER NOT NULL
);
`);

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.encryptionKey, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
function decrypt(payload) {
  const [iv, tag, enc] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', config.encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

const parseBot = (b) => b && { ...b, modules: JSON.parse(b.modules), presence: JSON.parse(b.presence) };

const users = {
  upsert: (u) => db.prepare(`INSERT INTO users (id, username, avatar, created_at, last_login) VALUES (?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET username = excluded.username, avatar = excluded.avatar, last_login = excluded.last_login`)
    .run(u.id, u.username, u.avatar, Date.now(), Date.now()),
  get: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
  all: () => db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM bots b WHERE b.owner_id = u.id) bot_count FROM users u ORDER BY created_at DESC`).all(),
  setPlan: (id, plan) => db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plans[plan] ? plan : 'free', id),
  setBanned: (id, banned) => db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(banned ? 1 : 0, id),
  plan: (id) => {
    if (config.ownerIds.includes(id)) return { ...plans.business, key: 'owner', name: 'Owner', maxBots: 1000 };
    const u = users.get(id);
    return plans[u?.plan] || plans.free;
  },
  count: () => db.prepare('SELECT COUNT(*) c FROM users').get().c,
};

const bots = {
  create: ({ ownerId, applicationId, name, avatar, token, template, modules }) => {
    const id = crypto.randomBytes(6).toString('hex');
    db.prepare(`INSERT INTO bots (id, owner_id, application_id, name, avatar, token, template, modules, created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(id, ownerId, applicationId, name, avatar, encrypt(token), template, JSON.stringify(modules), Date.now());
    return id;
  },
  get: (id) => parseBot(db.prepare('SELECT * FROM bots WHERE id = ?').get(id)),
  token: (id) => {
    const row = db.prepare('SELECT token FROM bots WHERE id = ?').get(id);
    return row ? decrypt(row.token) : null;
  },
  byOwner: (ownerId) => db.prepare('SELECT * FROM bots WHERE owner_id = ? ORDER BY created_at').all(ownerId).map(parseBot),
  byApplication: (appId) => parseBot(db.prepare('SELECT * FROM bots WHERE application_id = ?').get(appId)),
  all: () => db.prepare('SELECT * FROM bots ORDER BY created_at DESC').all().map(parseBot),
  autostart: () => db.prepare('SELECT * FROM bots WHERE autostart = 1').all().map(parseBot),
  setModules: (id, modules) => db.prepare('UPDATE bots SET modules = ? WHERE id = ?').run(JSON.stringify(modules), id),
  setPresence: (id, presence) => db.prepare('UPDATE bots SET presence = ? WHERE id = ?').run(JSON.stringify(presence), id),
  setProfile: (id, name, avatar) => db.prepare('UPDATE bots SET name = ?, avatar = ? WHERE id = ?').run(name, avatar, id),
  setToken: (id, token) => db.prepare('UPDATE bots SET token = ? WHERE id = ?').run(encrypt(token), id),
  setAutostart: (id, on) => db.prepare('UPDATE bots SET autostart = ? WHERE id = ?').run(on ? 1 : 0, id),
  remove: (id) => db.prepare('DELETE FROM bots WHERE id = ?').run(id),
  count: () => db.prepare('SELECT COUNT(*) c FROM bots').get().c,
};

const kv = {
  get: (key, def = null) => { const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(key); return r ? JSON.parse(r.value) : def; },
  set: (key, value) => db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, JSON.stringify(value)),
};

module.exports = { db, users, bots, kv };
