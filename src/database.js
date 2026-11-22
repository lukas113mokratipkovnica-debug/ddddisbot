// Per-bot storage. Every bot on the platform gets its own SQLite file (data/bots/<id>.db),
// so two bots on the same server never share settings, XP or money.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const botsDir = path.join(__dirname, '..', 'data', 'bots');
fs.mkdirSync(botsDir, { recursive: true });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS guild_settings (guild_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS warnings (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, mod_id TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_warn_guild_user ON warnings(guild_id, user_id);
CREATE TABLE IF NOT EXISTS mod_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, type TEXT NOT NULL, user_id TEXT NOT NULL, mod_id TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cases_guild ON mod_cases(guild_id);
CREATE TABLE IF NOT EXISTS levels (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 0, messages INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (guild_id, user_id));
CREATE TABLE IF NOT EXISTS custom_commands (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, trigger TEXT NOT NULL, response TEXT NOT NULL, embed INTEGER NOT NULL DEFAULT 0, delete_trigger INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0, match_type TEXT NOT NULL DEFAULT 'command', reaction TEXT, UNIQUE (guild_id, trigger, match_type));
CREATE TABLE IF NOT EXISTS role_panels (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT, title TEXT NOT NULL, description TEXT, unique_mode INTEGER NOT NULL DEFAULT 0, roles TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, user_id TEXT NOT NULL, number INTEGER NOT NULL, topic TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, closed_at INTEGER, closed_by TEXT);
CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id);
CREATE TABLE IF NOT EXISTS giveaways (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT, prize TEXT NOT NULL, winners INTEGER NOT NULL DEFAULT 1, host_id TEXT NOT NULL, ends_at INTEGER NOT NULL, ended INTEGER NOT NULL DEFAULT 0, entrants TEXT NOT NULL DEFAULT '[]', winner_ids TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS stats (guild_id TEXT NOT NULL, day TEXT NOT NULL, messages INTEGER NOT NULL DEFAULT 0, joins INTEGER NOT NULL DEFAULT 0, leaves INTEGER NOT NULL DEFAULT 0, commands INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (guild_id, day));
CREATE TABLE IF NOT EXISTS starboard (message_id TEXT PRIMARY KEY, star_message_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS economy (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, wallet INTEGER NOT NULL DEFAULT 0, bank INTEGER NOT NULL DEFAULT 0, last_daily INTEGER NOT NULL DEFAULT 0, last_work INTEGER NOT NULL DEFAULT 0, last_rob INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (guild_id, user_id));
CREATE TABLE IF NOT EXISTS inventory (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, item_id TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (guild_id, user_id, item_id));
CREATE TABLE IF NOT EXISTS counting (guild_id TEXT PRIMARY KEY, current INTEGER NOT NULL DEFAULT 0, last_user TEXT, high_score INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS birthdays (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, day INTEGER NOT NULL, month INTEGER NOT NULL, PRIMARY KEY (guild_id, user_id));
CREATE TABLE IF NOT EXISTS birthday_announced (guild_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY (guild_id, date));
CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, channel_id TEXT, user_id TEXT NOT NULL, text TEXT NOT NULL, due_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS afk (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT, since INTEGER NOT NULL, PRIMARY KEY (guild_id, user_id));
CREATE TABLE IF NOT EXISTS sticky (channel_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, content TEXT NOT NULL, last_message_id TEXT);
CREATE TABLE IF NOT EXISTS temp_voice (channel_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, owner_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invites (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, joins INTEGER NOT NULL DEFAULT 0, leaves INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (guild_id, user_id));
CREATE TABLE IF NOT EXISTS invited_by (guild_id TEXT NOT NULL, member_id TEXT NOT NULL, inviter_id TEXT, code TEXT, PRIMARY KEY (guild_id, member_id));
CREATE TABLE IF NOT EXISTS feed_state (feed_id TEXT PRIMARY KEY, last_id TEXT);
CREATE TABLE IF NOT EXISTS confessions (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL);
`;

const DEFAULTS = {
  language: 'hr',
  prefix: '!',
  modRole: '',
  disabledCommands: [],
  welcome: { enabled: false, channel: '', message: 'Dobrodošao/la {user} na **{server}**! Sada nas je {membercount}. 🎉', embed: true, dm: false, dmMessage: 'Hej {username}, dobrodošao/la na {server}!' },
  goodbye: { enabled: false, channel: '', message: '**{username}** je napustio/la server. Ostalo nas je {membercount}.', embed: true },
  autorole: { enabled: false, roles: [], botRoles: [] },
  logs: { enabled: false, channel: '', messageDelete: true, messageEdit: true, memberJoin: true, memberLeave: true, memberUpdate: true, modActions: true, voice: false, channels: false },
  automod: {
    enabled: false, ignoredChannels: [], ignoredRoles: [], timeoutMinutes: 10,
    badWords: { enabled: false, words: [], action: 'delete' },
    invites: { enabled: false, action: 'delete' },
    links: { enabled: false, whitelist: ['youtube.com', 'youtu.be', 'tenor.com'], action: 'delete' },
    mentions: { enabled: false, limit: 5, action: 'timeout' },
    caps: { enabled: false, percent: 70, minLength: 10, action: 'delete' },
    spam: { enabled: false, messages: 5, seconds: 5, action: 'timeout' },
    warnThreshold: { enabled: false, count: 3, action: 'timeout', minutes: 60 },
  },
  leveling: { enabled: true, xpMin: 15, xpMax: 25, cooldown: 60, announce: 'current', channel: '', message: 'GG {user}, dostigao/la si **level {level}**! 🚀', rewards: [], stackRewards: true, noXpChannels: [], noXpRoles: [], multiplier: 1 },
  tickets: { enabled: false, category: '', supportRoles: [], logChannel: '', panelTitle: '🎫 Podrška', panelDescription: 'Klikni na dugme ispod da otvoriš tiket. Tim će ti odgovoriti što prije.', welcomeMessage: 'Pozdrav {user}! Opiši svoj problem, a tim će ti uskoro odgovoriti.', maxOpen: 1, counter: 0 },
  suggestions: { enabled: false, channel: '' },
  starboard: { enabled: false, channel: '', emoji: '⭐', threshold: 3 },
  economy: { currency: 'coina', emoji: '🪙', startBalance: 100, dailyAmount: 250, workMin: 50, workMax: 200, workCooldown: 3600, robEnabled: true, robChance: 40, shop: [] },
  verification: { enabled: false, role: '', removeRole: '', captcha: true, title: '✅ Verifikacija', message: 'Klikni na dugme ispod kako bi dobio/la pristup serveru.' },
  tempvoice: { enabled: false, hub: '', category: '', nameTemplate: '🔊 {username}', userLimit: 0 },
  counting: { enabled: false, channel: '', sameUserTwice: false, resetOnFail: true },
  birthdays: { enabled: false, channel: '', role: '', message: '🎂 Sretan rođendan {user}! Cijeli **{server}** ti čestita! 🎉' },
  serverstats: { enabled: false, category: '', members: '', humans: '', bots: '', boosts: '', membersName: '👥 Članovi: {count}', humansName: '🙂 Ljudi: {count}', botsName: '🤖 Botovi: {count}', boostsName: '💎 Boostovi: {count}' },
  invites: { enabled: false, channel: '', message: '{user} je ušao/la. Pozvao/la ga/ju je **{inviter}** ({invites} pozivnica).' },
  notifications: { feeds: [] }, // [{ id, type: 'youtube'|'rss', source, channel, message }]
  confessions: { enabled: false, channel: '', logChannel: '', counter: 0 },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function mergeDefaults(defaults, data) {
  const out = {};
  for (const key of Object.keys(defaults)) {
    if (isObj(defaults[key])) out[key] = mergeDefaults(defaults[key], isObj(data?.[key]) ? data[key] : {});
    else out[key] = data && data[key] !== undefined ? data[key] : structuredClone(defaults[key]);
  }
  return out;
}

function xpForLevel(level) { return 5 * level * level + 50 * level + 100; }
function levelFromXp(xp) {
  let level = 0; let remaining = xp;
  while (remaining >= xpForLevel(level)) { remaining -= xpForLevel(level); level++; }
  return { level, current: remaining, needed: xpForLevel(level) };
}
function totalXpForLevel(level) { let t = 0; for (let i = 0; i < level; i++) t += xpForLevel(i); return t; }

const instances = new Map();

function createDatabase(botId) {
  if (instances.has(botId)) return instances.get(botId);
  const db = new Database(path.join(botsDir, `${botId.replace(/[^a-z0-9_-]/gi, '')}.db`));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const q = (sql) => db.prepare(sql);

  // -------------------------------------------------------------- settings
  const cache = new Map();
  function getSettings(guildId) {
    if (cache.has(guildId)) return cache.get(guildId);
    const row = q('SELECT data FROM guild_settings WHERE guild_id = ?').get(guildId);
    const s = mergeDefaults(DEFAULTS, row ? JSON.parse(row.data) : {});
    cache.set(guildId, s);
    return s;
  }
  const hasSettings = (guildId) => Boolean(q('SELECT 1 FROM guild_settings WHERE guild_id = ?').get(guildId));
  function saveSettings(guildId, settings) {
    const merged = mergeDefaults(DEFAULTS, settings);
    q('INSERT INTO guild_settings (guild_id, data) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data').run(guildId, JSON.stringify(merged));
    cache.set(guildId, merged);
    return merged;
  }
  function updateSettings(guildId, mutator) {
    const s = structuredClone(getSettings(guildId));
    mutator(s);
    return saveSettings(guildId, s);
  }

  const warnings = {
    add: (g, u, m, r) => q('INSERT INTO warnings (guild_id, user_id, mod_id, reason, created_at) VALUES (?,?,?,?,?)').run(g, u, m, r, Date.now()).lastInsertRowid,
    list: (g, u) => q('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY id DESC').all(g, u),
    count: (g, u) => q('SELECT COUNT(*) c FROM warnings WHERE guild_id = ? AND user_id = ?').get(g, u).c,
    all: (g, limit = 200) => q('SELECT * FROM warnings WHERE guild_id = ? ORDER BY id DESC LIMIT ?').all(g, limit),
    remove: (g, id) => q('DELETE FROM warnings WHERE guild_id = ? AND id = ?').run(g, id).changes,
    clear: (g, u) => q('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(g, u).changes,
    total: (g) => q('SELECT COUNT(*) c FROM warnings WHERE guild_id = ?').get(g).c,
  };

  const cases = {
    add: (g, type, u, m, r) => q('INSERT INTO mod_cases (guild_id, type, user_id, mod_id, reason, created_at) VALUES (?,?,?,?,?,?)').run(g, type, u, m, r, Date.now()).lastInsertRowid,
    recent: (g, limit = 100) => q('SELECT * FROM mod_cases WHERE guild_id = ? ORDER BY id DESC LIMIT ?').all(g, limit),
    total: (g) => q('SELECT COUNT(*) c FROM mod_cases WHERE guild_id = ?').get(g).c,
  };

  const levels = {
    get: (g, u) => q('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?').get(g, u) || { guild_id: g, user_id: u, xp: 0, level: 0, messages: 0 },
    set: (g, u, xp, messagesDelta = 0) => {
      const xpSafe = Math.max(0, Math.floor(xp));
      const { level } = levelFromXp(xpSafe);
      q(`INSERT INTO levels (guild_id, user_id, xp, level, messages) VALUES (?,?,?,?,?)
        ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, messages = messages + ?`).run(g, u, xpSafe, level, Math.max(0, messagesDelta), messagesDelta);
      return level;
    },
    rank: (g, u) => q('SELECT COUNT(*) c FROM levels WHERE guild_id = ? AND xp > ?').get(g, levels.get(g, u).xp).c + 1,
    top: (g, limit = 10, offset = 0) => q('SELECT * FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ? OFFSET ?').all(g, limit, offset),
    count: (g) => q('SELECT COUNT(*) c FROM levels WHERE guild_id = ?').get(g).c,
    reset: (g, u) => (u ? q('DELETE FROM levels WHERE guild_id = ? AND user_id = ?').run(g, u).changes : q('DELETE FROM levels WHERE guild_id = ?').run(g).changes),
  };

  const customCommands = {
    list: (g) => q('SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY match_type, trigger').all(g),
    get: (g, trigger) => q("SELECT * FROM custom_commands WHERE guild_id = ? AND trigger = ? AND match_type = 'command'").get(g, trigger.toLowerCase()),
    responders: (g) => q("SELECT * FROM custom_commands WHERE guild_id = ? AND match_type != 'command'").all(g),
    upsert: (g, trigger, response, embed, del, matchType = 'command', reaction = null) => q(`INSERT INTO custom_commands (guild_id, trigger, response, embed, delete_trigger, match_type, reaction) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(guild_id, trigger, match_type) DO UPDATE SET response = excluded.response, embed = excluded.embed, delete_trigger = excluded.delete_trigger, reaction = excluded.reaction`)
      .run(g, trigger.toLowerCase(), response, embed ? 1 : 0, del ? 1 : 0, matchType, reaction),
    remove: (g, id) => q('DELETE FROM custom_commands WHERE guild_id = ? AND id = ?').run(g, id).changes,
    used: (id) => q('UPDATE custom_commands SET uses = uses + 1 WHERE id = ?').run(id),
  };

  const parsePanel = (p) => p && { ...p, roles: JSON.parse(p.roles) };
  const rolePanels = {
    list: (g) => q('SELECT * FROM role_panels WHERE guild_id = ? ORDER BY id DESC').all(g).map(parsePanel),
    get: (g, id) => parsePanel(q('SELECT * FROM role_panels WHERE guild_id = ? AND id = ?').get(g, id)),
    create: (g, ch, title, desc, unique, roles) => q('INSERT INTO role_panels (guild_id, channel_id, title, description, unique_mode, roles) VALUES (?,?,?,?,?,?)').run(g, ch, title, desc, unique ? 1 : 0, JSON.stringify(roles)).lastInsertRowid,
    setMessage: (id, mid) => q('UPDATE role_panels SET message_id = ? WHERE id = ?').run(mid, id),
    remove: (g, id) => q('DELETE FROM role_panels WHERE guild_id = ? AND id = ?').run(g, id).changes,
  };

  const tickets = {
    create: (g, ch, u, n, topic) => q('INSERT INTO tickets (guild_id, channel_id, user_id, number, topic, created_at) VALUES (?,?,?,?,?,?)').run(g, ch, u, n, topic, Date.now()).lastInsertRowid,
    byChannel: (ch) => q('SELECT * FROM tickets WHERE channel_id = ?').get(ch),
    openByUser: (g, u) => q("SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'").all(g, u),
    close: (id, by) => q("UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = ? WHERE id = ?").run(Date.now(), by, id),
    list: (g, limit = 100) => q('SELECT * FROM tickets WHERE guild_id = ? ORDER BY id DESC LIMIT ?').all(g, limit),
    openCount: (g) => q("SELECT COUNT(*) c FROM tickets WHERE guild_id = ? AND status = 'open'").get(g).c,
  };

  const parseGw = (g) => g && { ...g, entrants: JSON.parse(g.entrants), winner_ids: JSON.parse(g.winner_ids) };
  const giveaways = {
    create: (g, ch, prize, winners, host, endsAt) => q('INSERT INTO giveaways (guild_id, channel_id, prize, winners, host_id, ends_at) VALUES (?,?,?,?,?,?)').run(g, ch, prize, winners, host, endsAt).lastInsertRowid,
    setMessage: (id, mid) => q('UPDATE giveaways SET message_id = ? WHERE id = ?').run(mid, id),
    get: (id) => parseGw(q('SELECT * FROM giveaways WHERE id = ?').get(id)),
    setEntrants: (id, e) => q('UPDATE giveaways SET entrants = ? WHERE id = ?').run(JSON.stringify(e), id),
    finish: (id, w) => q('UPDATE giveaways SET ended = 1, winner_ids = ? WHERE id = ?').run(JSON.stringify(w), id),
    due: () => q('SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= ?').all(Date.now()).map(parseGw),
    list: (g, limit = 50) => q('SELECT * FROM giveaways WHERE guild_id = ? ORDER BY id DESC LIMIT ?').all(g, limit).map(parseGw),
    remove: (g, id) => q('DELETE FROM giveaways WHERE guild_id = ? AND id = ?').run(g, id).changes,
  };

  const today = () => new Date().toISOString().slice(0, 10);
  const stats = {
    bump: (g, field, n = 1) => {
      if (!['messages', 'joins', 'leaves', 'commands'].includes(field)) return;
      q(`INSERT INTO stats (guild_id, day, ${field}) VALUES (?,?,?) ON CONFLICT(guild_id, day) DO UPDATE SET ${field} = ${field} + excluded.${field}`).run(g, today(), n);
    },
    range: (g, days = 14) => {
      const rows = q('SELECT * FROM stats WHERE guild_id = ? AND day >= ? ORDER BY day').all(g, new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10));
      const map = new Map(rows.map((r) => [r.day, r]));
      const out = [];
      for (let i = days - 1; i >= 0; i--) {
        const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
        out.push(map.get(day) || { day, messages: 0, joins: 0, leaves: 0, commands: 0 });
      }
      return out;
    },
    totals: () => q('SELECT COALESCE(SUM(messages),0) messages, COALESCE(SUM(commands),0) commands, COALESCE(SUM(joins),0) joins FROM stats WHERE day >= ?').get(new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10)),
  };

  const economy = {
    get: (g, u, start = 0) => {
      let row = q('SELECT * FROM economy WHERE guild_id = ? AND user_id = ?').get(g, u);
      if (!row) {
        q('INSERT INTO economy (guild_id, user_id, wallet) VALUES (?,?,?)').run(g, u, start);
        row = q('SELECT * FROM economy WHERE guild_id = ? AND user_id = ?').get(g, u);
      }
      return row;
    },
    add: (g, u, walletDelta, bankDelta = 0) => q('UPDATE economy SET wallet = MAX(0, wallet + ?), bank = MAX(0, bank + ?) WHERE guild_id = ? AND user_id = ?').run(walletDelta, bankDelta, g, u),
    setField: (g, u, field, value) => {
      if (!['last_daily', 'last_work', 'last_rob', 'wallet', 'bank'].includes(field)) return;
      q(`UPDATE economy SET ${field} = ? WHERE guild_id = ? AND user_id = ?`).run(value, g, u);
    },
    top: (g, limit = 10) => q('SELECT *, wallet + bank total FROM economy WHERE guild_id = ? ORDER BY total DESC LIMIT ?').all(g, limit),
    reset: (g, u) => (u ? q('DELETE FROM economy WHERE guild_id = ? AND user_id = ?').run(g, u).changes : q('DELETE FROM economy WHERE guild_id = ?').run(g).changes),
    count: (g) => q('SELECT COUNT(*) c FROM economy WHERE guild_id = ?').get(g).c,
    inventory: (g, u) => q('SELECT * FROM inventory WHERE guild_id = ? AND user_id = ? AND qty > 0').all(g, u),
    giveItem: (g, u, item, n = 1) => q('INSERT INTO inventory (guild_id, user_id, item_id, qty) VALUES (?,?,?,?) ON CONFLICT(guild_id, user_id, item_id) DO UPDATE SET qty = qty + excluded.qty').run(g, u, item, n),
  };

  const counting = {
    get: (g) => q('SELECT * FROM counting WHERE guild_id = ?').get(g) || { guild_id: g, current: 0, last_user: null, high_score: 0 },
    set: (g, current, lastUser) => q(`INSERT INTO counting (guild_id, current, last_user, high_score) VALUES (?,?,?,?)
      ON CONFLICT(guild_id) DO UPDATE SET current = excluded.current, last_user = excluded.last_user, high_score = MAX(high_score, excluded.current)`).run(g, current, lastUser, current),
  };

  const birthdays = {
    set: (g, u, d, m) => q('INSERT INTO birthdays (guild_id, user_id, day, month) VALUES (?,?,?,?) ON CONFLICT(guild_id, user_id) DO UPDATE SET day = excluded.day, month = excluded.month').run(g, u, d, m),
    remove: (g, u) => q('DELETE FROM birthdays WHERE guild_id = ? AND user_id = ?').run(g, u).changes,
    get: (g, u) => q('SELECT * FROM birthdays WHERE guild_id = ? AND user_id = ?').get(g, u),
    list: (g) => q('SELECT * FROM birthdays WHERE guild_id = ? ORDER BY month, day').all(g),
    on: (d, m) => q('SELECT * FROM birthdays WHERE day = ? AND month = ?').all(d, m),
    all: () => q('SELECT * FROM birthdays').all(),
    announced: (g, date) => Boolean(q('SELECT 1 FROM birthday_announced WHERE guild_id = ? AND date = ?').get(g, date)),
    markAnnounced: (g, date) => q('INSERT OR IGNORE INTO birthday_announced (guild_id, date) VALUES (?,?)').run(g, date),
  };

  const reminders = {
    add: (g, ch, u, text, due) => q('INSERT INTO reminders (guild_id, channel_id, user_id, text, due_at) VALUES (?,?,?,?,?)').run(g, ch, u, text, due).lastInsertRowid,
    byUser: (u) => q('SELECT * FROM reminders WHERE user_id = ? ORDER BY due_at').all(u),
    remove: (u, id) => q('DELETE FROM reminders WHERE user_id = ? AND id = ?').run(u, id).changes,
    due: () => q('SELECT * FROM reminders WHERE due_at <= ?').all(Date.now()),
    done: (id) => q('DELETE FROM reminders WHERE id = ?').run(id),
  };

  const afk = {
    set: (g, u, reason) => q('INSERT OR REPLACE INTO afk (guild_id, user_id, reason, since) VALUES (?,?,?,?)').run(g, u, reason, Date.now()),
    get: (g, u) => q('SELECT * FROM afk WHERE guild_id = ? AND user_id = ?').get(g, u),
    remove: (g, u) => q('DELETE FROM afk WHERE guild_id = ? AND user_id = ?').run(g, u).changes,
  };

  const sticky = {
    set: (ch, g, content) => q('INSERT INTO sticky (channel_id, guild_id, content) VALUES (?,?,?) ON CONFLICT(channel_id) DO UPDATE SET content = excluded.content').run(ch, g, content),
    get: (ch) => q('SELECT * FROM sticky WHERE channel_id = ?').get(ch),
    list: (g) => q('SELECT * FROM sticky WHERE guild_id = ?').all(g),
    setMessage: (ch, mid) => q('UPDATE sticky SET last_message_id = ? WHERE channel_id = ?').run(mid, ch),
    remove: (ch) => q('DELETE FROM sticky WHERE channel_id = ?').run(ch).changes,
  };

  const tempVoice = {
    add: (ch, g, owner) => q('INSERT OR REPLACE INTO temp_voice (channel_id, guild_id, owner_id) VALUES (?,?,?)').run(ch, g, owner),
    get: (ch) => q('SELECT * FROM temp_voice WHERE channel_id = ?').get(ch),
    setOwner: (ch, owner) => q('UPDATE temp_voice SET owner_id = ? WHERE channel_id = ?').run(owner, ch),
    remove: (ch) => q('DELETE FROM temp_voice WHERE channel_id = ?').run(ch),
    all: () => q('SELECT * FROM temp_voice').all(),
  };

  const invites = {
    recordJoin: (g, member, inviter, code) => {
      q('INSERT OR REPLACE INTO invited_by (guild_id, member_id, inviter_id, code) VALUES (?,?,?,?)').run(g, member, inviter, code);
      if (inviter) q('INSERT INTO invites (guild_id, user_id, joins) VALUES (?,?,1) ON CONFLICT(guild_id, user_id) DO UPDATE SET joins = joins + 1').run(g, inviter);
    },
    recordLeave: (g, member) => {
      const row = q('SELECT inviter_id FROM invited_by WHERE guild_id = ? AND member_id = ?').get(g, member);
      if (row?.inviter_id) q('UPDATE invites SET leaves = leaves + 1 WHERE guild_id = ? AND user_id = ?').run(g, row.inviter_id);
      return row?.inviter_id || null;
    },
    get: (g, u) => q('SELECT * FROM invites WHERE guild_id = ? AND user_id = ?').get(g, u) || { joins: 0, leaves: 0 },
    inviterOf: (g, member) => q('SELECT inviter_id FROM invited_by WHERE guild_id = ? AND member_id = ?').get(g, member)?.inviter_id || null,
    top: (g, limit = 10) => q('SELECT *, joins - leaves total FROM invites WHERE guild_id = ? ORDER BY total DESC LIMIT ?').all(g, limit),
  };

  const feeds = {
    last: (id) => q('SELECT last_id FROM feed_state WHERE feed_id = ?').get(id)?.last_id ?? null,
    setLast: (id, last) => q('INSERT OR REPLACE INTO feed_state (feed_id, last_id) VALUES (?,?)').run(id, last),
  };

  const confessions = {
    add: (g, u, content) => q('INSERT INTO confessions (guild_id, user_id, content, created_at) VALUES (?,?,?,?)').run(g, u, content, Date.now()).lastInsertRowid,
    list: (g, limit = 50) => q('SELECT * FROM confessions WHERE guild_id = ? ORDER BY id DESC LIMIT ?').all(g, limit),
  };

  const api = {
    raw: db, getSettings, saveSettings, hasSettings, updateSettings, warnings, cases, levels, customCommands, rolePanels, tickets,
    giveaways, stats, economy, counting, birthdays, reminders, afk, sticky, tempVoice, invites, feeds, confessions,
    close: () => { db.close(); instances.delete(botId); },
  };
  instances.set(botId, api);
  return api;
}

function deleteDatabase(botId) {
  instances.get(botId)?.close();
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(path.join(botsDir, `${botId}.db${suffix}`), { force: true });
}

module.exports = { createDatabase, deleteDatabase, DEFAULTS, xpForLevel, levelFromXp, totalXpForLevel };
