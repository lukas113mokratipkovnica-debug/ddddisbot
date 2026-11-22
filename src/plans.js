// Subscription plans. amount = price in cents (for Stripe), priceId = Stripe Price ID (or empty).
// If Stripe is not configured, the plan is assigned manually in the Admin panel.
module.exports = {
  free: {
    key: 'free', name: 'Free', price: '0 €', period: 'forever', maxBots: 1, amount: 0, priceId: '',
    features: ['1 custom bot', 'All modules', 'Web dashboard', 'Community support'],
  },
  pro: {
    key: 'pro', name: 'Pro', price: '4,99 €', period: 'monthly', maxBots: 5, highlight: true, amount: 499, priceId: process.env.STRIPE_PRICE_PRO || '',
    features: ['Up to 5 bots', 'All modules', 'Custom status and profile', 'Priority support', 'Bot console and logs'],
  },
  business: {
    key: 'business', name: 'Business', price: '14,99 €', period: 'monthly', maxBots: 25, amount: 1499, priceId: process.env.STRIPE_PRICE_BUSINESS || '',
    features: ['Up to 25 bots', 'Everything in Pro', 'Ideal for agencies and server networks', 'Direct support'],
  },
};
