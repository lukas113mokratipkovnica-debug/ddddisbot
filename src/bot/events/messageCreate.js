const { Events, EmbedBuilder } = require('discord.js');
const { fillPlaceholders } = require('../utils');
const automod = require('../systems/automod');
const leveling = require('../systems/leveling');
const community = require('../systems/community');
const config = require('../../config');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (!message.guild || message.author.bot || message.system) return;
    const has = (m) => client.modules.has(m);
    const db = client.db;
    db.stats.bump(message.guild.id, 'messages');

    if (has('automod') && await automod.handleMessage(message)) return;
    if (has('counting') && await community.counting(message)) return;
    if (has('sticky')) community.sticky(message);
    if (has('afk')) await community.afk(message);
    if (has('leveling')) await leveling.handleMessage(message);
    if (!has('customcommands')) return;

    const s = db.getSettings(message.guild.id);
    if (message.content.startsWith(s.prefix)) {
      const trigger = message.content.slice(s.prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
      const cc = trigger && db.customCommands.get(message.guild.id, trigger);
      if (cc) {
        db.customCommands.used(cc.id);
        const args = message.content.slice(s.prefix.length + trigger.length).trim();
        const text = fillPlaceholders(cc.response, { member: message.member, extra: { args, channel: `<#${message.channel.id}>` } });
        if (cc.delete_trigger) await message.delete().catch(() => {});
        if (cc.reaction && !cc.delete_trigger) await message.react(cc.reaction).catch(() => {});
        const payload = cc.embed
          ? { embeds: [new EmbedBuilder().setColor(config.color).setDescription(text.slice(0, 4096))] }
          : { content: text.slice(0, 2000) };
        await message.channel.send(payload).catch(() => {});
        return;
      }
    }
    await community.autoresponder(message, (t) => fillPlaceholders(t, { member: message.member, extra: { channel: `<#${message.channel.id}>` } }));
  },
};
