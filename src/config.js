require('dotenv').config();

const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'CLIENT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[config] Nedostaju varijable u .env: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  devGuildId: process.env.DEV_GUILD_ID || null,
  port: Number(process.env.PORT) || 3000,
  dashboardUrl: (process.env.DASHBOARD_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, ''),
  sessionSecret: process.env.SESSION_SECRET || 'change-me',
  ownerIds: (process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  color: 0x5865f2,
};
