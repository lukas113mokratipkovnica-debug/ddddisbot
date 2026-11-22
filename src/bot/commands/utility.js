const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, MessageFlags, version: djsVersion } = require('discord.js');
const { getSettings } = require('../../database');
const { ok, fail, formatDuration } = require('../utils');
const config = require('../../config');

const CATEGORY_NAMES = {
  moderation: '🛡️ Moderacija', utility: '🔧 Korisno', leveling: '📈 Leveling', giveaway: '🎉 Giveaway',
  tickets: '🎫 Tiketi', community: '💬 Zajednica',
};

module.exports = [
  {
    data: new SlashCommandBuilder().setName('ping').setDescription('Latencija bota'),
    async execute(i) {
      const sent = Date.now();
      await i.reply({ content: 'Pong…' });
      return i.editReply(`🏓 Pong! Poruka: **${Date.now() - sent}ms** • WebSocket: **${i.client.ws.ping}ms**`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('help').setDescription('Popis svih komandi'),
    async execute(i) {
      const groups = {};
      for (const cmd of i.client.commands.values()) (groups[cmd.category] ||= []).push(cmd.data);
      const e = new EmbedBuilder().setColor(config.color).setTitle(`${i.client.user.username} • Komande`)
        .setDescription(`Sve postavke se mijenjaju na dashboardu: ${config.dashboardUrl}`)
        .setThumbnail(i.client.user.displayAvatarURL());
      for (const [cat, cmds] of Object.entries(groups)) {
        e.addFields({ name: CATEGORY_NAMES[cat] || cat, value: cmds.map((c) => `\`/${c.name}\``).join(' ') });
      }
      const s = getSettings(i.guild.id);
      e.setFooter({ text: `Prefix za custom komande: ${s.prefix}` });
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('dashboard').setDescription('Link na web dashboard'),
    async execute(i) {
      return i.reply({ embeds: [ok(`Dashboard: ${config.dashboardUrl}/dashboard/${i.guild.id}`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('botinfo').setDescription('Informacije o botu'),
    async execute(i) {
      const c = i.client;
      const e = new EmbedBuilder().setColor(config.color).setTitle(c.user.username).setThumbnail(c.user.displayAvatarURL())
        .addFields(
          { name: 'Serveri', value: `${c.guilds.cache.size}`, inline: true },
          { name: 'Korisnici', value: `${c.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`, inline: true },
          { name: 'Uptime', value: formatDuration(c.uptime), inline: true },
          { name: 'Ping', value: `${c.ws.ping}ms`, inline: true },
          { name: 'RAM', value: `${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`, inline: true },
          { name: 'Verzija', value: `discord.js ${djsVersion} • Node ${process.version}`, inline: true },
        );
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('serverinfo').setDescription('Informacije o serveru'),
    async execute(i) {
      const g = i.guild;
      const owner = await g.fetchOwner().catch(() => null);
      const e = new EmbedBuilder().setColor(config.color).setTitle(g.name).setThumbnail(g.iconURL({ size: 256 }))
        .addFields(
          { name: 'Vlasnik', value: owner ? `${owner}` : '—', inline: true },
          { name: 'Članovi', value: `${g.memberCount}`, inline: true },
          { name: 'Kreiran', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Kanali', value: `${g.channels.cache.filter((c) => c.type === ChannelType.GuildText).size} tekst • ${g.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size} voice`, inline: true },
          { name: 'Uloge', value: `${g.roles.cache.size}`, inline: true },
          { name: 'Boost', value: `Level ${g.premiumTier} (${g.premiumSubscriptionCount || 0})`, inline: true },
        ).setFooter({ text: `ID: ${g.id}` });
      if (g.bannerURL()) e.setImage(g.bannerURL({ size: 1024 }));
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('userinfo').setDescription('Informacije o korisniku')
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik')),
    async execute(i) {
      const user = i.options.getUser('korisnik') || i.user;
      const member = await i.guild.members.fetch(user.id).catch(() => null);
      const e = new EmbedBuilder().setColor(member?.displayColor || config.color).setTitle(user.tag)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'ID', value: user.id, inline: true },
          { name: 'Račun kreiran', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        );
      if (member) {
        e.addFields(
          { name: 'Pridružio se', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
          { name: `Uloge (${member.roles.cache.size - 1})`, value: member.roles.cache.filter((r) => r.id !== i.guild.id).sort((a, b) => b.position - a.position).map((r) => `${r}`).slice(0, 20).join(' ') || '—' },
        );
      }
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('avatar').setDescription('Prikaži avatar')
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik')),
    async execute(i) {
      const user = i.options.getUser('korisnik') || i.user;
      return i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setTitle(user.tag).setImage(user.displayAvatarURL({ size: 1024 }))] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('say').setDescription('Bot pošalje poruku')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addStringOption((o) => o.setName('tekst').setDescription('Tekst').setRequired(true).setMaxLength(2000))
      .addChannelOption((o) => o.setName('kanal').setDescription('Kanal').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    async execute(i) {
      const ch = i.options.getChannel('kanal') || i.channel;
      await ch.send({ content: i.options.getString('tekst').replace(/\\n/g, '\n'), allowedMentions: { parse: ['users', 'roles'] } });
      return i.reply({ embeds: [ok('Poslano.')], flags: MessageFlags.Ephemeral });
    },
  },
  {
    data: new SlashCommandBuilder().setName('embed').setDescription('Pošalji embed poruku')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addStringOption((o) => o.setName('opis').setDescription('Opis (\\n za novi red)').setRequired(true).setMaxLength(4000))
      .addStringOption((o) => o.setName('naslov').setDescription('Naslov').setMaxLength(256))
      .addStringOption((o) => o.setName('boja').setDescription('Hex boja, npr. #5865F2'))
      .addStringOption((o) => o.setName('slika').setDescription('URL slike'))
      .addChannelOption((o) => o.setName('kanal').setDescription('Kanal').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    async execute(i) {
      const ch = i.options.getChannel('kanal') || i.channel;
      const e = new EmbedBuilder().setDescription(i.options.getString('opis').replace(/\\n/g, '\n'));
      const color = i.options.getString('boja');
      e.setColor(color && /^#?[0-9a-f]{6}$/i.test(color) ? parseInt(color.replace('#', ''), 16) : config.color);
      if (i.options.getString('naslov')) e.setTitle(i.options.getString('naslov'));
      const img = i.options.getString('slika');
      if (img && /^https?:\/\//.test(img)) e.setImage(img);
      await ch.send({ embeds: [e] });
      return i.reply({ embeds: [ok('Embed poslan.')], flags: MessageFlags.Ephemeral });
    },
  },
];
