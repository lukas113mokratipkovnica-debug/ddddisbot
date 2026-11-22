// Log listeners bundled into one "ready" hook so they can be registered together.
const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { sendLog, truncate } = require('../utils');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    client.on(Events.MessageDelete, async (m) => {
      if (!m.guild || m.author?.bot) return;
      const e = new EmbedBuilder().setColor(0xed4245).setTitle('Message deleted')
        .setDescription(`**Autor:** ${m.author ? `<@${m.author.id}>` : 'unknown'}\n**Channel:** <#${m.channelId}>`)
        .addFields({ name: 'Content', value: truncate(m.content, 1000) || '*unknown / not cached*' });
      if (m.attachments?.size) e.addFields({ name: 'Attachments', value: [...m.attachments.values()].map((a) => a.name).join(', ') });
      await sendLog(m.guild, 'messageDelete', e);
    });

    client.on(Events.MessageBulkDelete, async (msgs, channel) => {
      await sendLog(channel.guild, 'messageDelete', new EmbedBuilder().setColor(0xed4245)
        .setTitle('Bulk delete').setDescription(`**${msgs.size}** messages deleted in <#${channel.id}>`));
    });

    client.on(Events.MessageUpdate, async (oldM, newM) => {
      if (!newM.guild || newM.author?.bot || oldM.content === newM.content || oldM.partial) return;
      await sendLog(newM.guild, 'messageEdit', new EmbedBuilder().setColor(0xfaa61a).setTitle('Message edited')
        .setDescription(`**Author:** <@${newM.author.id}>
**Channel:** <#${newM.channelId}> • [Jump](${newM.url})`)
        .addFields(
          { name: 'Before', value: truncate(oldM.content, 1000) || '*empty*' },
          { name: 'After', value: truncate(newM.content, 1000) || '*empty*' },
        ));
    });

    client.on(Events.GuildMemberUpdate, async (oldM, newM) => {
      if (oldM.partial) return;
      const changes = [];
      if (oldM.nickname !== newM.nickname) changes.push(`**Nickname:** ${oldM.nickname || '—'} → ${newM.nickname || '—'}`);
      const added = newM.roles.cache.filter((r) => !oldM.roles.cache.has(r.id));
      const removed = oldM.roles.cache.filter((r) => !newM.roles.cache.has(r.id));
      if (added.size) changes.push(`**+ Roles:** ${added.map((r) => `${r}`).join(' ')}`);
      if (removed.size) changes.push(`**- Roles:** ${removed.map((r) => `${r}`).join(' ')}`);
      if (!oldM.isCommunicationDisabled() && newM.isCommunicationDisabled())
        changes.push(`**Timeout until:** <t:${Math.floor(newM.communicationDisabledUntilTimestamp / 1000)}:f>`);
      if (!changes.length) return;
      await sendLog(newM.guild, 'memberUpdate', new EmbedBuilder().setColor(0x5865f2).setTitle('Member updated')
        .setDescription(`<@${newM.id}> • ${newM.user.tag}\n${changes.join('\n')}`).setThumbnail(newM.user.displayAvatarURL()));
    });

    client.on(Events.VoiceStateUpdate, async (o, n) => {
      const member = n.member || o.member;
      if (!member || member.user.bot) return;
      let text;
      if (!o.channelId && n.channelId) text = `🔊 <@${member.id}> joined <#${n.channelId}>`;
      else if (o.channelId && !n.channelId) text = `🔇 <@${member.id}> left <#${o.channelId}>`;
      else if (o.channelId !== n.channelId) text = `🔀 <@${member.id}> moved <#${o.channelId}> → <#${n.channelId}>`;
      if (text) await sendLog(n.guild, 'voice', new EmbedBuilder().setColor(0x5865f2).setDescription(text));
    });

    client.on(Events.ChannelCreate, async (c) => {
      if (!c.guild) return;
      await sendLog(c.guild, 'channels', new EmbedBuilder().setColor(0x57f287).setDescription(`📁 Channel created: ${c} (\`${c.name}\`)`));
    });
    client.on(Events.ChannelDelete, async (c) => {
      if (!c.guild) return;
      await sendLog(c.guild, 'channels', new EmbedBuilder().setColor(0xed4245).setDescription(`🗑️ Channel deleted: \`#${c.name}\``));
    });

    // Bans done outside the bot (right-click ban) still get logged.
    client.on(Events.GuildBanAdd, async (ban) => {
      const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 }).catch(() => null);
      const entry = logs?.entries.first();
      if (entry?.executorId === client.user.id) return; // already logged by command
      await sendLog(ban.guild, 'modActions', new EmbedBuilder().setColor(0xed4245).setTitle('Member banned')
        .setDescription(`<@${ban.user.id}> • ${ban.user.tag}\n**Od:** ${entry?.executorId ? `<@${entry.executorId}>` : 'unknown'}\n**Reason:** ${entry?.reason || ban.reason || '—'}`));
    });
  },
};
