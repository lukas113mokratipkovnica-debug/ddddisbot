const { Events, EmbedBuilder } = require('discord.js');
const { getSettings, stats } = require('../../database');
const { fillPlaceholders, sendLog } = require('../utils');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const s = getSettings(member.guild.id);
    stats.bump(member.guild.id, 'leaves');
    if (s.goodbye.enabled && s.goodbye.channel) {
      const ch = member.guild.channels.cache.get(s.goodbye.channel);
      if (ch?.isTextBased()) {
        const text = fillPlaceholders(s.goodbye.message, { member, user: member.user });
        const payload = s.goodbye.embed
          ? { embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(text).setThumbnail(member.user.displayAvatarURL())] }
          : { content: text };
        await ch.send(payload).catch(() => {});
      }
    }
    const roles = member.roles?.cache?.filter((r) => r.id !== member.guild.id).map((r) => `${r}`).join(' ');
    await sendLog(member.guild, 'memberLeave', new EmbedBuilder().setColor(0xed4245).setTitle('Član izašao')
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(`<@${member.id}> • ${member.user.tag}${member.joinedTimestamp ? `\nBio član od <t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : ''}${roles ? `\n**Uloge:** ${roles.slice(0, 900)}` : ''}`)
      .setFooter({ text: `ID: ${member.id}` }));
  },
};
