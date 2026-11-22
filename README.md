# ddddisbot

Sve-u-jednom Discord bot s web dashboardom. Node.js + discord.js v14, SQLite baza (nema vanjskog servera baze), dashboard s Discord loginom.

## Mogućnosti

| Modul | Što radi |
|---|---|
| 🛡️ **Moderacija** | `/ban` `/unban` `/kick` `/timeout` `/untimeout` `/warn` `/warnings` `/delwarn` `/purge` `/slowmode` `/lock` `/unlock` `/nick` `/role`. Svaka akcija dobije broj slučaja i ide u log. Provjera hijerarhije uloga. |
| 🤖 **AutoMod** | Zabranjene riječi (s `*` wildcardom), Discord invite, linkovi (whitelist domena), masovno tagovanje, CAPS, spam. Akcije: obriši / obriši + warn / obriši + timeout. Automatski timeout/kick/ban nakon X upozorenja. Izuzeti kanali i uloge. |
| 📈 **Leveling** | XP za poruke (min/max, cooldown, multiplikator), `/rank`, `/leaderboard`, `/xp` (admin), nagradne uloge po levelu (zadrži sve ili samo najvišu), level-up poruka (kanal / DM / isključeno), kanali i uloge bez XP-a. |
| 👋 **Dobrodošlica** | Poruka ulaska i izlaska (tekst ili embed), DM novom članu, autorole posebno za ljude i botove. |
| 📜 **Logovi** | Obrisane/uređene poruke, masovno brisanje, ulasci/izlasci, promjene uloga i nadimaka, timeouti, voice, kanali, banovi (i oni ručni). |
| 🎫 **Tiketi** | Panel s dugmetom → modal s temom → privatni kanal. Support uloge, preuzimanje, `/ticket add/remove/close`, transkript (.txt) u log kanal i u DM korisniku. |
| 🎉 **Giveaway** | Start iz Discorda ili s dashboarda, prijava dugmetom, automatski kraj, reroll. |
| 🎭 **Button role** | Paneli s do 25 dugmadi (emoji, boja, opis), opcija "samo jedna uloga" (npr. boje). |
| 💬 **Custom komande** | `!okidač` → odgovor (tekst ili embed), varijable `{user}` `{args}` itd. |
| ⭐ **Starboard** | Poruke s dovoljno reakcija idu u poseban kanal. |
| 💡 **Prijedlozi** | `/suggest` → kanal s ✅/❌ i threadom za raspravu. |
| 🔧 **Ostalo** | `/help` `/ping` `/botinfo` `/serverinfo` `/userinfo` `/avatar` `/say` `/embed` `/poll` `/8ball` `/coinflip` `/roll` `/dashboard` |

**Dashboard:** pregled sa statistikom (poruke, ulasci/izlasci 14 dana, top XP, zadnji slučajevi), postavke svih modula, uključivanje/isključivanje pojedinih komandi, popis upozorenja i slučajeva, leaderboard s resetom, slanje poruka/embedova s live pregledom, upravljanje giveawayima, panelima i tiketima.

## Postavljanje

### 1. Discord aplikacija
1. Idi na <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab → *Reset Token* → kopiraj token.
3. Na istom tabu uključi **Server Members Intent** i **Message Content Intent** (obavezno).
4. **OAuth2** tab → kopiraj **Client ID** i **Client Secret**.
5. **OAuth2 → Redirects** → dodaj `http://localhost:3000/callback` (ili `https://tvoja-domena.com/callback` na serveru).

### 2. Instalacija
Treba Node.js 18.17+ (preporuka 20 ili 22).

```bash
git clone <repo> && cd ddddisbot
npm install
cp .env.example .env   # pa popuni vrijednosti
npm start
```

U `.env`:
- `DISCORD_TOKEN`, `CLIENT_ID`, `CLIENT_SECRET` — iz koraka 1
- `DASHBOARD_URL` — javni URL dashboarda bez `/` na kraju; redirect u portalu mora biti točno `DASHBOARD_URL/callback`
- `SESSION_SECRET` — bilo kakav dugi random string
- `DEV_GUILD_ID` — (opcionalno) ID tvog servera da se slash komande pojave odmah; bez toga se registriraju globalno
- `OWNER_IDS` — (opcionalno) tvoj Discord ID, dobiješ pristup svim serverima u dashboardu

### 3. Dodavanje bota
Otvori dashboard (`http://localhost:3000`) → **Dodaj bota**, ili uloguj se i klikni *Pozovi bota* kod servera. Bot traži Administrator dozvolu.

**Važno:** u Server Settings → Roles pomakni ulogu bota **iznad** uloga koje treba davati (autorole, level nagrade, button role) i iznad članova koje treba moderirati.

## Hosting 24/7
- **VPS (preporuka)**: `npm i -g pm2 && pm2 start src/index.js --name bot && pm2 save && pm2 startup`. Ispred stavi Nginx/Caddy s HTTPS-om i postavi `DASHBOARD_URL=https://...`.
- **Railway / Render / Fly.io**: start komanda `npm start`, postavi env varijable, `PORT` daje platforma. Za SQLite treba **persistent volume** montiran na `data/`, inače se baza briše pri svakom deployu.

## Struktura
```
src/
  index.js              start bota + dashboarda
  config.js             .env
  database.js           SQLite tablice, postavke po serveru (s defaultima)
  bot/
    client.js           klijent, učitavanje komandi/evenata, registracija slash komandi
    commands/           slash komande (grupirane po modulu)
    events/             discord eventi (poruke, ulasci, logovi, interakcije, starboard)
    systems/            automod, leveling, tiketi, giveaway, button role
  dashboard/
    server.js           Express, Discord OAuth2, rute i spremanje postavki
    views/              EJS stranice
    public/             CSS + JS
data/bot.db             baza (stvara se sama)
```

Dodavanje nove komande: napravi datoteku u `src/bot/commands/` koja exporta `{ data: SlashCommandBuilder, execute(interaction) }` (ili niz takvih). Kategorija = ime datoteke. Registrira se automatski pri pokretanju.
