const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'bot.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_warn_guild_user ON warnings(guild_id, user_id);
CREATE TABLE IF NOT EXISTS mod_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_guild ON mod_cases(guild_id);
CREATE TABLE IF NOT EXISTS levels (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  messages INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS custom_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  trigger TEXT NOT NULL,
  response TEXT NOT NULL,
  embed INTEGER NOT NULL DEFAULT 0,
  delete_trigger INTEGER NOT NULL DEFAULT 0,
  uses INTEGER NOT NULL DEFAULT 0,
  UNIQUE (guild_id, trigger)
);
CREATE TABLE IF NOT EXISTS role_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  unique_mode INTEGER NOT NULL DEFAULT 0,
  roles TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  closed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);
CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  prize TEXT NOT NULL,
  winners INTEGER NOT NULL DEFAULT 1,
  host_id TEXT NOT NULL,
  ends_at INTEGER NOT NULL,
  ended INTEGER NOT NULL DEFAULT 0,
  entrants TEXT NOT NULL DEFAULT '[]',
  winner_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS stats (
  guild_id TEXT NOT NULL,
  day TEXT NOT NULL,
  messages INTEGER NOT NULL DEFAULT 0,
  joins INTEGER NOT NULL DEFAULT 0,
  leaves INTEGER NOT NULL DEFAULT 0,
  commands INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, day)
);
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expires INTEGER NOT NULL
);
`);

// ---------------------------------------------------------------- settings
const DEFAULTS = {
  prefix: '!',
  modRole: '',
  disabledCommands: [],
  welcome: {
    enabled: false,
    channel: '',
    message: 'Dobrodošao/la {user} na **{server}**! Sada nas je {membercount}. 🎉',
    embed: true,
    dm: false,
    dmMessage: 'Hej {username}, dobrodošao/la na {server}!',
  },
  goodbye: {
    enabled: false,
    channel: '',
    message: '**{username}** je napustio/la server. Ostalo nas je {membercount}.',
    embed: true,
  },
  autorole: { enabled: false, roles: [], botRoles: [] },
  logs: {
    enabled: false,
    channel: '',
    messageDelete: true,
    messageEdit: true,
    memberJoin: true,
    memberLeave: true,
    memberUpdate: true,
    modActions: true,
    voice: false,
    channels: false,
  },
  automod: {
    enabled: false,
    ignoredChannels: [],
    ignoredRoles: [],
    timeoutMinutes: 10,
    badWords: { enabled: false, words: [], action: 'delete' },
    invites: { enabled: false, action: 'delete' },
    links: { enabled: false, whitelist: ['youtube.com', 'youtu.be', 'tenor.com'], action: 'delete' },
    mentions: { enabled: false, limit: 5, action: 'timeout' },
    caps: { enabled: false, percent: 70, minLength: 10, action: 'delete' },
    spam: { enabled: false, messages: 5, seconds: 5, action: 'timeout' },
    warnThreshold: { enabled: false, count: 3, action: 'timeout', minutes: 60 },
  },
  leveling: {
    enabled: true,
    xpMin: 15,
    xpMax: 25,
    cooldown: 60,
    announce: 'current', // current | channel | dm | off
    channel: '',
    message: 'GG {user}, dostigao/la si **level {level}**! 🚀',
    rewards: [], // [{ level, role }]
    stackRewards: true,
    noXpChannels: [],
    noXpRoles: [],
    multiplier: 1,
  },
  tickets: {
    enabled: false,
    category: '',
    supportRoles: [],
    logChannel: '',
    panelTitle: '🎫 Podrška',
    panelDescription: 'Klikni na dugme ispod da otvoriš tiket. Tim će ti odgovoriti što prije.',
    welcomeMessage: 'Pozdrav {user}! Opiši svoj problem, a tim će ti uskoro odgovoriti.',
    maxOpen: 1,
    counter: 0,
  },
  suggestions: { enabled: false, channel: '' },
  starboard: { enabled: false, channel: '', emoji: '⭐', threshold: 3 },
};

const settingsCache = new Map();

function isObj(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function mergeDefaults(defaults, data) {
  const out = {};
  for (const key of Object.keys(defaults)) {
    if (isObj(defaults[key])) out[key] = mergeDefaults(defaults[key], isObj(data?.[key]) ? data[key] : {});
    else out[key] = data && data[key] !== undefined ? data[key] : structuredClone(defaults[key]);
  }
  return out;
}

const getSettingsStmt = db.prepare('SELECT data FROM guild_settings WHERE guild_id = ?');
const upsertSettingsStmt = db.prepare(
  'INSERT INTO guild_settings (guild_id, data) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data'
);

function getSettings(guildId) {
  if (settingsCache.has(guildId)) return settingsCache.get(guildId);
  const row = getSettingsStmt.get(guildId);
  const settings = mergeDefaults(DEFAULTS, row ? JSON.parse(row.data) : {});
  settingsCache.set(guildId, settings);
  return settings;
}

function saveSettings(guildId, settings) {
  const merged = mergeDefaults(DEFAULTS, settings);
  upsertSettingsStmt.run(guildId, JSON.stringify(merged));
  settingsCache.set(guildId, merged);
  return merged;
}

/** Update one section, e.g. updateSettings(id, s => { s.welcome.enabled = true }) */
function updateSettings(guildId, mutator) {
  const s = structuredClone(getSettings(guildId));
  mutator(s);
  return saveSettings(guildId, s);
}

// ---------------------------------------------------------------- warnings / cases
const warnings = {
  add: (guildId, userId, modId, reason) =>
    db.prepare('INSERT INTO warnings (guild_id, user_id, mod_id, reason, created_at) VALUES (?,?,?,?,?)')
      .run(guildId, userId, modId, reason, Date.now()).lastInsertRowid,
  list: (guildId, userId) =>
    db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY id DESC').all(guildId, userId),
  count: (guildId, userId) =>
    db.prepare('SELECT COUNT(*) c FROM warnings WHERE guild_id = ? AND user_id = ?').get(guildId, userId).c,
  all: (guildId, limit = 200) =>
    db.prepare('SELECT * FROM warnings WHERE guild_id = ? ORDER BY id DESC LIMIT ?').all(guildId, limit),
  remove: (guildId, id) => db.prepare('DELETE FROM warnings WHERE guild_id = ? AND id = ?').run(guildId, id).changes,
  clear: (guildId, userId) =>
    db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(guildId, userId).changes,
  total: (guildId) => db.prepare('SELECT COUNT(*) c FROM warnings WHERE guild_id = ?').get(guildId).c,
};

const cases = {
  add: (guildId, type, userId, modId, reason) =>
    db.prepare('INSERT INTO mod_cases (guild_id, type, user_id, mod_id, reason, created_at) VALUES (?,?,?,?,?,?)')
      .run(guildId, type, userId, modId, reason, Date.now()).lastInsertRowid,
  recent: (guildId, limit = 100) =>
    db.prepare('SELECT * FROM mod_cases WHERE guild_id = ? ORDER BY id DESC LIMIT ?').all(guildId, limit),
  total: (guildId) => db.prepare('SELECT COUNT(*) c FROM mod_cases WHERE guild_id = ?').get(guildId).c,
};

// ---------------------------------------------------------------- levels
function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100; // xp needed to go from level -> level+1
}
function levelFromXp(xp) {
  let level = 0;
  let remaining = xp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, current: remaining, needed: xpForLevel(level) };
}
function totalXpForLevel(level) {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpForLevel(i);
  return total;
}

const levels = {
  get: (guildId, userId) =>
    db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?').get(guildId, userId) || {
      guild_id: guildId, user_id: userId, xp: 0, level: 0, messages: 0,
    },
  set: (guildId, userId, xp, messagesDelta = 0) => {
    const xpSafe = Math.max(0, Math.floor(xp));
    const { level } = levelFromXp(xpSafe);
    db.prepare(`INSERT INTO levels (guild_id, user_id, xp, level, messages) VALUES (?,?,?,?,?)
      ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, messages = messages + ?`)
      .run(guildId, userId, xpSafe, level, Math.max(0, messagesDelta), messagesDelta);
    return level;
  },
  rank: (guildId, userId) => {
    const me = levels.get(guildId, userId);
    return db.prepare('SELECT COUNT(*) c FROM levels WHERE guild_id = ? AND xp > ?').get(guildId, me.xp).c + 1;
  },
  top: (guildId, limit = 10, offset = 0) =>
    db.prepare('SELECT * FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ? OFFSET ?').all(guildId, limit, offset),
  count: (guildId) => db.prepare('SELECT COUNT(*) c FROM levels WHERE guild_id = ?').get(guildId).c,
  reset: (guildId, userId) =>
    userId
      ? db.prepare('DELETE FROM levels WHERE guild_id = ? AND user_id = ?').run(guildId, userId).changes
      : db.prepare('DELETE FROM levels WHERE guild_id = ?').run(guildId).changes,
};

// ---------------------------------------------------------------- custom commands
const customCommands = {
  list: (guildId) => db.prepare('SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY trigger').all(guildId),
  get: (guildId, trigger) =>
    db.prepare('SELECT * FROM custom_commands WHERE guild_id = ? AND trigger = ?').get(guildId, trigger.toLowerCase()),
  upsert: (guildId, trigger, response, embed, deleteTrigger) =>
    db.prepare(`INSERT INTO custom_commands (guild_id, trigger, response, embed, delete_trigger) VALUES (?,?,?,?,?)
      ON CONFLICT(guild_id, trigger) DO UPDATE SET response = excluded.response, embed = excluded.embed, delete_trigger = excluded.delete_trigger`)
      .run(guildId, trigger.toLowerCase(), response, embed ? 1 : 0, deleteTrigger ? 1 : 0),
  remove: (guildId, id) => db.prepare('DELETE FROM custom_commands WHERE guild_id = ? AND id = ?').run(guildId, id).changes,
  used: (id) => db.prepare('UPDATE custom_commands SET uses = uses + 1 WHERE id = ?').run(id),
};

// ---------------------------------------------------------------- role panels
const rolePanels = {
  list: (guildId) =>
    db.prepare('SELECT * FROM role_panels WHERE guild_id = ? ORDER BY id DESC').all(guildId)
      .map((p) => ({ ...p, roles: JSON.parse(p.roles) })),
  get: (guildId, id) => {
    const p = db.prepare('SELECT * FROM role_panels WHERE guild_id = ? AND id = ?').get(guildId, id);
    return p ? { ...p, roles: JSON.parse(p.roles) } : null;
  },
  getByMessage: (messageId) => {
    const p = db.prepare('SELECT * FROM role_panels WHERE message_id = ?').get(messageId);
    return p ? { ...p, roles: JSON.parse(p.roles) } : null;
  },
  create: (guildId, channelId, title, description, uniqueMode, roles) =>
    db.prepare('INSERT INTO role_panels (guild_id, channel_id, title, description, unique_mode, roles) VALUES (?,?,?,?,?,?)')
      .run(guildId, channelId, title, description, uniqueMode ? 1 : 0, JSON.stringify(roles)).lastInsertRowid,
  setMessage: (id, messageId) => db.prepare('UPDATE role_panels SET message_id = ? WHERE id = ?').run(messageId, id),
  remove: (guildId, id) => db.prepare('DELETE FROM role_panels WHERE guild_id = ? AND id = ?').run(guildId, id).changes,
};

// ---------------------------------------------------------------- tickets
const tickets = {
  create: (guildId, channelId, userId, number, topic) =>
    db.prepare('INSERT INTO tickets (guild_id, channel_id, user_id, number, topic, created_at) VALUES (?,?,?,?,?,?)')
      .run(guildId, channelId, userId, number, topic, Date.now()).lastInsertRowid,
  byChannel: (channelId) => db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId),
  openByUser: (guildId, userId) =>
    db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'").all(guildId, userId),
  close: (id, closedBy) =>
    db.prepare("UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = ? WHERE id = ?").run(Date.now(), closedBy, id),
  list: (guildId, limit = 100) =>
    db.prepare('SELECT * FROM tickets WHERE guild_id = ? ORDER BY id DESC LIMIT ?').all(guildId, limit),
  openCount: (guildId) => db.prepare("SELECT COUNT(*) c FROM tickets WHERE guild_id = ? AND status = 'open'").get(guildId).c,
};

// ---------------------------------------------------------------- giveaways
const parseGw = (g) => g && { ...g, entrants: JSON.parse(g.entrants), winner_ids: JSON.parse(g.winner_ids) };
const giveaways = {
  create: (guildId, channelId, prize, winners, hostId, endsAt) =>
    db.prepare('INSERT INTO giveaways (guild_id, channel_id, prize, winners, host_id, ends_at) VALUES (?,?,?,?,?,?)')
      .run(guildId, channelId, prize, winners, hostId, endsAt).lastInsertRowid,
  setMessage: (id, messageId) => db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(messageId, id),
  get: (id) => parseGw(db.prepare('SELECT * FROM giveaways WHERE id = ?').get(id)),
  byMessage: (messageId) => parseGw(db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(messageId)),
  setEntrants: (id, entrants) => db.prepare('UPDATE giveaways SET entrants = ? WHERE id = ?').run(JSON.stringify(entrants), id),
  finish: (id, winnerIds) =>
    db.prepare('UPDATE giveaways SET ended = 1, winner_ids = ? WHERE id = ?').run(JSON.stringify(winnerIds), id),
  due: () => db.prepare('SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= ?').all(Date.now()).map(parseGw),
  list: (guildId, limit = 50) =>
    db.prepare('SELECT * FROM giveaways WHERE guild_id = ? ORDER BY id DESC LIMIT ?').all(guildId, limit).map(parseGw),
  remove: (guildId, id) => db.prepare('DELETE FROM giveaways WHERE guild_id = ? AND id = ?').run(guildId, id).changes,
};

// ---------------------------------------------------------------- stats
const today = () => new Date().toISOString().slice(0, 10);
const stats = {
  bump: (guildId, field, n = 1) => {
    if (!['messages', 'joins', 'leaves', 'commands'].includes(field)) return;
    db.prepare(`INSERT INTO stats (guild_id, day, ${field}) VALUES (?,?,?)
      ON CONFLICT(guild_id, day) DO UPDATE SET ${field} = ${field} + excluded.${field}`).run(guildId, today(), n);
  },
  range: (guildId, days = 14) => {
    const rows = db.prepare('SELECT * FROM stats WHERE guild_id = ? AND day >= ? ORDER BY day')
      .all(guildId, new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10));
    const map = new Map(rows.map((r) => [r.day, r]));
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      out.push(map.get(day) || { day, messages: 0, joins: 0, leaves: 0, commands: 0 });
    }
    return out;
  },
};

module.exports = {
  db,
  DEFAULTS,
  getSettings,
  saveSettings,
  updateSettings,
  warnings,
  cases,
  levels,
  xpForLevel,
  levelFromXp,
  totalXpForLevel,
  customCommands,
  rolePanels,
  tickets,
  giveaways,
  stats,
};
