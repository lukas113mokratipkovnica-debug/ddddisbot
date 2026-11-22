// Stripe billing + entitlement enforcement.
// Self-serve: user clicks a plan -> Stripe Checkout -> webhook upgrades them.
// On refund / chargeback / cancellation / expiry -> downgrade to free and suspend bots over the limit
// (the "kill switch": transparent, logged, and reversible when they pay again).
const Stripe = require('stripe');
const config = require('./config');
const plans = require('./plans');
const platform = require('./platform');
const manager = require('./bot/manager');

const stripe = config.stripeSecret ? new Stripe(config.stripeSecret, { apiVersion: '2025-08-27.basil' }) : null;
const enabled = () => Boolean(stripe);

function planFromPriceId(priceId) {
  return Object.values(plans).find((p) => p.priceId && p.priceId === priceId) || null;
}

/** Apply a plan to a user and immediately enforce bot limits. `until` = ms when it lapses (null = no expiry). */
async function applyPlan(userId, planKey, { until = null, audit = null } = {}) {
  const key = plans[planKey] ? planKey : 'free';
  platform.users.setBilling(userId, { plan: key, plan_until: until });
  const result = await manager.enforcePlan(userId);
  platform.audit.log(userId, audit || 'billing.plan', null, null, { plan: key, suspended: result.suspended.length, restored: result.restored.length });
  return result;
}

async function createCheckout(user, planKey, { reqIp } = {}) {
  if (!stripe) throw new Error('Billing isn\'t set up.');
  const plan = plans[planKey];
  if (!plan || !plan.priceId) throw new Error('That plan isn\'t available for purchase.');

  // reuse or create the Stripe customer
  let customerId = platform.users.get(user.id)?.stripe_customer;
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { discord_id: user.id, username: user.username } });
    customerId = customer.id;
    platform.users.setBilling(user.id, { stripe_customer: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    client_reference_id: user.id,
    metadata: { discord_id: user.id, plan: planKey },
    subscription_data: { metadata: { discord_id: user.id, plan: planKey } },
    success_url: `${config.dashboardUrl}/billing?success=1`,
    cancel_url: `${config.dashboardUrl}/pricing?canceled=1`,
  }, { idempotencyKey: `checkout_${user.id}_${planKey}_${Math.floor(Date.now() / 60000)}` });
  platform.audit.log(user.id, 'billing.checkout', null, reqIp, { plan: planKey });
  return session.url;
}

async function createPortal(user) {
  if (!stripe) throw new Error('Billing isn\'t set up.');
  const customerId = platform.users.get(user.id)?.stripe_customer;
  if (!customerId) throw new Error('You don\'t have an active subscription.');
  const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${config.dashboardUrl}/billing` });
  return portal.url;
}

function verifyWebhook(rawBody, signature) {
  if (!config.stripeWebhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set.');
  return stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
}

async function userForEvent(obj) {
  const direct = obj.metadata?.discord_id || obj.client_reference_id;
  if (direct && platform.users.get(direct)) return platform.users.get(direct);
  if (obj.customer) return platform.users.byCustomer(obj.customer);
  if (obj.subscription) return platform.users.bySubscription(obj.subscription);
  return null;
}

/** Handle a verified Stripe event. Returns a short description for logs. */
async function handleEvent(event) {
  if (platform.billing.seen(event.id)) return 'duplicate';
  const obj = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed': {
      const user = await userForEvent(obj);
      if (user && obj.subscription) {
        const planKey = obj.metadata?.plan;
        platform.users.setBilling(user.id, { subscription: obj.subscription, stripe_customer: obj.customer, sub_status: 'active' });
        const sub = await stripe.subscriptions.retrieve(obj.subscription).catch(() => null);
        const until = sub?.current_period_end ? sub.current_period_end * 1000 : null;
        await applyPlan(user.id, planKey || keyFromSub(sub), { until, audit: 'billing.subscribe' });
        platform.billing.record(event.id, event.type, user.id);
        return `subscribed ${user.id} -> ${planKey}`;
      }
      break;
    }
    case 'customer.subscription.updated': {
      const user = platform.users.bySubscription(obj.id) || await userForEvent(obj);
      if (user) {
        const planKey = keyFromSub(obj);
        const active = ['active', 'trialing'].includes(obj.status);
        const until = obj.current_period_end ? obj.current_period_end * 1000 : null;
        platform.users.setBilling(user.id, { sub_status: obj.status });
        // if past_due/unpaid/canceled -> drop to free; else keep the plan
        await applyPlan(user.id, active && !obj.cancel_at_period_end ? planKey : (active ? planKey : 'free'), { until: active ? until : Date.now(), audit: 'billing.update' });
        platform.billing.record(event.id, event.type, user.id);
        return `updated ${user.id} status=${obj.status}`;
      }
      break;
    }
    case 'customer.subscription.deleted': { // cancellation / final churn -> kill switch
      const user = platform.users.bySubscription(obj.id) || await userForEvent(obj);
      if (user) {
        platform.users.setBilling(user.id, { sub_status: 'canceled', subscription: null });
        const r = await applyPlan(user.id, 'free', { audit: 'billing.canceled' });
        platform.billing.record(event.id, event.type, user.id);
        return `canceled ${user.id}, suspended ${r.suspended.length} bot(s)`;
      }
      break;
    }
    case 'charge.refunded':
    case 'charge.dispute.created': { // refund / chargeback -> immediate kill switch
      const user = await userForEvent(obj) || (obj.customer && platform.users.byCustomer(obj.customer));
      if (user) {
        // cancel the live subscription too so it doesn't keep renewing
        const sub = platform.users.get(user.id)?.subscription;
        if (sub) await stripe.subscriptions.cancel(sub).catch(() => {});
        platform.users.setBilling(user.id, { sub_status: event.type === 'charge.refunded' ? 'refunded' : 'disputed', subscription: null });
        const r = await applyPlan(user.id, 'free', { audit: event.type === 'charge.refunded' ? 'billing.refunded' : 'billing.disputed' });
        platform.billing.record(event.id, event.type, user.id);
        return `${event.type} ${user.id}, suspended ${r.suspended.length} bot(s)`;
      }
      break;
    }
    case 'invoice.payment_failed': {
      const user = obj.subscription ? platform.users.bySubscription(obj.subscription) : await userForEvent(obj);
      if (user) { platform.users.setBilling(user.id, { sub_status: 'past_due' }); platform.billing.record(event.id, event.type, user.id); return `payment failed ${user.id}`; }
      break;
    }
    default:
      return `ignored ${event.type}`;
  }
  return `no user for ${event.type}`;
}

function keyFromSub(sub) {
  const priceId = sub?.items?.data?.[0]?.price?.id;
  return planFromPriceId(priceId)?.key || 'pro';
}

// Fallback for deployments without Stripe webhooks: downgrade users whose plan_until has passed.
function startExpiryTicker() {
  const run = async () => {
    for (const u of platform.users.expired()) {
      await applyPlan(u.id, 'free', { audit: 'billing.expired' }).catch(() => {});
    }
  };
  setInterval(() => run().catch(() => {}), 60 * 60_000).unref();
  setTimeout(() => run().catch(() => {}), 30_000).unref();
}

module.exports = { enabled, createCheckout, createPortal, verifyWebhook, handleEvent, applyPlan, startExpiryTicker, stripe };
