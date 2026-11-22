const { Events, EmbedBuilder } = require('discord.js');
const { getSettings, customCommands, stats } = require('../../database');
const { fillPlaceholders } = require('../utils');
const automod = require('../systems/automod');
const leveling = require('../systems/leveling');
const config = require('../../config');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author.bot || message.system) return;
    stats.bump(message.guild.id, 'messages');

    if (await automod.handleMessage(message)) return;
    await leveling.handleMessage(message);

    const s = getSettings(message.guild.id);
    if (!message.content.startsWith(s.prefix)) return;
    const trigger = message.content.slice(s.prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
    if (!trigger) return;
    const cc = customCommands.get(message.guild.id, trigger);
    if (!cc) return;
    customCommands.used(cc.id);
    const args = message.content.slice(s.prefix.length + trigger.length).trim();
    const text = fillPlaceholders(cc.response, {
      member: message.member, extra: { args, channel: `<#${message.channel.id}>` },
    });
    if (cc.delete_trigger) await message.delete().catch(() => {});
    const payload = cc.embed
      ? { embeds: [new EmbedBuilder().setColor(config.color).setDescription(text.slice(0, 4096))] }
      : { content: text.slice(0, 2000) };
    await message.channel.send(payload).catch(() => {});
  },
};
