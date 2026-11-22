const { Events, MessageFlags } = require('discord.js');
const { getSettings, stats } = require('../../database');
const { fail } = require('../utils');
const tickets = require('../systems/tickets');
const giveaways = require('../systems/giveaways');
const rolePanels = require('../systems/rolePanels');

async function safeReply(i, payload) {
  if (i.deferred || i.replied) return i.followUp({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
  return i.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(i, client) {
    if (!i.inGuild()) {
      if (i.isRepliable()) return i.reply({ content: 'Komande rade samo na serverima.', flags: MessageFlags.Ephemeral });
      return;
    }
    try {
      if (i.isChatInputCommand()) {
        const cmd = client.commands.get(i.commandName);
        if (!cmd) return;
        if (getSettings(i.guild.id).disabledCommands.includes(i.commandName)) {
          return i.reply({ embeds: [fail('Ova komanda je isključena na ovom serveru.')], flags: MessageFlags.Ephemeral });
        }
        stats.bump(i.guild.id, 'commands');
        return await cmd.execute(i, client);
      }
      if (i.isButton()) {
        const [ns, a, b] = i.customId.split(':');
        if (ns === 'ticket') {
          if (a === 'open') return await tickets.showOpenModal(i);
          if (a === 'close') return await tickets.closeTicket(i);
          if (a === 'claim') return await tickets.claimTicket(i);
        }
        if (ns === 'gw' && a === 'join') return await giveaways.handleJoin(i, b);
        if (ns === 'rr') return await rolePanels.handleButton(i, a, b);
      }
      if (i.isModalSubmit() && i.customId === 'ticket:modal') {
        return await tickets.openTicket(i, i.fields.getTextInputValue('topic') || '');
      }
    } catch (e) {
      console.error(`[interaction] ${i.customId || i.commandName}:`, e);
      await safeReply(i, { embeds: [fail(`Došlo je do greške: ${e.message}`)] });
    }
  },
};
