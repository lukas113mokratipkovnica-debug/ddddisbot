const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { ok, fail } = require('../utils');
const config = require('../../config');

const codes = new Map(); // `${bot}:${guild}:${user}` -> { code, exp }
const key = (i) => `${i.client.user.id}:${i.guild.id}:${i.user.id}`;

async function postPanel(channel) {
  const V = channel.client.db.getSettings(channel.guild.id).verification;
  return channel.send({
    embeds: [new EmbedBuilder().setColor(config.color).setTitle(V.title).setDescription(V.message)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify:start').setLabel('Verify me').setEmoji('✅').setStyle(ButtonStyle.Success))],
  });
}

async function grant(i) {
  const V = i.client.db.getSettings(i.guild.id).verification;
  const role = i.guild.roles.cache.get(V.role);
  if (!role) return i.reply({ embeds: [fail('The verification role isn\'t set. Tell an admin.')], flags: MessageFlags.Ephemeral });
  try {
    await i.member.roles.add(role, 'Verification');
    if (V.removeRole && i.member.roles.cache.has(V.removeRole)) await i.member.roles.remove(V.removeRole, 'Verification');
  } catch {
    return i.reply({ embeds: [fail('I can\'t give you the role — the bot is too low in the hierarchy.')], flags: MessageFlags.Ephemeral });
  }
  return i.reply({ embeds: [ok('You\'re verified! Welcome 🎉')], flags: MessageFlags.Ephemeral });
}

async function handleButton(i, action) {
  const V = i.client.db.getSettings(i.guild.id).verification;
  if (!V.enabled) return i.reply({ embeds: [fail('Verification is disabled.')], flags: MessageFlags.Ephemeral });
  if (V.role && i.member.roles.cache.has(V.role)) return i.reply({ embeds: [ok('You\'re already verified.')], flags: MessageFlags.Ephemeral });
  if (action === 'start') {
    if (!V.captcha) return grant(i);
    const code = Math.random().toString(36).slice(2, 7).toUpperCase().replace(/[O0I1]/g, 'X');
    codes.set(key(i), { code, exp: Date.now() + 5 * 60_000 });
    return i.reply({
      content: `🔐 Your code is: **\`${code.split('').join(' ')}\`**
Click the button and type it (without spaces). Valid for 5 minutes.`,
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify:enter').setLabel('Enter code').setStyle(ButtonStyle.Primary))],
      flags: MessageFlags.Ephemeral,
    });
  }
  if (action === 'enter') {
    return i.showModal(new ModalBuilder().setCustomId('verify:modal').setTitle('Verification').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Code').setStyle(TextInputStyle.Short).setMinLength(5).setMaxLength(10).setRequired(true)),
    ));
  }
}

async function handleModal(i) {
  const entry = codes.get(key(i));
  const input = i.fields.getTextInputValue('code').replace(/\s/g, '').toUpperCase();
  if (!entry || entry.exp < Date.now()) return i.reply({ embeds: [fail('The code expired. Click "Verify me" again.')], flags: MessageFlags.Ephemeral });
  if (entry.code !== input) return i.reply({ embeds: [fail('Wrong code. Try again.')], flags: MessageFlags.Ephemeral });
  codes.delete(key(i));
  return grant(i);
}

module.exports = { postPanel, handleButton, handleModal };
