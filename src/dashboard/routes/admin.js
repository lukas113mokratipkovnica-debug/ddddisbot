const express = require('express');
const platform = require('../../platform');
const manager = require('../../bot/manager');
const plans = require('../../plans');
const { TEMPLATES } = require('../../modules');
const { requireAuth, requireAdmin, checkCsrf, flash, bool, audit } = require('../helpers');

const router = express.Router();

router.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const bots = [manager.recordFor(manager.MAIN_ID), ...platform.bots.all()].map((b) => ({ ...b, info: manager.info(b.id), template: TEMPLATES[b.template] }));
  const users = platform.users.all();
  const totals = bots.reduce((a, b) => ({ online: a.online + (b.info.status === 'online' ? 1 : 0), guilds: a.guilds + b.info.guilds, members: a.members + b.info.members }), { online: 0, guilds: 0, members: 0 });
  const mem = process.memoryUsage();
  res.render('admin', { title: 'Admin', auditList: platform.audit.recent(60), bots, users, totals, ram: Math.round(mem.rss / 1048576), uptime: process.uptime(), ownerName: (id) => users.find((u) => u.id === id)?.username || id });
});

router.post('/admin/users/:uid/plan', requireAuth, requireAdmin, checkCsrf, (req, res) => {
  platform.users.setPlan(req.params.uid, plans[req.body.plan] ? req.body.plan : 'free');
  audit(req, 'admin.plan', req.params.uid, { plan: req.body.plan });
  flash(req, 'success', 'Plan changed.');
  res.redirect('/admin');
});
router.post('/admin/users/:uid/ban', requireAuth, requireAdmin, checkCsrf, async (req, res) => {
  const banned = bool(req.body.banned);
  platform.users.setBanned(req.params.uid, banned);
  audit(req, banned ? 'admin.ban' : 'admin.unban', req.params.uid);
  if (banned) platform.sessions.destroyUser(req.params.uid);
  if (banned) for (const b of platform.bots.byOwner(req.params.uid)) await manager.stop(b.id);
  flash(req, 'success', banned ? 'User blocked, bots stopped.' : 'User unblocked.');
  res.redirect('/admin');
});

module.exports = router;
