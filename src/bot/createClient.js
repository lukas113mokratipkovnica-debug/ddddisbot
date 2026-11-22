const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, ActivityType } = require('discord.js');
const { createDatabase } = require('../database');
const giveaways = require('./systems/giveaways');
const tickers = require('./systems/tickers');
const tempvoice = require('./systems/tempvoice');
const invites = require('./systems/invites');

const FILE_MODULE = { giveaway: 'giveaways' };

// Load every command once; each client picks the ones whose module is enabled.
const ALL_COMMANDS = new Collection();
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter((f) => f.endsWith('.js'))) {
  const exported = require(path.join(__dirname, 'commands', file));
  const base = path.basename(file, '.js');
  for (const cmd of Array.isArray(exported) ? exported : [exported]) {
    cmd.module ||= FILE_MODULE[base] || base;
    ALL_COMMANDS.set(cmd.data.name, cmd);
  }
}
const EVENTS = fs.readdirSync(path.join(__dirname, 'events')).filter((f) => f.endsWith('.js'))
  .flatMap((f) => { const e = require(path.join(__dirname, 'events', f)); return Array.isArray(e) ? e : [e]; });

const ACTIVITY = { playing: ActivityType.Playing, watching: ActivityType.Watching, listening: ActivityType.Listening, competing: ActivityType.Competing, custom: ActivityType.Custom };

/**
 * @param {{ id: string, token: string, modules: string[], presence?: object, devGuildId?: string, onLog?: Function }} opts
 */
function createBotClient(opts) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildInvites, GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User],
    allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
  });

  client.botId = opts.id;
  client.db = createDatabase(opts.id);
  client.presenceConfig = opts.presence || {};
  client.timers = [];
  client.log = opts.onLog || (() => {});
  client.setModules = (mods) => {
    client.modules = new Set(['core', ...mods]);
    client.commands = ALL_COMMANDS.filter((c) => client.modules.has(c.module));
  };
  client.setModules(opts.modules);

  client.registerCommands = async () => {
    const body = client.commands.map((c) => c.data.toJSON());
    if (opts.devGuildId) {
      const g = await client.guilds.fetch(opts.devGuildId).catch(() => null);
      if (g) { await g.commands.set(body); await client.application.commands.set([]); return body.length; }
    }
    await client.application.commands.set(body);
    return body.length;
  };

  client.applyPresence = () => {
    const p = client.presenceConfig;
    const text = (p.text || '{servers} servera • /help').replace('{servers}', client.guilds.cache.size).replace('{members}', client.guilds.cache.reduce((a, g) => a + g.memberCount, 0));
    const type = ACTIVITY[p.type] ?? ActivityType.Watching;
    client.user.setPresence({
      status: ['online', 'idle', 'dnd', 'invisible'].includes(p.status) ? p.status : 'online',
      activities: [type === ActivityType.Custom ? { name: 'custom', state: text, type } : { name: text, type }],
    });
  };

  for (const ev of EVENTS) {
    const run = (...args) => Promise.resolve(ev.execute(...args, client)).catch((e) => {
      console.error(`[${opts.id}:${ev.name}]`, e);
      client.log('error', `${ev.name}: ${e.message}`);
    });
    if (ev.once) client.once(ev.name, run); else client.on(ev.name, run);
  }

  client.once('clientReady', async () => {
    client.log('info', `Prijavljen kao ${client.user.tag} na ${client.guilds.cache.size} servera`);
    try { client.log('info', `Registrirano ${await client.registerCommands()} slash komandi`); } catch (e) { client.log('error', `Registracija komandi: ${e.message}`); }
    client.applyPresence();
    client.timers.push(setInterval(() => client.applyPresence(), 10 * 60_000));
    client.timers.push(giveaways.startTicker(client));
    client.timers.push(...tickers.start(client));
    if (client.modules.has('invites')) invites.cacheAll(client).catch(() => {});
    if (client.modules.has('tempvoice')) tempvoice.cleanup(client).catch(() => {});
  });

  client.shutdown = async () => {
    client.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
    client.timers = [];
    await client.destroy();
  };

  return client;
}

module.exports = { createBotClient, ALL_COMMANDS };
