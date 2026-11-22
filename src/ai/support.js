const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const platform = require('../platform');
const manager = require('./../bot/manager');
const knowledge = require('./knowledge');

const client = config.aiKey ? new Anthropic({ apiKey: config.aiKey }) : null;
const enabled = () => Boolean(client);

const SYSTEM = (userContext) => `${knowledge.build()}

You are the AI customer-support agent for this platform. Rules:
- Answer ONLY about this platform (creating and hosting Discord bots, modules, plans, billing, settings). For unrelated questions, politely say you only help with the platform.
- Be short, concrete and friendly. Use steps when helpful.
- Answer in English.
- If you are not sure about something, say so and point the user to open a ticket or contact support. Never make things up (e.g. do not invent prices, limits or settings not listed above).
- Do not ask for or display a bot token. If the user pastes a token, warn them to reset it immediately.
${userContext ? `\nUSER CONTEXT (use if relevant):\n${userContext}` : ''}`;

function userContext(userId) {
  if (!userId) return '';
  const u = platform.users.get(userId);
  if (!u) return '';
  const plan = platform.users.plan(userId);
  const bots = platform.bots.byOwner(userId).map((b) => {
    const info = manager.info(b.id);
    return `- ${b.name}: ${info.suspended ? 'PAUSED (subscription)' : info.status}${info.error ? ` (error: ${info.error})` : ''}`;
  });
  return `User ${u.username}, plan ${plan.name} (limit ${plan.maxBots} bots).${bots.length ? `\nTheir bots:\n${bots.join('\n')}` : ' No bots yet.'}`;
}

// Fallback when no API key: score FAQ entries by keyword overlap.
function fallbackAnswer(question) {
  const q = question.toLowerCase();
  const words = q.split(/\W+/).filter((w) => w.length > 3);
  let best = null; let bestScore = 0;
  for (const [topic, ans] of knowledge.FAQ) {
    const hay = (topic + ' ' + ans).toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = ans; }
  }
  if (bestScore >= 2 && best) return best;
  return "I'm the support assistant, but live AI isn't configured here. Check the FAQ on the home page, or the bot's Console for errors. For anything else, open a ticket or contact support.";
}

/**
 * @param {{history: {role:string,content:string}[], userId?:string}} opts
 * @returns {Promise<{reply:string, ai:boolean}>}
 */
async function chat({ history, userId }) {
  const clean = (history || []).filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim())
    .slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!clean.length || clean[clean.length - 1].role !== 'user') throw new Error('No question.');

  if (!client) return { reply: fallbackAnswer(clean[clean.length - 1].content), ai: false };

  try {
    const res = await client.messages.create({
      model: config.aiModel,
      max_tokens: 1024,
      output_config: { effort: 'low' }, // support Q&A is simple; low effort keeps it fast and cheap
      system: SYSTEM(userContext(userId)),
      messages: clean,
    });
    const reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { reply: reply || fallbackAnswer(clean[clean.length - 1].content), ai: true };
  } catch (e) {
    console.error('[ai] support error:', e.message);
    return { reply: fallbackAnswer(clean[clean.length - 1].content), ai: false };
  }
}

module.exports = { enabled, chat };
