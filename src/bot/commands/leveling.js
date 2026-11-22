const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { levelFromXp, totalXpForLevel } = require('../../database');
const { ok, fail, progressBar } = require('../utils');
const { applyRewards } = require('../systems/leveling');
const config = require('../../config');

module.exports = [
  {
    data: new SlashCommandBuilder().setName('rank').setDescription('Your level and XP')
      .addUserOption((o) => o.setName('user').setDescription('Member')),
    async execute(i) {
      const user = i.options.getUser('user') || i.user;
      if (user.bot) return i.reply({ embeds: [fail('Bots don\'t have levels.')], flags: MessageFlags.Ephemeral });
      const row = i.client.db.levels.get(i.guild.id, user.id);
      const { level, current, needed } = levelFromXp(row.xp);
      const rank = i.client.db.levels.rank(i.guild.id, user.id);
      const e = new EmbedBuilder().setColor(config.color).setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'Rank', value: `#${rank}`, inline: true },
          { name: 'Level', value: `${level}`, inline: true },
          { name: 'Total XP', value: `${row.xp}`, inline: true },
          { name: `Progress (${current}/${needed})`, value: `${progressBar(current, needed)} ${Math.floor((current / needed) * 100)}%` },
        ).setFooter({ text: `Messages: ${row.messages}` });
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('leaderboard').setDescription('XP leaderboard')
      .addIntegerOption((o) => o.setName('page').setDescription('Page').setMinValue(1)),
    async execute(i) {
      const page = (i.options.getInteger('page') || 1) - 1;
      const rows = i.client.db.levels.top(i.guild.id, 10, page * 10);
      if (!rows.length) return i.reply({ embeds: [fail('No data for that page.')], flags: MessageFlags.Ephemeral });
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.map((r, idx) => {
        const pos = page * 10 + idx + 1;
        return `${medals[pos - 1] || `**${pos}.**`} <@${r.user_id}> — Level **${r.level}** • ${r.xp} XP`;
      });
      const e = new EmbedBuilder().setColor(config.color).setTitle(`🏆 Leaderboard • ${i.guild.name}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Page ${page + 1}/${Math.max(1, Math.ceil(i.client.db.levels.count(i.guild.id) / 10))} • Full list in the dashboard` });
      return i.reply({ embeds: [e], allowedMentions: { parse: [] } });
    },
  },
  {
    data: new SlashCommandBuilder().setName('xp').setDescription('Manage XP (admin)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('add').setDescription('Add XP')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
        .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
      .addSubcommand((s) => s.setName('subtract').setDescription('Remove XP')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
        .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
      .addSubcommand((s) => s.setName('level').setDescription('Set level')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
        .addIntegerOption((o) => o.setName('level').setDescription('Level').setRequired(true).setMinValue(0).setMaxValue(500)))
      .addSubcommand((s) => s.setName('reset').setDescription('Reset a member\'s XP')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))),
    async execute(i) {
      const sub = i.options.getSubcommand();
      const user = i.options.getUser('user');
      const cur = i.client.db.levels.get(i.guild.id, user.id);
      let newLevel;
      if (sub === 'add') newLevel = i.client.db.levels.set(i.guild.id, user.id, cur.xp + i.options.getInteger('amount'));
      else if (sub === 'subtract') newLevel = i.client.db.levels.set(i.guild.id, user.id, cur.xp - i.options.getInteger('amount'));
      else if (sub === 'level') newLevel = i.client.db.levels.set(i.guild.id, user.id, totalXpForLevel(i.options.getInteger('level')));
      else { i.client.db.levels.reset(i.guild.id, user.id); newLevel = 0; }
      const member = await i.guild.members.fetch(user.id).catch(() => null);
      if (member && newLevel > 0) await applyRewards(member, newLevel, i.client.db.getSettings(i.guild.id));
      return i.reply({ embeds: [ok(`${user} is now **level ${newLevel}** (${i.client.db.levels.get(i.guild.id, user.id).xp} XP).`)] });
    },
  },
];
