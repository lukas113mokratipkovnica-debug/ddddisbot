const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } = require('discord.js');
const { warnings, getSettings } = require('../../database');
const { ok, fail, logModAction, canModerate, parseDuration, formatDuration } = require('../utils');
const { thresholdPunish } = require('../systems/automod');

async function dmUser(user, guild, text) {
  await user.send(`**${guild.name}:** ${text}`).catch(() => {});
}

module.exports = [
  {
    data: new SlashCommandBuilder().setName('ban').setDescription('Banuj korisnika')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))
      .addStringOption((o) => o.setName('razlog').setDescription('Razlog'))
      .addIntegerOption((o) => o.setName('obrisi_dane').setDescription('Obriši poruke zadnjih X dana (0-7)').setMinValue(0).setMaxValue(7)),
    async execute(i) {
      const user = i.options.getUser('korisnik');
      const reason = i.options.getString('razlog') || 'Nije naveden';
      const member = await i.guild.members.fetch(user.id).catch(() => null);
      const err = canModerate(i.member, member, i.guild.members.me);
      if (err) return i.reply({ embeds: [fail(err)], flags: MessageFlags.Ephemeral });
      if (member) await dmUser(user, i.guild, `Banovan/a si. Razlog: ${reason}`);
      await i.guild.members.ban(user.id, { reason: `${i.user.tag}: ${reason}`, deleteMessageSeconds: (i.options.getInteger('obrisi_dane') || 0) * 86400 });
      const id = await logModAction(i.guild, 'ban', user, i.user, reason);
      return i.reply({ embeds: [ok(`**${user.tag}** je banovan/a. (slučaj #${id})`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('unban').setDescription('Unbanuj korisnika po ID-u')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addStringOption((o) => o.setName('id').setDescription('ID korisnika').setRequired(true))
      .addStringOption((o) => o.setName('razlog').setDescription('Razlog')),
    async execute(i) {
      const id = i.options.getString('id').replace(/\D/g, '');
      const reason = i.options.getString('razlog') || 'Nije naveden';
      const ban = await i.guild.bans.fetch(id).catch(() => null);
      if (!ban) return i.reply({ embeds: [fail('Taj korisnik nije banovan.')], flags: MessageFlags.Ephemeral });
      await i.guild.members.unban(id, `${i.user.tag}: ${reason}`);
      const c = await logModAction(i.guild, 'unban', ban.user, i.user, reason);
      return i.reply({ embeds: [ok(`**${ban.user.tag}** je unbanovan/a. (slučaj #${c})`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('kick').setDescription('Izbaci korisnika')
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))
      .addStringOption((o) => o.setName('razlog').setDescription('Razlog')),
    async execute(i) {
      const member = i.options.getMember('korisnik');
      const reason = i.options.getString('razlog') || 'Nije naveden';
      if (!member) return i.reply({ embeds: [fail('Korisnik nije na serveru.')], flags: MessageFlags.Ephemeral });
      const err = canModerate(i.member, member, i.guild.members.me);
      if (err) return i.reply({ embeds: [fail(err)], flags: MessageFlags.Ephemeral });
      await dmUser(member.user, i.guild, `Izbačen/a si. Razlog: ${reason}`);
      await member.kick(`${i.user.tag}: ${reason}`);
      const id = await logModAction(i.guild, 'kick', member.user, i.user, reason);
      return i.reply({ embeds: [ok(`**${member.user.tag}** je izbačen/a. (slučaj #${id})`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('timeout').setDescription('Utišaj korisnika (timeout)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))
      .addStringOption((o) => o.setName('trajanje').setDescription('npr. 10m, 2h, 1d (max 28d)').setRequired(true))
      .addStringOption((o) => o.setName('razlog').setDescription('Razlog')),
    async execute(i) {
      const member = i.options.getMember('korisnik');
      const ms = parseDuration(i.options.getString('trajanje'));
      const reason = i.options.getString('razlog') || 'Nije naveden';
      if (!member) return i.reply({ embeds: [fail('Korisnik nije na serveru.')], flags: MessageFlags.Ephemeral });
      if (!ms || ms > 28 * 864e5) return i.reply({ embeds: [fail('Neispravno trajanje (npr. 10m, 1h, 3d; max 28d).')], flags: MessageFlags.Ephemeral });
      const err = canModerate(i.member, member, i.guild.members.me);
      if (err) return i.reply({ embeds: [fail(err)], flags: MessageFlags.Ephemeral });
      await member.timeout(ms, `${i.user.tag}: ${reason}`);
      await dmUser(member.user, i.guild, `Dobio/la si timeout na ${formatDuration(ms)}. Razlog: ${reason}`);
      const id = await logModAction(i.guild, 'timeout', member.user, i.user, reason, `Trajanje: ${formatDuration(ms)}`);
      return i.reply({ embeds: [ok(`**${member.user.tag}** je utišan/a na **${formatDuration(ms)}**. (slučaj #${id})`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('untimeout').setDescription('Ukloni timeout')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))
      .addStringOption((o) => o.setName('razlog').setDescription('Razlog')),
    async execute(i) {
      const member = i.options.getMember('korisnik');
      if (!member?.isCommunicationDisabled()) return i.reply({ embeds: [fail('Taj korisnik nema timeout.')], flags: MessageFlags.Ephemeral });
      const reason = i.options.getString('razlog') || 'Nije naveden';
      await member.timeout(null, `${i.user.tag}: ${reason}`);
      const id = await logModAction(i.guild, 'untimeout', member.user, i.user, reason);
      return i.reply({ embeds: [ok(`Timeout uklonjen za **${member.user.tag}**. (slučaj #${id})`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('warn').setDescription('Upozori korisnika')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))
      .addStringOption((o) => o.setName('razlog').setDescription('Razlog').setRequired(true)),
    async execute(i) {
      const member = i.options.getMember('korisnik');
      const reason = i.options.getString('razlog');
      if (!member) return i.reply({ embeds: [fail('Korisnik nije na serveru.')], flags: MessageFlags.Ephemeral });
      if (member.user.bot) return i.reply({ embeds: [fail('Ne možeš upozoriti bota.')], flags: MessageFlags.Ephemeral });
      warnings.add(i.guild.id, member.id, i.user.id, reason);
      const count = warnings.count(i.guild.id, member.id);
      await dmUser(member.user, i.guild, `Dobio/la si upozorenje (#${count}). Razlog: ${reason}`);
      const id = await logModAction(i.guild, 'warn', member.user, i.user, reason, `Ukupno upozorenja: ${count}`);
      await i.reply({ embeds: [ok(`**${member.user.tag}** je upozoren/a. Ukupno: **${count}**. (slučaj #${id})`)] });
      const T = getSettings(i.guild.id).automod.warnThreshold;
      if (T.enabled && count >= T.count && count % T.count === 0) await thresholdPunish(member, T, count);
    },
  },
  {
    data: new SlashCommandBuilder().setName('warnings').setDescription('Prikaži upozorenja korisnika')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true)),
    async execute(i) {
      const user = i.options.getUser('korisnik');
      const list = warnings.list(i.guild.id, user.id);
      const e = new EmbedBuilder().setColor(0xfee75c).setTitle(`Upozorenja: ${user.tag}`).setThumbnail(user.displayAvatarURL());
      e.setDescription(list.length
        ? list.slice(0, 20).map((w) => `**#${w.id}** • <t:${Math.floor(w.created_at / 1000)}:d> • <@${w.mod_id}>\n${w.reason || '—'}`).join('\n\n')
        : 'Nema upozorenja. 😇');
      e.setFooter({ text: `Ukupno: ${list.length}` });
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('delwarn').setDescription('Obriši upozorenje(a)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addIntegerOption((o) => o.setName('id').setDescription('ID upozorenja'))
      .addUserOption((o) => o.setName('korisnik').setDescription('Obriši SVA upozorenja ovog korisnika')),
    async execute(i) {
      const id = i.options.getInteger('id');
      const user = i.options.getUser('korisnik');
      if (id) {
        const n = warnings.remove(i.guild.id, id);
        return i.reply({ embeds: [n ? ok(`Upozorenje #${id} obrisano.`) : fail('Nema tog upozorenja.')] });
      }
      if (user) {
        const n = warnings.clear(i.guild.id, user.id);
        return i.reply({ embeds: [ok(`Obrisano ${n} upozorenja za **${user.tag}**.`)] });
      }
      return i.reply({ embeds: [fail('Navedi `id` ili `korisnik`.')], flags: MessageFlags.Ephemeral });
    },
  },
  {
    data: new SlashCommandBuilder().setName('purge').setDescription('Obriši više poruka odjednom')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addIntegerOption((o) => o.setName('broj').setDescription('Broj poruka (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption((o) => o.setName('korisnik').setDescription('Samo poruke ovog korisnika'))
      .addBooleanOption((o) => o.setName('botovi').setDescription('Samo poruke botova')),
    async execute(i) {
      const amount = i.options.getInteger('broj');
      const user = i.options.getUser('korisnik');
      const bots = i.options.getBoolean('botovi');
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      let msgs = await i.channel.messages.fetch({ limit: 100 });
      msgs = msgs.filter((m) => Date.now() - m.createdTimestamp < 14 * 864e5);
      if (user) msgs = msgs.filter((m) => m.author.id === user.id);
      if (bots) msgs = msgs.filter((m) => m.author.bot);
      const toDelete = [...msgs.values()].slice(0, amount);
      const deleted = await i.channel.bulkDelete(toDelete, true);
      await logModAction(i.guild, 'purge', i.user, i.user, `Obrisano ${deleted.size} poruka`, `Kanal: <#${i.channel.id}>`);
      return i.editReply({ embeds: [ok(`Obrisano **${deleted.size}** poruka.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('slowmode').setDescription('Postavi slowmode u kanalu')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addIntegerOption((o) => o.setName('sekunde').setDescription('0 = isključi, max 21600').setRequired(true).setMinValue(0).setMaxValue(21600)),
    async execute(i) {
      const sec = i.options.getInteger('sekunde');
      await i.channel.setRateLimitPerUser(sec);
      return i.reply({ embeds: [ok(sec ? `Slowmode postavljen na **${sec}s**.` : 'Slowmode isključen.')] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('lock').setDescription('Zaključaj kanal (@everyone ne može pisati)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((o) => o.setName('kanal').setDescription('Kanal').addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o.setName('razlog').setDescription('Razlog')),
    async execute(i) {
      const ch = i.options.getChannel('kanal') || i.channel;
      await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false });
      await ch.send({ embeds: [ok(`🔒 Kanal je zaključan.${i.options.getString('razlog') ? ` Razlog: ${i.options.getString('razlog')}` : ''}`)] });
      return i.reply({ embeds: [ok(`${ch} zaključan.`)], flags: MessageFlags.Ephemeral });
    },
  },
  {
    data: new SlashCommandBuilder().setName('unlock').setDescription('Otključaj kanal')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((o) => o.setName('kanal').setDescription('Kanal').addChannelTypes(ChannelType.GuildText)),
    async execute(i) {
      const ch = i.options.getChannel('kanal') || i.channel;
      await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: null });
      await ch.send({ embeds: [ok('🔓 Kanal je otključan.')] });
      return i.reply({ embeds: [ok(`${ch} otključan.`)], flags: MessageFlags.Ephemeral });
    },
  },
  {
    data: new SlashCommandBuilder().setName('nick').setDescription('Promijeni nadimak korisniku')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))
      .addStringOption((o) => o.setName('nadimak').setDescription('Novi nadimak (prazno = reset)').setMaxLength(32)),
    async execute(i) {
      const member = i.options.getMember('korisnik');
      if (!member) return i.reply({ embeds: [fail('Korisnik nije na serveru.')], flags: MessageFlags.Ephemeral });
      const err = member.id === i.user.id ? null : canModerate(i.member, member, i.guild.members.me);
      if (err) return i.reply({ embeds: [fail(err)], flags: MessageFlags.Ephemeral });
      await member.setNickname(i.options.getString('nadimak') || null);
      return i.reply({ embeds: [ok(`Nadimak promijenjen za ${member}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('role').setDescription('Dodaj ili ukloni ulogu korisniku')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))
      .addRoleOption((o) => o.setName('uloga').setDescription('Uloga').setRequired(true)),
    async execute(i) {
      const member = i.options.getMember('korisnik');
      const role = i.options.getRole('uloga');
      if (!member) return i.reply({ embeds: [fail('Korisnik nije na serveru.')], flags: MessageFlags.Ephemeral });
      if (role.managed || role.position >= i.guild.members.me.roles.highest.position)
        return i.reply({ embeds: [fail('Ne mogu upravljati tom ulogom.')], flags: MessageFlags.Ephemeral });
      if (i.user.id !== i.guild.ownerId && role.position >= i.member.roles.highest.position)
        return i.reply({ embeds: [fail('Ta uloga je jednaka ili viša od tvoje.')], flags: MessageFlags.Ephemeral });
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        return i.reply({ embeds: [ok(`Uklonjena ${role} od ${member}.`)] });
      }
      await member.roles.add(role);
      return i.reply({ embeds: [ok(`Dodana ${role} korisniku ${member}.`)] });
    },
  },
];
