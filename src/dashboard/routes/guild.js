// Per-server configuration for a given bot: /bots/:botId/g/:guildId/:page
const express = require('express');
const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const { DEFAULTS, levelFromXp } = require('../../database');
const tickets = require('../../bot/systems/tickets');
const giveaways = require('../../bot/systems/giveaways');
const rolePanels = require('../../bot/systems/rolePanels');
const verification = require('../../bot/systems/verification');
const { createStatChannels } = require('../../bot/systems/tickers');
const { parseDuration } = require('../../bot/utils');
const { bool, arr, list, num, str, lines, action, flash, requireAuth, checkCsrf, loadBot, loadGuild } = require('../helpers');

const router = express.Router();
const G = '/bots/:botId/g/:guildId';
const guard = [requireAuth, loadBot, loadGuild];
const post = [requireAuth, checkCsrf, loadBot, loadGuild];

// page -> modules that unlock it (empty = always available)
const PAGES = {
  overview: [], general: [], messages: [],
  welcome: ['welcome', 'invites'], verification: ['verification'], moderation: ['moderation'], automod: ['automod'], logs: ['logging'],
  leveling: ['leveling'], economy: ['economy'], commands: ['customcommands'], roles: ['roles'], tickets: ['tickets'], giveaways: ['giveaways'],
  community: ['starboard', 'suggestions', 'confessions', 'counting', 'birthdays'], voice: ['tempvoice', 'serverstats'], notifications: ['notifications'],
};
const pageEnabled = (page, mods) => PAGES[page] && (PAGES[page].length === 0 || PAGES[page].some((m) => mods.has(m)));

function render(req, res, page) {
  const g = req.guild; const db = req.db;
  const data = { title: g.name, page, section: 'guild', pageEnabled };
  if (page === 'overview') {
    data.stats = db.stats.range(g.id, 14);
    data.counts = {
      members: g.memberCount, channels: g.channels.cache.size, roles: g.roles.cache.size, warnings: db.warnings.total(g.id),
      cases: db.cases.total(g.id), openTickets: db.tickets.openCount(g.id), ranked: db.levels.count(g.id), customCommands: db.customCommands.list(g.id).length,
    };
    data.recentCases = db.cases.recent(g.id, 6);
    data.top = db.levels.top(g.id, 5);
  }
  if (page === 'general') data.commands = req.client.commands.map((c) => ({ name: c.data.name, description: c.data.description, module: c.module }));
  if (page === 'leveling') {
    const p = Math.max(0, Number(req.query.p || 1) - 1);
    data.leaderboard = db.levels.top(g.id, 50, p * 50).map((r) => ({ ...r, ...levelFromXp(r.xp) }));
    data.lbPage = p + 1; data.lbPages = Math.max(1, Math.ceil(db.levels.count(g.id) / 50));
  }
  if (page === 'economy') data.richest = db.economy.top(g.id, 25);
  if (page === 'commands') data.customCommands = db.customCommands.list(g.id);
  if (page === 'roles') data.panels = db.rolePanels.list(g.id);
  if (page === 'tickets') data.ticketList = db.tickets.list(g.id, 50);
  if (page === 'giveaways') data.giveawayList = db.giveaways.list(g.id, 50);
  if (page === 'moderation') { data.warningList = db.warnings.all(g.id, 200); data.caseList = db.cases.recent(g.id, 100); }
  if (page === 'community') {
    data.countState = db.counting.get(g.id);
    data.birthdayList = db.birthdays.list(g.id);
    data.confessionList = db.confessions.list(g.id, 20);
  }
  if (page === 'messages') data.stickies = db.sticky.list(g.id);
  if (page === 'welcome') data.inviteTop = db.invites.top(g.id, 10);
  res.render(`guild/${page}`, data);
}

router.get(G, guard, (req, res) => render(req, res, 'overview'));
router.get(`${G}/:page`, guard, (req, res) => {
  if (!PAGES[req.params.page]) return res.status(404).render('error', { title: '404', message: 'Stranica ne postoji.' });
  if (!pageEnabled(req.params.page, req.client.modules)) {
    flash(req, 'error', 'Taj modul nije uključen za ovog bota. Uključi ga u "Moduli".');
    return res.redirect(res.locals.base);
  }
  render(req, res, req.params.page);
});

const back = (req, res, page) => res.redirect(`${res.locals.base}/${page}`);

