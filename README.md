# ServerPulse — Discord bot hosting platform

A full-stack platform where users create and host their own Discord bots without writing code: sign in with Discord, pick a ready-made bot (template), paste a bot token, and the platform runs it 24/7. Everything is configured from a web dashboard.

Change the service name in `.env` (`BRAND_NAME`).

## Highlights
- **No-code bots** — 13 templates over 25 modules / 60 slash commands.
- **Multi-bot hosting** — many bots run in one Node process, each with its own SQLite database. Bot tokens are encrypted at rest (AES-256-GCM).
- **Web dashboard** — marketing site, catalog, pricing, live status page; customer area (my bots, new-bot wizard, modules, settings, console, account & security); admin panel. Modern UI with light/dark theme, accent-color picker, command palette (Ctrl+K) and live updates over SSE.
- **Self-serve billing** — Stripe Checkout + Customer Portal.
- **Refund kill-switch** — on refund / chargeback / cancellation / expiry the plan drops to Free and bots over the limit are paused (kept, not deleted) and restored when payment resumes. Transparent, logged, reversible.
- **AI support** — Claude-backed chat widget with a platform knowledge base; falls back to an FAQ matcher when no API key is set.
- **English-only** — the entire app and codebase are English.
- **Secure** — strict CSP, security headers, CSRF + origin checks, rate limiting, SSRF-safe fetch, snowflake validation, audit log, session management, startup secret checks.

## Modules (25) and commands (60)

| Module | What it does |
|---|---|
| Moderation | `/ban` `/unban` `/kick` `/timeout` `/untimeout` `/warn` `/warnings` `/delwarn` `/purge` `/slowmode` `/lock` `/unlock` `/nick` `/role`; every action gets a case number and goes to the log |
| AutoMod | banned words (wildcards), invites, links with a whitelist, spam, CAPS, mass mentions; auto-punishment after X warnings |
| Logs | deleted/edited messages, joins/leaves, role & nickname changes, timeouts, voice, channels, bans |
| Verification | button + captcha panel, grants a role (optionally removes an "unverified" role), `/verify-panel` |
| Welcome | join/leave messages (embed), DM, autoroles for humans and bots |
| Invite tracking | who invited whom, `{inviter}` in welcome, `/invites user/top` |
| Button roles | panels with up to 25 buttons, "single role" mode |
| Leveling | XP, `/rank`, `/leaderboard`, `/xp`, reward roles, multiplier, no-XP channels |
| Economy | `/balance` `/daily` `/work` `/pay` `/deposit` `/withdraw` `/gamble` `/slots` `/rob` `/shop` `/buy` `/inventory` `/richest` `/eco`, a role shop |
| Giveaways | `/giveaway start/end/reroll`, button entry, dashboard controls |
| Counting | counting channel with a high score and rules |
| Fun | `/rps` `/choose` `/rate` `/ship` `/8ball` `/coinflip` `/roll` `/trivia` |
| Tickets | panel → modal → private channel, claim, `/ticket add/remove/close`, transcript to log and DM |
| Custom commands | `!trigger` commands + autoresponder (contains / exact / starts with) + emoji reaction |
| Sticky messages | a message that stays at the bottom of a channel |
| Starboard | best messages by reactions |
| Suggestions | `/suggest` with voting and a thread |
| Confessions | `/confess`, private author log for moderators |
| Birthdays | `/birthday set/remove/list`, wishes and a birthday role for the day |
| Temp voice | "join to create" channel, `/voice name/limit/lock/unlock/kick/claim` |
| Server stats channels | voice channels showing member/human/bot/boost counts |
| Reminders | `/remind set/list/delete` |
| AFK | `/afk`, reply when mentioned, auto return |
| Notifications | new YouTube videos and RSS posts in a channel |
| Utility | `/serverinfo` `/userinfo` `/avatar` `/poll` `/say` `/embed` |

Always on: `/help` `/ping` `/botinfo` `/dashboard`.

## Setup

### 1. Official Discord application (for login and the official bot)
1. <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab → Reset Token → copy it. Enable **Server Members Intent** and **Message Content Intent**.
3. **OAuth2** tab → copy Client ID and Secret; under **Redirects** add `DASHBOARD_URL/callback` (e.g. `http://localhost:3000/callback`).

### 2. Run
Requires Node.js 18.17+ (20/22 recommended).

```bash
npm install
cp .env.example .env   # then fill it in
npm start
```

Important in `.env`:
- `DISCORD_TOKEN`, `CLIENT_ID`, `CLIENT_SECRET` — from step 1.
- `OWNER_IDS` — your Discord ID, to get the Admin panel and an unlimited bot count.
- `ENCRYPTION_KEY` — set a long random string **before** the first customer adds a bot and never change it (bot tokens are encrypted with it).
- `BRAND_NAME`, `SUPPORT_URL` — service name and support link.
- In production, also set `NODE_ENV=production` and `TRUST_PROXY=1` if you run behind Nginx/Caddy.

### 3. Billing and AI (both optional)
Without these keys the platform works as before (plans assigned manually in the Admin panel, support uses the FAQ fallback).
- **Stripe:** set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_PRO` / `STRIPE_PRICE_BUSINESS` (monthly subscription Price IDs from Stripe → Products). Webhook endpoint: `https://your-domain/billing/webhook`. In Stripe enable these events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`, `invoice.payment_failed`.
- **AI:** set `ANTHROPIC_API_KEY`. For cheaper support set `AI_MODEL=claude-haiku-5-5`.

## Hosting
All bots run in one Node process. A VPS with 1–2 GB RAM handles a few dozen small bots.
- **VPS:** `pm2 start src/index.js --name serverpulse && pm2 save && pm2 startup`. Put Nginx/Caddy with HTTPS in front and set `DASHBOARD_URL=https://…`.
- **Railway / Render / Fly:** `npm start`, env vars, and a **persistent volume** mounted at `data/`, otherwise all bots and data are lost on each deploy.
- Health check: `GET /healthz`.

## Data
```
data/platform.db       users, bots (encrypted tokens), sessions, audit, billing events
data/bots/<id>.db      a separate database per bot (settings, XP, money, warnings…)
```
Secrets (`.env`), `node_modules/` and runtime databases (`data/`) are intentionally not committed.

## Structure
```
src/
  index.js               starts the dashboard and all bots
  config.js  plans.js  modules.js
  platform.js            users, bots, token encryption, audit, sessions
  database.js            per-bot database factory
  billing.js             Stripe + entitlement enforcement (kill-switch)
  security.js            SSRF-safe fetch, rate limiting, CSRF helpers
  ai/                    AI support (knowledge base + Claude)
  bot/
    manager.js           start/stop/restart many bots, status, logs, plan enforcement
    createClient.js      a discord.js client with the enabled modules
    commands/ events/ systems/
  dashboard/
    server.js  helpers.js  routes/{app,account,guild,admin,billing,support}.js
    views/                 EJS pages
    public/                CSS + JS
```

Not affiliated with Discord Inc.
