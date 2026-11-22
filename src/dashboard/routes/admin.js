const express = require('express');
const platform = require('../../platform');
const manager = require('../../bot/manager');
const plans = require('../../plans');
const { TEMPLATES } = require('../../modules');
const { requireAuth, requireAdmin, checkCsrf, flash, bool } = require('../helpers');

const router = express.Router();

router.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const bots = [manager.recordFor(manager.MAIN_ID), ...platform.bots.all()].map((b) => ({ ...b, info: manager.info(b.id), template: TEMPLATES[b.template] }));
  const users = platform.users.all();
  const totals = bots.reduce((a, b) => ({ online: a.online + (b.info.status === 'online' ? 1 : 0), guilds: a.guilds + b.info.guilds, members: a.members + b.info.members }), { online: 0, guilds: 0, members: 0 });
  const mem = process.memoryUsage();
  res.render('admin', { title: 'Admin', bots, users, totals, ram: Math.round(mem.rss / 1048576), uptime: process.uptime(), ownerName: (id) => users.find((u) => u.id === id)?.username || id });
});

router.post('/admin/users/:uid/plan', requireAuth, requireAdmin, checkCsrf, (req, res) => {
  platform.users.setPlan(req.params.uid, plans[req.body.plan] ? req.body.plan : 'free');
  flash(req, 'success', 'Paket promijenjen.');
  res.redirect('/admin');
});
router.post('/admin/users/:uid/ban', requireAuth, requireAdmin, checkCsrf, async (req, res) => {
  const banned = bool(req.body.banned);
  platform.users.setBanned(req.params.uid, banned);
  if (banned) for (const b of platform.bots.byOwner(req.params.uid)) await manager.stop(b.id);
  flash(req, 'success', banned ? 'Korisnik blokiran, botovi zaustavljeni.' : 'Korisnik odblokiran.');
  res.redirect('/admin');
});

module.exports = router;
