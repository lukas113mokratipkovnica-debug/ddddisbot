const { Events } = require('discord.js');
const giveaways = require('../systems/giveaways');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    const { registerCommands, setPresence } = require('../client');
    console.log(`[bot] Prijavljen kao ${client.user.tag} na ${client.guilds.cache.size} servera`);
    await registerCommands().catch((e) => console.error('[bot] Registracija komandi nije uspjela:', e.message));
    setPresence();
    setInterval(setPresence, 10 * 60_000);
    giveaways.startTicker(client);
  },
};
