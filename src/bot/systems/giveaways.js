const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { giveaways } = require('../../database');
const { ok, fail } = require('../utils');

function gwEmbed(g, ended = false) {
  const ts = Math.floor(g.ends_at / 1000);
  const e = new EmbedBuilder()
    .setColor(ended ? 0x2b2d31 : 0xeb459e)
    .setTitle(`🎉 ${g.prize}`)
    .setFooter({ text: `${g.winners} pobjednik(a) • ID ${g.id}` })
    .setTimestamp(g.ends_at);
  if (ended) {
    const w = g.winner_ids.length ? g.winner_ids.map((id) => `<@${id}>`).join(', ') : 'Nema dovoljno sudionika.';
    e.setDescription(`Završeno!\n**Pobjednici:** ${w}\n**Organizator:** <@${g.host_id}>\n**Sudionika:** ${g.entrants.length}`);
  } else {
    e.setDescription(`Klikni 🎉 da se prijaviš!\n**Završava:** <t:${ts}:R> (<t:${ts}:f>)\n**Organizator:** <@${g.host_id}>\n**Sudionika:** ${g.entrants.length}`);
  }
  return e;
}

function gwRow(g, ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gw:join:${g.id}`).setEmoji('🎉').setLabel(ended ? 'Završeno' : 'Sudjeluj')
      .setStyle(ButtonStyle.Success).setDisabled(ended),
  );
}

async function start(channel, prize, durationMs, winners, hostId) {
  const id = giveaways.create(channel.guild.id, channel.id, prize, winners, hostId, Date.now() + durationMs);
  const g = giveaways.get(id);
  const msg = await channel.send({ embeds: [gwEmbed(g)], components: [gwRow(g)] });
  giveaways.setMessage(id, msg.id);
  return { ...g, message_id: msg.id };
}

function pick(arr, n) {
  const pool = [...arr];
  const out = [];
  while (pool.length && out.length < n) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

async function end(client, id, { reroll = false } = {}) {
  const g = giveaways.get(id);
  if (!g) return null;
  const channel = await client.channels.fetch(g.channel_id).catch(() => null);
  const winners = pick(g.entrants, g.winners);
  giveaways.finish(id, winners);
  const done = { ...g, ended: 1, winner_ids: winners };
  if (!channel) return done;
  const msg = g.message_id ? await channel.messages.fetch(g.message_id).catch(() => null) : null;
  if (msg) await msg.edit({ embeds: [gwEmbed(done, true)], components: [gwRow(done, true)] }).catch(() => {});
  const text = winners.length
    ? `🎉 ${reroll ? 'Novi pobjednik' : 'Čestitamo'} ${winners.map((w) => `<@${w}>`).join(', ')}! Osvojili ste **${g.prize}**!`
    : `Giveaway za **${g.prize}** je završio, ali nema dovoljno sudionika. 😢`;
  await channel.send({ content: text, reply: msg ? { messageReference: msg.id, failIfNotExists: false } : undefined }).catch(() => {});
  return done;
}

async function handleJoin(interaction, id) {
  const g = giveaways.get(Number(id));
  if (!g || g.ended) return interaction.reply({ embeds: [fail('Ovaj giveaway je završen.')], flags: MessageFlags.Ephemeral });
  const uid = interaction.user.id;
  let entrants = g.entrants;
  let msg;
  if (entrants.includes(uid)) {
    entrants = entrants.filter((e) => e !== uid);
    msg = 'Odjavio/la si se iz giveawaya.';
  } else {
    entrants.push(uid);
    msg = 'Prijavljen/a si! Sretno 🍀';
  }
  giveaways.setEntrants(g.id, entrants);
  await interaction.update({ embeds: [gwEmbed({ ...g, entrants })], components: [gwRow(g)] });
  await interaction.followUp({ embeds: [ok(msg)], flags: MessageFlags.Ephemeral });
}

function startTicker(client) {
  setInterval(async () => {
    for (const g of giveaways.due()) {
      await end(client, g.id).catch((e) => console.warn('[giveaway] end error', e.message));
    }
  }, 10_000);
}

module.exports = { start, end, handleJoin, startTicker };
