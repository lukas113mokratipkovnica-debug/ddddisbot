const config = require('./config');
const { client } = require('./bot/client');
const { startDashboard } = require('./dashboard/server');

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

client.once('clientReady', () => startDashboard(client));
client.login(config.token).catch((e) => {
  console.error('[bot] Login nije uspio:', e.message);
  if (/disallowed intents/i.test(e.message)) {
    console.error('→ Uključi "Server Members Intent" i "Message Content Intent" u Developer Portalu (Bot tab).');
  }
  process.exit(1);
});
