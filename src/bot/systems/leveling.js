const { fillPlaceholders } = require('../utils');

const cooldowns = new Map(); // `${guild}:${user}` -> timestamp

async function applyRewards(member, level, settings) {
  const rewards = [...settings.leveling.rewards].filter((r) => r.role).sort((a, b) => a.level - b.level);
  if (!rewards.length) return;
  const earned = rewards.filter((r) => r.level <= level);
  if (!earned.length) return;
  const me = member.guild.members.me;
  const assignable = (id) => {
    const role = member.guild.roles.cache.get(id);
    return role && role.position < me.roles.highest.position && !role.managed;
  };
  try {
    if (settings.leveling.stackRewards) {
      const toAdd = earned.map((r) => r.role).filter((id) => !member.roles.cache.has(id) && assignable(id));
      if (toAdd.length) await member.roles.add(toAdd, 'Level reward');
    } else {
      const top = earned[earned.length - 1].role;
      const toRemove = rewards.map((r) => r.role).filter((id) => id !== top && member.roles.cache.has(id) && assignable(id));
      if (toRemove.length) await member.roles.remove(toRemove, 'Level reward (replacement)');
      if (!member.roles.cache.has(top) && assignable(top)) await member.roles.add(top, 'Level reward');
    }
  } catch (e) {
    console.warn('[leveling] reward error:', e.message);
  }
}

async function handleMessage(message) {
  const db = message.client.db;
  const s = db.getSettings(message.guild.id);
  const L = s.leveling;
  if (!L.enabled) return;
  if (L.noXpChannels.includes(message.channel.id) || L.noXpChannels.includes(message.channel.parentId)) return;
  if (message.member && L.noXpRoles.some((r) => message.member.roles.cache.has(r))) return;

  const key = `${message.client.user.id}:${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  if (now - (cooldowns.get(key) || 0) < L.cooldown * 1000) return;
  cooldowns.set(key, now);

  const min = Math.max(0, Number(L.xpMin) || 0);
  const max = Math.max(min, Number(L.xpMax) || min);
  const gain = Math.round((Math.floor(Math.random() * (max - min + 1)) + min) * (Number(L.multiplier) || 1));
  const before = db.levels.get(message.guild.id, message.author.id);
  const newLevel = db.levels.set(message.guild.id, message.author.id, before.xp + gain, 1);

  if (newLevel > before.level) {
    if (message.member) await applyRewards(message.member, newLevel, s);
    if (L.announce === 'off') return;
    const text = fillPlaceholders(L.message, { member: message.member, extra: { level: newLevel } });
    try {
      if (L.announce === 'dm') await message.author.send(text);
      else if (L.announce === 'channel' && L.channel) {
        const ch = message.guild.channels.cache.get(L.channel);
        if (ch?.isTextBased()) await ch.send(text);
      } else await message.channel.send(text);
    } catch { /* ignore */ }
  }
}

module.exports = { handleMessage, applyRewards };
