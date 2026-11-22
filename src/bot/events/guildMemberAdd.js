const { Events, EmbedBuilder } = require('discord.js');
const { getSettings, stats } = require('../../database');
const { fillPlaceholders, sendLog } = require('../utils');
const config = require('../../config');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const s = getSettings(member.guild.id);
    stats.bump(member.guild.id, 'joins');

    // autorole
    if (s.autorole.enabled) {
      const me = member.guild.members.me;
      const roles = (member.user.bot ? s.autorole.botRoles : s.autorole.roles)
        .filter((id) => {
          const r = member.guild.roles.cache.get(id);
          return r && !r.managed && r.position < me.roles.highest.position;
        });
      if (roles.length) await member.roles.add(roles, 'Autorole').catch((e) => console.warn('[autorole]', e.message));
    }

    // welcome
    if (s.welcome.enabled && s.welcome.channel) {
      const ch = member.guild.channels.cache.get(s.welcome.channel);
      if (ch?.isTextBased()) {
        const text = fillPlaceholders(s.welcome.message, { member });
        const payload = s.welcome.embed
          ? {
            content: `<@${member.id}>`,
            embeds: [new EmbedBuilder().setColor(config.color).setTitle('👋 Dobrodošlica')
              .setDescription(text).setThumbnail(member.user.displayAvatarURL({ size: 256 }))
              .setFooter({ text: `Član #${member.guild.memberCount}` }).setTimestamp()],
          }
          : { content: text };
        await ch.send(payload).catch(() => {});
      }
    }
    if (s.welcome.enabled && s.welcome.dm && s.welcome.dmMessage) {
      await member.send(fillPlaceholders(s.welcome.dmMessage, { member })).catch(() => {});
    }

    const age = Date.now() - member.user.createdTimestamp;
    await sendLog(member.guild, 'memberJoin', new EmbedBuilder().setColor(0x57f287).setTitle('Član ušao')
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(`<@${member.id}> • ${member.user.tag}\nRačun kreiran <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>${age < 7 * 864e5 ? '\n⚠️ **Novi račun!**' : ''}`)
      .setFooter({ text: `ID: ${member.id}` }));
  },
};
