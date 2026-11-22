// Periodic jobs per bot: reminders, birthdays, server stats channels, YouTube/RSS feeds.
const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { fillPlaceholders } = require('../utils');
const { safeFetch } = require('../../security');

async function reminders(client) {
  for (const r of client.db.reminders.due()) {
    client.db.reminders.done(r.id);
    const text = `⏰ <@${r.user_id}>, reminder: **${r.text}**`;
    const ch = r.channel_id && client.channels.cache.get(r.channel_id);
    const sent = ch ? await ch.send({ content: text, allowedMentions: { users: [r.user_id] } }).catch(() => null) : null;
    if (!sent) await client.users.send(r.user_id, text).catch(() => {});
  }
}

async function birthdays(client) {
  if (!client.modules.has('birthdays')) return;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const d = now.getDate(); const m = now.getMonth() + 1;
  for (const guild of client.guilds.cache.values()) {
    const B = client.db.getSettings(guild.id).birthdays;
    if (!B.enabled) continue;
    const list = client.db.birthdays.list(guild.id);
    const todays = list.filter((b) => b.day === d && b.month === m);
    // birthday role: give today, remove otherwise
    if (B.role && guild.roles.cache.has(B.role)) {
      for (const b of list) {
        const member = guild.members.cache.get(b.user_id) || await guild.members.fetch(b.user_id).catch(() => null);
        if (!member) continue;
        const isToday = b.day === d && b.month === m;
        if (isToday && !member.roles.cache.has(B.role)) await member.roles.add(B.role).catch(() => {});
        if (!isToday && member.roles.cache.has(B.role)) await member.roles.remove(B.role).catch(() => {});
      }
    }
    if (!todays.length || client.db.birthdays.announced(guild.id, date)) continue;
    const ch = guild.channels.cache.get(B.channel);
    if (!ch?.isTextBased()) continue;
    client.db.birthdays.markAnnounced(guild.id, date);
    for (const b of todays) {
      const member = await guild.members.fetch(b.user_id).catch(() => null);
      if (member) await ch.send(fillPlaceholders(B.message, { member })).catch(() => {});
    }
  }
}

const STAT_KEYS = ['members', 'humans', 'bots', 'boosts'];
function statCount(guild, k) {
  if (k === 'members') return guild.memberCount;
  if (k === 'boosts') return guild.premiumSubscriptionCount || 0;
  const bots = guild.members.cache.filter((m) => m.user.bot).size;
  return k === 'bots' ? bots : guild.memberCount - bots;
}
async function serverStats(client) {
  if (!client.modules.has('serverstats')) return;
  for (const guild of client.guilds.cache.values()) {
    const S = client.db.getSettings(guild.id).serverstats;
    if (!S.enabled) continue;
    for (const k of STAT_KEYS) {
      const ch = S[k] && guild.channels.cache.get(S[k]);
      if (!ch) continue;
      const name = S[`${k}Name`].replace('{count}', statCount(guild, k).toLocaleString('hr-HR'));
      if (ch.name !== name) await ch.setName(name).catch(() => {});
    }
  }
}
async function createStatChannels(guild) {
  const db = guild.client.db;
  await guild.members.fetch().catch(() => {});
  const S = db.getSettings(guild.id).serverstats;
  const cat = await guild.channels.create({ name: '📊 Statistika', type: ChannelType.GuildCategory, position: 0 });
  const ids = {};
  for (const k of STAT_KEYS) {
    const ch = await guild.channels.create({
      name: S[`${k}Name`].replace('{count}', statCount(guild, k)),
      type: ChannelType.GuildVoice, parent: cat.id,
      permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }],
    });
    ids[k] = ch.id;
  }
  db.updateSettings(guild.id, (s) => { Object.assign(s.serverstats, ids, { enabled: true, category: cat.id }); });
}

// --- feeds
const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1]) : ''; };
function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<entry[\s\S]*?<\/entry>/g) || xml.match(/<item[\s\S]*?<\/item>/g) || [];
  for (const b of blocks.slice(0, 10)) {
    const link = (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || tag(b, 'link');
    items.push({ id: tag(b, 'yt:videoId') || tag(b, 'id') || tag(b, 'guid') || link, title: tag(b, 'title'), link, author: tag(b, 'name') || tag(b, 'author') || tag(xml, 'title') });
  }
  return items;
}
function feedUrl(f) {
  if (f.type === 'youtube') return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(f.source)}`;
  return f.source;
}
async function feeds(client) {
  if (!client.modules.has('notifications')) return;
  for (const guild of client.guilds.cache.values()) {
    for (const f of client.db.getSettings(guild.id).notifications.feeds) {
      try {
        const res = await safeFetch(feedUrl(f), { maxBytes: 3_000_000 });
        if (!res.ok) continue;
        const items = parseFeed(res.text());
        if (!items.length) continue;
        const last = client.db.feeds.last(f.id);
        if (last === null) { client.db.feeds.setLast(f.id, items[0].id); continue; } // first run: don't spam old posts
        const fresh = [];
        for (const it of items) { if (it.id === last) break; fresh.push(it); }
        if (!fresh.length) continue;
        client.db.feeds.setLast(f.id, items[0].id);
        const ch = guild.channels.cache.get(f.channel);
        if (!ch?.isTextBased()) continue;
        for (const it of fresh.slice(0, 3).reverse()) {
          const text = (f.message || '{link}').replace(/\{title\}/g, it.title).replace(/\{link\}/g, it.link).replace(/\{author\}/g, it.author);
          await ch.send({ content: text, allowedMentions: { parse: ['everyone', 'roles'] } }).catch(() => {});
        }
      } catch { /* network errors are retried next tick */ }
    }
  }
}

function start(client) {
  const safe = (fn) => () => fn(client).catch((e) => console.warn(`[ticker:${fn.name}]`, e.message));
  return [
    setInterval(safe(reminders), 15_000),
    setInterval(safe(birthdays), 30 * 60_000),
    setInterval(safe(serverStats), 10 * 60_000),
    setInterval(safe(feeds), 5 * 60_000),
    setTimeout(() => { safe(birthdays)(); safe(serverStats)(); safe(feeds)(); }, 20_000),
  ];
}

module.exports = { start, createStatChannels, parseFeed };
