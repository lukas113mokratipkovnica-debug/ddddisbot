// Security primitives shared by the dashboard and the bots.
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');

// ---------------------------------------------------------------- SSRF-safe fetch
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
}

async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('Neispravan URL'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Dozvoljeni su samo http(s) linkovi');
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('Nedozvoljen port');
  if (u.username || u.password) throw new Error('URL ne smije sadržavati lozinku');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('Interni hostovi nisu dozvoljeni');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw new Error('Host ne postoji'); });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('Privatne mreže nisu dozvoljene');
  return u;
}

/** fetch() that refuses private/internal targets, follows max 3 redirects manually and caps the body size. */
async function safeFetch(url, { maxBytes = 2_000_000, timeout = 15_000, headers = {} } = {}) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicUrl(current);
    const res = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BotPlatform/2.0)', ...headers }, signal: AbortSignal.timeout(timeout) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location'), u).toString(); continue; }
    const len = Number(res.headers.get('content-length') || 0);
    if (len > maxBytes) throw new Error('Datoteka je prevelika');
    const reader = res.body?.getReader();
    const chunks = []; let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { reader.cancel().catch(() => {}); throw new Error('Datoteka je prevelika'); }
      chunks.push(value);
    }
    return { ok: res.ok, status: res.status, headers: res.headers, buffer: Buffer.concat(chunks), text() { return this.buffer.toString('utf8'); } };
  }
  throw new Error('Previše preusmjeravanja');
}

// ---------------------------------------------------------------- rate limiting (in-memory, fixed window)
const buckets = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k); }, 60_000).unref();

function hit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.count++;
  return { allowed: b.count <= max, remaining: Math.max(0, max - b.count), reset: b.reset };
}

function rateLimit(name, { max, windowMs, key = (req) => req.ip, message = 'Previše zahtjeva. Pričekaj malo pa pokušaj ponovo.' }) {
  return (req, res, next) => {
    const r = hit(`${name}:${key(req)}`, max, windowMs);
    res.setHeader('RateLimit-Remaining', r.remaining);
    if (r.allowed) return next();
    res.setHeader('Retry-After', Math.ceil((r.reset - Date.now()) / 1000));
    res.status(429);
    if (req.accepts('html')) return res.render('error', { title: '429', message });
    return res.json({ error: message });
  };
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

const SNOWFLAKE = /^\d{17,20}$/;
const snowflake = (v) => (typeof v === 'string' && SNOWFLAKE.test(v) ? v : '');

module.exports = { safeFetch, assertPublicUrl, isPrivateIp, rateLimit, hit, safeEqual, snowflake, SNOWFLAKE };
