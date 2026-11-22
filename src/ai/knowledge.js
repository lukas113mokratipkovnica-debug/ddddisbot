// Knowledge base for the AI support agent, generated from the live catalog so it never drifts.
const { MODULES, TEMPLATES } = require('../modules');
const plans = require('../plans');
const config = require('../config');

const FAQ = [
  ['How to create a bot', 'In the dashboard open "New bot". In the Discord Developer Portal create an application, in the Bot tab enable "Server Members Intent" and "Message Content Intent", click Reset Token and copy the token. Paste the token, pick a template and the bot is online right away. Then add it to your server with the "Add to server" button.'],
  ['Bot is offline or won\'t start', 'Most common reason: the two intents are not enabled in the Developer Portal (Bot tab) — "Server Members Intent" and "Message Content Intent". Second reason: the token was reset; then enter a new token in Bot settings. The bot console shows the exact error.'],
  ['Bot is paused', 'A bot is paused when the subscription is not active (e.g. after a refund, chargeback or expiry). Bots over the free plan limit are stopped. As soon as you renew the subscription, paused bots return and start again automatically.'],
  ['How many bots can I have', `Free plan: ${plans.free.maxBots} bot. Pro: ${plans.pro.maxBots} bots. Business: ${plans.business.maxBots} bots. You change your plan on the Pricing page.`],
  ['How to change the bot name or avatar', 'In Bot settings you change the name and give an image URL for the avatar. Discord allows name changes about twice per hour.'],
  ['Is my token safe', 'The token is stored encrypted (AES-256-GCM) and is never shown in the dashboard. You can reset it in the Developer Portal whenever you like.'],
  ['Can I use one bot on multiple servers', 'Yes. Every server has its own, fully separate settings, XP, money and statistics.'],
  ['Refunds and cancellation', 'You cancel the subscription or request a refund through the "Manage subscription" button on the Pricing/Billing page. After a refund or cancellation the plan drops to Free and bots over the limit are paused until you pay again.'],
  ['Slash commands don\'t show up', 'Global slash commands can take up to an hour the first time. Also check that the module for that command is enabled in "Modules".'],
];

function build() {
  const mods = Object.values(MODULES).map((m) => `- ${m.name}: ${m.desc}`).join('\n');
  const tpls = Object.values(TEMPLATES).map((t) => `- ${t.name}: ${t.desc}`).join('\n');
  const pl = Object.values(plans).map((p) => `- ${p.name} (${p.price}/${p.period}): up to ${p.maxBots} bots`).join('\n');
  const faq = FAQ.map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n');
  return `This is the "${config.brand}" platform where users build their own Discord bots without code: they sign in with Discord, pick a ready-made bot (template), paste their bot token and the platform hosts it 24/7.

PLANS:
${pl}

BOT TEMPLATES:
${tpls}

MODULES:
${mods}

FAQ:
${faq}`;
}

module.exports = { build, FAQ };
