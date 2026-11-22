// Customer area: my bots, create bot, bot overview / modules / settings / console.
const express = require('express');
const config = require('../../config');
const platform = require('../../platform');
const manager = require('../../bot/manager');
const { deleteDatabase } = require('../../database');
const { MODULES, TEMPLATES } = require('../../modules');
const { ALL_COMMANDS } = require('../../bot/createClient');
const { str, bool, arr, flash, requireAuth, checkCsrf, loadBot, requireBotManage, discordApi, inviteUrl } = require('../helpers');

const router = express.Router();
const INTENT_FLAGS = { members: (1 << 14) | (1 << 15), content: (1 << 18) | (1 << 19) };

function botCard(rec) {
  return { ...rec, info: manager.info(rec.id), invite: inviteUrl(rec.application_id), template: TEMPLATES[rec.template] || TEMPLATES.allinone };
}

router.get('/app', requireAuth, (req, res) => {
  const mine = platform.bots.byOwner(req.session.user.id).map(botCard);
  const official = botCard(manager.recordFor(manager.MAIN_ID));
  res.render('app/home', { title: 'Moji botovi', mine, official, plan: platform.users.plan(req.session.user.id) });
});

// ------------------------------------------------------------------ create
router.get('/app/new', requireAuth, (req, res) => {
  const template = TEMPLATES[req.query.template] ? req.query.template : null;
  const plan = platform.users.plan(req.session.user.id);
  const used = platform.bots.byOwner(req.session.user.id).length;
  res.render('app/new', { title: 'Novi bot', template, plan, used, limitReached: used >= plan.maxBots });
});

router.post('/app/new', requireAuth, checkCsrf, async (req, res) => {
  const uid = req.session.user.id;
  const template = TEMPLATES[req.body.template] ? req.body.template : 'allinone';
  const back = (msg) => { flash(req, 'error', msg); res.redirect(`/app/new?template=${template}`); };
  const plan = platform.users.plan(uid);
  if (platform.bots.byOwner(uid).length >= plan.maxBots) return back(`Tvoj paket (${plan.name}) dozvoljava ${plan.maxBots} bot(a). Nadogradi paket za više.`);

  const token = str(req.body.token, 200).trim().replace(/^Bot\s+/i, '');
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return back('To ne izgleda kao bot token. Kopiraj ga iz Developer Portala → Bot → Reset Token.');
  const [me, appInfo] = await Promise.all([discordApi('/users/@me', token, 'Bot'), discordApi('/oauth2/applications/@me', token, 'Bot')]);
  if (!me.ok || !me.body.bot) return back('Discord je odbio token. Provjeri je li ispravan i nije li resetiran.');
  const appId = appInfo.body.id || me.body.id;
  if (appId === config.clientId) return back('To je token službenog bota platforme.');
  if (platform.bots.byApplication(appId)) return back('Ovaj bot je već dodan na platformu.');
  const flags = appInfo.body.flags || 0;
  const missing = [];
  if (!(flags & INTENT_FLAGS.members)) missing.push('Server Members Intent');
  if (!(flags & INTENT_FLAGS.content)) missing.push('Message Content Intent');
  if (missing.length) return back(`U Developer Portalu (Bot tab → Privileged Gateway Intents) uključi: ${missing.join(' i ')}. Zatim pokušaj ponovo.`);

  const avatar = me.body.avatar ? `https://cdn.discordapp.com/avatars/${me.body.id}/${me.body.avatar}.png?size=256` : null;
  const id = platform.bots.create({ ownerId: uid, applicationId: appId, name: me.body.username, avatar, token, template, modules: TEMPLATES[template].modules });
  try {
    await manager.start(id);
    flash(req, 'success', `${me.body.username} je online! 🎉 Sada ga dodaj na svoj server.`);
  } catch (e) {
    flash(req, 'error', `Bot je spremljen, ali se nije pokrenuo: ${e.message}`);
  }
  res.redirect(`/bots/${id}`);
});

// ------------------------------------------------------------------ bot pages
router.get('/bots/:botId', requireAuth, loadBot, (req, res) => {
  const client = manager.client(req.botRec.id);
  let servers = [];
  if (client?.isReady()) {
    if (req.botManage) {
      servers = client.guilds.cache.map((g) => ({ id: g.id, name: g.name, icon: g.iconURL({ size: 128 }), members: g.memberCount, hasBot: true }));
    } else {
      servers = (req.session.guilds || []).map((g) => {
        const live = client.guilds.cache.get(g.id);
        return { id: g.id, name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null, members: live?.memberCount, hasBot: Boolean(live), invite: inviteUrl(req.botRec.application_id, g.id) };
      });
    }
    servers.sort((a, b) => Number(b.hasBot) - Number(a.hasBot) || (b.members || 0) - (a.members || 0));
  }
  const totals = client?.isReady() ? client.db.stats.totals() : { messages: 0, commands: 0, joins: 0 };
  res.render('app/bot', { title: req.botRec.name, section: 'overview', servers, totals, logs: manager.logs(req.botRec.id).slice(-6).reverse() });
});

router.get('/bots/:botId/modules', requireAuth, loadBot, requireBotManage, (req, res) => {
  const counts = {};
  for (const c of ALL_COMMANDS.values()) counts[c.module] = (counts[c.module] || 0) + 1;
  res.render('app/modules', { title: 'Moduli', section: 'modules', counts });
});
router.post('/bots/:botId/modules', requireAuth, checkCsrf, loadBot, requireBotManage, async (req, res) => {
  const mods = arr(req.body.modules).filter((m) => MODULES[m]);
  try { await manager.setModules(req.botRec.id, mods); flash(req, 'success', `Spremljeno — uključeno ${mods.length} modula. Komande su ažurirane.`); } catch (e) { flash(req, 'error', e.message); }
  res.redirect(`/bots/${req.botRec.id}/modules`);
});

