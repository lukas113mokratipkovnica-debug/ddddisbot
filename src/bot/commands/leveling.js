const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { levelFromXp, totalXpForLevel } = require('../../database');
const { ok, fail, progressBar } = require('../utils');
const { applyRewards } = require('../systems/leveling');
const config = require('../../config');

module.exports = [
  {
    data: new SlashCommandBuilder().setName('rank').setDescription('Tvoj level i XP')
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik')),
    async execute(i) {
      const user = i.options.getUser('korisnik') || i.user;
      if (user.bot) return i.reply({ embeds: [fail('Botovi nemaju level.')], flags: MessageFlags.Ephemeral });
      const row = i.client.db.levels.get(i.guild.id, user.id);
      const { level, current, needed } = levelFromXp(row.xp);
      const rank = i.client.db.levels.rank(i.guild.id, user.id);
      const e = new EmbedBuilder().setColor(config.color).setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'Rang', value: `#${rank}`, inline: true },
          { name: 'Level', value: `${level}`, inline: true },
          { name: 'Ukupno XP', value: `${row.xp}`, inline: true },
          { name: `Napredak (${current}/${needed})`, value: `${progressBar(current, needed)} ${Math.floor((current / needed) * 100)}%` },
        ).setFooter({ text: `Poruka: ${row.messages}` });
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('leaderboard').setDescription('Top lista po XP-u')
      .addIntegerOption((o) => o.setName('stranica').setDescription('Stranica').setMinValue(1)),
    async execute(i) {
      const page = (i.options.getInteger('stranica') || 1) - 1;
      const rows = i.client.db.levels.top(i.guild.id, 10, page * 10);
      if (!rows.length) return i.reply({ embeds: [fail('Nema podataka za tu stranicu.')], flags: MessageFlags.Ephemeral });
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.map((r, idx) => {
        const pos = page * 10 + idx + 1;
        return `${medals[pos - 1] || `**${pos}.**`} <@${r.user_id}> — Level **${r.level}** • ${r.xp} XP`;
      });
      const e = new EmbedBuilder().setColor(config.color).setTitle(`🏆 Leaderboard • ${i.guild.name}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Stranica ${page + 1}/${Math.max(1, Math.ceil(i.client.db.levels.count(i.guild.id) / 10))} • Puna lista na dashboardu` });
      return i.reply({ embeds: [e], allowedMentions: { parse: [] } });
    },
  },
  {
    data: new SlashCommandBuilder().setName('xp').setDescription('Upravljanje XP-om (admin)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('dodaj').setDescription('Dodaj XP')
        .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))
        .addIntegerOption((o) => o.setName('kolicina').setDescription('Količina').setRequired(true).setMinValue(1)))
      .addSubcommand((s) => s.setName('oduzmi').setDescription('Oduzmi XP')
        .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))
        .addIntegerOption((o) => o.setName('kolicina').setDescription('Količina').setRequired(true).setMinValue(1)))
      .addSubcommand((s) => s.setName('level').setDescription('Postavi level')
        .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))
        .addIntegerOption((o) => o.setName('level').setDescription('Level').setRequired(true).setMinValue(0).setMaxValue(500)))
      .addSubcommand((s) => s.setName('reset').setDescription('Resetiraj XP korisnika')
        .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))),
    async execute(i) {
      const sub = i.options.getSubcommand();
      const user = i.options.getUser('korisnik');
      const cur = i.client.db.levels.get(i.guild.id, user.id);
      let newLevel;
      if (sub === 'dodaj') newLevel = i.client.db.levels.set(i.guild.id, user.id, cur.xp + i.options.getInteger('kolicina'));
      else if (sub === 'oduzmi') newLevel = i.client.db.levels.set(i.guild.id, user.id, cur.xp - i.options.getInteger('kolicina'));
      else if (sub === 'level') newLevel = i.client.db.levels.set(i.guild.id, user.id, totalXpForLevel(i.options.getInteger('level')));
      else { i.client.db.levels.reset(i.guild.id, user.id); newLevel = 0; }
      const member = await i.guild.members.fetch(user.id).catch(() => null);
      if (member && newLevel > 0) await applyRewards(member, newLevel, i.client.db.getSettings(i.guild.id));
      return i.reply({ embeds: [ok(`${user} je sada **level ${newLevel}** (${i.client.db.levels.get(i.guild.id, user.id).xp} XP).`)] });
    },
  },
];