// ------------------------------------------------------------------ settings sections
const SECTIONS = {
  general: ['general', (b, s) => {
    s.prefix = str(b.prefix, 5).trim() || '!';
    s.modRole = str(b.modRole, 30);
    s.disabledCommands = arr(b.disabledCommands);
  }],
  welcome: ['welcome', (b, s) => {
    s.welcome = { enabled: bool(b.welcomeEnabled), channel: str(b.welcomeChannel, 30), message: str(b.welcomeMessage, 2000), embed: bool(b.welcomeEmbed), dm: bool(b.welcomeDm), dmMessage: str(b.welcomeDmMessage, 2000) };
    s.goodbye = { enabled: bool(b.goodbyeEnabled), channel: str(b.goodbyeChannel, 30), message: str(b.goodbyeMessage, 2000), embed: bool(b.goodbyeEmbed) };
    s.autorole = { enabled: bool(b.autoroleEnabled), roles: arr(b.autoroleRoles), botRoles: arr(b.autoroleBotRoles) };
  }],
  invites: ['welcome', (b, s) => { s.invites = { enabled: bool(b.enabled), channel: str(b.channel, 30), message: str(b.message, 1000) || DEFAULTS.invites.message }; }],
  verification: ['verification', (b, s) => {
    s.verification = { enabled: bool(b.enabled), role: str(b.role, 30), removeRole: str(b.removeRole, 30), captcha: bool(b.captcha), title: str(b.title, 256) || DEFAULTS.verification.title, message: str(b.message, 2000) || DEFAULTS.verification.message };
  }],
  logs: ['logs', (b, s) => {
    s.logs = { enabled: bool(b.enabled), channel: str(b.channel, 30), messageDelete: bool(b.messageDelete), messageEdit: bool(b.messageEdit), memberJoin: bool(b.memberJoin),
      memberLeave: bool(b.memberLeave), memberUpdate: bool(b.memberUpdate), modActions: bool(b.modActions), voice: bool(b.voice), channels: bool(b.channels) };
  }],
  automod: ['automod', (b, s) => {
    s.automod = {
      enabled: bool(b.enabled), ignoredChannels: arr(b.ignoredChannels), ignoredRoles: arr(b.ignoredRoles), timeoutMinutes: num(b.timeoutMinutes, 1, 40320, 10),
      badWords: { enabled: bool(b.badWordsEnabled), words: lines(b.badWords), action: action(b.badWordsAction) },
      invites: { enabled: bool(b.invitesEnabled), action: action(b.invitesAction) },
      links: { enabled: bool(b.linksEnabled), whitelist: lines(b.linksWhitelist), action: action(b.linksAction) },
      mentions: { enabled: bool(b.mentionsEnabled), limit: num(b.mentionsLimit, 2, 50, 5), action: action(b.mentionsAction, 'timeout') },
      caps: { enabled: bool(b.capsEnabled), percent: num(b.capsPercent, 30, 100, 70), minLength: num(b.capsMin, 5, 200, 10), action: action(b.capsAction) },
      spam: { enabled: bool(b.spamEnabled), messages: num(b.spamMessages, 2, 30, 5), seconds: num(b.spamSeconds, 1, 60, 5), action: action(b.spamAction, 'timeout') },
      warnThreshold: { enabled: bool(b.thresholdEnabled), count: num(b.thresholdCount, 1, 50, 3), action: ['timeout', 'kick', 'ban'].includes(b.thresholdAction) ? b.thresholdAction : 'timeout', minutes: num(b.thresholdMinutes, 1, 40320, 60) },
    };
  }],
  leveling: ['leveling', (b, s) => {
    const lv = list(b.rewardLevel); const rl = list(b.rewardRole);
    const rewards = [];
    lv.forEach((v, k) => { const n = Number(v); if (rl[k] && Number.isInteger(n) && n > 0) rewards.push({ level: n, role: rl[k] }); });
    const xpMin = num(b.xpMin, 1, 1000, 15);
    s.leveling = {
      enabled: bool(b.enabled), xpMin, xpMax: Math.max(xpMin, num(b.xpMax, 1, 1000, 25)), cooldown: num(b.cooldown, 0, 3600, 60),
      announce: ['current', 'channel', 'dm', 'off'].includes(b.announce) ? b.announce : 'current', channel: str(b.channel, 30), message: str(b.message, 1000) || DEFAULTS.leveling.message,
      rewards: rewards.sort((x, y) => x.level - y.level), stackRewards: bool(b.stackRewards), noXpChannels: arr(b.noXpChannels), noXpRoles: arr(b.noXpRoles), multiplier: num(b.multiplier, 0.1, 10, 1),
    };
  }],
  economy: ['economy', (b, s) => {
    const names = list(b.itemName); const prices = list(b.itemPrice); const rolesL = list(b.itemRole); const descs = list(b.itemDesc); const ids = list(b.itemId);
    const shop = [];
    names.forEach((n, k) => {
      const name = str(n, 60).trim(); const price = Math.floor(Number(prices[k]));
      if (!name || !(price >= 0)) return;
      const id = (str(ids[k], 20).trim() || name.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 20)) || crypto.randomBytes(3).toString('hex');
      shop.push({ id, name, price, role: str(rolesL[k], 30), description: str(descs[k], 200) });
    });
    s.economy = {
      ...s.economy, currency: str(b.currency, 20).trim() || 'coina', emoji: str(b.emoji, 64).trim() || '🪙', startBalance: num(b.startBalance, 0, 1e9, 100),
      dailyAmount: num(b.dailyAmount, 0, 1e9, 250), workMin: num(b.workMin, 0, 1e9, 50), workMax: Math.max(num(b.workMin, 0, 1e9, 50), num(b.workMax, 0, 1e9, 200)),
      workCooldown: num(b.workCooldown, 0, 864e2, 3600), robEnabled: bool(b.robEnabled), robChance: num(b.robChance, 0, 100, 40), shop: shop.slice(0, 25),
    };
  }],
  tickets: ['tickets', (b, s) => {
    s.tickets = { ...s.tickets, enabled: bool(b.enabled), category: str(b.category, 30), supportRoles: arr(b.supportRoles), logChannel: str(b.logChannel, 30),
      panelTitle: str(b.panelTitle, 256) || '🎫 Podrška', panelDescription: str(b.panelDescription, 4000), welcomeMessage: str(b.welcomeMessage, 2000), maxOpen: num(b.maxOpen, 1, 10, 1) };
  }],
  starboard: ['community', (b, s) => { s.starboard = { enabled: bool(b.enabled), channel: str(b.channel, 30), emoji: str(b.emoji, 64).trim() || '⭐', threshold: num(b.threshold, 1, 100, 3) }; }],
  suggestions: ['community', (b, s) => { s.suggestions = { enabled: bool(b.enabled), channel: str(b.channel, 30) }; }],
  confessions: ['community', (b, s) => { s.confessions = { ...s.confessions, enabled: bool(b.enabled), channel: str(b.channel, 30), logChannel: str(b.logChannel, 30) }; }],
  counting: ['community', (b, s) => { s.counting = { enabled: bool(b.enabled), channel: str(b.channel, 30), sameUserTwice: bool(b.sameUserTwice), resetOnFail: bool(b.resetOnFail) }; }],
  birthdays: ['community', (b, s) => { s.birthdays = { enabled: bool(b.enabled), channel: str(b.channel, 30), role: str(b.role, 30), message: str(b.message, 1000) || DEFAULTS.birthdays.message }; }],
  tempvoice: ['voice', (b, s) => { s.tempvoice = { enabled: bool(b.enabled), hub: str(b.hub, 30), category: str(b.category, 30), nameTemplate: str(b.nameTemplate, 90) || DEFAULTS.tempvoice.nameTemplate, userLimit: num(b.userLimit, 0, 99, 0) }; }],
  serverstats: ['voice', (b, s) => {
    s.serverstats = { ...s.serverstats, enabled: bool(b.enabled) };
    for (const k of ['members', 'humans', 'bots', 'boosts']) { s.serverstats[k] = str(b[k], 30); s.serverstats[`${k}Name`] = str(b[`${k}Name`], 90) || DEFAULTS.serverstats[`${k}Name`]; }
  }],
};

