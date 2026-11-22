const { Events } = require('discord.js');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    console.log(`[bot] Dodan na server: ${guild.name} (${guild.id})`);
    require('../client').setPresence();
  },
};
