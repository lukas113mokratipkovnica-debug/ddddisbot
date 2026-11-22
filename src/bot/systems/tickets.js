const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits,
  AttachmentBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { fillPlaceholders, ok, fail, sendLog } = require('../utils');
const config = require('../../config');

async function postPanel(channel) {
  const { getSettings } = channel.client.db;
  const s = getSettings(channel.guild.id).tickets;
  const embed = new EmbedBuilder().setColor(config.color).setTitle(s.panelTitle).setDescription(s.panelDescription);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:open').setLabel('Otvori tiket').setEmoji('🎫').setStyle(ButtonStyle.Primary),
  );
  return channel.send({ embeds: [embed], components: [row] });
}

function isStaff(member, s) {
  return member.permissions.has(PermissionFlagsBits.ManageChannels) || s.supportRoles.some((r) => member.roles.cache.has(r));
}

async function showOpenModal(interaction) {
  const modal = new ModalBuilder().setCustomId('ticket:modal').setTitle('Novi tiket').addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('topic').setLabel('Ukratko opiši problem').setStyle(TextInputStyle.Paragraph)
        .setRequired(false).setMaxLength(500),
    ),
  );
  return interaction.showModal(modal);
}

async function openTicket(interaction, topic = '') {
  const { getSettings, updateSettings, tickets } = interaction.client.db;
  const { guild, member } = interaction;
  const s = getSettings(guild.id).tickets;
  if (!s.enabled) return interaction.reply({ embeds: [fail('Tiketi su isključeni na ovom serveru.')], flags: MessageFlags.Ephemeral });

  const open = tickets.openByUser(guild.id, member.id).filter((t) => guild.channels.cache.has(t.channel_id));
  if (open.length >= Math.max(1, s.maxOpen)) {
    return interaction.reply({ embeds: [fail(`Već imaš otvoren tiket: <#${open[0].channel_id}>`)], flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const updated = updateSettings(guild.id, (x) => { x.tickets.counter += 1; });
  const number = updated.tickets.counter;
  const parent = s.category && guild.channels.cache.get(s.category)?.type === ChannelType.GuildCategory ? s.category : null;

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
    ...s.supportRoles.filter((r) => guild.roles.cache.has(r)).map((r) => ({
      id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory],
    })),
  ];

  let channel;
  try {
    channel = await guild.channels.create({
      name: `tiket-${String(number).padStart(4, '0')}`,
      type: ChannelType.GuildText,
      parent,
      topic: `Tiket #${number} • ${member.user.tag} (${member.id})${topic ? ` • ${topic.slice(0, 200)}` : ''}`,
      permissionOverwrites: overwrites,
    });
  } catch (e) {
    return interaction.editReply({ embeds: [fail(`Ne mogu napraviti kanal: ${e.message}`)] });
  }
  tickets.create(guild.id, channel.id, member.id, number, topic || null);

  const embed = new EmbedBuilder().setColor(config.color).setTitle(`Tiket #${number}`)
    .setDescription(fillPlaceholders(s.welcomeMessage, { member }));
  if (topic) embed.addFields({ name: 'Tema', value: topic });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Zatvori').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Preuzmi').setEmoji('🙋').setStyle(ButtonStyle.Secondary),
  );
  const pings = [`<@${member.id}>`, ...s.supportRoles.map((r) => `<@&${r}>`)].join(' ');
  await channel.send({ content: pings, embeds: [embed], components: [row] });
  await interaction.editReply({ embeds: [ok(`Tiket otvoren: ${channel}`)] });
}

async function claimTicket(interaction) {
  const { getSettings, updateSettings, tickets } = interaction.client.db;
  const s = getSettings(interaction.guild.id).tickets;
  if (!isStaff(interaction.member, s)) return interaction.reply({ embeds: [fail('Samo tim može preuzeti tiket.')], flags: MessageFlags.Ephemeral });
  return interaction.reply({ embeds: [ok(`${interaction.user} je preuzeo/la ovaj tiket.`)] });
}

async function buildTranscript(channel) {
  let all = [];
  let before;
  for (let i = 0; i < 10; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    all = all.concat([...batch.values()]);
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  all.reverse();
  const lines = all.map((m) => {
    const time = new Date(m.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
    const att = m.attachments.size ? ` [prilozi: ${[...m.attachments.values()].map((a) => a.url).join(', ')}]` : '';
    const emb = m.embeds.length ? ` [embed: ${m.embeds.map((e) => e.title || e.description || '').join(' | ').slice(0, 300)}]` : '';
    return `[${time}] ${m.author.tag}: ${m.content}${att}${emb}`;
  });
  return new AttachmentBuilder(Buffer.from(lines.join('\n'), 'utf8'), { name: `${channel.name}.txt` });
}

async function closeTicket(interaction, reason = '') {
  const { getSettings, updateSettings, tickets } = interaction.client.db;
  const { guild, channel } = interaction;
  const t = tickets.byChannel(channel.id);
  if (!t || t.status !== 'open') return interaction.reply({ embeds: [fail('Ovo nije otvoreni tiket.')], flags: MessageFlags.Ephemeral });
  const s = getSettings(guild.id).tickets;
  if (interaction.user.id !== t.user_id && !isStaff(interaction.member, s)) {
    return interaction.reply({ embeds: [fail('Nemaš dozvolu zatvoriti ovaj tiket.')], flags: MessageFlags.Ephemeral });
  }
  await interaction.reply({ embeds: [ok('Tiket se zatvara za 5 sekundi…')] });
  tickets.close(t.id, interaction.user.id);

  const transcript = await buildTranscript(channel);
  const logEmbed = new EmbedBuilder().setColor(0xed4245).setTitle(`Tiket #${t.number} zatvoren`).addFields(
    { name: 'Otvorio', value: `<@${t.user_id}>`, inline: true },
    { name: 'Zatvorio', value: `<@${interaction.user.id}>`, inline: true },
    { name: 'Razlog', value: reason || 'Nije naveden' },
  ).setTimestamp();

  const logCh = s.logChannel && guild.channels.cache.get(s.logChannel);
  if (logCh?.isTextBased()) await logCh.send({ embeds: [logEmbed], files: [transcript] }).catch(() => {});
  else await sendLog(guild, 'modActions', logEmbed);

  const opener = await guild.client.users.fetch(t.user_id).catch(() => null);
  if (opener) {
    const t2 = await buildTranscript(channel).catch(() => null);
    await opener.send({ content: `Tvoj tiket **#${t.number}** na **${guild.name}** je zatvoren.`, files: t2 ? [t2] : [] }).catch(() => {});
  }
  setTimeout(() => channel.delete(`Tiket zatvorio ${interaction.user.tag}`).catch(() => {}), 5000);
}

module.exports = { postPanel, openTicket, closeTicket, claimTicket, showOpenModal, isStaff };
