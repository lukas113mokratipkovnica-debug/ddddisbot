const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { ok, fail, formatDuration } = require('../utils');
const config = require('../../config');

const ctx = (i) => {
  const db = i.client.db;
  const E = db.getSettings(i.guild.id).economy;
  const fmt = (n) => `${E.emoji} **${Number(n).toLocaleString('hr-HR')}** ${E.currency}`;
  const acc = (uid) => db.economy.get(i.guild.id, uid, E.startBalance);
  return { db, E, fmt, acc };
};

const WORK = ['You worked as a programmer', 'You delivered pizzas', 'You washed dishes in a restaurant', 'You filmed a TikTok', 'You fixed your neighbour\'s car',
  'You worked as a cashier', 'You streamed for 6 hours', 'You walked a dog', 'You sold popcorn at a match', 'You moderated a Discord server'];
const SLOTS = ['🍒', '🍋', '🍇', '🔔', '💎', '7️⃣'];

function parseAmount(input, max) {
  if (!input) return null;
  const s = String(input).toLowerCase().trim();
  if (['all', 'sve', 'max'].includes(s)) return max;
  if (s === 'pola' || s === 'half') return Math.floor(max / 2);
  const n = Math.floor(Number(s.replace(/[.,\s]/g, '')));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const cmds = [
  {
    data: new SlashCommandBuilder().setName('balance').setDescription('Balance')
      .addUserOption((o) => o.setName('user').setDescription('Member')),
    async execute(i) {
      const { fmt, acc } = ctx(i);
      const user = i.options.getUser('user') || i.user;
      const a = acc(user.id);
      const e = new EmbedBuilder().setColor(config.color).setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .addFields({ name: 'Wallet', value: fmt(a.wallet), inline: true }, { name: 'Bank', value: fmt(a.bank), inline: true }, { name: 'Total', value: fmt(a.wallet + a.bank), inline: true });
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('daily').setDescription('Daily reward'),
    async execute(i) {
      const { db, E, fmt, acc } = ctx(i);
      const a = acc(i.user.id);
      const left = a.last_daily + 864e5 - Date.now();
      if (left > 0) return i.reply({ embeds: [fail(`You can claim your daily reward again in **${formatDuration(left)}**.`)], flags: MessageFlags.Ephemeral });
      db.economy.add(i.guild.id, i.user.id, E.dailyAmount);
      db.economy.setField(i.guild.id, i.user.id, 'last_daily', Date.now());
      return i.reply({ embeds: [ok(`You claimed your daily reward: ${fmt(E.dailyAmount)}`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('work').setDescription('Work and earn money'),
    async execute(i) {
      const { db, E, fmt, acc } = ctx(i);
      const a = acc(i.user.id);
      const left = a.last_work + E.workCooldown * 1000 - Date.now();
      if (left > 0) return i.reply({ embeds: [fail(`You're tired. You can work again in **${formatDuration(left)}**.`)], flags: MessageFlags.Ephemeral });
      const pay = Math.floor(Math.random() * (E.workMax - E.workMin + 1)) + E.workMin;
      db.economy.add(i.guild.id, i.user.id, pay);
      db.economy.setField(i.guild.id, i.user.id, 'last_work', Date.now());
      return i.reply({ embeds: [ok(`${WORK[Math.floor(Math.random() * WORK.length)]} and earned ${fmt(pay)}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('pay').setDescription('Send money to another member')
      .addUserOption((o) => o.setName('user').setDescription('To whom').setRequired(true))
      .addStringOption((o) => o.setName('amount').setDescription('Amount or "all"').setRequired(true)),
    async execute(i) {
      const { db, fmt, acc } = ctx(i);
      const user = i.options.getUser('user');
      if (user.bot || user.id === i.user.id) return i.reply({ embeds: [fail('You can\'t send money to that member.')], flags: MessageFlags.Ephemeral });
      const a = acc(i.user.id);
      const amount = parseAmount(i.options.getString('amount'), a.wallet);
      if (!amount || amount > a.wallet) return i.reply({ embeds: [fail(`You don't have that much in your wallet (${fmt(a.wallet)}).`)], flags: MessageFlags.Ephemeral });
      acc(user.id);
      db.economy.add(i.guild.id, i.user.id, -amount);
      db.economy.add(i.guild.id, user.id, amount);
      return i.reply({ embeds: [ok(`You sent ${fmt(amount)} to ${user}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('deposit').setDescription('Deposit money in the bank')
      .addStringOption((o) => o.setName('amount').setDescription('Amount or "all"').setRequired(true)),
    async execute(i) {
      const { db, fmt, acc } = ctx(i);
      const a = acc(i.user.id);
      const amount = parseAmount(i.options.getString('amount'), a.wallet);
      if (!amount || amount > a.wallet) return i.reply({ embeds: [fail('You don\'t have that much in your wallet.')], flags: MessageFlags.Ephemeral });
      db.economy.add(i.guild.id, i.user.id, -amount, amount);
      return i.reply({ embeds: [ok(`You deposited ${fmt(amount)} in the bank.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('withdraw').setDescription('Withdraw money from the bank')
      .addStringOption((o) => o.setName('amount').setDescription('Amount or "all"').setRequired(true)),
    async execute(i) {
      const { db, fmt, acc } = ctx(i);
      const a = acc(i.user.id);
      const amount = parseAmount(i.options.getString('amount'), a.bank);
      if (!amount || amount > a.bank) return i.reply({ embeds: [fail('You don\'t have that much in the bank.')], flags: MessageFlags.Ephemeral });
      db.economy.add(i.guild.id, i.user.id, amount, -amount);
      return i.reply({ embeds: [ok(`You withdrew ${fmt(amount)} from the bank.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('gamble').setDescription('Flip a coin for money (50/50)')
      .addStringOption((o) => o.setName('bet').setDescription('Amount or "all"').setRequired(true)),
    async execute(i) {
      const { db, fmt, acc } = ctx(i);
      const a = acc(i.user.id);
      const bet = parseAmount(i.options.getString('bet'), a.wallet);
      if (!bet || bet > a.wallet) return i.reply({ embeds: [fail('You don\'t have that much in your wallet.')], flags: MessageFlags.Ephemeral });
      const win = Math.random() < 0.48;
      db.economy.add(i.guild.id, i.user.id, win ? bet : -bet);
      return i.reply({ embeds: [win ? ok(`🪙 You won! +${fmt(bet)}`) : fail(`🪙 You lost ${fmt(bet)}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('slots').setDescription('Slot machine')
      .addStringOption((o) => o.setName('bet').setDescription('Amount').setRequired(true)),
    async execute(i) {
      const { db, fmt, acc } = ctx(i);
      const a = acc(i.user.id);
      const bet = parseAmount(i.options.getString('bet'), a.wallet);
      if (!bet || bet > a.wallet) return i.reply({ embeds: [fail('You don\'t have that much in your wallet.')], flags: MessageFlags.Ephemeral });
      const r = [0, 0, 0].map(() => SLOTS[Math.floor(Math.random() * SLOTS.length)]);
      let mult = 0;
      if (r[0] === r[1] && r[1] === r[2]) mult = r[0] === '7️⃣' ? 10 : r[0] === '💎' ? 7 : 4;
      else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) mult = 1.5;
      const net = Math.floor(bet * mult) - bet;
      db.economy.add(i.guild.id, i.user.id, net);
      const line = `**[ ${r.join(' | ')} ]**`;
      return i.reply({ embeds: [net > 0 ? ok(`${line}
You won ${fmt(net)}! (x${mult})`) : fail(`${line}
You lost ${fmt(bet)}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('rob').setDescription('Try to rob someone')
      .addUserOption((o) => o.setName('user').setDescription('Victim').setRequired(true)),
    async execute(i) {
      const { db, E, fmt, acc } = ctx(i);
      if (!E.robEnabled) return i.reply({ embeds: [fail('Robbing is disabled on this server.')], flags: MessageFlags.Ephemeral });
      const user = i.options.getUser('user');
      if (user.bot || user.id === i.user.id) return i.reply({ embeds: [fail('You can\'t rob that member.')], flags: MessageFlags.Ephemeral });
      const me = acc(i.user.id);
      const left = me.last_rob + 2 * 36e5 - Date.now();
      if (left > 0) return i.reply({ embeds: [fail(`The police are still looking for you. Try again in **${formatDuration(left)}**.`)], flags: MessageFlags.Ephemeral });
      const victim = acc(user.id);
      if (victim.wallet < 50) return i.reply({ embeds: [fail(`${user} doesn't have enough in their wallet. Broke.`)], flags: MessageFlags.Ephemeral });
      db.economy.setField(i.guild.id, i.user.id, 'last_rob', Date.now());
      if (Math.random() * 100 < E.robChance) {
        const stolen = Math.floor(victim.wallet * (0.1 + Math.random() * 0.3));
        db.economy.add(i.guild.id, user.id, -stolen);
        db.economy.add(i.guild.id, i.user.id, stolen);
        return i.reply({ embeds: [ok(`🦹 You stole ${fmt(stolen)} from ${user}!`)] });
      }
      const fine = Math.min(me.wallet, Math.floor(100 + Math.random() * 200));
      db.economy.add(i.guild.id, i.user.id, -fine);
      return i.reply({ embeds: [fail(`🚓 You got caught! You paid a fine of ${fmt(fine)}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('shop').setDescription('Server shop'),
    async execute(i) {
      const { E, fmt } = ctx(i);
      if (!E.shop.length) return i.reply({ embeds: [fail('The shop is empty. An admin can add items in the dashboard.')], flags: MessageFlags.Ephemeral });
      const e = new EmbedBuilder().setColor(config.color).setTitle(`🛒 Shop • ${i.guild.name}`)
        .setDescription(E.shop.map((it) => `**${it.name}** — ${fmt(it.price)}${it.role ? ` • daje <@&${it.role}>` : ''}\n${it.description || ''}\nID: \`${it.id}\``).join('\n\n'))
        .setFooter({ text: 'Buy with /buy <id>' });
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('buy').setDescription('Buy an item from the shop')
      .addStringOption((o) => o.setName('id').setDescription('Item ID (from /shop)').setRequired(true)),
    async execute(i) {
      const { db, E, fmt, acc } = ctx(i);
      const id = i.options.getString('id').toLowerCase().trim();
      const item = E.shop.find((it) => it.id === id || it.name.toLowerCase() === id);
      if (!item) return i.reply({ embeds: [fail('That item doesn\'t exist. Check /shop.')], flags: MessageFlags.Ephemeral });
      const a = acc(i.user.id);
      if (a.wallet < item.price) return i.reply({ embeds: [fail(`You need ${fmt(item.price)}, but you have ${fmt(a.wallet)}.`)], flags: MessageFlags.Ephemeral });
      if (item.role) {
        if (i.member.roles.cache.has(item.role)) return i.reply({ embeds: [fail('You already have that role.')], flags: MessageFlags.Ephemeral });
        const ok2 = await i.member.roles.add(item.role, 'Shop purchase').then(() => true).catch(() => false);
        if (!ok2) return i.reply({ embeds: [fail('I can\'t give you that role (check the bot\'s role position).')], flags: MessageFlags.Ephemeral });
      }
      db.economy.add(i.guild.id, i.user.id, -item.price);
      db.economy.giveItem(i.guild.id, i.user.id, item.id);
      return i.reply({ embeds: [ok(`You bought **${item.name}** for ${fmt(item.price)}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('inventory').setDescription('Your purchased items')
      .addUserOption((o) => o.setName('user').setDescription('Member')),
    async execute(i) {
      const { db, E } = ctx(i);
      const user = i.options.getUser('user') || i.user;
      const inv = db.economy.inventory(i.guild.id, user.id);
      const names = inv.map((x) => `• **${E.shop.find((s) => s.id === x.item_id)?.name || x.item_id}** ×${x.qty}`);
      return i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setTitle(`🎒 ${user.username}`).setDescription(names.join('\n') || 'Empty.')] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('richest').setDescription('Richest members'),
    async execute(i) {
      const { db, fmt } = ctx(i);
      const rows = db.economy.top(i.guild.id, 10);
      const medals = ['🥇', '🥈', '🥉'];
      const e = new EmbedBuilder().setColor(config.color).setTitle(`💰 Richest • ${i.guild.name}`)
        .setDescription(rows.map((r, k) => `${medals[k] || `**${k + 1}.**`} <@${r.user_id}> — ${fmt(r.total)}`).join('\n') || 'No data.');
      return i.reply({ embeds: [e], allowedMentions: { parse: [] } });
    },
  },
  {
    data: new SlashCommandBuilder().setName('eco').setDescription('Admin: manage money')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('give').setDescription('Give money')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
        .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
      .addSubcommand((s) => s.setName('take').setDescription('Take money')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
        .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
      .addSubcommand((s) => s.setName('reset').setDescription('Reset a member')
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))),
    async execute(i) {
      const { db, fmt, acc } = ctx(i);
      const sub = i.options.getSubcommand();
      const user = i.options.getUser('user');
      acc(user.id);
      if (sub === 'reset') { db.economy.reset(i.guild.id, user.id); return i.reply({ embeds: [ok(`Account reset for ${user}.`)] }); }
      const n = i.options.getInteger('amount');
      db.economy.add(i.guild.id, user.id, sub === 'give' ? n : -n);
      return i.reply({ embeds: [ok(`${sub === 'give' ? 'Dodano' : 'Oduzeto'} ${fmt(n)} — ${user}.`)] });
    },
  },
];
cmds.forEach((c) => { c.module = 'economy'; });
module.exports = cmds;
