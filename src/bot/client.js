const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, ActivityType } = require('discord.js');
const config = require('../config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User],
  allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
});

client.commands = new Collection();
const cmdDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(cmdDir).filter((f) => f.endsWith('.js'))) {
  const exported = require(path.join(cmdDir, file));
  for (const cmd of Array.isArray(exported) ? exported : [exported]) {
    cmd.category ||= path.basename(file, '.js');
    client.commands.set(cmd.data.name, cmd);
  }
}

const evDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(evDir).filter((f) => f.endsWith('.js'))) {
  const ev = require(path.join(evDir, file));
  const run = (...args) => Promise.resolve(ev.execute(...args, client)).catch((e) => console.error(`[event:${ev.name}]`, e));
  if (ev.once) client.once(ev.name, run);
  else client.on(ev.name, run);
}

async function registerCommands() {
  const body = client.commands.map((c) => c.data.toJSON());
  if (config.devGuildId) {
    const guild = await client.guilds.fetch(config.devGuildId).catch(() => null);
    if (guild) {
      await guild.commands.set(body);
      console.log(`[bot] ${body.length} komandi registrirano na dev serveru ${guild.name}`);
      return;
    }
  }
  await client.application.commands.set(body);
  console.log(`[bot] ${body.length} komandi registrirano globalno`);
}

function setPresence() {
  client.user.setPresence({
    activities: [{ name: `${client.guilds.cache.size} servera • /help`, type: ActivityType.Watching }],
    status: 'online',
  });
}

module.exports = { client, registerCommands, setPresence };
