// Runs every bot on the platform inside this process and tracks status + a short log per bot.
const { EventEmitter } = require('events');
const config = require('../config');
const platform = require('../platform');
const { ALL } = require('../modules');
const { createBotClient } = require('./createClient');

const MAIN_ID = 'main';
const instances = new Map(); // id -> { client, status, error, startedAt, logs: [] }
const events = new EventEmitter(); // 'log' (id, entry), 'status' (id)
events.setMaxListeners(1000);

function entry(id) {
  if (!instances.has(id)) instances.set(id, { client: null, status: 'offline', error: null, startedAt: null, logs: [] });
  return instances.get(id);
}

function log(id, level, msg) {
  const e = entry(id);
  e.logs.push({ t: Date.now(), level, msg: String(msg).slice(0, 500) });
  if (e.logs.length > 200) e.logs.shift();
  events.emit('log', id, e.logs[e.logs.length - 1]);
  if (level === 'error') console.error(`[bot:${id}] ${msg}`);
}

function friendlyError(e) {
  const m = e?.message || String(e);
  if (/disallowed intents/i.test(m)) return 'Uključi "Server Members Intent" i "Message Content Intent" u Developer Portalu (Bot tab), pa pokreni ponovo.';
  if (/invalid token|TokenInvalid|401/i.test(m)) return 'Token nije ispravan ili je resetiran. Unesi novi token u postavkama bota.';
  return m;
}

function recordFor(id) {
  if (id === MAIN_ID) {
    const modules = platform.kv.get('main.modules', ALL).filter((m) => ALL.includes(m));
    return { id: MAIN_ID, name: config.brand, owner_id: config.ownerIds[0] || null, application_id: config.clientId, template: 'allinone', modules, presence: platform.kv.get('main.presence', {}), autostart: 1, official: true };
  }
  return platform.bots.get(id);
}

async function start(id) {
  const rec = recordFor(id);
  if (!rec) throw new Error('Bot ne postoji');
  const e = entry(id);
  if (e.client) await stop(id);
  if (id !== MAIN_ID && platform.bots.get(id)?.suspended) throw new Error('Bot je pauziran (pretplata nije aktivna). Obnovi pretplatu da ga ponovo pokreneš.');
  const token = id === MAIN_ID ? config.token : platform.bots.token(id);
  e.status = 'starting'; e.error = null;
  log(id, 'info', 'Pokretanje…');
  const client = createBotClient({
    id, token, modules: rec.modules, presence: rec.presence,
    devGuildId: id === MAIN_ID ? config.devGuildId : null,
    onLog: (level, msg) => log(id, level, msg),
  });
  e.client = client;
  client.once('clientReady', () => { e.status = 'online'; e.startedAt = Date.now(); events.emit('status', id); });
  client.on('shardDisconnect', () => { e.status = 'reconnecting'; events.emit('status', id); });
  client.on('shardResume', () => { e.status = 'online'; events.emit('status', id); });
  client.on('guildCreate', () => events.emit('status', id));
  client.on('guildDelete', () => events.emit('status', id));
  client.on('error', (err) => log(id, 'error', err.message));
  try {
    await client.login(token);
  } catch (err) {
    e.status = 'error'; e.error = friendlyError(err); e.client = null; events.emit('status', id);
    log(id, 'error', e.error);
    await client.shutdown().catch(() => {});
    throw new Error(e.error);
  }
  return client;
}

async function stop(id) {
  const e = entry(id);
  if (e.client) { await e.client.shutdown().catch(() => {}); log(id, 'info', 'Zaustavljen'); }
  e.client = null; e.status = 'offline'; e.startedAt = null;
  events.emit('status', id);
}

async function restart(id) { await stop(id); return start(id); }

async function setModules(id, modules) {
  if (id === MAIN_ID) platform.kv.set('main.modules', modules); else platform.bots.setModules(id, modules);
  const c = entry(id).client;
  if (c?.isReady()) {
    c.setModules(modules);
    const n = await c.registerCommands();
    log(id, 'info', `Moduli ažurirani (${modules.length}), ${n} komandi registrirano`);
  }
}

function setPresence(id, presence) {
  if (id === MAIN_ID) platform.kv.set('main.presence', presence); else platform.bots.setPresence(id, presence);
  const c = entry(id).client;
  if (c?.isReady()) { c.presenceConfig = presence; c.applyPresence(); }
}

function info(id) {
  const e = entry(id);
  const c = e.client;
  const ready = c?.isReady();
  const suspended = id !== MAIN_ID && Boolean(platform.bots.get(id)?.suspended);
  return {
    suspended, status: suspended && e.status !== 'online' ? 'suspended' : e.status, error: e.error, startedAt: e.startedAt,
    uptime: e.startedAt ? Date.now() - e.startedAt : 0,
    guilds: ready ? c.guilds.cache.size : 0,
    members: ready ? c.guilds.cache.reduce((a, g) => a + g.memberCount, 0) : 0,
    ping: ready && Number.isFinite(c.ws.ping) && c.ws.ping >= 0 ? c.ws.ping : null,
    tag: ready ? c.user.tag : null,
    avatar: ready ? c.user.displayAvatarURL({ size: 128 }) : null,
    commands: c?.commands?.size || 0,
  };
}

const client = (id) => entry(id).client;
const logs = (id) => entry(id).logs;
const mainClient = () => client(MAIN_ID);

// uptime history for the public status page (one sample per 15 min, last 24h)
function sampleStatus() {
  const ids = [MAIN_ID, ...platform.bots.all().map((b) => b.id)];
  const online = ids.filter((id) => entry(id).status === 'online').length;
  const expected = [MAIN_ID, ...platform.bots.autostart().map((b) => b.id)].length;
  const samples = platform.kv.get('status.samples', []);
  samples.push({ t: Date.now(), online, expected, main: entry(MAIN_ID).status === 'online' });
  platform.kv.set('status.samples', samples.slice(-96));
}
const statusSamples = () => platform.kv.get('status.samples', []);

async function startAll() {
  setTimeout(sampleStatus, 60_000).unref?.();
  setInterval(sampleStatus, 15 * 60_000).unref?.();
  await start(MAIN_ID).catch((e) => console.error('[manager] Glavni bot se nije pokrenuo:', e.message));
  for (const b of platform.bots.autostart()) {
    await start(b.id).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500)); // be gentle with the gateway
  }
}

// Entitlement enforcement: keep the oldest `maxBots` running, suspend (stop) the rest.
// Used by billing on refund/chargeback/cancellation and on upgrade to restore.
async function enforcePlan(userId) {
  const plan = platform.users.plan(userId);
  const list = platform.bots.byOwner(userId).sort((a, b) => a.created_at - b.created_at);
  const out = { suspended: [], restored: [], max: plan.maxBots };
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const over = i >= plan.maxBots;
    if (over && !b.suspended) {
      platform.bots.setSuspended(b.id, true);
      await stop(b.id);
      events.emit('status', b.id);
      out.suspended.push(b.id);
    } else if (!over && b.suspended) {
      platform.bots.setSuspended(b.id, false);
      events.emit('status', b.id);
      if (b.autostart) await start(b.id).catch(() => {});
      out.restored.push(b.id);
    }
  }
  return out;
}

async function remove(id) {
  await stop(id);
  instances.delete(id);
}

async function stopAll() { await Promise.all([...instances.keys()].map(stop)); }

module.exports = { events, statusSamples, enforcePlan, MAIN_ID, start, stop, restart, setModules, setPresence, info, client, logs, mainClient, startAll, stopAll, remove, recordFor };
