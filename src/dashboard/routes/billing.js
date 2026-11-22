const express = require('express');
const config = require('../../config');
const plans = require('../../plans');
const platform = require('../../platform');
const billing = require('../../billing');
const { rateLimit } = require('../../security');
const { requireAuth, checkCsrf, flash, audit } = require('../helpers');

const router = express.Router();
const checkoutLimit = rateLimit('checkout', { max: 12, windowMs: 10 * 60_000, key: (r) => r.session.user?.id || r.ip });

router.get('/billing', requireAuth, (req, res) => {
  const u = platform.users.get(req.session.user.id) || {};
  const plan = platform.users.plan(req.session.user.id);
  res.render('app/billing', {
    title: 'Billing', section: 'billing', plan, billingEnabled: billing.enabled(),
    subStatus: u.sub_status || null, planUntil: u.plan_until || null, hasCustomer: Boolean(u.stripe_customer),
    bots: platform.bots.byOwner(req.session.user.id),
  });
});

router.post('/billing/checkout/:plan', requireAuth, checkoutLimit, checkCsrf, async (req, res) => {
  if (!billing.enabled()) { flash(req, 'error', 'Billing isn\'t available right now. Contact an administrator.'); return res.redirect('/pricing'); }
  const planKey = req.params.plan;
  if (!plans[planKey] || planKey === 'free') { flash(req, 'error', 'Unknown plan.'); return res.redirect('/pricing'); }
  try {
    const url = await billing.createCheckout(req.session.user, planKey, { reqIp: req.ip });
    res.redirect(303, url);
  } catch (e) {
    flash(req, 'error', e.message);
    res.redirect('/pricing');
  }
});

router.post('/billing/portal', requireAuth, checkCsrf, async (req, res) => {
  try {
    const url = await billing.createPortal(req.session.user);
    audit(req, 'billing.portal');
    res.redirect(303, url);
  } catch (e) {
    flash(req, 'error', e.message);
    res.redirect('/billing');
  }
});

module.exports = router;
