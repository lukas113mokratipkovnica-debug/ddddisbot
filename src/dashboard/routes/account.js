// Account / security center, command palette data and live updates (SSE).
const express = require('express');
const crypto = require('crypto');
const platform = require('../../platform');
const manager = require('../../bot/manager');
const i18n = require('../../i18n');
const { requireAuth, checkCsrf, flash, audit, isAdmin } = require('../helpers');

const router = express.Router();
const sidHash = (sid) => crypto.createHash('sha256').update(sid).digest('hex').slice(0, 16);

function describeUa(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Preglednik';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` · ${os}` : ''}`;
}
const maskIp = (ip = '') => (ip.includes('.') ? ip.split('.').slice(0, 3).join('.') + '.x' : ip.split(':').slice(0, 3).join(':') + ':…');

router.get('/account', requireAuth, (req, res) => {
  const list = platform.sessions.byUser(req.session.user.id).map((s) => ({
    id: sidHash(s.sid), current: s.sid === req.sessionID, device: describeUa(s.ua), ip: maskIp(s.ip), createdAt: s.createdAt, expires: s.expires,
  })).sort((a, b) => Number(b.current) - Number(a.current));
  res.render('app/account', { title: 'Račun i sigurnost', section: 'account', sessionList: list, auditList: platform.audit.byUser(req.session.user.id, 40), plan: platform.users.plan(req.session.user.id), bots: platform.bots.byOwner(req.session.user.id).length });
});

router.post('/account/sessions/:id/revoke', requireAuth, checkCsrf, (req, res) => {
  const target = platform.sessions.byUser(req.session.user.id).find((s) => sidHash(s.sid) === req.params.id);
  if (target && target.sid !== req.sessionID) { platform.sessions.destroy(target.sid); audit(req, 'session.revoke'); flash(req, 'success', 'Sesija je odjavljena.'); }
  res.redirect('/account');
});
router.post('/account/sessions/revoke-all', requireAuth, checkCsrf, (req, res) => {
  const n = platform.sessions.destroyUser(req.session.user.id, req.sessionID);
  audit(req, 'session.revoke_all', null, { n });
  flash(req, 'success', `Odjavljeno s ostalih uređaja: ${n}.`);
  res.redirect('/account');
});

// ---------------------------------------------------------------- command palette data
router.get('/api/palette', requireAuth, (req, res) => {
  const uid = req.session.user.id;
  const own = isAdmin(req.session.user) ? platform.bots.all() : platform.bots.byOwner(uid);
  const items = [];
  for (const rec of [manager.recordFor(manager.MAIN_ID), ...own]) {
    items.push({ type: 'bot', label: rec.name, url: `/bots/${rec.id}`, hint: manager.info(rec.id).status });
    const client = manager.client(rec.id);
    if (!client?.isReady()) continue;
    const manage = rec.owner_id === uid || isAdmin(req.session.user);
    const guilds = manage ? [...client.guilds.cache.values()] : (req.session.guilds || []).map((g) => client.guilds.cache.get(g.id)).filter(Boolean);
    for (const g of guilds.slice(0, 50)) items.push({ type: 'server', label: g.name, url: `/bots/${rec.id}/g/${g.id}`, hint: rec.name });
  }
  res.json({ items });
});

// ---------------------------------------------------------------- live updates (Server-Sent Events)
let streams = 0;
router.get('/api/stream', requireAuth, (req, res) => {
  if (streams > 500) return res.status(503).end();
  const uid = req.session.user.id;
  const admin = isAdmin(req.session.user);
  const visible = (id) => id === manager.MAIN_ID || admin || platform.bots.get(id)?.owner_id === uid;
  const canSeeLogs = (id) => admin || (id !== manager.MAIN_ID && platform.bots.get(id)?.owner_id === uid);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  streams++;
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const onStatus = (id) => { if (visible(id)) send('status', { id, ...manager.info(id) }); };
  const onLog = (id, entry) => { if (canSeeLogs(id)) send('log', { id, ...entry, msg: i18n.translateText(req.lang, entry.msg) }); };
  manager.events.on('status', onStatus);
  manager.events.on('log', onLog);
  const beat = setInterval(() => res.write(': ping\n\n'), 25_000);
  const refresh = setInterval(() => {
    for (const id of [manager.MAIN_ID, ...(admin ? platform.bots.all() : platform.bots.byOwner(uid)).map((b) => b.id)]) onStatus(id);
  }, 15_000);
  req.on('close', () => { streams--; clearInterval(beat); clearInterval(refresh); manager.events.off('status', onStatus); manager.events.off('log', onLog); });
  send('hello', { ok: true });
});

module.exports = router;
