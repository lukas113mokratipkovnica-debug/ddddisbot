const { Events, EmbedBuilder } = require('discord.js');
const { fillPlaceholders, sendLog } = require('../utils');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member, client) {
    const db = client.db;
    const s = db.getSettings(member.guild.id);
    db.stats.bump(member.guild.id, 'leaves');
    if (client.modules.has('invites')) db.invites.recordLeave(member.guild.id, member.id);
    if (client.modules.has('welcome') && s.goodbye.enabled && s.goodbye.channel) {
      const ch = member.guild.channels.cache.get(s.goodbye.channel);
      if (ch?.isTextBased()) {
        const text = fillPlaceholders(s.goodbye.message, { member, user: member.user });
        await ch.send(s.goodbye.embed ? { embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(text).setThumbnail(member.user.displayAvatarURL())] } : { content: text }).catch(() => {});
      }
    }
    const roles = member.roles?.cache?.filter((r) => r.id !== member.guild.id).map((r) => `${r}`).join(' ');
    await sendLog(member.guild, 'memberLeave', new EmbedBuilder().setColor(0xed4245).setTitle('Member left').setThumbnail(member.user.displayAvatarURL())
      .setDescription(`<@${member.id}> • ${member.user.tag}${member.joinedTimestamp ? `\nMember since <t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : ''}${roles ? `\n**Roles:** ${roles.slice(0, 900)}` : ''}`)
      .setFooter({ text: `ID: ${member.id}` }));
  },
};
