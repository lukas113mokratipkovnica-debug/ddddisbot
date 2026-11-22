// Translation engine.
// Croatian is the source language: the Croatian sentence itself is the key ("gettext style").
// locales/<lang>.json maps source text -> translation. Keys may contain placeholders like {0} or {name}
// which match any text, so rendered strings ("Obrisano **12** poruka.") can be translated at the boundary.
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const SOURCE = 'hr';
const LANGS = {
  hr: { code: 'hr', name: 'Hrvatski', short: 'HR', locale: 'hr-HR', discord: ['hr'] },
  en: { code: 'en', name: 'English', short: 'EN', locale: 'en-GB', discord: ['en-US', 'en-GB'] },
};

const context = new AsyncLocalStorage();
const misses = new Set(); // filled only when I18N_TRACK=1 (used to find untranslated text)
const TRACK = process.env.I18N_TRACK === '1';
const PH = /\{(\w+)\}/g;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s) => s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim(); // keeps line breaks (Discord messages)
const normHtml = (s) => s.replace(/\s+/g, ' ').trim();

const dicts = {};
function load() {
  for (const code of Object.keys(LANGS)) {
    if (code === SOURCE) continue;
    const file = path.join(__dirname, 'locales', `${code}.json`);
    const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const exact = new Map();
    const buckets = new Map();
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('//') || typeof v !== 'string' || !v) continue;
      const key = norm(k);
      if (!/\{\w+\}/.test(key)) { exact.set(key, v); continue; }
      const names = [];
      let src = '^';
      let last = 0;
      for (const m of key.matchAll(PH)) {
        src += esc(key.slice(last, m.index)) + '([\\s\\S]+?)';
        names.push(m[1]);
        last = m.index + m[0].length;
      }
      src += `${esc(key.slice(last))}$`;
      const prefix = key.split('{')[0].slice(0, 2).toLowerCase();
      if (!buckets.has(prefix)) buckets.set(prefix, []);
      buckets.get(prefix).push({ re: new RegExp(src), names, value: v, len: key.length });
      exact.set(key, v); // so t('Key {x}', vars) works too
    }
    for (const list of buckets.values()) list.sort((a, b) => b.len - a.len); // most specific first
    dicts[code] = { exact, buckets };
  }
}
load();

const interpolate = (s, vars) => (vars ? s.replace(PH, (m, n) => (vars[n] !== undefined ? String(vars[n]) : m)) : s);

/** Translate a source string (with optional {vars}). */
function t(lang, str, vars) {
  if (!str) return '';
  if (lang === SOURCE || !dicts[lang]) return interpolate(str, vars);
  return interpolate(dicts[lang].exact.get(norm(str)) ?? str, vars);
}

