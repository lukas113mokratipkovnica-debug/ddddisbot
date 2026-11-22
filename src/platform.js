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
for (const [table, col, def] of [['users', 'stripe_customer', 'TEXT'], ['users', 'subscription', 'TEXT'], ['users', 'sub_status', 'TEXT'], ['users', 'plan_until', 'INTEGER'], ['bots', 'suspended', 'INTEGER NOT NULL DEFAULT 0']]) {
  try { db.prepare(`SELECT ${col} FROM ${table} LIMIT 1`).get(); } catch { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch { /* table not yet created */ } }
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  avatar TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login INTEGER,
  stripe_customer TEXT,
  subscription TEXT,
  sub_status TEXT,
  plan_until INTEGER
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
  suspended INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  ip TEXT,
  meta TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit(user_id, id);
CREATE TABLE IF NOT EXISTS billing_events (id TEXT PRIMARY KEY, type TEXT, user_id TEXT, created_at INTEGER NOT NULL);
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
  setBilling: (id, fields) => {
    const allowed = ['stripe_customer', 'subscription', 'sub_status', 'plan_until', 'plan'];
    const keys = Object.keys(fields).filter((k) => allowed.includes(k));
    if (!keys.length) return;
    db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  },
  byCustomer: (cust) => db.prepare('SELECT * FROM users WHERE stripe_customer = ?').get(cust),
  bySubscription: (sub) => db.prepare('SELECT * FROM users WHERE subscription = ?').get(sub),
  expired: () => db.prepare("SELECT * FROM users WHERE plan != 'free' AND plan_until IS NOT NULL AND plan_until < ?").all(Date.now()),
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
  autostart: () => db.prepare('SELECT * FROM bots WHERE autostart = 1 AND suspended = 0').all().map(parseBot),
  setModules: (id, modules) => db.prepare('UPDATE bots SET modules = ? WHERE id = ?').run(JSON.stringify(modules), id),
  setPresence: (id, presence) => db.prepare('UPDATE bots SET presence = ? WHERE id = ?').run(JSON.stringify(presence), id),
  setProfile: (id, name, avatar) => db.prepare('UPDATE bots SET name = ?, avatar = ? WHERE id = ?').run(name, avatar, id),
  setToken: (id, token) => db.prepare('UPDATE bots SET token = ? WHERE id = ?').run(encrypt(token), id),
  setAutostart: (id, on) => db.prepare('UPDATE bots SET autostart = ? WHERE id = ?').run(on ? 1 : 0, id),
  setSuspended: (id, on) => db.prepare('UPDATE bots SET suspended = ? WHERE id = ?').run(on ? 1 : 0, id),
  remove: (id) => db.prepare('DELETE FROM bots WHERE id = ?').run(id),
  count: () => db.prepare('SELECT COUNT(*) c FROM bots').get().c,
};

const kv = {
  get: (key, def = null) => { const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(key); return r ? JSON.parse(r.value) : def; },
  set: (key, value) => db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, JSON.stringify(value)),
};

const audit = {
  log: (userId, action, target = null, ip = null, meta = null) => db.prepare('INSERT INTO audit (user_id, action, target, ip, meta, created_at) VALUES (?,?,?,?,?,?)')
    .run(userId, action, target, ip, meta ? JSON.stringify(meta).slice(0, 1000) : null, Date.now()),
  byUser: (userId, limit = 50) => db.prepare('SELECT * FROM audit WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit),
  recent: (limit = 100) => db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit),
};
setInterval(() => db.prepare('DELETE FROM audit WHERE created_at < ?').run(Date.now() - 90 * 864e5), 6 * 3600_000).unref();

const sessions = {
  byUser: (userId) => db.prepare("SELECT sid, sess, expires FROM sessions WHERE expires > ? AND json_extract(sess, '$.user.id') = ?").all(Date.now(), userId)
    .map((r) => ({ sid: r.sid, expires: r.expires, ...JSON.parse(r.sess) })),
  destroy: (sid) => db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid),
  destroyUser: (userId, exceptSid) => db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.user.id') = ? AND sid != ?").run(userId, exceptSid || '').changes,
};

const billing = {
  seen: (id) => Boolean(db.prepare('SELECT 1 FROM billing_events WHERE id = ?').get(id)),
  record: (id, type, userId) => { try { db.prepare('INSERT INTO billing_events (id, type, user_id, created_at) VALUES (?,?,?,?)').run(id, type, userId, Date.now()); return true; } catch { return false; } },
};

module.exports = { db, users, bots, kv, audit, sessions, billing };
