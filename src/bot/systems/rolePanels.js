const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { fail } = require('../utils');
const config = require('../../config');

const STYLES = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger };

function buildPanel(panel, guild) {
  const embed = new EmbedBuilder().setColor(config.color).setTitle(panel.title);
  const lines = panel.roles.map((r) => `${r.emoji ? `${r.emoji} ` : ''}<@&${r.role}>${r.description ? ` — ${r.description}` : ''}`);
  embed.setDescription([panel.description, '', ...lines].filter((x) => x !== undefined && x !== null).join('\n').trim());
  if (panel.unique_mode) embed.setFooter({ text: 'Možeš imati samo jednu ulogu s ovog panela.' });

  const rows = [];
  panel.roles.slice(0, 25).forEach((r, i) => {
    if (i % 5 === 0) rows.push(new ActionRowBuilder());
    const role = guild.roles.cache.get(r.role);
    const btn = new ButtonBuilder()
      .setCustomId(`rr:${panel.id}:${r.role}`)
      .setLabel((r.label || role?.name || 'Uloga').slice(0, 80))
      .setStyle(STYLES[r.style] || ButtonStyle.Secondary);
    if (r.emoji) { try { btn.setEmoji(r.emoji); } catch { /* invalid emoji */ } }
    rows[rows.length - 1].addComponents(btn);
  });
  return { embeds: [embed], components: rows };
}

async function publish(client, panelId, guildId) {
  const { rolePanels } = client.db;
  const panel = rolePanels.get(guildId, panelId);
  if (!panel) throw new Error('Panel ne postoji');
  const guild = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(panel.channel_id);
  if (!channel?.isTextBased()) throw new Error('Kanal ne postoji');
  const payload = buildPanel(panel, guild);
  if (panel.message_id) {
    const existing = await channel.messages.fetch(panel.message_id).catch(() => null);
    if (existing) { await existing.edit(payload); return existing; }
  }
  const msg = await channel.send(payload);
  rolePanels.setMessage(panel.id, msg.id);
  return msg;
}

async function handleButton(interaction, panelId, roleId) {
  const { rolePanels } = interaction.client.db;
  const { guild, member } = interaction;
  const panel = rolePanels.get(guild.id, Number(panelId));
  const role = guild.roles.cache.get(roleId);
  if (!panel || !role) return interaction.reply({ embeds: [fail('Ova uloga više ne postoji.')], flags: MessageFlags.Ephemeral });
  if (role.position >= guild.members.me.roles.highest.position) {
    return interaction.reply({ embeds: [fail('Ne mogu dodijeliti tu ulogu (moja uloga je niža).')], flags: MessageFlags.Ephemeral });
  }
  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, 'Button role');
      return interaction.reply({ content: `➖ Uklonjena uloga ${role}`, flags: MessageFlags.Ephemeral });
    }
    if (panel.unique_mode) {
      const others = panel.roles.map((r) => r.role).filter((id) => id !== roleId && member.roles.cache.has(id));
      if (others.length) await member.roles.remove(others, 'Button role (unique)');
    }
    await member.roles.add(roleId, 'Button role');
    return interaction.reply({ content: `➕ Dodana uloga ${role}`, flags: MessageFlags.Ephemeral });
  } catch (e) {
    return interaction.reply({ embeds: [fail(`Greška: ${e.message}`)], flags: MessageFlags.Ephemeral });
  }
}

module.exports = { publish, handleButton, buildPanel };
