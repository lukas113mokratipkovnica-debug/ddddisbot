const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../config');
const db = require('../database');
const SqliteStore = require('./sessionStore');
const tickets = require('../bot/systems/tickets');
const giveaways = require('../bot/systems/giveaways');
const rolePanels = require('../bot/systems/rolePanels');
const { parseDuration } = require('../bot/utils');

const API = 'https://discord.com/api/v10';
const REDIRECT = `${config.dashboardUrl}/callback`;
const MANAGE_GUILD = 0x20n;
const ADMIN = 0x8n;

// ------------------------------------------------------------------ form helpers
const bool = (v) => v === 'on' || v === 'true' || v === '1';
const arr = (v) => (v === undefined || v === '' ? [] : Array.isArray(v) ? v.filter(Boolean) : [v]);
const num = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const lines = (v) => str(v, 20000).split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
const ACTIONS = ['delete', 'warn', 'timeout'];
const action = (v, def = 'delete') => (ACTIONS.includes(v) ? v : def);

function startDashboard(client) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(session({
    store: new SqliteStore(),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 864e5,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.dashboardUrl.startsWith('https://'),
    },
  }));

  app.use((req, res, next) => {
    req.session.csrf ||= crypto.randomBytes(24).toString('hex');
    res.locals.user = req.session.user || null;
    res.locals.csrf = req.session.csrf;
    res.locals.bot = client.user;
    res.locals.flash = req.session.flash || null;
    res.locals.inviteUrl = inviteUrl();
    res.locals.path = req.path;
    delete req.session.flash;
    next();
  });

  const flash = (req, type, msg) => { req.session.flash = { type, msg }; };

  function inviteUrl(guildId) {
    const p = new URLSearchParams({ client_id: config.clientId, permissions: '8', scope: 'bot applications.commands' });
    if (guildId) { p.set('guild_id', guildId); p.set('disable_guild_select', 'true'); }
    return `https://discord.com/oauth2/authorize?${p}`;
  }

  function requireAuth(req, res, next) {
    if (!req.session.user) { req.session.returnTo = req.originalUrl; return res.redirect('/login'); }
    next();
  }

  function checkCsrf(req, res, next) {
    if (req.body?._csrf !== req.session.csrf) return res.status(403).send('Neispravan CSRF token. Osvježi stranicu.');
    next();
  }

  async function requireGuild(req, res, next) {
    const guild = client.guilds.cache.get(req.params.id);
    if (!guild) return res.redirect(inviteUrl(req.params.id));
    const uid = req.session.user.id;
    let allowed = config.ownerIds.includes(uid) || guild.ownerId === uid;
    if (!allowed) {
      const member = await guild.members.fetch(uid).catch(() => null);
      allowed = Boolean(member?.permissions.has(PermissionFlagsBits.ManageGuild));
    }
    if (!allowed) return res.status(403).render('error', { title: 'Nemaš pristup', message: 'Treba ti dozvola "Manage Server" na tom serveru.' });
    req.guild = guild;
    res.locals.guild = guild;
    res.locals.settings = db.getSettings(guild.id);
    res.locals.channels = guild.channels.cache
      .filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type))
      .sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, name: c.name, parent: c.parent?.name || '' }));
    res.locals.categories = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, name: c.name }));
    const myTop = guild.members.me.roles.highest.position;
    res.locals.roles = guild.roles.cache.filter((r) => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, managed: r.managed, assignable: !r.managed && r.position < myTop }));
    next();
  }

  const saveFlash = (req) => flash(req, 'success', 'Postavke spremljene ✅');

  // ------------------------------------------------------------------ public & auth
  app.get('/', (req, res) => res.render('index', { title: 'Početna', guildCount: client.guilds.cache.size, userCount: client.guilds.cache.reduce((a, g) => a + g.memberCount, 0), commandCount: client.commands.size }));

  app.get('/login', (req, res) => {
    req.session.oauthState = crypto.randomBytes(16).toString('hex');
    const p = new URLSearchParams({
      client_id: config.clientId, redirect_uri: REDIRECT, response_type: 'code', scope: 'identify guilds', state: req.session.oauthState, prompt: 'none',
    });
    res.redirect(`https://discord.com/oauth2/authorize?${p}`);
  });

  app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state || state !== req.session.oauthState) return res.redirect('/');
    delete req.session.oauthState;
    try {
      const tokenRes = await fetch(`${API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'authorization_code', code, redirect_uri: REDIRECT,
        }),
      });
      const token = await tokenRes.json();
      if (!token.access_token) throw new Error(token.error_description || 'OAuth greška');
      const headers = { Authorization: `Bearer ${token.access_token}` };
      const [user, guilds] = await Promise.all([
        fetch(`${API}/users/@me`, { headers }).then((r) => r.json()),
        fetch(`${API}/users/@me/guilds`, { headers }).then((r) => r.json()),
      ]);
      const manageable = (Array.isArray(guilds) ? guilds : []).filter((g) => g.owner || (BigInt(g.permissions) & (MANAGE_GUILD | ADMIN)) !== 0n)
        .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
      const returnTo = req.session.returnTo || '/dashboard';
      req.session.regenerate((err) => {
        if (err) return res.redirect('/');
        req.session.user = {
          id: user.id, username: user.global_name || user.username,
          avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : 'https://cdn.discordapp.com/embed/avatars/0.png',
        };
        req.session.guilds = manageable;
        res.redirect(returnTo);
      });
    } catch (e) {
      console.error('[dashboard] login error', e);
      res.status(500).render('error', { title: 'Greška pri prijavi', message: e.message });
    }
  });

  app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

  // ------------------------------------------------------------------ server list
  app.get('/dashboard', requireAuth, (req, res) => {
    let list = req.session.guilds || [];
    if (config.ownerIds.includes(req.session.user.id)) {
      const ids = new Set(list.map((g) => g.id));
      list = list.concat(client.guilds.cache.filter((g) => !ids.has(g.id)).map((g) => ({ id: g.id, name: g.name, icon: g.icon })));
    }
    const servers = list.map((g) => ({
      ...g,
      iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
      hasBot: client.guilds.cache.has(g.id),
      invite: inviteUrl(g.id),
    })).sort((a, b) => Number(b.hasBot) - Number(a.hasBot) || a.name.localeCompare(b.name));
    res.render('servers', { title: 'Serveri', servers });
  });

  // ------------------------------------------------------------------ guild pages
  const PAGES = ['overview', 'general', 'welcome', 'logs', 'automod', 'leveling', 'commands', 'roles', 'tickets', 'giveaways', 'moderation', 'messages', 'starboard'];

  app.get('/dashboard/:id', requireAuth, requireGuild, (req, res) => renderPage(req, res, 'overview'));
  app.get('/dashboard/:id/:page', requireAuth, requireGuild, (req, res) => {
    if (!PAGES.includes(req.params.page)) return res.status(404).render('error', { title: '404', message: 'Stranica ne postoji.' });
    renderPage(req, res, req.params.page);
  });

  function renderPage(req, res, page) {
    const g = req.guild;
    const data = { title: g.name, page };
    if (page === 'overview') {
      data.stats = db.stats.range(g.id, 14);
      data.counts = {
        members: g.memberCount,
        channels: g.channels.cache.size,
        roles: g.roles.cache.size,
        warnings: db.warnings.total(g.id),
        cases: db.cases.total(g.id),
        openTickets: db.tickets.openCount(g.id),
        ranked: db.levels.count(g.id),
        customCommands: db.customCommands.list(g.id).length,
      };
      data.recentCases = db.cases.recent(g.id, 8);
      data.top = db.levels.top(g.id, 5);
    }
    if (page === 'general') data.commands = client.commands.map((c) => ({ name: c.data.name, description: c.data.description, category: c.category }));
    if (page === 'leveling') {
      const page2 = Math.max(0, Number(req.query.p || 1) - 1);
      data.leaderboard = db.levels.top(g.id, 50, page2 * 50).map((r) => ({ ...r, ...db.levelFromXp(r.xp) }));
      data.lbPage = page2 + 1;
      data.lbPages = Math.max(1, Math.ceil(db.levels.count(g.id) / 50));
    }
    if (page === 'commands') data.customCommands = db.customCommands.list(g.id);
    if (page === 'roles') data.panels = db.rolePanels.list(g.id);
    if (page === 'tickets') data.ticketList = db.tickets.list(g.id, 50);
    if (page === 'giveaways') data.giveawayList = db.giveaways.list(g.id, 50);
    if (page === 'moderation') {
      data.warningList = db.warnings.all(g.id, 200);
      data.caseList = db.cases.recent(g.id, 100);
    }
    data.userName = (id) => {
      const m = g.members.cache.get(id);
      return m ? m.user.username : client.users.cache.get(id)?.username || id;
    };
    data.userAvatar = (id) => g.members.cache.get(id)?.user.displayAvatarURL({ size: 64 }) || client.users.cache.get(id)?.displayAvatarURL({ size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    res.render(`guild/${page}`, data);
  }

  // ------------------------------------------------------------------ settings save
  const SECTION_PARSERS = {
    general: (b, s) => {
      s.prefix = str(b.prefix, 5).trim() || '!';
      s.modRole = str(b.modRole, 30);
      s.disabledCommands = arr(b.disabledCommands);
      s.suggestions.enabled = bool(b.suggestionsEnabled);
      s.suggestions.channel = str(b.suggestionsChannel, 30);
    },
    welcome: (b, s) => {
      s.welcome = {
        enabled: bool(b.welcomeEnabled), channel: str(b.welcomeChannel, 30), message: str(b.welcomeMessage, 2000),
        embed: bool(b.welcomeEmbed), dm: bool(b.welcomeDm), dmMessage: str(b.welcomeDmMessage, 2000),
      };
      s.goodbye = { enabled: bool(b.goodbyeEnabled), channel: str(b.goodbyeChannel, 30), message: str(b.goodbyeMessage, 2000), embed: bool(b.goodbyeEmbed) };
      s.autorole = { enabled: bool(b.autoroleEnabled), roles: arr(b.autoroleRoles), botRoles: arr(b.autoroleBotRoles) };
    },
    logs: (b, s) => {
      s.logs = {
        enabled: bool(b.enabled), channel: str(b.channel, 30),
        messageDelete: bool(b.messageDelete), messageEdit: bool(b.messageEdit), memberJoin: bool(b.memberJoin),
        memberLeave: bool(b.memberLeave), memberUpdate: bool(b.memberUpdate), modActions: bool(b.modActions),
        voice: bool(b.voice), channels: bool(b.channels),
      };
    },
    automod: (b, s) => {
      s.automod = {
        enabled: bool(b.enabled),
        ignoredChannels: arr(b.ignoredChannels),
        ignoredRoles: arr(b.ignoredRoles),
        timeoutMinutes: num(b.timeoutMinutes, 1, 40320, 10),
        badWords: { enabled: bool(b.badWordsEnabled), words: lines(b.badWords), action: action(b.badWordsAction) },
        invites: { enabled: bool(b.invitesEnabled), action: action(b.invitesAction) },
        links: { enabled: bool(b.linksEnabled), whitelist: lines(b.linksWhitelist), action: action(b.linksAction) },
        mentions: { enabled: bool(b.mentionsEnabled), limit: num(b.mentionsLimit, 2, 50, 5), action: action(b.mentionsAction, 'timeout') },
        caps: { enabled: bool(b.capsEnabled), percent: num(b.capsPercent, 30, 100, 70), minLength: num(b.capsMin, 5, 200, 10), action: action(b.capsAction) },
        spam: { enabled: bool(b.spamEnabled), messages: num(b.spamMessages, 2, 30, 5), seconds: num(b.spamSeconds, 1, 60, 5), action: action(b.spamAction, 'timeout') },
        warnThreshold: {
          enabled: bool(b.thresholdEnabled), count: num(b.thresholdCount, 1, 50, 3),
          action: ['timeout', 'kick', 'ban'].includes(b.thresholdAction) ? b.thresholdAction : 'timeout',
          minutes: num(b.thresholdMinutes, 1, 40320, 60),
        },
      };
    },
    leveling: (b, s) => {
      const rewards = [];
      const lvRaw = Array.isArray(b.rewardLevel) ? b.rewardLevel : b.rewardLevel !== undefined ? [b.rewardLevel] : [];
      const rlRaw = Array.isArray(b.rewardRole) ? b.rewardRole : b.rewardRole !== undefined ? [b.rewardRole] : [];
      for (let k = 0; k < lvRaw.length; k++) {
        const lv = Number(lvRaw[k]);
        if (rlRaw[k] && Number.isInteger(lv) && lv > 0) rewards.push({ level: lv, role: rlRaw[k] });
      }
      const xpMin = num(b.xpMin, 1, 1000, 15);
      s.leveling = {
        enabled: bool(b.enabled), xpMin, xpMax: Math.max(xpMin, num(b.xpMax, 1, 1000, 25)),
        cooldown: num(b.cooldown, 0, 3600, 60), announce: ['current', 'channel', 'dm', 'off'].includes(b.announce) ? b.announce : 'current',
        channel: str(b.channel, 30), message: str(b.message, 1000) || DEFAULT_LV_MSG,
        rewards: rewards.sort((x, y) => x.level - y.level), stackRewards: bool(b.stackRewards),
        noXpChannels: arr(b.noXpChannels), noXpRoles: arr(b.noXpRoles), multiplier: num(b.multiplier, 0.1, 10, 1),
      };
    },
    tickets: (b, s) => {
      s.tickets = {
        ...s.tickets,
        enabled: bool(b.enabled), category: str(b.category, 30), supportRoles: arr(b.supportRoles), logChannel: str(b.logChannel, 30),
        panelTitle: str(b.panelTitle, 256) || '🎫 Podrška', panelDescription: str(b.panelDescription, 4000),
        welcomeMessage: str(b.welcomeMessage, 2000), maxOpen: num(b.maxOpen, 1, 10, 1),
      };
    },
    starboard: (b, s) => {
      s.starboard = { enabled: bool(b.enabled), channel: str(b.channel, 30), emoji: str(b.emoji, 64).trim() || '⭐', threshold: num(b.threshold, 1, 100, 3) };
    },
  };
  const DEFAULT_LV_MSG = db.DEFAULTS.leveling.message;

  app.post('/dashboard/:id/save/:section', requireAuth, checkCsrf, requireGuild, (req, res) => {
    const parser = SECTION_PARSERS[req.params.section];
    if (!parser) return res.status(400).send('Nepoznata sekcija');
    db.updateSettings(req.guild.id, (s) => parser(req.body, s));
    saveFlash(req);
    res.redirect(`/dashboard/${req.guild.id}/${req.params.section}`);
  });

  // ------------------------------------------------------------------ custom commands
  app.post('/dashboard/:id/commands/add', requireAuth, checkCsrf, requireGuild, (req, res) => {
    const trigger = str(req.body.trigger, 32).trim().toLowerCase().replace(/\s+/g, '-');
    const response = str(req.body.response, 2000);
    if (!trigger || !response) flash(req, 'error', 'Okidač i odgovor su obavezni.');
    else { db.customCommands.upsert(req.guild.id, trigger, response, bool(req.body.embed), bool(req.body.deleteTrigger)); flash(req, 'success', `Komanda "${trigger}" spremljena.`); }
    res.redirect(`/dashboard/${req.guild.id}/commands`);
  });
  app.post('/dashboard/:id/commands/:cid/delete', requireAuth, checkCsrf, requireGuild, (req, res) => {
    db.customCommands.remove(req.guild.id, Number(req.params.cid));
    flash(req, 'success', 'Komanda obrisana.');
    res.redirect(`/dashboard/${req.guild.id}/commands`);
  });

  // ------------------------------------------------------------------ role panels
  app.post('/dashboard/:id/roles/create', requireAuth, checkCsrf, requireGuild, async (req, res) => {
    const b = req.body;
    const roleIds = Array.isArray(b.role) ? b.role : [b.role];
    const labels = Array.isArray(b.label) ? b.label : [b.label];
    const emojis = Array.isArray(b.emoji) ? b.emoji : [b.emoji];
    const styles = Array.isArray(b.style) ? b.style : [b.style];
    const descs = Array.isArray(b.rdesc) ? b.rdesc : [b.rdesc];
    const roles = [];
    roleIds.forEach((r, k) => {
      if (r && req.guild.roles.cache.has(r)) roles.push({ role: r, label: str(labels[k], 80), emoji: str(emojis[k], 64).trim(), style: str(styles[k], 12), description: str(descs[k], 100) });
    });
    if (!roles.length || !b.channel) {
      flash(req, 'error', 'Odaberi kanal i barem jednu ulogu.');
      return res.redirect(`/dashboard/${req.guild.id}/roles`);
    }
    const id = db.rolePanels.create(req.guild.id, str(b.channel, 30), str(b.title, 256) || 'Odaberi uloge', str(b.description, 2000), bool(b.unique), roles.slice(0, 25));
    try {
      await rolePanels.publish(client, id, req.guild.id);
      flash(req, 'success', 'Panel objavljen.');
    } catch (e) {
      db.rolePanels.remove(req.guild.id, id);
      flash(req, 'error', `Greška pri objavi: ${e.message}`);
    }
    res.redirect(`/dashboard/${req.guild.id}/roles`);
  });
  app.post('/dashboard/:id/roles/:pid/republish', requireAuth, checkCsrf, requireGuild, async (req, res) => {
    try { await rolePanels.publish(client, Number(req.params.pid), req.guild.id); flash(req, 'success', 'Panel ponovo objavljen.'); } catch (e) { flash(req, 'error', e.message); }
    res.redirect(`/dashboard/${req.guild.id}/roles`);
  });
  app.post('/dashboard/:id/roles/:pid/delete', requireAuth, checkCsrf, requireGuild, async (req, res) => {
    const p = db.rolePanels.get(req.guild.id, Number(req.params.pid));
    if (p?.message_id) {
      const ch = req.guild.channels.cache.get(p.channel_id);
      await ch?.messages.delete(p.message_id).catch(() => {});
    }
    db.rolePanels.remove(req.guild.id, Number(req.params.pid));
    flash(req, 'success', 'Panel obrisan.');
    res.redirect(`/dashboard/${req.guild.id}/roles`);
  });

  // ------------------------------------------------------------------ tickets
  app.post('/dashboard/:id/tickets/panel', requireAuth, checkCsrf, requireGuild, async (req, res) => {
    const ch = req.guild.channels.cache.get(req.body.channel);
    if (!ch?.isTextBased()) flash(req, 'error', 'Odaberi kanal.');
    else {
      try { await tickets.postPanel(ch); flash(req, 'success', `Panel poslan u #${ch.name}.`); } catch (e) { flash(req, 'error', e.message); }
    }
    res.redirect(`/dashboard/${req.guild.id}/tickets`);
  });

  // ------------------------------------------------------------------ giveaways
  app.post('/dashboard/:id/giveaways/create', requireAuth, checkCsrf, requireGuild, async (req, res) => {
    const ch = req.guild.channels.cache.get(req.body.channel);
    const ms = parseDuration(req.body.duration);
    const prize = str(req.body.prize, 200).trim();
    if (!ch?.isTextBased() || !ms || ms < 10_000 || !prize) flash(req, 'error', 'Provjeri kanal, nagradu i trajanje (npr. 1h, 2d).');
    else {
      try { await giveaways.start(ch, prize, ms, num(req.body.winners, 1, 50, 1), req.session.user.id); flash(req, 'success', 'Giveaway pokrenut 🎉'); } catch (e) { flash(req, 'error', e.message); }
    }
    res.redirect(`/dashboard/${req.guild.id}/giveaways`);
  });
  app.post('/dashboard/:id/giveaways/:gid/:act', requireAuth, checkCsrf, requireGuild, async (req, res) => {
    const g = db.giveaways.get(Number(req.params.gid));
    if (!g || g.guild_id !== req.guild.id) return res.redirect(`/dashboard/${req.guild.id}/giveaways`);
    if (req.params.act === 'end' && !g.ended) await giveaways.end(client, g.id);
    if (req.params.act === 'reroll' && g.ended) await giveaways.end(client, g.id, { reroll: true });
    if (req.params.act === 'delete') db.giveaways.remove(req.guild.id, g.id);
    flash(req, 'success', 'Gotovo.');
    res.redirect(`/dashboard/${req.guild.id}/giveaways`);
  });

  // ------------------------------------------------------------------ moderation
  app.post('/dashboard/:id/warnings/:wid/delete', requireAuth, checkCsrf, requireGuild, (req, res) => {
    db.warnings.remove(req.guild.id, Number(req.params.wid));
    flash(req, 'success', 'Upozorenje obrisano.');
    res.redirect(`/dashboard/${req.guild.id}/moderation`);
  });

  // ------------------------------------------------------------------ leveling admin
  app.post('/dashboard/:id/leveling/reset', requireAuth, checkCsrf, requireGuild, (req, res) => {
    const n = db.levels.reset(req.guild.id, req.body.userId || undefined);
    flash(req, 'success', `Resetirano (${n}).`);
    res.redirect(`/dashboard/${req.guild.id}/leveling`);
  });

  // ------------------------------------------------------------------ message / embed sender
  app.post('/dashboard/:id/messages/send', requireAuth, checkCsrf, requireGuild, async (req, res) => {
    const b = req.body;
    const ch = req.guild.channels.cache.get(b.channel);
    if (!ch?.isTextBased()) { flash(req, 'error', 'Odaberi kanal.'); return res.redirect(`/dashboard/${req.guild.id}/messages`); }
    const payload = {};
    if (str(b.content).trim()) payload.content = str(b.content, 2000);
    if (bool(b.useEmbed)) {
      const e = new EmbedBuilder();
      if (str(b.title).trim()) e.setTitle(str(b.title, 256));
      if (str(b.description).trim()) e.setDescription(str(b.description, 4096));
      if (/^#?[0-9a-f]{6}$/i.test(b.color || '')) e.setColor(parseInt(b.color.replace('#', ''), 16));
      if (/^https?:\/\//.test(b.image || '')) e.setImage(b.image);
      if (/^https?:\/\//.test(b.thumbnail || '')) e.setThumbnail(b.thumbnail);
      if (str(b.footer).trim()) e.setFooter({ text: str(b.footer, 2048) });
      if (bool(b.timestamp)) e.setTimestamp();
      if (e.data.title || e.data.description || e.data.image) payload.embeds = [e];
    }
    if (!payload.content && !payload.embeds) { flash(req, 'error', 'Poruka je prazna.'); return res.redirect(`/dashboard/${req.guild.id}/messages`); }
    try { await ch.send(payload); flash(req, 'success', `Poruka poslana u #${ch.name}.`); } catch (e) { flash(req, 'error', e.message); }
    res.redirect(`/dashboard/${req.guild.id}/messages`);
  });

  app.use((req, res) => res.status(404).render('error', { title: '404', message: 'Stranica ne postoji.' }));
  app.use((err, req, res, _next) => {
    console.error('[dashboard]', err);
    res.status(500).render('error', { title: 'Greška', message: err.message });
  });

  app.listen(config.port, () => console.log(`[dashboard] Pokrenut na ${config.dashboardUrl} (port ${config.port})`));
  return app;
}

module.exports = { startDashboard };
