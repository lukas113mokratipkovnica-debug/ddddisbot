const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

function fillPlaceholders(text, { member, user, guild, extra = {} } = {}) {
  if (!text) return '';
  const u = user || member?.user;
  const g = guild || member?.guild;
  const map = {
    '{user}': u ? `<@${u.id}>` : '',
    '{username}': u?.username ?? '',
    '{tag}': u?.tag ?? '',
    '{userid}': u?.id ?? '',
    '{server}': g?.name ?? '',
    '{membercount}': g?.memberCount?.toString() ?? '',
    '{avatar}': u?.displayAvatarURL?.() ?? '',
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [`{${k}}`, String(v)])),
  };
  return text.replace(/\{[a-z]+\}/gi, (m) => (m.toLowerCase() in map ? map[m.toLowerCase()] : m));
}

function embed(description, color = config.color) {
  return new EmbedBuilder().setColor(color).setDescription(description);
}
const ok = (d) => embed(`✅ ${d}`, 0x57f287);
const fail = (d) => embed(`❌ ${d}`, 0xed4245);

async function sendLog(guild, type, embedObj) {
  if (!guild.client.modules?.has('logging')) return;
  const s = guild.client.db.getSettings(guild.id);
  if (!s.logs.enabled || !s.logs.channel || (type && s.logs[type] === false)) return;
  const ch = guild.channels.cache.get(s.logs.channel);
  if (!ch?.isTextBased()) return;
  await ch.send({ embeds: [embedObj.setTimestamp()] }).catch(() => {});
}

const CASE_COLORS = {
  ban: 0xed4245, unban: 0x57f287, kick: 0xfaa61a, timeout: 0xfaa61a, untimeout: 0x57f287,
  warn: 0xfee75c, purge: 0x5865f2, automod: 0xeb459e,
};

/** Records a moderation case and posts it to the log channel. */
async function logModAction(guild, type, target, moderator, reason, extra = '') {
  const id = guild.client.db.cases.add(guild.id, type, target.id, moderator.id, reason || null);
  const e = new EmbedBuilder()
    .setColor(CASE_COLORS[type] || config.color)
    .setTitle(`Case #${id} • ${type.toUpperCase()}`)
    .addFields(
      { name: 'Member', value: `<@${target.id}> (${target.id})`, inline: true },
      { name: 'Moderator', value: `<@${moderator.id}>`, inline: true },
      { name: 'Reason', value: reason || 'Not provided' },
    );
  if (extra) e.addFields({ name: 'Details', value: extra });
  await sendLog(guild, 'modActions', e);
  return id;
}

/** Checks whether `mod` may act on `target` (role hierarchy, owner, self). Returns error string or null. */
function canModerate(mod, target, me) {
  if (!target) return null;
  if (target.id === mod.id) return 'You can\'t do that to yourself.';
  if (target.id === mod.guild.ownerId) return 'You can\'t moderate the server owner.';
  if (target.id === me.id) return 'You can\'t do that to me.';
  if (mod.id !== mod.guild.ownerId && target.roles.highest.position >= mod.roles.highest.position)
    return 'That member has an equal or higher role than you.';
  if (target.roles.highest.position >= me.roles.highest.position)
    return 'My role is below that member\'s role — move my role higher.';
  return null;
}

function isMod(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const s = member.client.db.getSettings(member.guild.id);
  return Boolean(s.modRole && member.roles.cache.has(s.modRole));
}

/** "10m", "2h", "1d", "1w", "30s", combos "1h30m" -> ms */
function parseDuration(str) {
  if (!str) return null;
  const re = /(\d+)\s*(s|sek|m|min|h|d|w|t)/gi;
  const mult = { s: 1e3, sek: 1e3, m: 6e4, min: 6e4, h: 36e5, d: 864e5, w: 6048e5, t: 6048e5 };
  let total = 0;
  let match;
  let matched = false;
  while ((match = re.exec(str))) {
    matched = true;
    total += Number(match[1]) * mult[match[2].toLowerCase()];
  }
  if (!matched && /^\d+$/.test(str.trim())) total = Number(str) * 6e4; // plain number = minutes
  return total > 0 ? total : null;
}

function formatDuration(ms) {
  const parts = [];
  const units = [['d', 864e5], ['h', 36e5], ['m', 6e4], ['s', 1e3]];
  for (const [u, v] of units) {
    const n = Math.floor(ms / v);
    if (n) { parts.push(`${n}${u}`); ms -= n * v; }
  }
  return parts.join(' ') || '0s';
}

function progressBar(current, total, size = 16) {
  const filled = Math.round((current / total) * size);
  return '▰'.repeat(filled) + '▱'.repeat(Math.max(0, size - filled));
}

function truncate(str, n = 1000) {
  if (!str) return '';
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

module.exports = {
  fillPlaceholders, embed, ok, fail, sendLog, logModAction, canModerate, isMod,
  parseDuration, formatDuration, progressBar, truncate,
};
