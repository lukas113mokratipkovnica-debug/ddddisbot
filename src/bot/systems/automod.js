const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { logModAction, sendLog, truncate } = require('../utils');

const spamTracker = new Map(); // `${guild}:${user}` -> [timestamps]
const INVITE_RE = /(discord\.(gg|io|me|li)|discord(app)?\.com\/invite)\/[a-z0-9-]+/i;
const LINK_RE = /https?:\/\/([^\s/]+)/gi;

function detect(message, A) {
  const content = message.content || '';
  const lower = content.toLowerCase();

  if (A.badWords.enabled && A.badWords.words.length) {
    const hit = A.badWords.words.find((w) => {
      const word = w.trim().toLowerCase();
      if (!word) return false;
      if (word.includes('*')) {
        const re = new RegExp(word.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'), 'i');
        return re.test(lower);
      }
      return new RegExp(`(^|[^\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(lower);
    });
    if (hit) return { rule: 'Zabranjena riječ', action: A.badWords.action };
  }
  if (A.invites.enabled && INVITE_RE.test(content)) return { rule: 'Discord pozivnica', action: A.invites.action };
  if (A.links.enabled) {
    const hosts = [...content.matchAll(LINK_RE)].map((m) => m[1].toLowerCase().replace(/^www\./, ''));
    const bad = hosts.find((h) => !A.links.whitelist.some((w) => h === w.toLowerCase() || h.endsWith(`.${w.toLowerCase()}`)));
    if (bad) return { rule: `Link (${bad})`, action: A.links.action };
  }
  if (A.mentions.enabled) {
    const count = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0);
    if (count >= A.mentions.limit) return { rule: `Masovno tagovanje (${count})`, action: A.mentions.action };
  }
  if (A.caps.enabled && content.length >= A.caps.minLength) {
    const letters = content.replace(/[^a-zA-ZČĆŽŠĐčćžšđ]/g, '');
    if (letters.length >= A.caps.minLength) {
      const upper = letters.replace(/[^A-ZČĆŽŠĐ]/g, '').length;
      if ((upper / letters.length) * 100 >= A.caps.percent) return { rule: 'Previše velikih slova', action: A.caps.action };
    }
  }
  if (A.spam.enabled) {
    const key = `${message.client.user.id}:${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const arr = (spamTracker.get(key) || []).filter((t) => now - t < A.spam.seconds * 1000);
    arr.push(now);
    spamTracker.set(key, arr);
    if (arr.length > A.spam.messages) {
      spamTracker.set(key, []);
      return { rule: 'Spam', action: A.spam.action };
    }
  }
  return null;
}

async function punish(message, hit, A) {
  const { member, guild } = message;
  const me = guild.members.me;
  await message.delete().catch(() => {});
  const reason = `[AutoMod] ${hit.rule}`;

  const notice = await message.channel
    .send({ content: `<@${member.id}>, poruka je uklonjena: **${hit.rule}**.`, allowedMentions: { users: [member.id] } })
    .catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), 6000);

  if (hit.action === 'warn' || hit.action === 'timeout') {
    if (hit.action === 'warn') message.client.db.warnings.add(guild.id, member.id, me.id, reason);
    if (hit.action === 'timeout' && member.moderatable) {
      await member.timeout(A.timeoutMinutes * 60_000, reason).catch(() => {});
    }
    await logModAction(guild, hit.action === 'warn' ? 'warn' : 'timeout', member.user, me.user, reason,
      `Kanal: <#${message.channel.id}>\nPoruka: ${truncate(message.content, 900) || '*prazno*'}`);

    if (hit.action === 'warn' && A.warnThreshold.enabled) {
      const count = message.client.db.warnings.count(guild.id, member.id);
      if (count >= A.warnThreshold.count && count % A.warnThreshold.count === 0) {
        await thresholdPunish(member, A.warnThreshold, count);
      }
    }
  } else {
    await sendLog(guild, 'modActions', new EmbedBuilder().setColor(0xeb459e).setTitle('AutoMod • poruka obrisana')
      .addFields(
        { name: 'Korisnik', value: `<@${member.id}>`, inline: true },
        { name: 'Pravilo', value: hit.rule, inline: true },
        { name: 'Kanal', value: `<#${message.channel.id}>`, inline: true },
        { name: 'Poruka', value: truncate(message.content, 1000) || '*prazno*' },
      ));
  }
}

async function thresholdPunish(member, T, count) {
  const me = member.guild.members.me;
  const reason = `Automatska kazna: ${count} upozorenja`;
  try {
    if (T.action === 'timeout' && member.moderatable) await member.timeout(T.minutes * 60_000, reason);
    else if (T.action === 'kick' && member.kickable) await member.kick(reason);
    else if (T.action === 'ban' && member.bannable) await member.ban({ reason });
    else return;
    await logModAction(member.guild, T.action, member.user, me.user, reason);
  } catch (e) {
    console.warn('[automod] threshold error', e.message);
  }
}

/** Returns true if the message was removed. */
async function handleMessage(message) {
  const s = message.client.db.getSettings(message.guild.id);
  const A = s.automod;
  if (!A.enabled || !message.member) return false;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;
  if (A.ignoredChannels.includes(message.channel.id) || A.ignoredChannels.includes(message.channel.parentId)) return false;
  if (A.ignoredRoles.some((r) => message.member.roles.cache.has(r))) return false;
  const hit = detect(message, A);
  if (!hit) return false;
  await punish(message, hit, A);
  return true;
}

module.exports = { handleMessage, thresholdPunish };
