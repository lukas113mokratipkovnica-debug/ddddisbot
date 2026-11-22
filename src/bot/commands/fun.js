const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hash = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const cmds = [
  {
    data: new SlashCommandBuilder().setName('rps').setDescription('Rock, paper, scissors')
      .addStringOption((o) => o.setName('choice').setDescription('Your choice').setRequired(true)
        .addChoices({ name: '🪨 Rock', value: 'rock' }, { name: '✂️ Scissors', value: 'scissors' }, { name: '📄 Paper', value: 'paper' })),
    async execute(i) {
      const me = i.options.getString('choice');
      const bot = pick(['rock', 'scissors', 'paper']);
      const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
      const res = me === bot ? 'It\'s a draw! 🤝' : beats[me] === bot ? 'You won! 🎉' : 'You lost! 😈';
      return i.reply(`You: **${me}** • Me: **${bot}**
${res}`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('choose').setDescription('Let the bot choose for you')
      .addStringOption((o) => o.setName('options').setDescription('Options separated by |').setRequired(true)),
    async execute(i) {
      const opts = i.options.getString('options').split('|').map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) return i.reply('Give me at least two options separated by `|`.');
      return i.reply(`🤔 Biram: **${pick(opts)}**`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('rate').setDescription('Rate anything from 0 to 10')
      .addStringOption((o) => o.setName('thing').setDescription('What to rate').setRequired(true)),
    async execute(i) {
      const t = i.options.getString('thing');
      return i.reply(`Rating for **${t}**: **${hash(t.toLowerCase()) % 11}/10**`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('ship').setDescription('How compatible are two people?')
      .addUserOption((o) => o.setName('first').setDescription('First person').setRequired(true))
      .addUserOption((o) => o.setName('second').setDescription('Second person')),
    async execute(i) {
      const a = i.options.getUser('first');
      const b = i.options.getUser('second') || i.user;
      const pct = hash([a.id, b.id].sort().join('')) % 101;
      const bar = '❤️'.repeat(Math.round(pct / 10)) + '🖤'.repeat(10 - Math.round(pct / 10));
      const name = a.username.slice(0, Math.ceil(a.username.length / 2)) + b.username.slice(Math.floor(b.username.length / 2));
      return i.reply({ embeds: [new EmbedBuilder().setColor(0xec4899).setTitle(`💘 ${name}`).setDescription(`${a} + ${b}\n${bar}\n**${pct}%** ${pct > 80 ? 'A perfect match!' : pct > 50 ? "There's potential 👀" : pct > 25 ? 'Hmm… maybe as friends.' : 'Run away. 🏃'}`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('8ball').setDescription('Ask the magic 8-ball')
      .addStringOption((o) => o.setName('question').setDescription('Question').setRequired(true)),
    async execute(i) {
      const a = ['Yes.', 'No.', 'Definitely.', 'No way.', 'Maybe.', 'Ask again later.', 'Certainly!', 'I doubt it.', 'Without a doubt.', 'Don\'t count on it.'];
      return i.reply(`🎱 **${i.options.getString('question')}**\n${pick(a)}`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin'),
    async execute(i) { return i.reply(`🪙 ${Math.random() < 0.5 ? '**Pismo**' : '**Glava**'}`); },
  },
  {
    data: new SlashCommandBuilder().setName('roll').setDescription('Roll a die')
      .addIntegerOption((o) => o.setName('sides').setDescription('Number of sides (default 6)').setMinValue(2).setMaxValue(1000)),
    async execute(i) {
      const n = i.options.getInteger('sides') || 6;
      return i.reply(`🎲 Dobio/la si **${Math.floor(Math.random() * n) + 1}** (1-${n})`);
    },
  },
  {
    data: new SlashCommandBuilder().setName('trivia').setDescription('Trivia question'),
    async execute(i) {
      const Q = [
        ['What is the capital of Australia?', 'Canberra', ['Sydney', 'Melbourne', 'Perth']],
        ['How many planets are in the Solar System?', '8', ['9', '7', '10']],
        ['Who painted the Mona Lisa?', 'Leonardo da Vinci', ['Michelangelo', 'Rafael', 'Van Gogh']],
        ['Which element has the symbol O?', 'Oxygen', ['Gold', 'Osmium', 'Lead']],
        ['The longest river in the world?', 'Nil', ['Amazon', 'Dunav', 'Jangce']],
        ['How many bones does an adult human have?', '206', ['186', '216', '300']],
        ['In which year did the Berlin Wall fall?', '1989', ['1991', '1985', '1979']],
        ['The largest ocean?', 'Pacific', ['Atlantic', 'Indian', 'Arctic']],
        ['Which language has the most native speakers?', 'Mandarin', ['English', 'Spanish', 'Hindi']],
        ['The speed of light is roughly?', '300 000 km/s', ['150 000 km/s', '30 000 km/s', '1 000 000 km/s']],
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
