const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const T = require('../systems/tickets');
const { ok, fail } = require('../utils');

module.exports = [
  {
    data: new SlashCommandBuilder().setName('ticket').setDescription('Tiket sistem')
      .addSubcommand((s) => s.setName('panel').setDescription('Pošalji panel za otvaranje tiketa (admin)')
        .addChannelOption((o) => o.setName('kanal').setDescription('Kanal').addChannelTypes(ChannelType.GuildText)))
      .addSubcommand((s) => s.setName('open').setDescription('Otvori tiket')
        .addStringOption((o) => o.setName('tema').setDescription('Tema').setMaxLength(500)))
      .addSubcommand((s) => s.setName('close').setDescription('Zatvori ovaj tiket')
        .addStringOption((o) => o.setName('razlog').setDescription('Razlog')))
      .addSubcommand((s) => s.setName('add').setDescription('Dodaj korisnika u tiket')
        .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true)))
      .addSubcommand((s) => s.setName('remove').setDescription('Ukloni korisnika iz tiketa')
        .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))),
    async execute(i) {
      const sub = i.options.getSubcommand();
      const s = i.client.db.getSettings(i.guild.id).tickets;
      if (sub === 'panel') {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageGuild)) return i.reply({ embeds: [fail('Treba ti Manage Server.')], flags: MessageFlags.Ephemeral });
        const ch = i.options.getChannel('kanal') || i.channel;
        await T.postPanel(ch);
        return i.reply({ embeds: [ok(`Panel poslan u ${ch}.${s.enabled ? '' : ' ⚠️ Tiketi su isključeni — uključi ih na dashboardu.'}`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'open') return T.openTicket(i, i.options.getString('tema') || '');
      if (sub === 'close') return T.closeTicket(i, i.options.getString('razlog') || '');

      const t = i.client.db.tickets.byChannel(i.channel.id);
      if (!t || t.status !== 'open') return i.reply({ embeds: [fail('Ovo nije tiket kanal.')], flags: MessageFlags.Ephemeral });
      if (!T.isStaff(i.member, s)) return i.reply({ embeds: [fail('Samo tim to može.')], flags: MessageFlags.Ephemeral });
      const user = i.options.getUser('korisnik');
      if (sub === 'add') {
        await i.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
        return i.reply({ embeds: [ok(`${user} dodan/a u tiket.`)] });
      }
      await i.channel.permissionOverwrites.delete(user.id);
      return i.reply({ embeds: [ok(`${user} uklonjen/a iz tiketa.`)] });
    },
  },
];
