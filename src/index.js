const manager = require('./bot/manager');
const { startDashboard } = require('./dashboard/server');

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

startDashboard();
manager.startAll();

const shutdown = async () => {
  console.log('Gašenje svih botova…');
  await manager.stopAll();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
