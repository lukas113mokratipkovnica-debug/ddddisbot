const { Events, MessageFlags } = require('discord.js');
const { fail } = require('../utils');
const tickets = require('../systems/tickets');
const giveaways = require('../systems/giveaways');
const rolePanels = require('../systems/rolePanels');
const verification = require('../systems/verification');

async function safeReply(i, payload) {
  if (i.deferred || i.replied) return i.followUp({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
  return i.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(i, client) {
    if (!i.inGuild()) {
      if (i.isRepliable()) return i.reply({ content: 'Commands only work in servers.', flags: MessageFlags.Ephemeral });
      return;
    }
    const has = (m) => client.modules.has(m);
    try {
      if (i.isChatInputCommand()) {
        const cmd = client.commands.get(i.commandName);
        if (!cmd) return i.reply({ embeds: [fail('This command is not enabled right now.')], flags: MessageFlags.Ephemeral });
        if (client.db.getSettings(i.guild.id).disabledCommands.includes(i.commandName)) {
          return i.reply({ embeds: [fail('This command is disabled on this server.')], flags: MessageFlags.Ephemeral });
        }
        client.db.stats.bump(i.guild.id, 'commands');
        client.log?.('cmd', `/${i.commandName} — ${i.user.tag} @ ${i.guild.name}`);
        return await cmd.execute(i, client);
      }
      if (i.isButton()) {
        const [ns, a, b] = i.customId.split(':');
        if (ns === 'ticket' && has('tickets')) {
          if (a === 'open') return await tickets.showOpenModal(i);
          if (a === 'close') return await tickets.closeTicket(i);
          if (a === 'claim') return await tickets.claimTicket(i);
        }
        if (ns === 'gw' && a === 'join' && has('giveaways')) return await giveaways.handleJoin(i, b);
        if (ns === 'rr' && has('roles')) return await rolePanels.handleButton(i, a, b);
        if (ns === 'verify' && has('verification')) return await verification.handleButton(i, a);
        return i.reply({ embeds: [fail('This module is disabled.')], flags: MessageFlags.Ephemeral });
      }
      if (i.isModalSubmit()) {
        if (i.customId === 'ticket:modal') return await tickets.openTicket(i, i.fields.getTextInputValue('topic') || '');
        if (i.customId === 'verify:modal') return await verification.handleModal(i);
      }
    } catch (e) {
      console.error(`[interaction] ${i.customId || i.commandName}:`, e);
      client.log?.('error', `${i.customId || `/${i.commandName}`}: ${e.message}`);
      await safeReply(i, { embeds: [fail(`Something went wrong: ${e.message}`)] });
    }
  },
};
