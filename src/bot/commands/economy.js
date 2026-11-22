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

const WORK = ['Radio/la si kao programer', 'Dostavljao/la si pizze', 'Prao/la si suđe u restoranu', 'Snimao/la si TikTok', 'Popravljao/la si auto susjedu',
  'Radio/la si na kasi', 'Streamao/la si 6 sati', 'Čuvao/la si psa', 'Prodavao/la si kokice na utakmici', 'Moderirao/la si Discord server'];
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
    data: new SlashCommandBuilder().setName('balance').setDescription('Stanje novca')
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik')),
    async execute(i) {
      const { fmt, acc } = ctx(i);
      const user = i.options.getUser('korisnik') || i.user;
      const a = acc(user.id);
      const e = new EmbedBuilder().setColor(config.color).setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
        .addFields({ name: 'Novčanik', value: fmt(a.wallet), inline: true }, { name: 'Banka', value: fmt(a.bank), inline: true }, { name: 'Ukupno', value: fmt(a.wallet + a.bank), inline: true });
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('daily').setDescription('Dnevna nagrada'),
    async execute(i) {
      const { db, E, fmt, acc } = ctx(i);
      const a = acc(i.user.id);
      const left = a.last_daily + 864e5 - Date.now();
      if (left > 0) return i.reply({ embeds: [fail(`Dnevnu nagradu možeš ponovo uzeti za **${formatDuration(left)}**.`)], flags: MessageFlags.Ephemeral });
      db.economy.add(i.guild.id, i.user.id, E.dailyAmount);
      db.economy.setField(i.guild.id, i.user.id, 'last_daily', Date.now());
      return i.reply({ embeds: [ok(`Uzeo/la si dnevnu nagradu: ${fmt(E.dailyAmount)}`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('work').setDescription('Radi i zaradi novac'),
    async execute(i) {
      const { db, E, fmt, acc } = ctx(i);
      const a = acc(i.user.id);
      const left = a.last_work + E.workCooldown * 1000 - Date.now();
      if (left > 0) return i.reply({ embeds: [fail(`Umoran/na si. Ponovo možeš raditi za **${formatDuration(left)}**.`)], flags: MessageFlags.Ephemeral });
      const pay = Math.floor(Math.random() * (E.workMax - E.workMin + 1)) + E.workMin;
      db.economy.add(i.guild.id, i.user.id, pay);
      db.economy.setField(i.guild.id, i.user.id, 'last_work', Date.now());
      return i.reply({ embeds: [ok(`${WORK[Math.floor(Math.random() * WORK.length)]} i zaradio/la ${fmt(pay)}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('pay').setDescription('Pošalji novac drugom korisniku')
      .addUserOption((o) => o.setName('korisnik').setDescription('Kome').setRequired(true))
      .addStringOption((o) => o.setName('iznos').setDescription('Iznos ili "sve"').setRequired(true)),
    async execute(i) {
      const { db, fmt, acc } = ctx(i);
      const user = i.options.getUser('korisnik');
      if (user.bot || user.id === i.user.id) return i.reply({ embeds: [fail('Ne možeš poslati novac tom korisniku.')], flags: MessageFlags.Ephemeral });
      const a = acc(i.user.id);
      const amount = parseAmount(i.options.getString('iznos'), a.wallet);
      if (!amount || amount > a.wallet) return i.reply({ embeds: [fail(`Nemaš toliko u novčaniku (${fmt(a.wallet)}).`)], flags: MessageFlags.Ephemeral });
      acc(user.id);
      db.economy.add(i.guild.id, i.user.id, -amount);
      db.economy.add(i.guild.id, user.id, amount);
      return i.reply({ embeds: [ok(`Poslao/la si ${fmt(amount)} korisniku ${user}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('deposit').setDescription('Spremi novac u banku')
      .addStringOption((o) => o.setName('iznos').setDescription('Iznos ili "sve"').setRequired(true)),
    async execute(i) {
      const { db, fmt, acc } = ctx(i);
      const a = acc(i.user.id);
      const amount = parseAmount(i.options.getString('iznos'), a.wallet);
      if (!amount || amount > a.wallet) return i.reply({ embeds: [fail('Nemaš toliko u novčaniku.')], flags: MessageFlags.Ephemeral });
      db.economy.add(i.guild.id, i.user.id, -amount, amount);
      return i.reply({ embeds: [ok(`Spremio/la si ${fmt(amount)} u banku.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('withdraw').setDescription('Podigni novac iz banke')
      .addStringOption((o) => o.setName('iznos').setDescription('Iznos ili "sve"').setRequired(true)),
    async execute(i) {
      const { db, fmt, acc } = ctx(i);
      const a = acc(i.user.id);
      const amount = parseAmount(i.options.getString('iznos'), a.bank);
      if (!amount || amount > a.bank) return i.reply({ embeds: [fail('Nemaš toliko u banci.')], flags: MessageFlags.Ephemeral });
      db.economy.add(i.guild.id, i.user.id, amount, -amount);
      return i.reply({ embeds: [ok(`Podigao/la si ${fmt(amount)} iz banke.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('gamble').setDescription('Okreni novčić za novac (50/50)')
      .addStringOption((o) => o.setName('ulog').setDescription('Iznos ili "sve"').setRequired(true)),
    async execute(i) {
      const { db, fmt, acc } = ctx(i);
      const a = acc(i.user.id);
      const bet = parseAmount(i.options.getString('ulog'), a.wallet);
      if (!bet || bet > a.wallet) return i.reply({ embeds: [fail('Nemaš toliko u novčaniku.')], flags: MessageFlags.Ephemeral });
      const win = Math.random() < 0.48;
      db.economy.add(i.guild.id, i.user.id, win ? bet : -bet);
      return i.reply({ embeds: [win ? ok(`🪙 Pobijedio/la si! +${fmt(bet)}`) : fail(`🪙 Izgubio/la si ${fmt(bet)}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('slots').setDescription('Slot mašina')
      .addStringOption((o) => o.setName('ulog').setDescription('Iznos').setRequired(true)),
    async execute(i) {
      const { db, fmt, acc } = ctx(i);
      const a = acc(i.user.id);
      const bet = parseAmount(i.options.getString('ulog'), a.wallet);
      if (!bet || bet > a.wallet) return i.reply({ embeds: [fail('Nemaš toliko u novčaniku.')], flags: MessageFlags.Ephemeral });
      const r = [0, 0, 0].map(() => SLOTS[Math.floor(Math.random() * SLOTS.length)]);
      let mult = 0;
      if (r[0] === r[1] && r[1] === r[2]) mult = r[0] === '7️⃣' ? 10 : r[0] === '💎' ? 7 : 4;
      else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) mult = 1.5;
      const net = Math.floor(bet * mult) - bet;
      db.economy.add(i.guild.id, i.user.id, net);
      const line = `**[ ${r.join(' | ')} ]**`;
      return i.reply({ embeds: [net > 0 ? ok(`${line}\nDobitak ${fmt(net)}! (x${mult})`) : fail(`${line}\nIzgubio/la si ${fmt(bet)}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('rob').setDescription('Pokušaj opljačkati nekoga')
      .addUserOption((o) => o.setName('korisnik').setDescription('Žrtva').setRequired(true)),
    async execute(i) {
      const { db, E, fmt, acc } = ctx(i);
      if (!E.robEnabled) return i.reply({ embeds: [fail('Pljačka je isključena na ovom serveru.')], flags: MessageFlags.Ephemeral });
      const user = i.options.getUser('korisnik');
      if (user.bot || user.id === i.user.id) return i.reply({ embeds: [fail('Ne možeš opljačkati tog korisnika.')], flags: MessageFlags.Ephemeral });
      const me = acc(i.user.id);
      const left = me.last_rob + 2 * 36e5 - Date.now();
      if (left > 0) return i.reply({ embeds: [fail(`Policija te još traži. Pokušaj za **${formatDuration(left)}**.`)], flags: MessageFlags.Ephemeral });
      const victim = acc(user.id);
      if (victim.wallet < 50) return i.reply({ embeds: [fail(`${user} nema dovoljno u novčaniku. Siromah.`)], flags: MessageFlags.Ephemeral });
      db.economy.setField(i.guild.id, i.user.id, 'last_rob', Date.now());
      if (Math.random() * 100 < E.robChance) {
        const stolen = Math.floor(victim.wallet * (0.1 + Math.random() * 0.3));
        db.economy.add(i.guild.id, user.id, -stolen);
        db.economy.add(i.guild.id, i.user.id, stolen);
        return i.reply({ embeds: [ok(`🦹 Ukrao/la si ${fmt(stolen)} od ${user}!`)] });
      }
      const fine = Math.min(me.wallet, Math.floor(100 + Math.random() * 200));
      db.economy.add(i.guild.id, i.user.id, -fine);
      return i.reply({ embeds: [fail(`🚓 Uhvaćen/a si! Platio/la si kaznu od ${fmt(fine)}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('shop').setDescription('Trgovina servera'),
    async execute(i) {
      const { E, fmt } = ctx(i);
      if (!E.shop.length) return i.reply({ embeds: [fail('Trgovina je prazna. Admin može dodati artikle na dashboardu.')], flags: MessageFlags.Ephemeral });
      const e = new EmbedBuilder().setColor(config.color).setTitle(`🛒 Trgovina • ${i.guild.name}`)
        .setDescription(E.shop.map((it) => `**${it.name}** — ${fmt(it.price)}${it.role ? ` • daje <@&${it.role}>` : ''}\n${it.description || ''}\nID: \`${it.id}\``).join('\n\n'))
        .setFooter({ text: 'Kupi s /buy <id>' });
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('buy').setDescription('Kupi artikl iz trgovine')
      .addStringOption((o) => o.setName('id').setDescription('ID artikla (iz /shop)').setRequired(true)),
    async execute(i) {
      const { db, E, fmt, acc } = ctx(i);
      const id = i.options.getString('id').toLowerCase().trim();
      const item = E.shop.find((it) => it.id === id || it.name.toLowerCase() === id);
      if (!item) return i.reply({ embeds: [fail('Taj artikl ne postoji. Pogledaj /shop.')], flags: MessageFlags.Ephemeral });
      const a = acc(i.user.id);
      if (a.wallet < item.price) return i.reply({ embeds: [fail(`Treba ti ${fmt(item.price)}, a imaš ${fmt(a.wallet)}.`)], flags: MessageFlags.Ephemeral });
      if (item.role) {
        if (i.member.roles.cache.has(item.role)) return i.reply({ embeds: [fail('Već imaš tu ulogu.')], flags: MessageFlags.Ephemeral });
        const ok2 = await i.member.roles.add(item.role, 'Kupnja u shopu').then(() => true).catch(() => false);
        if (!ok2) return i.reply({ embeds: [fail('Ne mogu ti dati tu ulogu (provjeri poziciju uloge bota).')], flags: MessageFlags.Ephemeral });
      }
      db.economy.add(i.guild.id, i.user.id, -item.price);
      db.economy.giveItem(i.guild.id, i.user.id, item.id);
      return i.reply({ embeds: [ok(`Kupio/la si **${item.name}** za ${fmt(item.price)}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('inventory').setDescription('Tvoji kupljeni artikli')
      .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik')),
    async execute(i) {
      const { db, E } = ctx(i);
      const user = i.options.getUser('korisnik') || i.user;
      const inv = db.economy.inventory(i.guild.id, user.id);
      const names = inv.map((x) => `• **${E.shop.find((s) => s.id === x.item_id)?.name || x.item_id}** ×${x.qty}`);
      return i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setTitle(`🎒 ${user.username}`).setDescription(names.join('\n') || 'Prazno.')] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('richest').setDescription('Najbogatiji članovi'),
    async execute(i) {
      const { db, fmt } = ctx(i);
      const rows = db.economy.top(i.guild.id, 10);
      const medals = ['🥇', '🥈', '🥉'];
      const e = new EmbedBuilder().setColor(config.color).setTitle(`💰 Najbogatiji • ${i.guild.name}`)
        .setDescription(rows.map((r, k) => `${medals[k] || `**${k + 1}.**`} <@${r.user_id}> — ${fmt(r.total)}`).join('\n') || 'Nema podataka.');
      return i.reply({ embeds: [e], allowedMentions: { parse: [] } });
    },
  },
  {
    data: new SlashCommandBuilder().setName('eco').setDescription('Admin: upravljanje novcem')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('give').setDescription('Daj novac')
        .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))
        .addIntegerOption((o) => o.setName('iznos').setDescription('Iznos').setRequired(true).setMinValue(1)))
      .addSubcommand((s) => s.setName('take').setDescription('Oduzmi novac')
        .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))
        .addIntegerOption((o) => o.setName('iznos').setDescription('Iznos').setRequired(true).setMinValue(1)))
      .addSubcommand((s) => s.setName('reset').setDescription('Resetiraj korisnika')
        .addUserOption((o) => o.setName('korisnik').setDescription('Korisnik').setRequired(true))),
    async execute(i) {
      const { db, fmt, acc } = ctx(i);
      const sub = i.options.getSubcommand();
      const user = i.options.getUser('korisnik');
      acc(user.id);
      if (sub === 'reset') { db.economy.reset(i.guild.id, user.id); return i.reply({ embeds: [ok(`Resetiran račun za ${user}.`)] }); }
      const n = i.options.getInteger('iznos');
      db.economy.add(i.guild.id, user.id, sub === 'give' ? n : -n);
      return i.reply({ embeds: [ok(`${sub === 'give' ? 'Dodano' : 'Oduzeto'} ${fmt(n)} — ${user}.`)] });
    },
  },
];
cmds.forEach((c) => { c.module = 'economy'; });
module.exports = cmds;
