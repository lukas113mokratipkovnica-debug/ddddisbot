// Invite tracking: cache invite uses per guild and diff them on member join.
const cache = new Map(); // `${bot}:${guild}` -> Map(code -> { uses, inviterId })

const k = (guild) => `${guild.client.user.id}:${guild.id}`;

async function cacheGuild(guild) {
  const invs = await guild.invites.fetch().catch(() => null);
  if (!invs) return;
  cache.set(k(guild), new Map(invs.map((i) => [i.code, { uses: i.uses, inviterId: i.inviterId }])));
}

async function cacheAll(client) {
  for (const g of client.guilds.cache.values()) await cacheGuild(g);
}

async function findInviter(member) {
  const guild = member.guild;
  const before = cache.get(k(guild)) || new Map();
  const invs = await guild.invites.fetch().catch(() => null);
  if (!invs) return null;
  let used = null;
  for (const inv of invs.values()) {
    const prev = before.get(inv.code);
    if (inv.uses > (prev?.uses ?? 0)) { used = inv; break; }
  }
  if (!used) { // invite with max uses got deleted after use
    for (const [code, prev] of before) if (!invs.has(code) && prev.uses >= 0) { used = { code, inviterId: prev.inviterId }; break; }
  }
  cache.set(k(guild), new Map(invs.map((i) => [i.code, { uses: i.uses, inviterId: i.inviterId }])));
  if (!used && guild.vanityURLCode) return { code: guild.vanityURLCode, inviterId: null, vanity: true };
  return used ? { code: used.code, inviterId: used.inviterId } : null;
}

module.exports = { cacheGuild, cacheAll, findInviter };
