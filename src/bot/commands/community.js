const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { ok, fail } = require('../utils');
const config = require('../../config');

const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

const cmds = [
  {
    data: new SlashCommandBuilder().setName('poll').setDescription('Napravi anketu')
      .addStringOption((o) => o.setName('pitanje').setDescription('Pitanje').setRequired(true).setMaxLength(256))
      .addStringOption((o) => o.setName('opcije').setDescription('Opcije odvojene sa | (prazno = da/ne)')),
    async execute(i) {
      const q = i.options.getString('pitanje');
      const opts = (i.options.getString('opcije') || '').split('|').map((s) => s.trim()).filter(Boolean).slice(0, 10);
      const e = new EmbedBuilder().setColor(config.color).setTitle(`📊 ${q}`)
        .setFooter({ text: `Anketa od ${i.user.tag}`, iconURL: i.user.displayAvatarURL() });
      if (opts.length >= 2) e.setDescription(opts.map((o, idx) => `${NUM[idx]} ${o}`).join('\n'));
      const msg = await i.reply({ embeds: [e], withResponse: true }).then((r) => r.resource.message);
      if (opts.length >= 2) for (let k = 0; k < opts.length; k++) await msg.react(NUM[k]);
      else { await msg.react('👍'); await msg.react('👎'); }
    },
  },
  {
    data: new SlashCommandBuilder().setName('suggest').setDescription('Pošalji prijedlog')
      .addStringOption((o) => o.setName('prijedlog').setDescription('Tvoj prijedlog').setRequired(true).setMaxLength(2000)),
    async execute(i) {
      const s = i.client.db.getSettings(i.guild.id).suggestions;
      const ch = s.enabled && s.channel && i.guild.channels.cache.get(s.channel);
      if (!ch?.isTextBased()) return i.reply({ embeds: [fail('Prijedlozi nisu postavljeni na ovom serveru.')], flags: MessageFlags.Ephemeral });
      const e = new EmbedBuilder().setColor(0xfee75c).setAuthor({ name: i.user.tag, iconURL: i.user.displayAvatarURL() })
        .setTitle('💡 Novi prijedlog').setDescription(i.options.getString('prijedlog')).setTimestamp();
      const msg = await ch.send({ embeds: [e] });
      await msg.react('✅'); await msg.react('❌');
      await msg.startThread({ name: `Rasprava: ${i.user.username}`.slice(0, 100) }).catch(() => {});
      return i.reply({ embeds: [ok(`Prijedlog poslan u ${ch}!`)], flags: MessageFlags.Ephemeral });
    },
  },
];
cmds[0].module = 'utility';
cmds[1].module = 'suggestions';
module.exports = cmds;
