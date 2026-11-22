// counting, afk, sticky, autoresponder — message-driven community features
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');

async function counting(message) {
  const db = message.client.db;
  const C = db.getSettings(message.guild.id).counting;
  if (!C.enabled || message.channel.id !== C.channel) return false;
  const m = message.content.trim().match(/^(\d+)/);
  if (!m) return false;
  const n = Number(m[1]);
  const state = db.counting.get(message.guild.id);
  const sameUser = !C.sameUserTwice && state.last_user === message.author.id;
  if (n === state.current + 1 && !sameUser) {
    db.counting.set(message.guild.id, n, message.author.id);
    await message.react(n > state.high_score && n % 10 === 0 ? '🏆' : '✅').catch(() => {});
    return true;
  }
  await message.react('❌').catch(() => {});
  const why = sameUser ? 'ne možeš brojati dvaput zaredom' : `sljedeći broj je bio **${state.current + 1}**`;
  if (C.resetOnFail) {
    db.counting.set(message.guild.id, 0, null);
    await message.channel.send(`💥 ${message.author} je pokvario/la niz na **${state.current}** (${why}). Krećemo od **1**! Rekord: **${Math.max(state.high_score, state.current)}**`).catch(() => {});
  } else {
    await message.channel.send(`⚠️ ${message.author}, ${why}.`).then((x) => setTimeout(() => x.delete().catch(() => {}), 5000)).catch(() => {});
  }
  return true;
}

async function afk(message) {
  const db = message.client.db;
  const g = message.guild.id;
  const mine = db.afk.get(g, message.author.id);
  if (mine) {
    db.afk.remove(g, message.author.id);
    if (message.member?.manageable && message.member.displayName.startsWith('[AFK] ')) {
      await message.member.setNickname(message.member.displayName.slice(6) || null).catch(() => {});
    }
    await message.reply(`👋 Dobrodošao/la nazad! Bio/la si AFK <t:${Math.floor(mine.since / 1000)}:R>.`).then((x) => setTimeout(() => x.delete().catch(() => {}), 8000)).catch(() => {});
  }
  const notes = [];
  for (const user of message.mentions.users.values()) {
    const a = db.afk.get(g, user.id);
    if (a) notes.push(`💤 **${user.username}** je AFK: ${a.reason} (<t:${Math.floor(a.since / 1000)}:R>)`);
  }
  if (notes.length) await message.reply({ content: notes.slice(0, 5).join('\n'), allowedMentions: { parse: [] } }).catch(() => {});
}

const stickyTimers = new Map();
function sticky(message) {
  const db = message.client.db;
  const st = db.sticky.get(message.channel.id);
  if (!st) return;
  const k = `${message.client.user.id}:${message.channel.id}`;
  clearTimeout(stickyTimers.get(k));
  stickyTimers.set(k, setTimeout(async () => {
    const cur = db.sticky.get(message.channel.id);
    if (!cur) return;
    if (cur.last_message_id) await message.channel.messages.delete(cur.last_message_id).catch(() => {});
    const msg = await message.channel.send({ embeds: [new EmbedBuilder().setColor(config.color).setDescription(`📌 ${cur.content}`)] }).catch(() => null);
    if (msg) db.sticky.setMessage(message.channel.id, msg.id);
  }, 3000));
}

async function autoresponder(message, fill) {
  const db = message.client.db;
  const content = message.content.toLowerCase();
  for (const r of db.customCommands.responders(message.guild.id)) {
    const t = r.trigger;
    const hit = r.match_type === 'exact' ? content.trim() === t
      : r.match_type === 'startswith' ? content.startsWith(t)
        : new RegExp(`(^|\\W)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\W)`, 'i').test(content);
    if (!hit) continue;
    db.customCommands.used(r.id);
    if (r.reaction) await message.react(r.reaction).catch(() => {});
    if (r.response && r.response !== '-') {
      const text = fill(r.response);
      await message.reply(r.embed ? { embeds: [new EmbedBuilder().setColor(config.color).setDescription(text.slice(0, 4096))] } : { content: text.slice(0, 2000) }).catch(() => {});
    }
    return true;
  }
  return false;
}

module.exports = { counting, afk, sticky, autoresponder };
