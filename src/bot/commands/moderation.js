const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } = require('discord.js');
const { ok, fail, logModAction, canModerate, parseDuration, formatDuration } = require('../utils');
const { thresholdPunish } = require('../systems/automod');

async function dmUser(user, guild, text) {
  await user.send(`**${guild.name}:** ${text}`).catch(() => {});
}

module.exports = [
  {
    data: new SlashCommandBuilder().setName('ban').setDescription('Ban a member')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason'))
      .addIntegerOption((o) => o.setName('delete_days').setDescription('Delete messages from the last X days (0-7)').setMinValue(0).setMaxValue(7)),
    async execute(i) {
      const user = i.options.getUser('user');
      const reason = i.options.getString('reason') || 'Not provided';
      const member = await i.guild.members.fetch(user.id).catch(() => null);
      const err = canModerate(i.member, member, i.guild.members.me);
      if (err) return i.reply({ embeds: [fail(err)], flags: MessageFlags.Ephemeral });
      if (member) await dmUser(user, i.guild, `You were banned. Reason: ${reason}`);
      await i.guild.members.ban(user.id, { reason: `${i.user.tag}: ${reason}`, deleteMessageSeconds: (i.options.getInteger('delete_days') || 0) * 86400 });
      const id = await logModAction(i.guild, 'ban', user, i.user, reason);
      return i.reply({ embeds: [ok(`**${user.tag}** was banned. (case #${id})`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('unban').setDescription('Unban a user by ID')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addStringOption((o) => o.setName('id').setDescription('User ID').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason')),
    async execute(i) {
      const id = i.options.getString('id').replace(/\D/g, '');
      const reason = i.options.getString('reason') || 'Not provided';
      const ban = await i.guild.bans.fetch(id).catch(() => null);
      if (!ban) return i.reply({ embeds: [fail('That user is not banned.')], flags: MessageFlags.Ephemeral });
      await i.guild.members.unban(id, `${i.user.tag}: ${reason}`);
      const c = await logModAction(i.guild, 'unban', ban.user, i.user, reason);
      return i.reply({ embeds: [ok(`**${ban.user.tag}** was unbanned. (case #${c})`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('kick').setDescription('Kick a member')
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason')),
    async execute(i) {
      const member = i.options.getMember('user');
      const reason = i.options.getString('reason') || 'Not provided';
      if (!member) return i.reply({ embeds: [fail('That member is not in the server.')], flags: MessageFlags.Ephemeral });
      const err = canModerate(i.member, member, i.guild.members.me);
      if (err) return i.reply({ embeds: [fail(err)], flags: MessageFlags.Ephemeral });
      await dmUser(member.user, i.guild, `You were kicked. Reason: ${reason}`);
      await member.kick(`${i.user.tag}: ${reason}`);
      const id = await logModAction(i.guild, 'kick', member.user, i.user, reason);
      return i.reply({ embeds: [ok(`**${member.user.tag}** was kicked. (case #${id})`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('timeout').setDescription('Mute a member (timeout)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('duration').setDescription('e.g. 10m, 2h, 1d (max 28d)').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason')),
    async execute(i) {
      const member = i.options.getMember('user');
      const ms = parseDuration(i.options.getString('duration'));
      const reason = i.options.getString('reason') || 'Not provided';
      if (!member) return i.reply({ embeds: [fail('That member is not in the server.')], flags: MessageFlags.Ephemeral });
      if (!ms || ms > 28 * 864e5) return i.reply({ embeds: [fail('Invalid duration (e.g. 10m, 1h, 3d; max 28d).')], flags: MessageFlags.Ephemeral });
      const err = canModerate(i.member, member, i.guild.members.me);
      if (err) return i.reply({ embeds: [fail(err)], flags: MessageFlags.Ephemeral });
      await member.timeout(ms, `${i.user.tag}: ${reason}`);
      await dmUser(member.user, i.guild, `You were timed out for ${formatDuration(ms)}. Reason: ${reason}`);
      const id = await logModAction(i.guild, 'timeout', member.user, i.user, reason, `Duration: ${formatDuration(ms)}`);
      return i.reply({ embeds: [ok(`**${member.user.tag}** was muted for **${formatDuration(ms)}**. (case #${id})`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('untimeout').setDescription('Remove a timeout')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason')),
    async execute(i) {
      const member = i.options.getMember('user');
      if (!member?.isCommunicationDisabled()) return i.reply({ embeds: [fail('That member is not timed out.')], flags: MessageFlags.Ephemeral });
      const reason = i.options.getString('reason') || 'Not provided';
      await member.timeout(null, `${i.user.tag}: ${reason}`);
      const id = await logModAction(i.guild, 'untimeout', member.user, i.user, reason);
      return i.reply({ embeds: [ok(`Timeout removed for **${member.user.tag}**. (case #${id})`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('warn').setDescription('Warn a member')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true)),
    async execute(i) {
      const member = i.options.getMember('user');
      const reason = i.options.getString('reason');
      if (!member) return i.reply({ embeds: [fail('That member is not in the server.')], flags: MessageFlags.Ephemeral });
      if (member.user.bot) return i.reply({ embeds: [fail('You can\'t warn a bot.')], flags: MessageFlags.Ephemeral });
      i.client.db.warnings.add(i.guild.id, member.id, i.user.id, reason);
      const count = i.client.db.warnings.count(i.guild.id, member.id);
      await dmUser(member.user, i.guild, `You received a warning (#${count}). Reason: ${reason}`);
      const id = await logModAction(i.guild, 'warn', member.user, i.user, reason, `Total warnings: ${count}`);
      await i.reply({ embeds: [ok(`**${member.user.tag}** was warned. Total: **${count}**. (case #${id})`)] });
      const T = i.client.db.getSettings(i.guild.id).automod.warnThreshold;
      if (T.enabled && count >= T.count && count % T.count === 0) await thresholdPunish(member, T, count);
    },
  },
  {
    data: new SlashCommandBuilder().setName('warnings').setDescription('Show a member\'s warnings')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)),
    async execute(i) {
      const user = i.options.getUser('user');
      const list = i.client.db.warnings.list(i.guild.id, user.id);
      const e = new EmbedBuilder().setColor(0xfee75c).setTitle(`Warnings: ${user.tag}`).setThumbnail(user.displayAvatarURL());
      e.setDescription(list.length
        ? list.slice(0, 20).map((w) => `**#${w.id}** • <t:${Math.floor(w.created_at / 1000)}:d> • <@${w.mod_id}>\n${w.reason || '—'}`).join('\n\n')
        : 'No warnings. 😇');
      e.setFooter({ text: `Total: ${list.length}` });
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('delwarn').setDescription('Delete warning(s)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addIntegerOption((o) => o.setName('id').setDescription('Warning ID'))
      .addUserOption((o) => o.setName('user').setDescription('Delete ALL warnings of this member')),
    async execute(i) {
      const id = i.options.getInteger('id');
      const user = i.options.getUser('user');
      if (id) {
        const n = i.client.db.warnings.remove(i.guild.id, id);
        return i.reply({ embeds: [n ? ok(`Warning #${id} deleted.`) : fail('No such warning.')] });
      }
      if (user) {
        const n = i.client.db.warnings.clear(i.guild.id, user.id);
        return i.reply({ embeds: [ok(`Deleted ${n} warnings for **${user.tag}**.`)] });
      }
      return i.reply({ embeds: [fail('Provide `id` or `user`.')], flags: MessageFlags.Ephemeral });
    },
  },
  {
    data: new SlashCommandBuilder().setName('purge').setDescription('Delete many messages at once')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addIntegerOption((o) => o.setName('amount').setDescription('Number of messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption((o) => o.setName('user').setDescription('Only this member\'s messages'))
      .addBooleanOption((o) => o.setName('bots').setDescription('Only bot messages')),
    async execute(i) {
      const amount = i.options.getInteger('amount');
      const user = i.options.getUser('user');
      const bots = i.options.getBoolean('bots');
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      let msgs = await i.channel.messages.fetch({ limit: 100 });
      msgs = msgs.filter((m) => Date.now() - m.createdTimestamp < 14 * 864e5);
      if (user) msgs = msgs.filter((m) => m.author.id === user.id);
      if (bots) msgs = msgs.filter((m) => m.author.bot);
      const toDelete = [...msgs.values()].slice(0, amount);
      const deleted = await i.channel.bulkDelete(toDelete, true);
      await logModAction(i.guild, 'purge', i.user, i.user, `Deleted ${deleted.size} messages`, `Channel: <#${i.channel.id}>`);
      return i.editReply({ embeds: [ok(`Deleted **${deleted.size}** messages.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('slowmode').setDescription('Set slowmode in a channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addIntegerOption((o) => o.setName('seconds').setDescription('0 = off, max 21600').setRequired(true).setMinValue(0).setMaxValue(21600)),
    async execute(i) {
      const sec = i.options.getInteger('seconds');
      await i.channel.setRateLimitPerUser(sec);
      return i.reply({ embeds: [ok(sec ? `Slowmode set to **${sec}s**.` : 'Slowmode disabled.')] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('lock').setDescription('Lock a channel (@everyone can\'t type)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o.setName('reason').setDescription('Reason')),
    async execute(i) {
      const ch = i.options.getChannel('channel') || i.channel;
      await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false });
      await ch.send({ embeds: [ok(`🔒 The channel is locked.${i.options.getString('reason') ? ` Reason: ${i.options.getString('reason')}` : ''}`)] });
      return i.reply({ embeds: [ok(`${ch} locked.`)], flags: MessageFlags.Ephemeral });
    },
  },
  {
    data: new SlashCommandBuilder().setName('unlock').setDescription('Unlock a channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText)),
    async execute(i) {
      const ch = i.options.getChannel('channel') || i.channel;
      await ch.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: null });
      await ch.send({ embeds: [ok('🔓 The channel is unlocked.')] });
      return i.reply({ embeds: [ok(`${ch} unlocked.`)], flags: MessageFlags.Ephemeral });
    },
  },
  {
    data: new SlashCommandBuilder().setName('nick').setDescription('Change a member\'s nickname')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption((o) => o.setName('nickname').setDescription('New nickname (empty = reset)').setMaxLength(32)),
    async execute(i) {
      const member = i.options.getMember('user');
      if (!member) return i.reply({ embeds: [fail('That member is not in the server.')], flags: MessageFlags.Ephemeral });
      const err = member.id === i.user.id ? null : canModerate(i.member, member, i.guild.members.me);
      if (err) return i.reply({ embeds: [fail(err)], flags: MessageFlags.Ephemeral });
      await member.setNickname(i.options.getString('nickname') || null);
      return i.reply({ embeds: [ok(`Nickname changed for ${member}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('role').setDescription('Add or remove a role from a member')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
    async execute(i) {
      const member = i.options.getMember('user');
      const role = i.options.getRole('role');
      if (!member) return i.reply({ embeds: [fail('That member is not in the server.')], flags: MessageFlags.Ephemeral });
      if (role.managed || role.position >= i.guild.members.me.roles.highest.position)
        return i.reply({ embeds: [fail('I can\'t manage that role.')], flags: MessageFlags.Ephemeral });
      if (i.user.id !== i.guild.ownerId && role.position >= i.member.roles.highest.position)
        return i.reply({ embeds: [fail('That role is equal to or higher than yours.')], flags: MessageFlags.Ephemeral });
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        return i.reply({ embeds: [ok(`Removed ${role} from ${member}.`)] });
      }
      await member.roles.add(role);
      return i.reply({ embeds: [ok(`Added ${role} to ${member}.`)] });
    },
  },
];
