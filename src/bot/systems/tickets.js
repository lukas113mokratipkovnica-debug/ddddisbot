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
    new ButtonBuilder().setCustomId('ticket:open').setLabel('Open ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary),
  );
  return channel.send({ embeds: [embed], components: [row] });
}

function isStaff(member, s) {
  return member.permissions.has(PermissionFlagsBits.ManageChannels) || s.supportRoles.some((r) => member.roles.cache.has(r));
}

async function showOpenModal(interaction) {
  const modal = new ModalBuilder().setCustomId('ticket:modal').setTitle('New ticket').addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('topic').setLabel('Briefly describe the problem').setStyle(TextInputStyle.Paragraph)
        .setRequired(false).setMaxLength(500),
    ),
  );
  return interaction.showModal(modal);
}

async function openTicket(interaction, topic = '') {
  const { getSettings, updateSettings, tickets } = interaction.client.db;
  const { guild, member } = interaction;
  const s = getSettings(guild.id).tickets;
  if (!s.enabled) return interaction.reply({ embeds: [fail('Tickets are disabled on this server.')], flags: MessageFlags.Ephemeral });

  const open = tickets.openByUser(guild.id, member.id).filter((t) => guild.channels.cache.has(t.channel_id));
  if (open.length >= Math.max(1, s.maxOpen)) {
    return interaction.reply({ embeds: [fail(`You already have an open ticket: <#${open[0].channel_id}>`)], flags: MessageFlags.Ephemeral });
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
    return interaction.editReply({ embeds: [fail(`I can't create the channel: ${e.message}`)] });
  }
  tickets.create(guild.id, channel.id, member.id, number, topic || null);

  const embed = new EmbedBuilder().setColor(config.color).setTitle(`Ticket #${number}`)
    .setDescription(fillPlaceholders(s.welcomeMessage, { member }));
  if (topic) embed.addFields({ name: 'Topic', value: topic });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Secondary),
  );
  const pings = [`<@${member.id}>`, ...s.supportRoles.map((r) => `<@&${r}>`)].join(' ');
  await channel.send({ content: pings, embeds: [embed], components: [row] });
  await interaction.editReply({ embeds: [ok(`Ticket opened: ${channel}`)] });
}

async function claimTicket(interaction) {
  const { getSettings, updateSettings, tickets } = interaction.client.db;
  const s = getSettings(interaction.guild.id).tickets;
  if (!isStaff(interaction.member, s)) return interaction.reply({ embeds: [fail('Only the team can claim a ticket.')], flags: MessageFlags.Ephemeral });
  return interaction.reply({ embeds: [ok(`${interaction.user} claimed this ticket.`)] });
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
  if (!t || t.status !== 'open') return interaction.reply({ embeds: [fail('This is not an open ticket.')], flags: MessageFlags.Ephemeral });
  const s = getSettings(guild.id).tickets;
  if (interaction.user.id !== t.user_id && !isStaff(interaction.member, s)) {
    return interaction.reply({ embeds: [fail('You don\'t have permission to close this ticket.')], flags: MessageFlags.Ephemeral });
  }
  await interaction.reply({ embeds: [ok('The ticket closes in 5 seconds…')] });
  tickets.close(t.id, interaction.user.id);

  const transcript = await buildTranscript(channel);
  const logEmbed = new EmbedBuilder().setColor(0xed4245).setTitle(`Ticket #${t.number} closed`).addFields(
    { name: 'Opened by', value: `<@${t.user_id}>`, inline: true },
    { name: 'Closed by', value: `<@${interaction.user.id}>`, inline: true },
    { name: 'Reason', value: reason || 'Not provided' },
  ).setTimestamp();

  const logCh = s.logChannel && guild.channels.cache.get(s.logChannel);
  if (logCh?.isTextBased()) await logCh.send({ embeds: [logEmbed], files: [transcript] }).catch(() => {});
  else await sendLog(guild, 'modActions', logEmbed);

  const opener = await guild.client.users.fetch(t.user_id).catch(() => null);
  if (opener) {
    const t2 = await buildTranscript(channel).catch(() => null);
    await opener.send({ content: `Your ticket **#${t.number}** on **${guild.name}** was closed.`, files: t2 ? [t2] : [] }).catch(() => {});
  }
  setTimeout(() => channel.delete(`Tiket zatvorio ${interaction.user.tag}`).catch(() => {}), 5000);
}

module.exports = { postPanel, openTicket, closeTicket, claimTicket, showOpenModal, isStaff };