router.get('/bots/:botId/settings', requireAuth, loadBot, requireBotManage, (req, res) => res.render('app/settings', { title: 'Postavke bota', section: 'settings' }));

router.post('/bots/:botId/presence', requireAuth, checkCsrf, loadBot, requireBotManage, (req, res) => {
  const p = {
    status: ['online', 'idle', 'dnd', 'invisible'].includes(req.body.status) ? req.body.status : 'online',
    type: ['playing', 'watching', 'listening', 'competing', 'custom'].includes(req.body.type) ? req.body.type : 'watching',
    text: str(req.body.text, 120),
  };
  manager.setPresence(req.botRec.id, p);
  flash(req, 'success', 'Status ažuriran.');
  res.redirect(`/bots/${req.botRec.id}/settings`);
});

router.post('/bots/:botId/profile', requireAuth, checkCsrf, loadBot, requireBotManage, async (req, res) => {
  const client = manager.client(req.botRec.id);
  if (!client?.isReady()) { flash(req, 'error', 'Bot mora biti online.'); return res.redirect(`/bots/${req.botRec.id}/settings`); }
  const name = str(req.body.username, 32).trim();
  const avatar = str(req.body.avatar, 500).trim();
  try {
    const patch = {};
    if (name && name !== client.user.username) patch.username = name;
    if (/^https?:\/\//.test(avatar)) patch.avatar = avatar;
    if (Object.keys(patch).length) await client.user.edit(patch);
    if (req.botRec.id !== manager.MAIN_ID) platform.bots.setProfile(req.botRec.id, client.user.username, client.user.displayAvatarURL({ size: 256 }));
    flash(req, 'success', 'Profil ažuriran.');
  } catch (e) {
    flash(req, 'error', `Discord je odbio promjenu: ${e.message} (ime se smije mijenjati ~2 puta na sat)`);
  }
  res.redirect(`/bots/${req.botRec.id}/settings`);
});

router.post('/bots/:botId/token', requireAuth, checkCsrf, loadBot, requireBotManage, async (req, res) => {
  if (req.botRec.official) return res.redirect(`/bots/${req.botRec.id}/settings`);
  const token = str(req.body.token, 200).trim().replace(/^Bot\s+/i, '');
  const me = await discordApi('/users/@me', token, 'Bot');
  const appInfo = await discordApi('/oauth2/applications/@me', token, 'Bot');
  if (!me.ok || (appInfo.body.id || me.body.id) !== req.botRec.application_id) {
    flash(req, 'error', 'Token nije ispravan ili pripada drugom botu.');
  } else {
    platform.bots.setToken(req.botRec.id, token);
    await manager.restart(req.botRec.id).then(() => flash(req, 'success', 'Token ažuriran i bot ponovo pokrenut.')).catch((e) => flash(req, 'error', e.message));
  }
  res.redirect(`/bots/${req.botRec.id}/settings`);
});

router.post('/bots/:botId/autostart', requireAuth, checkCsrf, loadBot, requireBotManage, (req, res) => {
  if (!req.botRec.official) platform.bots.setAutostart(req.botRec.id, bool(req.body.autostart));
  flash(req, 'success', 'Spremljeno.');
  res.redirect(`/bots/${req.botRec.id}/settings`);
});

router.post('/bots/:botId/power/:action', requireAuth, checkCsrf, loadBot, requireBotManage, async (req, res) => {
  const id = req.botRec.id;
  try {
    if (req.params.action === 'start') await manager.start(id);
    else if (req.params.action === 'stop') await manager.stop(id);
    else if (req.params.action === 'restart') await manager.restart(id);
    flash(req, 'success', { start: 'Bot pokrenut.', stop: 'Bot zaustavljen.', restart: 'Bot ponovo pokrenut.' }[req.params.action] || 'Gotovo.');
  } catch (e) { flash(req, 'error', e.message); }
  res.redirect(req.get('Referrer')?.includes(`/bots/${id}`) ? req.get('Referrer') : `/bots/${id}`);
});

router.post('/bots/:botId/delete', requireAuth, checkCsrf, loadBot, requireBotManage, async (req, res) => {
  if (req.botRec.official) return res.redirect('/app');
  if (str(req.body.confirm).trim() !== req.botRec.name) {
    flash(req, 'error', 'Za brisanje upiši točno ime bota.');
    return res.redirect(`/bots/${req.botRec.id}/settings`);
  }
  await manager.remove(req.botRec.id);
  platform.bots.remove(req.botRec.id);
  deleteDatabase(req.botRec.id);
  flash(req, 'success', `${req.botRec.name} je obrisan s platforme.`);
  res.redirect('/app');
});

router.get('/bots/:botId/console', requireAuth, loadBot, requireBotManage, (req, res) => res.render('app/console', { title: 'Konzola', section: 'console', logs: manager.logs(req.botRec.id) }));
router.get('/bots/:botId/status.json', requireAuth, loadBot, (req, res) => {
  res.json({ info: manager.info(req.botRec.id), logs: req.botManage ? manager.logs(req.botRec.id).slice(-100) : [] });
});

module.exports = router;
