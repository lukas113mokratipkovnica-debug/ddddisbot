require('dotenv').config({ quiet: true });
const crypto = require('crypto');

const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'CLIENT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[config] Missing variables in .env: ${missing.join(', ')}`);
  process.exit(1);
}

const sessionSecret = process.env.SESSION_SECRET || 'change-me';
const production = process.env.NODE_ENV === 'production';
if (sessionSecret === 'change-me' || sessionSecret.length < 32) {
  const msg = '[config] SESSION_SECRET must be a random string of at least 32 characters.';
  if (production) { console.error(msg); process.exit(1); } else console.warn(`${msg} (the platform will not start in production)`);
}
if (!process.env.ENCRYPTION_KEY) console.warn('[config] ENCRYPTION_KEY is not set — tokens are encrypted with a key derived from SESSION_SECRET.');

module.exports = {
  brand: process.env.BRAND_NAME || 'ServerPulse',
  production,
  trustProxy: process.env.TRUST_PROXY ?? (production ? '1' : '0'),
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  devGuildId: process.env.DEV_GUILD_ID || null,
  port: Number(process.env.PORT) || 3000,
  dashboardUrl: (process.env.DASHBOARD_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, ''),
  sessionSecret,
  // 32-byte key used to encrypt customer bot tokens at rest
  encryptionKey: crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || sessionSecret).digest(),
  ownerIds: (process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  supportUrl: process.env.SUPPORT_URL || '',
  color: 0x7c5cff,
  // --- Naplata (Stripe) ---
  stripeSecret: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripePublicKey: process.env.STRIPE_PUBLIC_KEY || '',
  currency: process.env.CURRENCY || 'eur',
  // --- AI support (Anthropic / Claude) ---
  aiKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-opus-5-5',
};
module.exports.billingEnabled = Boolean(module.exports.stripeSecret);
module.exports.aiEnabled = Boolean(module.exports.aiKey);