function lookup(lang, core, depth = 0) {
  const d = dicts[lang];
  const hit = d.exact.get(core);
  if (hit !== undefined && !/\{\w+\}/.test(core)) return hit;
  const candidates = [...(d.buckets.get(core.slice(0, 2).toLowerCase()) || []), ...(d.buckets.get('') || [])];
  for (const p of candidates) {
    const m = p.re.exec(core);
    if (!m) continue;
    return p.value.replace(PH, (x, n) => {
      const i = p.names.indexOf(n);
      if (i < 0) return x;
      const cap = m[i + 1];
      return depth < 2 ? (lookup(lang, cap.trim(), depth + 1) ?? cap) : cap;
    });
  }
  // leading emoji / symbols ("✅ Gotovo.") -> translate the rest
  const pre = core.match(/^([^\p{L}\p{N}*_`<@#[(]+)(\S[\s\S]*)$/u);
  if (pre) { const r = lookup(lang, pre[2], depth + 1); if (r !== null) return pre[1] + r; }
  return null;
}

/** Translate already-rendered text (keeps surrounding whitespace, falls back line by line). */
function translateText(lang, text, html = false) {
  if (!text || lang === SOURCE || !dicts[lang] || typeof text !== 'string') return text;
  const lead = text.match(/^\s*/)[0];
  const trail = text.slice(lead.length).match(/\s*$/)[0];
  const core = text.slice(lead.length, text.length - trail.length);
  if (!core || !/\p{L}/u.test(core)) return text;
  const key = html ? normHtml(core) : norm(core);
  const single = lookup(lang, key);
  if (single !== null) return lead + single + trail;
  if (key.includes('\n')) return lead + key.split('\n').map((l) => translateText(lang, l)).join('\n') + trail;
  if (TRACK) misses.add(key);
  return text;
}

// ---------------------------------------------------------------- HTML (dashboard)
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#34|#39);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#34': '"', '#39': "'" }[e]));
const encode = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;').replace(/'/g, '&#39;');
const PROTECTED = /(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<code[\s\S]*?<\/code>|<pre[\s\S]*?<\/pre>|<!--[\s\S]*?-->|<[^>]*\bdata-notr\b[^>]*>[\s\S]*?<\/(?:span|b|div|small|strong|a|td|option|h1)>)/;
const ATTRS = /(\s(?:placeholder|title|aria-label|data-confirm|data-loading|alt|data-label)=")([^"]*)(")/g;

function translateHtml(lang, html) {
  if (lang === SOURCE || !dicts[lang]) return html;
  return html.split(PROTECTED).map((part, i) => {
    if (i % 2 === 1) return part;
    return part
      .replace(/>([^<>]+)</g, (m, txt) => {
        if (!/\p{L}/u.test(txt)) return m;
        const out = translateText(lang, decode(txt), true);
        return `>${out === decode(txt) ? txt : encode(out)}<`;
      })
      .replace(ATTRS, (m, a, v, b) => {
        if (!v) return m;
        const out = translateText(lang, decode(v), true);
        return a + (out === decode(v) ? v : encode(out)) + b;
      });
  }).join('');
}

// ---------------------------------------------------------------- Discord payloads (bot)
function trEmbed(lang, e) {
  const d = typeof e?.toJSON === 'function' ? e.toJSON() : { ...e };
  if (d.title) d.title = translateText(lang, d.title);
  if (d.description) d.description = translateText(lang, d.description);
  if (d.footer?.text) d.footer = { ...d.footer, text: translateText(lang, d.footer.text) };
  if (d.author?.name) d.author = { ...d.author, name: translateText(lang, d.author.name) };
  if (d.fields) d.fields = d.fields.map((f) => ({ ...f, name: translateText(lang, f.name), value: translateText(lang, f.value) }));
  return d;
}
function trComponent(lang, c) {
  const d = typeof c?.toJSON === 'function' ? c.toJSON() : { ...c };
  if (d.label) d.label = translateText(lang, d.label);
  if (d.placeholder) d.placeholder = translateText(lang, d.placeholder);
  if (d.title) d.title = translateText(lang, d.title);
  if (Array.isArray(d.components)) d.components = d.components.map((x) => trComponent(lang, x));
  if (Array.isArray(d.options)) d.options = d.options.map((o) => ({ ...o, label: translateText(lang, o.label), description: o.description && translateText(lang, o.description) }));
  return d;
}
function translatePayload(lang, options) {
  if (!lang || lang === SOURCE || !dicts[lang] || !options) return options;
  if (typeof options === 'string') return translateText(lang, options);
  if (typeof options !== 'object' || options.constructor?.name === 'MessagePayload') return options;
  const out = { ...options };
  if (typeof out.content === 'string') out.content = translateText(lang, out.content);
  if (Array.isArray(out.embeds)) out.embeds = out.embeds.map((e) => trEmbed(lang, e));
  if (Array.isArray(out.components)) out.components = out.components.map((c) => trComponent(lang, c));
  return out;
}
const translateModal = (lang, modal) => (lang === SOURCE || !dicts[lang] ? modal : trComponent(lang, modal));

/** Adds Discord-native localizations: default text becomes English, Croatian stays for hr clients. */
function localizeCommand(json) {
  const walk = (node) => {
    if (node.description) {
      const en = t('en', node.description);
      if (en !== node.description) {
        node.description_localizations = { hr: node.description.slice(0, 100) };
        node.description = en.slice(0, 100);
      }
    }
    const enName = dicts.en?.exact.get(`opt:${node.name}`);
    if (enName && node.type !== undefined && node.type !== 1 && node.type !== 2) {
      node.name_localizations = { 'en-US': enName, 'en-GB': enName };
    }
    if (Array.isArray(node.choices)) {
      node.choices = node.choices.map((c) => {
        const en = t('en', c.name);
        return en !== c.name ? { ...c, name: en, name_localizations: { hr: c.name } } : c;
      });
    }
    (node.options || []).forEach(walk);
  };
  walk(json);
  return json;
}

/** Discord guild preferred locale -> our language code. */
function fromDiscordLocale(locale) {
  for (const [code, l] of Object.entries(LANGS)) if (l.discord.includes(locale)) return code;
  if (/^(hr|sr|bs)/i.test(locale || '')) return 'hr';
  return 'en';
}
function fromAcceptLanguage(header) {
  const tags = String(header || '').toLowerCase().split(',').map((x) => x.split(';')[0].trim());
  for (const tag of tags) {
    const base = tag.split('-')[0];
    if (LANGS[base]) return base;
    if (['sr', 'bs', 'sh', 'cnr'].includes(base)) return 'hr';
  }
  return 'en';
}

module.exports = {
  SOURCE, LANGS, context, t, translateText, translateHtml, translatePayload, translateModal, localizeCommand,
  fromDiscordLocale, fromAcceptLanguage, reload: load, misses, stats: () => Object.fromEntries(Object.entries(dicts).map(([k, d]) => [k, d.exact.size])),
};
