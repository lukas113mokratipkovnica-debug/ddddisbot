const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { ok, fail, parseDuration, formatDuration } = require('../utils');
const config = require('../../config');

module.exports = [
  {
    module: 'reminders',
    data: new SlashCommandBuilder().setName('remind').setDescription('Reminder')
      .addSubcommand((s) => s.setName('set').setDescription('New reminder')
        .addStringOption((o) => o.setName('in').setDescription('In how long? e.g. 10m, 2h, 1d').setRequired(true))
        .addStringOption((o) => o.setName('text').setDescription('What should I remind you about').setRequired(true).setMaxLength(1000)))
      .addSubcommand((s) => s.setName('list').setDescription('Your reminders'))
      .addSubcommand((s) => s.setName('delete').setDescription('Delete a reminder')
        .addIntegerOption((o) => o.setName('id').setDescription('ID').setRequired(true))),
    async execute(i) {
      const db = i.client.db;
      const sub = i.options.getSubcommand();
      if (sub === 'set') {
        const ms = parseDuration(i.options.getString('in'));
        if (!ms || ms > 365 * 864e5) return i.reply({ embeds: [fail('Invalid time (e.g. 10m, 2h, 3d).')], flags: MessageFlags.Ephemeral });
        const id = db.reminders.add(i.guild.id, i.channel.id, i.user.id, i.options.getString('text'), Date.now() + ms);
        return i.reply({ embeds: [ok(`I'll remind you <t:${Math.floor((Date.now() + ms) / 1000)}:R>. (ID ${id})`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'list') {
        const list = db.reminders.byUser(i.user.id);
        return i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setTitle('⏰ Your reminders')
          .setDescription(list.map((r) => `**${r.id}.** <t:${Math.floor(r.due_at / 1000)}:R> — ${r.text.slice(0, 100)}`).join('\n') || 'You have no reminders.')], flags: MessageFlags.Ephemeral });
      }
      const n = db.reminders.remove(i.user.id, i.options.getInteger('id'));
      return i.reply({ embeds: [n ? ok('Deleted.') : fail('No such reminder.')], flags: MessageFlags.Ephemeral });
    },
  },
  {
    module: 'afk',
    data: new SlashCommandBuilder().setName('afk').setDescription('Set your AFK status')
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(200)),
    async execute(i) {
      const reason = i.options.getString('reason') || 'AFK';
      i.client.db.afk.set(i.guild.id, i.user.id, reason);
      if (i.member.manageable && !i.member.displayName.startsWith('[AFK]')) await i.member.setNickname(`[AFK] ${i.member.displayName}`.slice(0, 32)).catch(() => {});
      return i.reply({ embeds: [ok(`You are now AFK: ${reason}`)] });
    },
  },
  {
    module: 'sticky',
    data: new SlashCommandBuilder().setName('sticky').setDescription('Sticky message in this channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addSubcommand((s) => s.setName('set').setDescription('Set a sticky message')
        .addStringOption((o) => o.setName('text').setDescription('Tekst (\\n za novi red)').setRequired(true).setMaxLength(1800)))
      .addSubcommand((s) => s.setName('remove').setDescription('Remove the sticky message')),
    async execute(i) {
      const db = i.client.db;
      if (i.options.getSubcommand() === 'remove') {
        const st = db.sticky.get(i.channel.id);
        if (st?.last_message_id) await i.channel.messages.delete(st.last_message_id).catch(() => {});
        db.sticky.remove(i.channel.id);
        return i.reply({ embeds: [ok('Sticky message removed.')], flags: MessageFlags.Ephemeral });
      }
      const text = i.options.getString('text').replace(/\\n/g, '\n');
      db.sticky.set(i.channel.id, i.guild.id, text);
      const msg = await i.channel.send({ embeds: [new EmbedBuilder().setColor(config.color).setDescription(`📌 ${text}`)] });
      db.sticky.setMessage(i.channel.id, msg.id);
      return i.reply({ embeds: [ok('Sticky message set.')], flags: MessageFlags.Ephemeral });
    },
  },
  {
    module: 'birthdays',
    data: new SlashCommandBuilder().setName('birthday').setDescription('Birthdays')
      .addSubcommand((s) => s.setName('set').setDescription('Set your birthday')
        .addIntegerOption((o) => o.setName('day').setDescription('Day').setRequired(true).setMinValue(1).setMaxValue(31))
        .addIntegerOption((o) => o.setName('month').setDescription('Month').setRequired(true).setMinValue(1).setMaxValue(12)))
      .addSubcommand((s) => s.setName('remove').setDescription('Remove your birthday'))
      .addSubcommand((s) => s.setName('list').setDescription('Upcoming birthdays')),
    async execute(i) {
      const db = i.client.db;
      const sub = i.options.getSubcommand();
      if (sub === 'set') {
        const d = i.options.getInteger('day'); const m = i.options.getInteger('month');
        const test = new Date(2024, m - 1, d);
        if (test.getMonth() !== m - 1) return i.reply({ embeds: [fail('That date doesn\'t exist.')], flags: MessageFlags.Ephemeral });
        db.birthdays.set(i.guild.id, i.user.id, d, m);
        return i.reply({ embeds: [ok(`Birthday set to **${d}/${m}** 🎂`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'remove') { db.birthdays.remove(i.guild.id, i.user.id); return i.reply({ embeds: [ok('Birthday removed.')], flags: MessageFlags.Ephemeral }); }
      const now = new Date();
      const daysUntil = (b) => {
        let next = new Date(now.getFullYear(), b.month - 1, b.day);
        if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next = new Date(now.getFullYear() + 1, b.month - 1, b.day);
        return Math.round((next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
      };
      const list = db.birthdays.list(i.guild.id).map((b) => ({ ...b, in: daysUntil(b) })).sort((a, b) => a.in - b.in).slice(0, 15);
      return i.reply({ embeds: [new EmbedBuilder().setColor(0xf472b6).setTitle('🎂 Upcoming birthdays')
        .setDescription(list.map((b) => `<@${b.user_id}> — **${b.day}.${b.month}.** ${b.in === 0 ? '🎉 danas!' : `(za ${b.in} d)`}`).join('\n') || 'Nobody has set a birthday yet. `/birthday set`')], allowedMentions: { parse: [] } });
    },
  },
  {
    module: 'confessions',
    data: new SlashCommandBuilder().setName('confess').setDescription('Send an anonymous confession')
      .addStringOption((o) => o.setName('text').setDescription('Your confession').setRequired(true).setMaxLength(2000)),
    async execute(i) {
      const db = i.client.db;
      const C = db.getSettings(i.guild.id).confessions;
      const ch = C.enabled && i.guild.channels.cache.get(C.channel);
      if (!ch?.isTextBased()) return i.reply({ embeds: [fail('Confessions are not set up on this server.')], flags: MessageFlags.Ephemeral });
      const text = i.options.getString('text');
      const updated = db.updateSettings(i.guild.id, (s) => { s.confessions.counter += 1; });
      const n = updated.confessions.counter;
      db.confessions.add(i.guild.id, i.user.id, text);
      await ch.send({ embeds: [new EmbedBuilder().setColor(0x8b5cf6).setTitle(`🎭 Anonimna ispovijest #${n}`).setDescription(text).setTimestamp()] });
      const log = C.logChannel && i.guild.channels.cache.get(C.logChannel);
      if (log?.isTextBased()) await log.send({ embeds: [new EmbedBuilder().setColor(0x8b5cf6).setTitle(`Confession #${n}`).setDescription(text).addFields({ name: 'Author', value: `<@${i.user.id}> (${i.user.id})` })] }).catch(() => {});
      return i.reply({ embeds: [ok(`Confession #${n} was sent anonymously.`)], flags: MessageFlags.Ephemeral });
    },
  },
  {
    module: 'tempvoice',
    data: new SlashCommandBuilder().setName('voice').setDescription('Manage your temporary voice channel')
      .addSubcommand((s) => s.setName('name').setDescription('Rename the channel').addStringOption((o) => o.setName('name').setDescription('New name').setRequired(true).setMaxLength(90)))
      .addSubcommand((s) => s.setName('limit').setDescription('User limit').addIntegerOption((o) => o.setName('amount').setDescription('0 = no limit').setRequired(true).setMinValue(0).setMaxValue(99)))
      .addSubcommand((s) => s.setName('lock').setDescription('Lock the channel'))
      .addSubcommand((s) => s.setName('unlock').setDescription('Unlock a channel'))
      .addSubcommand((s) => s.setName('kick').setDescription('Kick a member from the channel').addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)))
      .addSubcommand((s) => s.setName('claim').setDescription('Claim the channel if the owner left')),
    async execute(i) {
      const db = i.client.db;
      const vc = i.member.voice.channel;
      const t = vc && db.tempVoice.get(vc.id);
      if (!t) return i.reply({ embeds: [fail('You must be in your temporary voice channel.')], flags: MessageFlags.Ephemeral });
      const sub = i.options.getSubcommand();
      if (sub === 'claim') {
        if (vc.members.has(t.owner_id)) return i.reply({ embeds: [fail('The owner is still in the channel.')], flags: MessageFlags.Ephemeral });
        db.tempVoice.setOwner(vc.id, i.user.id);
        return i.reply({ embeds: [ok('You now own the channel.')] });
      }
      if (t.owner_id !== i.user.id) return i.reply({ embeds: [fail('Only the channel owner can do that.')], flags: MessageFlags.Ephemeral });
      if (sub === 'name') await vc.setName(i.options.getString('name'));
      if (sub === 'limit') await vc.setUserLimit(i.options.getInteger('amount'));
      if (sub === 'lock') await vc.permissionOverwrites.edit(i.guild.roles.everyone, { Connect: false });
      if (sub === 'unlock') await vc.permissionOverwrites.edit(i.guild.roles.everyone, { Connect: null });
      if (sub === 'kick') {
        const m = i.options.getMember('user');
        if (m?.voice.channelId === vc.id) await m.voice.disconnect();
      }
      return i.reply({ embeds: [ok('Done.')], flags: MessageFlags.Ephemeral });
    },
  },
  {
    module: 'invites',
    data: new SlashCommandBuilder().setName('invites').setDescription('Invites')
      .addSubcommand((s) => s.setName('user').setDescription('How many people someone invited').addUserOption((o) => o.setName('user').setDescription('Member')))
      .addSubcommand((s) => s.setName('top').setDescription('Invite leaderboard')),
    async execute(i) {
      const db = i.client.db;
      if (i.options.getSubcommand() === 'top') {
        const rows = db.invites.top(i.guild.id, 10);
        return i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setTitle('📨 Top inviters')
          .setDescription(rows.map((r, k) => `**${k + 1}.** <@${r.user_id}> — **${r.total}** (${r.joins} joined, ${r.leaves} left)`).join('\n') || 'No data.')], allowedMentions: { parse: [] } });
      }
      const user = i.options.getUser('user') || i.user;
      const r = db.invites.get(i.guild.id, user.id);
      const by = db.invites.inviterOf(i.guild.id, user.id);
      return i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setDescription(`**${r.joins - r.leaves}** invites (${r.joins} joined, ${r.leaves} left)${by ? `\nInvited by: <@${by}>` : ''}`)], allowedMentions: { parse: [] } });
    },
  },
  {
    module: 'verification',
    data: new SlashCommandBuilder().setName('verify-panel').setDescription('Send the verification panel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText)),
    async execute(i) {
      const ch = i.options.getChannel('channel') || i.channel;
      await require('../systems/verification').postPanel(ch);
      return i.reply({ embeds: [ok(`Panel sent to ${ch}.`)], flags: MessageFlags.Ephemeral });
    },
  },
];
