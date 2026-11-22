const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const manager = require('../bot/manager');
const platform = require('../platform');
const { safeEqual, snowflake } = require('../security');

const bool = (v) => v === 'on' || v === 'true' || v === '1';
const arr = (v) => (v === undefined || v === '' ? [] : Array.isArray(v) ? v.filter(Boolean) : [v]);
const list = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const num = (v, min, max, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const lines = (v) => str(v, 20000).split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
const ACTIONS = ['delete', 'warn', 'timeout'];
const action = (v, def = 'delete') => (ACTIONS.includes(v) ? v : def);

const isAdmin = (user) => Boolean(user && config.ownerIds.includes(user.id));

function inviteUrl(applicationId, guildId) {
  const p = new URLSearchParams({ client_id: applicationId, permissions: '8', scope: 'bot applications.commands' });
  if (guildId) { p.set('guild_id', guildId); p.set('disable_guild_select', 'true'); }
  return `https://discord.com/oauth2/authorize?${p}`;
}

function flash(req, type, msg) { req.session.flash = { type, msg }; }

function requireAuth(req, res, next) {
  if (!req.session.user) { req.session.returnTo = req.originalUrl; return res.redirect('/login'); }
  const u = platform.users.get(req.session.user.id);
  if (u?.banned) { req.session.destroy(() => {}); return res.status(403).render('error', { title: 'Račun blokiran', message: 'Tvoj račun je blokiran na ovoj platformi.' }); }
  next();
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req.session.user)) return res.status(403).render('error', { title: 'Nemaš pristup', message: 'Samo administratori platforme.' });
  next();
}
const ALLOWED_ORIGIN = new URL(config.dashboardUrl).origin;
function checkCsrf(req, res, next) {
  // 1) same-origin check (browsers always send Origin on cross-site POSTs), 2) synchronizer token
  const origin = req.get('origin');
  if (origin && origin !== ALLOWED_ORIGIN && origin !== `${req.protocol}://${req.get('host')}`) {
    return res.status(403).render('error', { title: 'Zahtjev odbijen', message: 'Zahtjev nije došao s ove stranice.' });
  }
  if (!safeEqual(req.body?._csrf, req.session.csrf)) return res.status(403).render('error', { title: 'Sesija je istekla', message: 'Osvježi stranicu i pokušaj ponovo.' });
  next();
}
function audit(req, action, target = null, meta = null) {
  platform.audit.log(req.session.user?.id || null, action, target, req.ip, meta);
}

/** Loads bot record + live info. `manage` = user may change modules/settings/token. */
function loadBot(req, res, next) {
  const rec = manager.recordFor(req.params.botId);
  if (!rec) return res.status(404).render('error', { title: 'Bot ne postoji', message: 'Taj bot ne postoji ili je obrisan.' });
  const user = req.session.user;
  const owner = rec.owner_id === user.id;
  if (!rec.official && !owner && !isAdmin(user)) return res.status(403).render('error', { title: 'Nemaš pristup', message: 'Ovo nije tvoj bot.' });
  req.botRec = rec;
  req.botManage = owner || isAdmin(user);
  res.locals.botRec = rec;
  res.locals.botInfo = manager.info(rec.id);
  res.locals.botManage = req.botManage;
  res.locals.botInvite = inviteUrl(rec.application_id);
  next();
}
function requireBotManage(req, res, next) {
  if (!req.botManage) return res.status(403).render('error', { title: 'Nemaš pristup', message: 'Samo vlasnik bota može mijenjati ove postavke.' });
  next();
}

async function loadGuild(req, res, next) {
  const client = manager.client(req.botRec.id);
  if (!client?.isReady()) return res.status(503).render('error', { title: 'Bot nije online', message: 'Pokreni bota da bi upravljao serverima.' });
  const guild = client.guilds.cache.get(req.params.guildId);
  if (!snowflake(req.params.guildId)) return res.status(404).render('error', { title: '404', message: 'Server ne postoji.' });
  if (!guild) return res.redirect(inviteUrl(req.botRec.application_id, req.params.guildId));
  const uid = req.session.user.id;
  let allowed = req.botManage || guild.ownerId === uid;
  if (!allowed) {
    const member = await guild.members.fetch(uid).catch(() => null);
    allowed = Boolean(member?.permissions.has(PermissionFlagsBits.ManageGuild));
  }
  if (!allowed) return res.status(403).render('error', { title: 'Nemaš pristup', message: 'Treba ti dozvola "Manage Server" na tom serveru.' });
  req.client = client;
  req.db = client.db;
  req.guild = guild;
  res.locals.guild = guild;
  res.locals.base = `/bots/${req.botRec.id}/g/${guild.id}`;
  res.locals.modules = client.modules;
  res.locals.settings = client.db.getSettings(guild.id);
  res.locals.channels = guild.channels.cache.filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, name: c.name, parent: c.parent?.name || '' }));
  res.locals.voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice)
    .sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, name: c.name, parent: c.parent?.name || '' }));
  res.locals.categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, name: c.name }));
  const myTop = guild.members.me.roles.highest.position;
  res.locals.roles = guild.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, managed: r.managed, assignable: !r.managed && r.position < myTop }));
  res.locals.userName = (id) => guild.members.cache.get(id)?.user.username || client.users.cache.get(id)?.username || id;
  res.locals.userAvatar = (id) => guild.members.cache.get(id)?.user.displayAvatarURL({ size: 64 }) || client.users.cache.get(id)?.displayAvatarURL({ size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
  next();
}

async function discordApi(path, token, type = 'Bearer') {
  const r = await fetch(`https://discord.com/api/v10${path}`, { headers: { Authorization: `${type} ${token}` } });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

module.exports = { audit, snowflake, bool, arr, list, num, str, lines, action, isAdmin, inviteUrl, flash, requireAuth, requireAdmin, checkCsrf, loadBot, requireBotManage, loadGuild, discordApi };
