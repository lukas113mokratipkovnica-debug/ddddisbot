const { Events, EmbedBuilder } = require('discord.js');
const { fillPlaceholders, sendLog } = require('../utils');
const invites = require('../systems/invites');
const config = require('../../config');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member, client) {
    const db = client.db;
    const s = db.getSettings(member.guild.id);
    const has = (m) => client.modules.has(m);
    db.stats.bump(member.guild.id, 'joins');

    let inviter = null; let inviteCount = 0;
    if (has('invites')) {
      const used = await invites.findInviter(member);
      if (used) {
        db.invites.recordJoin(member.guild.id, member.id, used.inviterId, used.code);
        if (used.inviterId) {
          inviter = await client.users.fetch(used.inviterId).catch(() => null);
          const r = db.invites.get(member.guild.id, used.inviterId);
          inviteCount = r.joins - r.leaves;
        }
      }
      if (s.invites.enabled && s.invites.channel) {
        const ch = member.guild.channels.cache.get(s.invites.channel);
        const text = fillPlaceholders(s.invites.message, { member, extra: { inviter: inviter ? inviter.username : (used?.vanity ? 'vanity link' : 'unknown'), invites: inviteCount } });
        if (ch?.isTextBased()) await ch.send({ content: text, allowedMentions: { users: [member.id] } }).catch(() => {});
      }
    }

    if (has('welcome')) {
      if (s.autorole.enabled) {
        const me = member.guild.members.me;
        const roles = (member.user.bot ? s.autorole.botRoles : s.autorole.roles).filter((id) => {
          const r = member.guild.roles.cache.get(id);
          return r && !r.managed && r.position < me.roles.highest.position;
        });
        if (roles.length) await member.roles.add(roles, 'Autoroles').catch((e) => client.log?.('warn', `Autorole: ${e.message}`));
      }
      const extra = { inviter: inviter ? inviter.username : 'unknown', invites: inviteCount };
      if (s.welcome.enabled && s.welcome.channel) {
        const ch = member.guild.channels.cache.get(s.welcome.channel);
        if (ch?.isTextBased()) {
          const text = fillPlaceholders(s.welcome.message, { member, extra });
          const payload = s.welcome.embed
            ? { content: `<@${member.id}>`, embeds: [new EmbedBuilder().setColor(config.color).setTitle('👋 Welcome').setDescription(text).setThumbnail(member.user.displayAvatarURL({ size: 256 })).setFooter({ text: `Member #${member.guild.memberCount}` }).setTimestamp()] }
            : { content: text };
          await ch.send(payload).catch(() => {});
        }
      }
      if (s.welcome.enabled && s.welcome.dm && s.welcome.dmMessage) await member.send(fillPlaceholders(s.welcome.dmMessage, { member, extra })).catch(() => {});
    }

    const age = Date.now() - member.user.createdTimestamp;
    await sendLog(member.guild, 'memberJoin', new EmbedBuilder().setColor(0x57f287).setTitle('Member joined').setThumbnail(member.user.displayAvatarURL())
      .setDescription(`<@${member.id}> • ${member.user.tag}\nAccount created <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>${age < 7 * 864e5 ? '\n⚠️ **New account!**' : ''}${inviter ? `\nInvited by: <@${inviter.id}>` : ''}`)
      .setFooter({ text: `ID: ${member.id}` }));
  },
};
