const { Events, EmbedBuilder } = require('discord.js');
const { getSettings, db } = require('../../database');

db.exec('CREATE TABLE IF NOT EXISTS starboard (message_id TEXT PRIMARY KEY, star_message_id TEXT NOT NULL)');

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction) {
    if (reaction.partial) await reaction.fetch().catch(() => null);
    const msg = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
    if (!msg?.guild) return;
    const s = getSettings(msg.guild.id).starboard;
    if (!s.enabled || !s.channel || msg.channelId === s.channel) return;
    if ((reaction.emoji.id || reaction.emoji.name) !== s.emoji && reaction.emoji.name !== s.emoji) return;
    if (reaction.count < s.threshold) return;
    const ch = msg.guild.channels.cache.get(s.channel);
    if (!ch?.isTextBased()) return;

    const content = `${s.emoji} **${reaction.count}** • <#${msg.channelId}>`;
    const existing = db.prepare('SELECT star_message_id FROM starboard WHERE message_id = ?').get(msg.id);
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
    db.prepare('INSERT OR REPLACE INTO starboard (message_id, star_message_id) VALUES (?, ?)').run(msg.id, sent.id);
  },
};
