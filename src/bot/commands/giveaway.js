const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const gw = require('../systems/giveaways');
const { ok, fail, parseDuration, formatDuration } = require('../utils');

module.exports = [
  {
    data: new SlashCommandBuilder().setName('giveaway').setDescription('Giveaway system')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('start').setDescription('Start a giveaway')
        .addStringOption((o) => o.setName('prize').setDescription('Prize').setRequired(true).setMaxLength(200))
        .addStringOption((o) => o.setName('duration').setDescription('e.g. 1h, 2d, 30m').setRequired(true))
        .addIntegerOption((o) => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(50))
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
      .addSubcommand((s) => s.setName('end').setDescription('End the giveaway now')
        .addIntegerOption((o) => o.setName('id').setDescription('Giveaway ID (in the footer)').setRequired(true)))
      .addSubcommand((s) => s.setName('reroll').setDescription('Draw a new winner')
        .addIntegerOption((o) => o.setName('id').setDescription('Giveaway ID').setRequired(true))),
    async execute(i) {
      const sub = i.options.getSubcommand();
      if (sub === 'start') {
        const ms = parseDuration(i.options.getString('duration'));
        if (!ms || ms < 10_000) return i.reply({ embeds: [fail('Invalid duration (min 10s).')], flags: MessageFlags.Ephemeral });
        const ch = i.options.getChannel('channel') || i.channel;
        const g = await gw.start(ch, i.options.getString('prize'), ms, i.options.getInteger('winners') || 1, i.user.id);
        return i.reply({ embeds: [ok(`Giveaway #${g.id} started in ${ch} for ${formatDuration(ms)}.`)], flags: MessageFlags.Ephemeral });
      }
      const id = i.options.getInteger('id');
      const g = i.client.db.giveaways.get(id);
      if (!g || g.guild_id !== i.guild.id) return i.reply({ embeds: [fail('Giveaway not found.')], flags: MessageFlags.Ephemeral });
      if (sub === 'end' && g.ended) return i.reply({ embeds: [fail('It has already ended.')], flags: MessageFlags.Ephemeral });
      if (sub === 'reroll' && !g.ended) return i.reply({ embeds: [fail('The giveaway is still running.')], flags: MessageFlags.Ephemeral });
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      await gw.end(i.client, id, { reroll: sub === 'reroll' });
      return i.editReply({ embeds: [ok(sub === 'end' ? 'Giveaway ended.' : 'New winner drawn.')] });
    },
  },
];
