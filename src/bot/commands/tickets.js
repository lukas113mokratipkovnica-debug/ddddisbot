const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const T = require('../systems/tickets');
const { ok, fail } = require('../utils');

module.exports = [
  {
    data: new SlashCommandBuilder().setName('ticket').setDescription('Ticket system')
      .addSubcommand((s) => s.setName('panel').setDescription('Send the ticket panel (admin)')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText)))
      .addSubcommand((s) => s.setName('open').setDescription('Open ticket')
        .addStringOption((o) => o.setName('topic').setDescription('Topic').setMaxLength(500)))
      .addSubcommand((s) => s.setName('close').setDescription('Close this ticket')
        .addStringOption((o) => o.setName('reason').setDescription('Reason')))
      .addSubcommand((s) => s.setName('add').setDescription('Add a member to the ticket')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)))
      .addSubcommand((s) => s.setName('remove').setDescription('Remove a member from the ticket')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))),
    async execute(i) {
      const sub = i.options.getSubcommand();
      const s = i.client.db.getSettings(i.guild.id).tickets;
      if (sub === 'panel') {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild)) return i.reply({ embeds: [fail('You need Manage Server.')], flags: MessageFlags.Ephemeral });
        const ch = i.options.getChannel('channel') || i.channel;
        await T.postPanel(ch);
        return i.reply({ embeds: [ok(`Panel sent to ${ch}.${s.enabled ? '' : ' ⚠️ Tickets are disabled — enable them in the dashboard.'}`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'open') return T.openTicket(i, i.options.getString('topic') || '');
      if (sub === 'close') return T.closeTicket(i, i.options.getString('reason') || '');

      const t = i.client.db.tickets.byChannel(i.channel.id);
      if (!t || t.status !== 'open') return i.reply({ embeds: [fail('This is not a ticket channel.')], flags: MessageFlags.Ephemeral });
      if (!T.isStaff(i.member, s)) return i.reply({ embeds: [fail('Only the team can do that.')], flags: MessageFlags.Ephemeral });
      const user = i.options.getUser('user');
      if (sub === 'add') {
        await i.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
        return i.reply({ embeds: [ok(`${user} was added to the ticket.`)] });
      }
      await i.channel.permissionOverwrites.delete(user.id);
      return i.reply({ embeds: [ok(`${user} was removed from the ticket.`)] });
    },
  },
];
