// Pretplatnički paketi. Cijene su samo prikaz na stranici — naplatu (Stripe, PayPal, ručno) dodaješ sam,
// a paket korisniku dodjeljuješ u Admin panelu.
module.exports = {
  free: {
    key: 'free', name: 'Free', price: '0 €', period: 'zauvijek', maxBots: 1,
    features: ['1 vlastiti bot', 'Svi moduli', 'Web dashboard', 'Podrška zajednice'],
  },
  pro: {
    key: 'pro', name: 'Pro', price: '4,99 €', period: 'mjesečno', maxBots: 5, highlight: true,
    features: ['Do 5 botova', 'Svi moduli', 'Prilagođeni status i profil', 'Prioritetna podrška', 'Konzola i logovi bota'],
  },
  business: {
    key: 'business', name: 'Business', price: '14,99 €', period: 'mjesečno', maxBots: 25,
    features: ['Do 25 botova', 'Sve iz Pro paketa', 'Idealno za agencije i mreže servera', 'Direktna podrška'],
  },
};
