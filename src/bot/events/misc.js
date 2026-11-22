// Small event handlers: starboard, temp voice, invite cache, guild join/leave.
const { Events, EmbedBuilder } = require('discord.js');
const tempvoice = require('../systems/tempvoice');
const invites = require('../systems/invites');

module.exports = [
  {
    name: Events.MessageReactionAdd,
    async execute(reaction, user, client) {
      if (!client.modules.has('starboard')) return;
      if (reaction.partial) await reaction.fetch().catch(() => null);
      const msg = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
      if (!msg?.guild) return;
      const db = client.db;
      const s = db.getSettings(msg.guild.id).starboard;
      if (!s.enabled || !s.channel || msg.channelId === s.channel) return;
      if (reaction.emoji.name !== s.emoji && reaction.emoji.id !== s.emoji && reaction.emoji.toString() !== s.emoji) return;
      if (reaction.count < s.threshold) return;
      const ch = msg.guild.channels.cache.get(s.channel);
      if (!ch?.isTextBased()) return;
      const content = `${s.emoji} **${reaction.count}** • <#${msg.channelId}>`;
      const existing = db.raw.prepare('SELECT star_message_id FROM starboard WHERE message_id = ?').get(msg.id);
      if (existing) {
        const sm = await ch.messages.fetch(existing.star_message_id).catch(() => null);
        if (sm) await sm.edit({ content }).catch(() => {});
        return;
      }
      const e = new EmbedBuilder().setColor(0xfee75c).setAuthor({ name: msg.author.tag, iconURL: msg.author.displayAvatarURL() })
        .setDescription(`${msg.content || ''}\n\n[Skoči na poruku](${msg.url})`.trim()).setTimestamp(msg.createdTimestamp);
      const img = msg.attachments.find((a) => a.contentType?.startsWith('image/'));
      if (img) e.setImage(img.url);
      const sent = await ch.send({ content, embeds: [e] });
      db.raw.prepare('INSERT OR REPLACE INTO starboard (message_id, star_message_id) VALUES (?, ?)').run(msg.id, sent.id);
    },
  },
  {
    name: Events.VoiceStateUpdate,
    async execute(o, n, client) { if (client.modules.has('tempvoice')) await tempvoice.handleVoice(o, n); },
  },
  { name: Events.InviteCreate, async execute(inv, client) { if (client.modules.has('invites') && inv.guild) await invites.cacheGuild(client.guilds.cache.get(inv.guild.id)); } },
  { name: Events.InviteDelete, async execute(inv, client) { if (client.modules.has('invites') && inv.guild) setTimeout(() => invites.cacheGuild(client.guilds.cache.get(inv.guild.id)), 2000); } },
  {
    name: Events.GuildCreate,
    async execute(guild, client) {
      client.log?.('info', `Dodan na server: ${guild.name} (${guild.memberCount} članova)`);
      if (client.modules.has('invites')) await invites.cacheGuild(guild);
    },
  },
  { name: Events.GuildDelete, async execute(guild, client) { client.log?.('info', `Uklonjen sa servera: ${guild.name}`); } },
];
