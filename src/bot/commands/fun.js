const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hash = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const cmds = [
  {
    data: new SlashCommandBuilder().setName('rps').setDescription('Kamen, škare, papir')
      .addStringOption((o) => o.setName('izbor').setDescription('Tvoj izbor').setRequired(true)
        .addChoices({ name: '🪨 Kamen', value: 'kamen' }, { name: '✂️ Škare', value: 'škare' }, { name: '📄 Papir', value: 'papir' })),
    async execute(i) {
      const me = i.options.getString('izbor');
      const bot = pick(['kamen', 'škare', 'papir']);
      const beats = { kamen: 'škare', škare: 'papir', papir: 'kamen' };
      const res = me === bot ? 'Neriješeno! 🤝' : beats[me] === bot ? 'Pobijedio/la si! 🎉' : 'Izgubio/la si! 😈';
      return i.reply(`Ti: **${me}** • Ja: **${bot}**\n${res}`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('choose').setDescription('Bot bira umjesto tebe')
      .addStringOption((o) => o.setName('opcije').setDescription('Opcije odvojene sa |').setRequired(true)),
    async execute(i) {
      const opts = i.options.getString('opcije').split('|').map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) return i.reply('Daj mi barem dvije opcije odvojene sa `|`.');
      return i.reply(`🤔 Biram: **${pick(opts)}**`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('rate').setDescription('Ocijeni bilo što od 0 do 10')
      .addStringOption((o) => o.setName('stvar').setDescription('Što ocijeniti').setRequired(true)),
    async execute(i) {
      const t = i.options.getString('stvar');
      return i.reply(`Ocjena za **${t}**: **${hash(t.toLowerCase()) % 11}/10**`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('ship').setDescription('Koliko se dvoje slaže?')
      .addUserOption((o) => o.setName('prvi').setDescription('Prva osoba').setRequired(true))
      .addUserOption((o) => o.setName('drugi').setDescription('Druga osoba')),
    async execute(i) {
      const a = i.options.getUser('prvi');
      const b = i.options.getUser('drugi') || i.user;
      const pct = hash([a.id, b.id].sort().join('')) % 101;
      const bar = '❤️'.repeat(Math.round(pct / 10)) + '🖤'.repeat(10 - Math.round(pct / 10));
      const name = a.username.slice(0, Math.ceil(a.username.length / 2)) + b.username.slice(Math.floor(b.username.length / 2));
      return i.reply({ embeds: [new EmbedBuilder().setColor(0xec4899).setTitle(`💘 ${name}`).setDescription(`${a} + ${b}\n${bar}\n**${pct}%** ${pct > 80 ? 'Savršen par!' : pct > 50 ? 'Ima potencijala 👀' : pct > 25 ? 'Hmm… možda kao prijatelji.' : 'Bježi. 🏃'}`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('8ball').setDescription('Pitaj magičnu kuglu')
      .addStringOption((o) => o.setName('pitanje').setDescription('Pitanje').setRequired(true)),
    async execute(i) {
      const a = ['Da.', 'Ne.', 'Definitivno.', 'Nema šanse.', 'Možda.', 'Pitaj kasnije.', 'Sigurno!', 'Sumnjam.', 'Bez sumnje.', 'Ne računaj na to.'];
      return i.reply(`🎱 **${i.options.getString('pitanje')}**\n${pick(a)}`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('coinflip').setDescription('Baci novčić'),
    async execute(i) { return i.reply(`🪙 ${Math.random() < 0.5 ? '**Pismo**' : '**Glava**'}`); },
  },
  {
    data: new SlashCommandBuilder().setName('roll').setDescription('Baci kockicu')
      .addIntegerOption((o) => o.setName('strane').setDescription('Broj strana (default 6)').setMinValue(2).setMaxValue(1000)),
    async execute(i) {
      const n = i.options.getInteger('strane') || 6;
      return i.reply(`🎲 Dobio/la si **${Math.floor(Math.random() * n) + 1}** (1-${n})`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('trivia').setDescription('Kviz pitanje'),
    async execute(i) {
      const Q = [
        ['Koji je glavni grad Australije?', 'Canberra', ['Sydney', 'Melbourne', 'Perth']],
        ['Koliko planeta ima Sunčev sustav?', '8', ['9', '7', '10']],
        ['Tko je naslikao Mona Lisu?', 'Leonardo da Vinci', ['Michelangelo', 'Rafael', 'Van Gogh']],
        ['Koji element ima simbol O?', 'Kisik', ['Zlato', 'Osmij', 'Olovo']],
        ['Najduža rijeka na svijetu?', 'Nil', ['Amazona', 'Dunav', 'Jangce']],
        ['Koliko kostiju ima odrasli čovjek?', '206', ['186', '216', '300']],
        ['Koje godine je pao Berlinski zid?', '1989', ['1991', '1985', '1979']],
        ['Najveći ocean?', 'Tihi', ['Atlantski', 'Indijski', 'Arktički']],
        ['Koji jezik ima najviše izvornih govornika?', 'Mandarinski', ['Engleski', 'Španjolski', 'Hindi']],
        ['Brzina svjetlosti je otprilike?', '300 000 km/s', ['150 000 km/s', '30 000 km/s', '1 000 000 km/s']],
      ];
      const [q, correct, wrong] = pick(Q);
      const answers = [correct, ...wrong].sort(() => Math.random() - 0.5);
      const letters = ['🇦', '🇧', '🇨', '🇩'];
      return i.reply({ embeds: [new EmbedBuilder().setColor(config.color).setTitle(`❓ ${q}`)
        .setDescription(`${answers.map((a, k) => `${letters[k]} ${a}`).join('\n')}\n\nOdgovor: ||${letters[answers.indexOf(correct)]} ${correct}||`)] });
    },
  },
];
cmds.forEach((c) => { c.module = 'fun'; });
module.exports = cmds;
