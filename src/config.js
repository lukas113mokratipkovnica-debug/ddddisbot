require('dotenv').config();
const crypto = require('crypto');

const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'CLIENT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[config] Nedostaju varijable u .env: ${missing.join(', ')}`);
  process.exit(1);
}

const sessionSecret = process.env.SESSION_SECRET || 'change-me';

module.exports = {
  brand: process.env.BRAND_NAME || 'Botnica',
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
};
