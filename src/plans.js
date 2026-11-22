// Pretplatnički paketi. amount = cijena u centima (za Stripe), priceId = Stripe Price ID (ili prazno).
// Ako Stripe nije postavljen, paket se dodjeljuje ručno u Admin panelu.
module.exports = {
  free: {
    key: 'free', name: 'Free', price: '0 €', period: 'zauvijek', maxBots: 1, amount: 0, priceId: '',
    features: ['1 vlastiti bot', 'Svi moduli', 'Web dashboard', 'Podrška zajednice'],
  },
  pro: {
    key: 'pro', name: 'Pro', price: '4,99 €', period: 'mjesečno', maxBots: 5, highlight: true, amount: 499, priceId: process.env.STRIPE_PRICE_PRO || '',
    features: ['Do 5 botova', 'Svi moduli', 'Prilagođeni status i profil', 'Prioritetna podrška', 'Konzola i logovi bota'],
  },
  business: {
    key: 'business', name: 'Business', price: '14,99 €', period: 'mjesečno', maxBots: 25, amount: 1499, priceId: process.env.STRIPE_PRICE_BUSINESS || '',
    features: ['Do 25 botova', 'Sve iz Pro paketa', 'Idealno za agencije i mreže servera', 'Direktna podrška'],
  },
};
