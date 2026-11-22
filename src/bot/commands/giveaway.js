const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const gw = require('../systems/giveaways');
const { ok, fail, parseDuration, formatDuration } = require('../utils');

module.exports = [
  {
    data: new SlashCommandBuilder().setName('giveaway').setDescription('Giveaway sistem')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('start').setDescription('Pokreni giveaway')
        .addStringOption((o) => o.setName('nagrada').setDescription('Nagrada').setRequired(true).setMaxLength(200))
        .addStringOption((o) => o.setName('trajanje').setDescription('npr. 1h, 2d, 30m').setRequired(true))
        .addIntegerOption((o) => o.setName('pobjednici').setDescription('Broj pobjednika').setMinValue(1).setMaxValue(50))
        .addChannelOption((o) => o.setName('kanal').setDescription('Kanal').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
      .addSubcommand((s) => s.setName('end').setDescription('Završi giveaway odmah')
        .addIntegerOption((o) => o.setName('id').setDescription('ID giveawaya (u footeru)').setRequired(true)))
      .addSubcommand((s) => s.setName('reroll').setDescription('Izvuci novog pobjednika')
        .addIntegerOption((o) => o.setName('id').setDescription('ID giveawaya').setRequired(true))),
    async execute(i) {
      const sub = i.options.getSubcommand();
      if (sub === 'start') {
        const ms = parseDuration(i.options.getString('trajanje'));
        if (!ms || ms < 10_000) return i.reply({ embeds: [fail('Neispravno trajanje (min 10s).')], flags: MessageFlags.Ephemeral });
        const ch = i.options.getChannel('kanal') || i.channel;
        const g = await gw.start(ch, i.options.getString('nagrada'), ms, i.options.getInteger('pobjednici') || 1, i.user.id);
        return i.reply({ embeds: [ok(`Giveaway #${g.id} pokrenut u ${ch} na ${formatDuration(ms)}.`)], flags: MessageFlags.Ephemeral });
      }
      const id = i.options.getInteger('id');
      const g = i.client.db.giveaways.get(id);
      if (!g || g.guild_id !== i.guild.id) return i.reply({ embeds: [fail('Giveaway nije pronađen.')], flags: MessageFlags.Ephemeral });
      if (sub === 'end' && g.ended) return i.reply({ embeds: [fail('Već je završen.')], flags: MessageFlags.Ephemeral });
      if (sub === 'reroll' && !g.ended) return i.reply({ embeds: [fail('Giveaway još traje.')], flags: MessageFlags.Ephemeral });
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await gw.end(i.client, id, { reroll: sub === 'reroll' });
      return i.editReply({ embeds: [ok(sub === 'end' ? 'Giveaway završen.' : 'Novi pobjednik izvučen.')] });
    },
  },
];
