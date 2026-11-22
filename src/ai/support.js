const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const platform = require('../platform');
const manager = require('./../bot/manager');
const knowledge = require('./knowledge');

const client = config.aiKey ? new Anthropic({ apiKey: config.aiKey }) : null;
const enabled = () => Boolean(client);

const SYSTEM = (userContext, lang) => `${knowledge.build()}

Ti si AI agent korisničke podrške za ovu platformu. Pravila:
- Odgovaraj ISKLJUČIVO o ovoj platformi (pravljenje i hosting Discord botova, moduli, paketi, naplata, postavke). Na nepovezana pitanja ljubazno reci da pomažeš samo oko platforme.
- Budi kratak, konkretan i prijateljski. Koristi korake kad su korisni.
- Odgovaraj na jeziku: ${lang === 'en' ? 'engleskom' : 'hrvatskom'}.
- Ako nešto ne znaš sa sigurnošću, reci to i uputi korisnika da otvori tiket ili kontaktira podršku. Ništa ne izmišljaj (npr. ne izmišljaj cijene, limite ni postavke kojih nema gore).
- Ne traži i ne prikazuj token bota. Ako korisnik zalijepi token, upozori ga da ga odmah resetira.
${userContext ? `\nKONTEKST KORISNIKA (koristi ako je relevantno):\n${userContext}` : ''}`;

function userContext(userId) {
  if (!userId) return '';
  const u = platform.users.get(userId);
  if (!u) return '';
  const plan = platform.users.plan(userId);
  const bots = platform.bots.byOwner(userId).map((b) => {
    const info = manager.info(b.id);
    return `- ${b.name}: ${info.suspended ? 'PAUZIRAN (pretplata)' : info.status}${info.error ? ` (greška: ${info.error})` : ''}`;
  });
  return `Korisnik ${u.username}, paket ${plan.name} (limit ${plan.maxBots} bota).${bots.length ? `\nNjegovi botovi:\n${bots.join('\n')}` : ' Još nema botova.'}`;
}

// Fallback when no API key: score FAQ entries by keyword overlap.
function fallbackAnswer(question, lang) {
  const q = question.toLowerCase();
  const words = q.split(/\W+/).filter((w) => w.length > 3);
  let best = null; let bestScore = 0;
  for (const [topic, ans] of knowledge.FAQ) {
    const hay = (topic + ' ' + ans).toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = ans; }
  }
  if (bestScore >= 2 && best) return best;
  return lang === 'en'
    ? "I'm the support assistant, but live AI isn't configured here. Check the FAQ on the home page, or the bot's Console for errors. For anything else, open a ticket or contact support."
    : 'Ja sam asistent podrške, ali AI trenutno nije uključen. Pogledaj česta pitanja na početnoj stranici ili Konzolu bota za greške. Za ostalo otvori tiket ili kontaktiraj podršku.';
}

/**
 * @param {{history: {role:string,content:string}[], userId?:string, lang?:string}} opts
 * @returns {Promise<{reply:string, ai:boolean}>}
 */
async function chat({ history, userId, lang = 'hr' }) {
  const clean = (history || []).filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim())
    .slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!clean.length || clean[clean.length - 1].role !== 'user') throw new Error('Nema pitanja.');

  if (!client) return { reply: fallbackAnswer(clean[clean.length - 1].content, lang), ai: false };

  try {
    const res = await client.messages.create({
      model: config.aiModel,
      max_tokens: 1024,
      output_config: { effort: 'low' }, // support Q&A is simple; low effort keeps it fast and cheap
      system: SYSTEM(userContext(userId), lang),
      messages: clean,
    });
    const reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { reply: reply || fallbackAnswer(clean[clean.length - 1].content, lang), ai: true };
  } catch (e) {
    console.error('[ai] support error:', e.message);
    return { reply: fallbackAnswer(clean[clean.length - 1].content, lang), ai: false };
  }
}

module.exports = { enabled, chat };
