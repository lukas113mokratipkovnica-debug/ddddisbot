const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, MessageFlags, version: djsVersion } = require('discord.js');
const { ok, fail, formatDuration } = require('../utils');
const config = require('../../config');

const { MODULES } = require('../../modules');

const cmds = [
  {
    data: new SlashCommandBuilder().setName('ping').setDescription('Bot latency'),
    async execute(i) {
      const sent = Date.now();
      await i.reply({ content: 'Pong…' });
      return i.editReply(`🏓 Pong! Message: **${Date.now() - sent}ms** • WebSocket: **${i.client.ws.ping}ms**`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('help').setDescription('List of all commands'),
    async execute(i) {
      const groups = {};
      for (const cmd of i.client.commands.values()) (groups[cmd.module] ||= []).push(cmd.data);
      const e = new EmbedBuilder().setColor(config.color).setTitle(`${i.client.user.username} • Commands`)
        .setDescription(`Sve postavke se mijenjaju na dashboardu: ${config.dashboardUrl}/bots/${i.client.botId}/g/${i.guild.id}`)
        .setThumbnail(i.client.user.displayAvatarURL());
      for (const [cat, cmds] of Object.entries(groups)) {
        e.addFields({ name: cat === 'core' ? 'Basics' : MODULES[cat]?.name || cat, value: cmds.map((c) => `\`/${c.name}\``).join(' ') });
      }
      const s = i.client.db.getSettings(i.guild.id);
      e.setFooter({ text: `Custom command prefix: ${s.prefix}` });
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('dashboard').setDescription('Link to the web dashboard'),
    async execute(i) {
      return i.reply({ embeds: [ok(`Dashboard: ${config.dashboardUrl}/bots/${i.client.botId}/g/${i.guild.id}`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('botinfo').setDescription('Bot information'),
    async execute(i) {
      const c = i.client;
      const e = new EmbedBuilder().setColor(config.color).setTitle(c.user.username).setThumbnail(c.user.displayAvatarURL())
        .addFields(
          { name: 'Servers', value: `${c.guilds.cache.size}`, inline: true },
          { name: 'Users', value: `${c.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`, inline: true },
          { name: 'Uptime', value: formatDuration(c.uptime), inline: true },
          { name: 'Ping', value: `${c.ws.ping}ms`, inline: true },
          { name: 'RAM', value: `${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`, inline: true },
          { name: 'Modules', value: `${i.client.modules.size}`, inline: true },
          { name: 'Platform', value: `${config.brand} • discord.js ${djsVersion}`, inline: true },
        );
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('serverinfo').setDescription('Server information'),
    async execute(i) {
      const g = i.guild;
      const owner = await g.fetchOwner().catch(() => null);
      const e = new EmbedBuilder().setColor(config.color).setTitle(g.name).setThumbnail(g.iconURL({ size: 256 }))
        .addFields(
          { name: 'Owner', value: owner ? `${owner}` : '—', inline: true },
          { name: 'Members', value: `${g.memberCount}`, inline: true },
          { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Channels', value: `${g.channels.cache.filter((c) => c.type === ChannelType.GuildText).size} text • ${g.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size} voice`, inline: true },
          { name: 'Roles', value: `${g.roles.cache.size}`, inline: true },
          { name: 'Boost', value: `Level ${g.premiumTier} (${g.premiumSubscriptionCount || 0})`, inline: true },
        ).setFooter({ text: `ID: ${g.id}` });
      if (g.bannerURL()) e.setImage(g.bannerURL({ size: 1024 }));
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('userinfo').setDescription('Member information')
      .addUserOption((o) => o.setName('user').setDescription('Member')),
    async execute(i) {
      const user = i.options.getUser('user') || i.user;
      const member = await i.guild.members.fetch(user.id).catch(() => null);
      const e = new EmbedBuilder().setColor(member?.displayColor || config.color).setTitle(user.tag)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'ID', value: user.id, inline: true },
          { name: 'Account created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        );
      if (member) {
        e.addFields(
          { name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
          { name: `Roles (${member.roles.cache.size - 1})`, value: member.roles.cache.filter((r) => r.id !== i.guild.id).sort((a, b) => b.position - a.position).map((r) => `${r}`).slice(0, 20).join(' ') || '—' },
        );
      }
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('avatar').setDescription('Show avatar')
      .addUserOption((o) => o.setName('user').setDescription('Member')),
    async execute(i) {
      const user = i.options.getUser('user') || i.user;
      return i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setTitle(user.tag).setImage(user.displayAvatarURL({ size: 1024 }))] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('say').setDescription('Make the bot send a message')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addStringOption((o) => o.setName('text').setDescription('Text').setRequired(true).setMaxLength(2000))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    async execute(i) {
      const ch = i.options.getChannel('channel') || i.channel;
      await ch.send({ content: i.options.getString('text').replace(/\\n/g, '\n'), allowedMentions: { parse: ['users', 'roles'] } });
      return i.reply({ embeds: [ok('Sent.')], flags: MessageFlags.Ephemeral });
    },
  },
  {
    data: new SlashCommandBuilder().setName('embed').setDescription('Send an embed message')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addStringOption((o) => o.setName('description').setDescription('Opis (\\n za novi red)').setRequired(true).setMaxLength(4000))
      .addStringOption((o) => o.setName('title').setDescription('Title').setMaxLength(256))
      .addStringOption((o) => o.setName('color').setDescription('Hex color, e.g. #5865F2'))
      .addStringOption((o) => o.setName('image').setDescription('Image URL'))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    async execute(i) {
      const ch = i.options.getChannel('channel') || i.channel;
      const e = new EmbedBuilder().setDescription(i.options.getString('description').replace(/\\n/g, '\n'));
      const color = i.options.getString('color');
      e.setColor(color && /^#?[0-9a-f]{6}$/i.test(color) ? parseInt(color.replace('#', ''), 16) : config.color);
      if (i.options.getString('title')) e.setTitle(i.options.getString('title'));
      const img = i.options.getString('image');
      if (img && /^https?:\/\//.test(img)) e.setImage(img);
      await ch.send({ embeds: [e] });
      return i.reply({ embeds: [ok('Embed sent.')], flags: MessageFlags.Ephemeral });
    },
  },
];
const CORE = ['ping', 'help', 'dashboard', 'botinfo'];
cmds.forEach((c) => { c.module = CORE.includes(c.data.name) ? 'core' : 'utility'; });
module.exports = cmds;