router.post(`${G}/save/:section`, post, (req, res) => {
  const sec = SECTIONS[req.params.section];
  if (!sec) return res.status(400).send('Nepoznata sekcija');
  req.db.updateSettings(req.guild.id, (s) => sec[1](req.body, s));
  flash(req, 'success', 'Postavke spremljene ✓');
  back(req, res, sec[0]);
});

// ------------------------------------------------------------------ custom commands / autoresponder
router.post(`${G}/commands/add`, post, (req, res) => {
  const matchType = ['command', 'contains', 'exact', 'startswith'].includes(req.body.matchType) ? req.body.matchType : 'command';
  let trigger = str(req.body.trigger, 100).trim().toLowerCase();
  if (matchType === 'command') trigger = trigger.replace(/\s+/g, '-').slice(0, 32);
  const response = str(req.body.response, 2000);
  const reaction = str(req.body.reaction, 64).trim() || null;
  if (!trigger || (!response && !reaction)) flash(req, 'error', 'Okidač i odgovor (ili reakcija) su obavezni.');
  else { req.db.customCommands.upsert(req.guild.id, trigger, response || '-', bool(req.body.embed), bool(req.body.deleteTrigger), matchType, reaction); flash(req, 'success', `"${trigger}" spremljeno.`); }
  back(req, res, 'commands');
});
router.post(`${G}/commands/:cid/delete`, post, (req, res) => { req.db.customCommands.remove(req.guild.id, Number(req.params.cid)); flash(req, 'success', 'Obrisano.'); back(req, res, 'commands'); });

