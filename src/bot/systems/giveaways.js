const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { ok, fail } = require('../utils');

function gwEmbed(g, ended = false) {
  const ts = Math.floor(g.ends_at / 1000);
  const e = new EmbedBuilder()
    .setColor(ended ? 0x2b2d31 : 0xeb459e)
    .setTitle(`🎉 ${g.prize}`)
    .setFooter({ text: `${g.winners} winner(s) • ID ${g.id}` })
    .setTimestamp(g.ends_at);
  if (ended) {
    const w = g.winner_ids.length ? g.winner_ids.map((id) => `<@${id}>`).join(', ') : 'Not enough entrants.';
    e.setDescription(`Ended!
**Winners:** ${w}
**Host:** <@${g.host_id}>
**Entrants:** ${g.entrants.length}`);
  } else {
    e.setDescription(`Click 🎉 to enter!
**Ends:** <t:${ts}:R> (<t:${ts}:f>)
**Host:** <@${g.host_id}>
**Entrants:** ${g.entrants.length}`);
  }
  return e;
}

function gwRow(g, ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gw:join:${g.id}`).setEmoji('🎉').setLabel(ended ? 'Ended' : 'Enter')
      .setStyle(ButtonStyle.Success).setDisabled(ended),
  );
}

async function start(channel, prize, durationMs, winners, hostId) {
  const giveaways = channel.client.db;
  const id = giveaways.giveaways.create(channel.guild.id, channel.id, prize, winners, hostId, Date.now() + durationMs);
  const g = giveaways.giveaways.get(id);
  const msg = await channel.send({ embeds: [gwEmbed(g)], components: [gwRow(g)] });
  giveaways.giveaways.setMessage(id, msg.id);
  return { ...g, message_id: msg.id };
}

function pick(arr, n) {
  const pool = [...arr];
  const out = [];
  while (pool.length && out.length < n) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

async function end(client, id, { reroll = false } = {}) {
  const { giveaways } = client.db;
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
    ? `🎉 ${reroll ? 'New winner' : 'Congratulations'} ${winners.map((w) => `<@${w}>`).join(', ')}! You won **${g.prize}**!`
    : `The giveaway for **${g.prize}** ended, but there weren't enough entrants. 😢`;
  await channel.send({ content: text, reply: msg ? { messageReference: msg.id, failIfNotExists: false } : undefined }).catch(() => {});
  return done;
}

async function handleJoin(interaction, id) {
  const { giveaways } = interaction.client.db;
  const g = giveaways.get(Number(id));
  if (!g || g.ended) return interaction.reply({ embeds: [fail('This giveaway has ended.')], flags: MessageFlags.Ephemeral });
  const uid = interaction.user.id;
  let entrants = g.entrants;
  let msg;
  if (entrants.includes(uid)) {
    entrants = entrants.filter((e) => e !== uid);
    msg = 'You left the giveaway.';
  } else {
    entrants.push(uid);
    msg = 'You\'re in! Good luck 🍀';
  }
  giveaways.setEntrants(g.id, entrants);
  await interaction.update({ embeds: [gwEmbed({ ...g, entrants })], components: [gwRow(g)] });
  await interaction.followUp({ embeds: [ok(msg)], flags: MessageFlags.Ephemeral });
}

function startTicker(client) {
  return setInterval(async () => {
    for (const g of client.db.giveaways.due()) {
      await end(client, g.id).catch((e) => console.warn('[giveaway] end error', e.message));
    }
  }, 10_000);
}

module.exports = { start, end, handleJoin, startTicker };
