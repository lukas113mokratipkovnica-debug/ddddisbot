const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const config = require('../config');
const platform = require('../platform');
const plans = require('../plans');
const manager = require('../bot/manager');
const { MODULES, TEMPLATES } = require('../modules');
const { ALL_COMMANDS } = require('../bot/createClient');
const SqliteStore = require('./sessionStore');
const { isAdmin, inviteUrl } = require('./helpers');

const API = 'https://discord.com/api/v10';
const REDIRECT = `${config.dashboardUrl}/callback`;
const MANAGE_GUILD = 0x20n;
const ADMIN = 0x8n;

function startDashboard() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(session({
    store: new SqliteStore(), secret: config.sessionSecret, resave: false, saveUninitialized: false, name: 'sid',
    cookie: { maxAge: 7 * 864e5, httpOnly: true, sameSite: 'lax', secure: config.dashboardUrl.startsWith('https://') },
  }));

  app.use((req, res, next) => {
    req.session.csrf ||= crypto.randomBytes(24).toString('hex');
    res.locals.user = req.session.user || null;
    res.locals.isAdmin = isAdmin(req.session.user);
    res.locals.csrf = req.session.csrf;
    res.locals.brand = config.brand;
    res.locals.supportUrl = config.supportUrl;
    res.locals.flash = req.session.flash || null;
    res.locals.path = req.path;
    res.locals.MODULES = MODULES;
    res.locals.TEMPLATES = TEMPLATES;
    res.locals.plans = plans;
    res.locals.mainInvite = inviteUrl(config.clientId);
    const main = manager.mainClient();
    res.locals.brandLogo = main?.isReady() ? main.user.displayAvatarURL({ size: 128 }) : null;
    res.locals.userPlan = req.session.user ? platform.users.plan(req.session.user.id) : null;
    delete req.session.flash;
    next();
  });

  // ------------------------------------------------------------------ marketing
  const platformStats = () => {
    let guilds = 0; let members = 0; let online = 0;
    for (const id of [manager.MAIN_ID, ...platform.bots.all().map((b) => b.id)]) {
      const i = manager.info(id);
      if (i.status === 'online') { online++; guilds += i.guilds; members += i.members; }
    }
    return { guilds, members, online, bots: platform.bots.count() + 1, users: platform.users.count(), commands: ALL_COMMANDS.size, modules: Object.keys(MODULES).length };
  };
  app.get('/', (req, res) => res.render('index', { title: 'Discord botovi bez kodiranja', stats: platformStats() }));
  app.get('/catalog', (req, res) => {
    const byModule = {};
    for (const c of ALL_COMMANDS.values()) (byModule[c.module] ||= []).push({ name: c.data.name, description: c.data.description });
    res.render('catalog', { title: 'Katalog botova', byModule });
  });
  app.get('/pricing', (req, res) => res.render('pricing', { title: 'Cijene' }));

  // ------------------------------------------------------------------ auth
  app.get('/login', (req, res) => {
    req.session.oauthState = crypto.randomBytes(16).toString('hex');
    const p = new URLSearchParams({ client_id: config.clientId, redirect_uri: REDIRECT, response_type: 'code', scope: 'identify guilds', state: req.session.oauthState, prompt: 'none' });
    res.redirect(`https://discord.com/oauth2/authorize?${p}`);
  });

  app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    if (!code || !state || state !== req.session.oauthState) return res.redirect('/');
    delete req.session.oauthState;
    try {
      const tokenRes = await fetch(`${API}/oauth2/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
      });
      const token = await tokenRes.json();
      if (!token.access_token) throw new Error(token.error_description || 'OAuth greška');
      const headers = { Authorization: `Bearer ${token.access_token}` };
      const [user, guilds] = await Promise.all([
        fetch(`${API}/users/@me`, { headers }).then((r) => r.json()),
        fetch(`${API}/users/@me/guilds`, { headers }).then((r) => r.json()),
      ]);
      const manageable = (Array.isArray(guilds) ? guilds : []).filter((g) => g.owner || (BigInt(g.permissions) & (MANAGE_GUILD | ADMIN)) !== 0n)
        .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
      const profile = {
        id: user.id, username: user.global_name || user.username,
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : 'https://cdn.discordapp.com/embed/avatars/0.png',
      };
      platform.users.upsert(profile);
      if (platform.users.get(user.id)?.banned) return res.status(403).render('error', { title: 'Račun blokiran', message: 'Tvoj račun je blokiran na ovoj platformi.' });
      const returnTo = req.session.returnTo || '/app';
      req.session.regenerate((err) => {
        if (err) return res.redirect('/');
        req.session.user = profile;
        req.session.guilds = manageable;
        res.redirect(returnTo);
      });
    } catch (e) {
      console.error('[dashboard] login error', e);
      res.status(500).render('error', { title: 'Greška pri prijavi', message: e.message });
    }
  });
  app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

  app.use(require('./routes/app'));
  app.use(require('./routes/guild'));
  app.use(require('./routes/admin'));

  app.use((req, res) => res.status(404).render('error', { title: '404', message: 'Stranica ne postoji.' }));
  app.use((err, req, res, _next) => {
    console.error('[dashboard]', err);
    res.status(500).render('error', { title: 'Greška', message: err.message });
  });

  return app.listen(config.port, () => console.log(`[dashboard] ${config.brand} radi na ${config.dashboardUrl} (port ${config.port})`));
}

module.exports = { startDashboard };