// ------------------------------------------------------------------ role panels
router.post(`${G}/roles/create`, post, async (req, res) => {
  const b = req.body;
  const roleIds = list(b.role); const labels = list(b.label); const emojis = list(b.emoji); const styles = list(b.style); const descs = list(b.rdesc);
  const roles = [];
  roleIds.forEach((r, k) => { if (r && req.guild.roles.cache.has(r)) roles.push({ role: r, label: str(labels[k], 80), emoji: str(emojis[k], 64).trim(), style: str(styles[k], 12), description: str(descs[k], 100) }); });
  if (!roles.length || !b.channel) { flash(req, 'error', 'Odaberi kanal i barem jednu ulogu.'); return back(req, res, 'roles'); }
  const id = req.db.rolePanels.create(req.guild.id, str(b.channel, 30), str(b.title, 256) || 'Odaberi uloge', str(b.description, 2000), bool(b.unique), roles.slice(0, 25));
  try { await rolePanels.publish(req.client, id, req.guild.id); flash(req, 'success', 'Panel objavljen.'); } catch (e) { req.db.rolePanels.remove(req.guild.id, id); flash(req, 'error', `Greška pri objavi: ${e.message}`); }
  back(req, res, 'roles');
});
router.post(`${G}/roles/:pid/republish`, post, async (req, res) => {
  try { await rolePanels.publish(req.client, Number(req.params.pid), req.guild.id); flash(req, 'success', 'Panel osvježen.'); } catch (e) { flash(req, 'error', e.message); }
  back(req, res, 'roles');
});
router.post(`${G}/roles/:pid/delete`, post, async (req, res) => {
  const p = req.db.rolePanels.get(req.guild.id, Number(req.params.pid));
  if (p?.message_id) await req.guild.channels.cache.get(p.channel_id)?.messages.delete(p.message_id).catch(() => {});
  req.db.rolePanels.remove(req.guild.id, Number(req.params.pid));
  flash(req, 'success', 'Panel obrisan.');
  back(req, res, 'roles');
});

// ------------------------------------------------------------------ panels (tickets / verification)
const panelRoute = (name, page, fn) => router.post(`${G}/${name}/panel`, post, async (req, res) => {
  const ch = req.guild.channels.cache.get(req.body.channel);
  if (!ch?.isTextBased()) flash(req, 'error', 'Odaberi kanal.');
  else { try { await fn(ch); flash(req, 'success', `Panel poslan u #${ch.name}.`); } catch (e) { flash(req, 'error', e.message); } }
  back(req, res, page);
});
panelRoute('tickets', 'tickets', tickets.postPanel);
panelRoute('verification', 'verification', verification.postPanel);

// ------------------------------------------------------------------ giveaways
router.post(`${G}/giveaways/create`, post, async (req, res) => {
  const ch = req.guild.channels.cache.get(req.body.channel);
  const ms = parseDuration(req.body.duration);
  const prize = str(req.body.prize, 200).trim();
  if (!ch?.isTextBased() || !ms || ms < 10_000 || !prize) flash(req, 'error', 'Provjeri kanal, nagradu i trajanje (npr. 1h, 2d).');
  else { try { await giveaways.start(ch, prize, ms, num(req.body.winners, 1, 50, 1), req.session.user.id); flash(req, 'success', 'Giveaway pokrenut 🎉'); } catch (e) { flash(req, 'error', e.message); } }
  back(req, res, 'giveaways');
});
router.post(`${G}/giveaways/:gid/:act`, post, async (req, res) => {
  const g = req.db.giveaways.get(Number(req.params.gid));
  if (g && g.guild_id === req.guild.id) {
    if (req.params.act === 'end' && !g.ended) await giveaways.end(req.client, g.id);
    if (req.params.act === 'reroll' && g.ended) await giveaways.end(req.client, g.id, { reroll: true });
    if (req.params.act === 'delete') req.db.giveaways.remove(req.guild.id, g.id);
    flash(req, 'success', 'Gotovo.');
  }
  back(req, res, 'giveaways');
});

