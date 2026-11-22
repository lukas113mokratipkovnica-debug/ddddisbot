const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const config = require('../config');
const platform = require('../platform');
const plans = require('../plans');
const i18n = require('../i18n');
const manager = require('../bot/manager');
const { MODULES, TEMPLATES } = require('../modules');
const { ALL_COMMANDS } = require('../bot/createClient');
const { rateLimit } = require('../security');
const SqliteStore = require('./sessionStore');
const { isAdmin, inviteUrl, audit } = require('./helpers');

const API = 'https://discord.com/api/v10';
const REDIRECT = `${config.dashboardUrl}/callback`;
const MANAGE_GUILD = 0x20n;
const ADMIN = 0x8n;
const HTTPS = config.dashboardUrl.startsWith('https://');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    ...(HTTPS ? ['upgrade-insecure-requests'] : []),
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (HTTPS) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

function startDashboard() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: config.production ? '7d' : 0 }));
  app.use(rateLimit('global', { max: 600, windowMs: 60_000 }));
  app.use(express.urlencoded({ extended: true, limit: '200kb', parameterLimit: 2000 }));
  app.use(session({
    store: new SqliteStore(), secret: config.sessionSecret, resave: false, saveUninitialized: false, rolling: true, name: HTTPS ? '__Host-sid' : 'sid',
    cookie: { maxAge: 7 * 864e5, httpOnly: true, sameSite: 'lax', secure: HTTPS, path: '/' },
  }));
  app.use((req, res, next) => { if (req.method === 'POST') return rateLimit('post', { max: 90, windowMs: 60_000, key: (r) => r.session.user?.id || r.ip })(req, res, next); next(); });

  // ------------------------------------------------------------------ locals + i18n
  app.use((req, res, next) => {
    req.session.csrf ||= crypto.randomBytes(32).toString('hex');
    const lang = i18n.LANGS[req.session.lang] ? req.session.lang : (() => {
      const c = /(?:^|;\s*)lang=(\w+)/.exec(req.headers.cookie || '');
      return c && i18n.LANGS[c[1]] ? c[1] : i18n.fromAcceptLanguage(req.headers['accept-language']);
    })();
    req.lang = lang;
    Object.assign(res.locals, {
      lang, langs: i18n.LANGS, numLocale: i18n.LANGS[lang].locale, t: (s, v) => i18n.t(lang, s, v),
      user: req.session.user || null, isAdmin: isAdmin(req.session.user), csrf: req.session.csrf, brand: config.brand,
      supportUrl: config.supportUrl, flash: req.session.flash || null, path: req.path, url: req.originalUrl,
      MODULES, TEMPLATES, plans, mainInvite: inviteUrl(config.clientId),
      userPlan: req.session.user ? platform.users.plan(req.session.user.id) : null,
    });
    const main = manager.mainClient();
    res.locals.brandLogo = main?.isReady() ? main.user.displayAvatarURL({ size: 128 }) : null;
    delete req.session.flash;
    // every rendered page is translated in one pass (source language = Croatian)
    const render = res.render.bind(res);
    res.render = (view, opts = {}) => render(view, opts, (err, html) => {
      if (err) return next(err);
      res.type('html').send(i18n.translateHtml(lang, html));
    });
    next();
  });

  app.get('/lang/:code', (req, res) => {
    const code = i18n.LANGS[req.params.code] ? req.params.code : 'en';
    req.session.lang = code;
    res.cookie('lang', code, { maxAge: 365 * 864e5, sameSite: 'lax', secure: HTTPS, httpOnly: true });
    const next = typeof req.query.next === 'string' && req.query.next.startsWith('/') && !req.query.next.startsWith('//') ? req.query.next : '/';
    res.redirect(next);
  });

  // ------------------------------------------------------------------ marketing + status
  const platformStats = () => {
    let guilds = 0; let members = 0; let online = 0;
    const ids = [manager.MAIN_ID, ...platform.bots.all().map((b) => b.id)];
    for (const id of ids) {
      const i = manager.info(id);
      if (i.status === 'online') { online++; guilds += i.guilds; members += i.members; }
    }
    return { guilds, members, online, bots: ids.length, users: platform.users.count(), commands: ALL_COMMANDS.size, modules: Object.keys(MODULES).length };
  };
  app.get('/', (req, res) => res.render('index', { title: 'Discord botovi bez kodiranja', stats: platformStats() }));
  app.get('/catalog', (req, res) => {
    const byModule = {};
    for (const c of ALL_COMMANDS.values()) (byModule[c.module] ||= []).push({ name: c.data.name, description: c.data.description });
    res.render('catalog', { title: 'Katalog botova', byModule });
  });
  app.get('/pricing', (req, res) => res.render('pricing', { title: 'Cijene' }));
  app.get('/status', (req, res) => {
    const main = manager.info(manager.MAIN_ID);
    res.render('status', { title: 'Status', stats: platformStats(), main, samples: manager.statusSamples(), uptime: process.uptime() });
  });
  app.get('/api/status', rateLimit('api-status', { max: 30, windowMs: 60_000 }), (req, res) => {
    const s = platformStats();
    res.json({ ok: true, bots: { online: s.online, total: s.bots }, guilds: s.guilds, uptime: Math.floor(process.uptime()) });
  });

  // ------------------------------------------------------------------ auth
  const authLimit = rateLimit('auth', { max: 15, windowMs: 10 * 60_000 });
  app.get('/login', authLimit, (req, res) => {
    req.session.oauthState = crypto.randomBytes(24).toString('hex');
    const p = new URLSearchParams({ client_id: config.clientId, redirect_uri: REDIRECT, response_type: 'code', scope: 'identify guilds', state: req.session.oauthState, prompt: 'none' });
    res.redirect(`https://discord.com/oauth2/authorize?${p}`);
  });

  app.get('/callback', authLimit, async (req, res, next) => {
    const { code, state } = req.query;
    if (typeof code !== 'string' || typeof state !== 'string' || !req.session.oauthState || state !== req.session.oauthState) return res.redirect('/');
    delete req.session.oauthState;
    try {
      const tokenRes = await fetch(`${API}/oauth2/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
      });
      const token = await tokenRes.json();
      if (!token.access_token) throw new Error('Discord je odbio prijavu. Pokušaj ponovo.');
      const headers = { Authorization: `Bearer ${token.access_token}` };
      const [user, guilds] = await Promise.all([
        fetch(`${API}/users/@me`, { headers }).then((r) => r.json()),
        fetch(`${API}/users/@me/guilds`, { headers }).then((r) => r.json()),
      ]);
      if (!user?.id) throw new Error('Discord nije vratio korisnika.');
      const manageable = (Array.isArray(guilds) ? guilds : []).filter((g) => g.owner || (BigInt(g.permissions) & (MANAGE_GUILD | ADMIN)) !== 0n)
        .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
      const profile = {
        id: user.id, username: user.global_name || user.username,
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : 'https://cdn.discordapp.com/embed/avatars/0.png',
      };
      platform.users.upsert(profile);
      if (platform.users.get(user.id)?.banned) return res.status(403).render('error', { title: 'Račun blokiran', message: 'Tvoj račun je blokiran na ovoj platformi.' });
      const returnTo = typeof req.session.returnTo === 'string' && req.session.returnTo.startsWith('/') && !req.session.returnTo.startsWith('//') ? req.session.returnTo : '/app';
      const lang = req.session.lang;
      req.session.regenerate((err) => { // new session id on login prevents session fixation
        if (err) return next(err);
        Object.assign(req.session, {
          user: profile, guilds: manageable, lang, createdAt: Date.now(), ip: req.ip, ua: String(req.get('user-agent') || '').slice(0, 200),
        });
        platform.audit.log(profile.id, 'login', null, req.ip);
        res.redirect(returnTo);
      });
    } catch (e) {
      console.error('[dashboard] login error', e.message);
      res.status(500).render('error', { title: 'Greška pri prijavi', message: e.message });
    }
  });
  app.post('/logout', (req, res) => {
    if (req.session.user) audit(req, 'logout');
    req.session.destroy(() => res.redirect('/'));
  });
  app.get('/logout', (req, res) => res.redirect('/app')); // logging out requires POST (CSRF-safe)

  app.use(require('./routes/app'));
  app.use(require('./routes/account'));
  app.use(require('./routes/guild'));
  app.use(require('./routes/admin'));

  app.use((req, res) => res.status(404).render('error', { title: '404', message: 'Stranica ne postoji.' }));
  app.use((err, req, res, _next) => {
    console.error('[dashboard]', err);
    if (res.headersSent) return;
    res.status(500).render('error', { title: 'Greška', message: config.production ? 'Nešto je pošlo po zlu. Pokušaj ponovo.' : err.message });
  });

  return app.listen(config.port, () => console.log(`[dashboard] ${config.brand} radi na ${config.dashboardUrl} (port ${config.port})`));
}

module.exports = { startDashboard };
