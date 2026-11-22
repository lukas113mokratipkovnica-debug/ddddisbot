const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { fillPlaceholders } = require('../utils');

async function handleVoice(oldState, newState) {
  const client = newState.client;
  const db = client.db;
  const guild = newState.guild;
  const T = db.getSettings(guild.id).tempvoice;

  // joined hub -> create channel
  if (T.enabled && T.hub && newState.channelId === T.hub && newState.member) {
    const member = newState.member;
    const hub = guild.channels.cache.get(T.hub);
    const parent = T.category || hub?.parentId || null;
    try {
      const vc = await guild.channels.create({
        name: fillPlaceholders(T.nameTemplate, { member }).slice(0, 100) || member.user.username,
        type: ChannelType.GuildVoice,
        parent,
        userLimit: T.userLimit || 0,
        permissionOverwrites: [{ id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect] }],
      });
      db.tempVoice.add(vc.id, guild.id, member.id);
      await member.voice.setChannel(vc).catch(() => vc.delete().catch(() => {}));
    } catch (e) {
      console.warn('[tempvoice]', e.message);
    }
  }

  // left a temp channel -> delete when empty
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const t = db.tempVoice.get(oldState.channelId);
    if (t) {
      const ch = guild.channels.cache.get(oldState.channelId);
      if (!ch) db.tempVoice.remove(oldState.channelId);
      else if (ch.members.size === 0) {
        await ch.delete('Privremeni kanal prazan').catch(() => {});
        db.tempVoice.remove(oldState.channelId);
      }
    }
  }
}

// cleanup channels left empty while the bot was offline
async function cleanup(client) {
  for (const t of client.db.tempVoice.all()) {
    const ch = client.channels.cache.get(t.channel_id);
    if (!ch) client.db.tempVoice.remove(t.channel_id);
    else if (ch.members?.size === 0) { await ch.delete().catch(() => {}); client.db.tempVoice.remove(t.channel_id); }
  }
}

module.exports = { handleVoice, cleanup };