// ------------------------------------------------------------------ misc admin actions
router.post(`${G}/warnings/:wid/delete`, post, (req, res) => { req.db.warnings.remove(req.guild.id, Number(req.params.wid)); flash(req, 'success', 'Upozorenje obrisano.'); back(req, res, 'moderation'); });
router.post(`${G}/leveling/reset`, post, (req, res) => { const n = req.db.levels.reset(req.guild.id, req.body.userId || undefined); flash(req, 'success', `Resetirano (${n}).`); back(req, res, 'leveling'); });
router.post(`${G}/economy/reset`, post, (req, res) => { const n = req.db.economy.reset(req.guild.id, req.body.userId || undefined); flash(req, 'success', `Resetirano (${n}).`); back(req, res, 'economy'); });
router.post(`${G}/counting/reset`, post, (req, res) => { req.db.counting.set(req.guild.id, 0, null); flash(req, 'success', 'Brojanje resetirano na 0.'); back(req, res, 'community'); });
router.post(`${G}/serverstats/create`, post, async (req, res) => {
  try { await createStatChannels(req.guild); flash(req, 'success', 'Statistika kanali kreirani.'); } catch (e) { flash(req, 'error', e.message); }
  back(req, res, 'voice');
});
router.post(`${G}/sticky/:cid/delete`, post, async (req, res) => {
  const st = req.db.sticky.get(req.params.cid);
  if (st?.guild_id === req.guild.id) {
    if (st.last_message_id) await req.guild.channels.cache.get(st.channel_id)?.messages.delete(st.last_message_id).catch(() => {});
    req.db.sticky.remove(st.channel_id);
  }
  flash(req, 'success', 'Sticky poruka uklonjena.');
  back(req, res, 'messages');
});
router.post(`${G}/sticky/add`, post, async (req, res) => {
  const ch = req.guild.channels.cache.get(req.body.channel);
  const text = str(req.body.content, 1800).trim();
  if (!ch?.isTextBased() || !text) { flash(req, 'error', 'Odaberi kanal i upiši tekst.'); return back(req, res, 'messages'); }
  req.db.sticky.set(ch.id, req.guild.id, text);
  const msg = await ch.send({ embeds: [new EmbedBuilder().setColor(0x7c5cff).setDescription(`📌 ${text}`)] }).catch(() => null);
  if (msg) req.db.sticky.setMessage(ch.id, msg.id);
  flash(req, 'success', `Sticky poruka postavljena u #${ch.name}.`);
  back(req, res, 'messages');
});

// ------------------------------------------------------------------ notifications feeds
router.post(`${G}/notifications/add`, post, (req, res) => {
  const type = req.body.type === 'rss' ? 'rss' : 'youtube';
  let source = str(req.body.source, 500).trim();
  if (type === 'youtube') {
    const m = source.match(/(UC[\w-]{22})/);
    source = m ? m[1] : '';
  }
  const ch = req.guild.channels.cache.get(req.body.channel);
  if (!source || !ch || (type === 'rss' && !/^https?:\/\//.test(source))) {
    flash(req, 'error', type === 'youtube' ? 'Treba YouTube channel ID (počinje s UC…, 24 znaka) ili link na kanal s tim ID-em.' : 'Upiši ispravan RSS URL.');
    return back(req, res, 'notifications');
  }
  req.db.updateSettings(req.guild.id, (s) => {
    if (s.notifications.feeds.length >= 20) return;
    s.notifications.feeds.push({ id: crypto.randomBytes(5).toString('hex'), type, source, channel: ch.id, message: str(req.body.message, 500) || '📢 **{author}** je objavio/la: **{title}**\n{link}' });
  });
  flash(req, 'success', 'Feed dodan. Prva provjera je za par minuta (stare objave se preskaču).');
  back(req, res, 'notifications');
});
router.post(`${G}/notifications/:fid/delete`, post, (req, res) => {
  req.db.updateSettings(req.guild.id, (s) => { s.notifications.feeds = s.notifications.feeds.filter((f) => f.id !== req.params.fid); });
  flash(req, 'success', 'Feed obrisan.');
  back(req, res, 'notifications');
});

// ------------------------------------------------------------------ message / embed sender
router.post(`${G}/messages/send`, post, async (req, res) => {
  const b = req.body;
  const ch = req.guild.channels.cache.get(b.channel);
  if (!ch?.isTextBased()) { flash(req, 'error', 'Odaberi kanal.'); return back(req, res, 'messages'); }
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
  if (!payload.content && !payload.embeds) { flash(req, 'error', 'Poruka je prazna.'); return back(req, res, 'messages'); }
  try { await ch.send(payload); flash(req, 'success', `Poruka poslana u #${ch.name}.`); } catch (e) { flash(req, 'error', e.message); }
  back(req, res, 'messages');
});

module.exports = router;
