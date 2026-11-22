const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { ok, fail, parseDuration, formatDuration } = require('../utils');
const config = require('../../config');

module.exports = [
  {
    module: 'reminders',
    data: new SlashCommandBuilder().setName('remind').setDescription('Podsjetnik')
      .addSubcommand((s) => s.setName('set').setDescription('Novi podsjetnik')
        .addStringOption((o) => o.setName('za').setDescription('Za koliko? npr. 10m, 2h, 1d').setRequired(true))
        .addStringOption((o) => o.setName('tekst').setDescription('Na što da te podsjetim').setRequired(true).setMaxLength(1000)))
      .addSubcommand((s) => s.setName('list').setDescription('Tvoji podsjetnici'))
      .addSubcommand((s) => s.setName('delete').setDescription('Obriši podsjetnik')
        .addIntegerOption((o) => o.setName('id').setDescription('ID').setRequired(true))),
    async execute(i) {
      const db = i.client.db;
      const sub = i.options.getSubcommand();
      if (sub === 'set') {
        const ms = parseDuration(i.options.getString('za'));
        if (!ms || ms > 365 * 864e5) return i.reply({ embeds: [fail('Neispravno vrijeme (npr. 10m, 2h, 3d).')], flags: MessageFlags.Ephemeral });
        const id = db.reminders.add(i.guild.id, i.channel.id, i.user.id, i.options.getString('tekst'), Date.now() + ms);
        return i.reply({ embeds: [ok(`Podsjetit ću te <t:${Math.floor((Date.now() + ms) / 1000)}:R>. (ID ${id})`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'list') {
        const list = db.reminders.byUser(i.user.id);
        return i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setTitle('⏰ Tvoji podsjetnici')
          .setDescription(list.map((r) => `**${r.id}.** <t:${Math.floor(r.due_at / 1000)}:R> — ${r.text.slice(0, 100)}`).join('\n') || 'Nemaš podsjetnika.')], flags: MessageFlags.Ephemeral });
      }
      const n = db.reminders.remove(i.user.id, i.options.getInteger('id'));
      return i.reply({ embeds: [n ? ok('Obrisano.') : fail('Nema tog podsjetnika.')], flags: MessageFlags.Ephemeral });
    },
  },
  {
    module: 'afk',
    data: new SlashCommandBuilder().setName('afk').setDescription('Postavi AFK status')
      .addStringOption((o) => o.setName('razlog').setDescription('Razlog').setMaxLength(200)),
    async execute(i) {
      const reason = i.options.getString('razlog') || 'AFK';
      i.client.db.afk.set(i.guild.id, i.user.id, reason);
      if (i.member.manageable && !i.member.displayName.startsWith('[AFK]')) await i.member.setNickname(`[AFK] ${i.member.displayName}`.slice(0, 32)).catch(() => {});
      return i.reply({ embeds: [ok(`Sada si AFK: ${reason}`)] });
    },
  },
  {
    module: 'sticky',
    data: new SlashCommandBuilder().setName('sticky').setDescription('Sticky poruka u ovom kanalu')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addSubcommand((s) => s.setName('set').setDescription('Postavi sticky poruku')
        .addStringOption((o) => o.setName('tekst').setDescription('Tekst (\\n za novi red)').setRequired(true).setMaxLength(1800)))
      .addSubcommand((s) => s.setName('remove').setDescription('Ukloni sticky poruku')),
    async execute(i) {
      const db = i.client.db;
      if (i.options.getSubcommand() === 'remove') {
        const st = db.sticky.get(i.channel.id);
        if (st?.last_message_id) await i.channel.messages.delete(st.last_message_id).catch(() => {});
        db.sticky.remove(i.channel.id);
        return i.reply({ embeds: [ok('Sticky poruka uklonjena.')], flags: MessageFlags.Ephemeral });
      }
      const text = i.options.getString('tekst').replace(/\\n/g, '\n');
      db.sticky.set(i.channel.id, i.guild.id, text);
      const msg = await i.channel.send({ embeds: [new EmbedBuilder().setColor(config.color).setDescription(`📌 ${text}`)] });
      db.sticky.setMessage(i.channel.id, msg.id);
      return i.reply({ embeds: [ok('Sticky poruka postavljena.')], flags: MessageFlags.Ephemeral });
    },
  },
  {
    module: 'birthdays',
    data: new SlashCommandBuilder().setName('birthday').setDescription('Rođendani')
      .addSubcommand((s) => s.setName('set').setDescription('Postavi svoj rođendan')
        .addIntegerOption((o) => o.setName('dan').setDescription('Dan').setRequired(true).setMinValue(1).setMaxValue(31))
        .addIntegerOption((o) => o.setName('mjesec').setDescription('Mjesec').setRequired(true).setMinValue(1).setMaxValue(12)))
      .addSubcommand((s) => s.setName('remove').setDescription('Ukloni svoj rođendan'))
      .addSubcommand((s) => s.setName('list').setDescription('Nadolazeći rođendani')),
    async execute(i) {
      const db = i.client.db;
      const sub = i.options.getSubcommand();
      if (sub === 'set') {
        const d = i.options.getInteger('dan'); const m = i.options.getInteger('mjesec');
        const test = new Date(2024, m - 1, d);
        if (test.getMonth() !== m - 1) return i.reply({ embeds: [fail('Taj datum ne postoji.')], flags: MessageFlags.Ephemeral });
        db.birthdays.set(i.guild.id, i.user.id, d, m);
        return i.reply({ embeds: [ok(`Rođendan postavljen na **${d}.${m}.** 🎂`)], flags: MessageFlags.Ephemeral });
      }
      if (sub === 'remove') { db.birthdays.remove(i.guild.id, i.user.id); return i.reply({ embeds: [ok('Rođendan uklonjen.')], flags: MessageFlags.Ephemeral }); }
      const now = new Date();
      const daysUntil = (b) => {
        let next = new Date(now.getFullYear(), b.month - 1, b.day);
        if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next = new Date(now.getFullYear() + 1, b.month - 1, b.day);
        return Math.round((next - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
      };
      const list = db.birthdays.list(i.guild.id).map((b) => ({ ...b, in: daysUntil(b) })).sort((a, b) => a.in - b.in).slice(0, 15);
      return i.reply({ embeds: [new EmbedBuilder().setColor(0xf472b6).setTitle('🎂 Nadolazeći rođendani')
        .setDescription(list.map((b) => `<@${b.user_id}> — **${b.day}.${b.month}.** ${b.in === 0 ? '🎉 danas!' : `(za ${b.in} d)`}`).join('\n') || 'Nitko još nije postavio rođendan. `/birthday set`')], allowedMentions: { parse: [] } });
    },
  },
  {
    module: 'confessions',
    data: new SlashCommandBuilder().setName('confess').setDescription('Pošalji anonimnu ispovijest')
      .addStringOption((o) => o.setName('tekst').setDescription('Tvoja ispovijest').setRequired(true).setMaxLength(2000)),
    async execute(i) {
      const db = i.client.db;
      const C = db.getSettings(i.guild.id).confessions;
      const ch = C.enabled && i.guild.channels.cache.get(C.channel);
      if (!ch?.isTextBased()) return i.reply({ embeds: [fail('Ispovijesti nisu postavljene na ovom serveru.')], flags: MessageFlags.Ephemeral });
      const text = i.options.getString('tekst');
      const updated = db.updateSettings(i.guild.id, (s) => { s.confessions.counter += 1; });
      const n = updated.confessions.counter;
      db.confessions.add(i.guild.id, i.user.id, text);
      await ch.send({ embeds: [new EmbedBuilder().setColor(0x8b5cf6).setTitle(`🎭 Anonimna ispovijest #${n}`).setDescription(text).setTimestamp()] });
      const log = C.logChannel && i.guild.channels.cache.get(C.logChannel);
      if (log?.isTextBased()) await log.send({ embeds: [new EmbedBuilder().setColor(0x8b5cf6).setTitle(`Ispovijest #${n}`).setDescription(text).addFields({ name: 'Autor', value: `<@${i.user.id}> (${i.user.id})` })] }).catch(() => {});
      return i.reply({ embeds: [ok(`Ispovijest #${n} je poslana anonimno.`)], flags: MessageFlags.Ephemeral });
    },
  },
  {
    module: 'tempvoice',
    data: new SlashCommandBuilder().setName('voice').setDescription('Upravljaj svojim privremenim voice kanalom')
      .addSubcommand((s) => s.setName('name').setDescription('Preimenuj kanal').addStringOption((o) => o.setName('ime').setDescription('Novo ime').setRequired(true).setMaxLength(90)))
      .addSubcommand((s) => s.setName('limit').setDescription('Limit korisnika').addIntegerOption((o) => o.setName('broj').setDescription('0 = bez limita').setRequired(true).setMinValue(0).setMaxValue(99)))
      .addSubcommand((s) => s.setName('lock').setDescription('Zaključaj kanal'))
      .addSubcommand((s) => s.setName('unlock').setDescription('Otključaj kanal'))
      .addSubcommand((s) => s.setName('kick').setDescription('Izbaci korisnika iz kanala').addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true)))
      .addSubcommand((s) => s.setName('claim').setDescription('Preuzmi kanal ako je vlasnik izašao')),
    async execute(i) {
      const db = i.client.db;
      const vc = i.member.voice.channel;
      const t = vc && db.tempVoice.get(vc.id);
      if (!t) return i.reply({ embeds: [fail('Moraš biti u svom privremenom voice kanalu.')], flags: MessageFlags.Ephemeral });
      const sub = i.options.getSubcommand();
      if (sub === 'claim') {
        if (vc.members.has(t.owner_id)) return i.reply({ embeds: [fail('Vlasnik je još u kanalu.')], flags: MessageFlags.Ephemeral });
        db.tempVoice.setOwner(vc.id, i.user.id);
        return i.reply({ embeds: [ok('Sada si vlasnik kanala.')] });
      }
      if (t.owner_id !== i.user.id) return i.reply({ embeds: [fail('Samo vlasnik kanala to može.')], flags: MessageFlags.Ephemeral });
      if (sub === 'name') await vc.setName(i.options.getString('ime'));
      if (sub === 'limit') await vc.setUserLimit(i.options.getInteger('broj'));
      if (sub === 'lock') await vc.permissionOverwrites.edit(i.guild.roles.everyone, { Connect: false });
      if (sub === 'unlock') await vc.permissionOverwrites.edit(i.guild.roles.everyone, { Connect: null });
      if (sub === 'kick') {
        const m = i.options.getMember('korisnik');
        if (m?.voice.channelId === vc.id) await m.voice.disconnect();
      }
      return i.reply({ embeds: [ok('Gotovo.')], flags: MessageFlags.Ephemeral });
    },
  },
  {
    module: 'invites',
    data: new SlashCommandBuilder().setName('invites').setDescription('Pozivnice')
      .addSubcommand((s) => s.setName('user').setDescription('Koliko je netko pozvao').addUserOption((o) => o.setName('korisnik').setDescription('Korisnik')))
      .addSubcommand((s) => s.setName('top').setDescription('Leaderboard pozivnica')),
    async execute(i) {
      const db = i.client.db;
      if (i.options.getSubcommand() === 'top') {
        const rows = db.invites.top(i.guild.id, 10);
        return i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setTitle('📨 Top pozivači')
          .setDescription(rows.map((r, k) => `**${k + 1}.** <@${r.user_id}> — **${r.total}** (${r.joins} ušlo, ${r.leaves} izašlo)`).join('\n') || 'Nema podataka.')], allowedMentions: { parse: [] } });
      }
      const user = i.options.getUser('korisnik') || i.user;
      const r = db.invites.get(i.guild.id, user.id);
      const by = db.invites.inviterOf(i.guild.id, user.id);
      return i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .setDescription(`**${r.joins - r.leaves}** pozivnica (${r.joins} ušlo, ${r.leaves} izašlo)${by ? `\nPozvao/la ga/ju: <@${by}>` : ''}`)], allowedMentions: { parse: [] } });
    },
  },
  {
    module: 'verification',
    data: new SlashCommandBuilder().setName('verify-panel').setDescription('Pošalji panel za verifikaciju')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption((o) => o.setName('kanal').setDescription('Kanal').addChannelTypes(ChannelType.GuildText)),
    async execute(i) {
      const ch = i.options.getChannel('kanal') || i.channel;
      await require('../systems/verification').postPanel(ch);
      return i.reply({ embeds: [ok(`Panel poslan u ${ch}.`)], flags: MessageFlags.Ephemeral });
    },
  },
];
