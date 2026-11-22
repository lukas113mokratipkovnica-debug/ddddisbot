# Botnica — platforma za Discord botove

Web platforma na kojoj korisnici sami prave svoje Discord botove bez kodiranja: prijave se Discordom, odaberu gotovog bota, zalijepe token, i bot je online 24/7 na tvom serveru. Sve se podešava klikom u dashboardu.

Ime usluge mijenjaš u `.env` (`BRAND_NAME`).

## Što platforma ima

**Za posjetitelje:** landing stranica (hero, katalog botova, moduli, cijene, FAQ), `/catalog` s komandama svakog modula, `/pricing`.

**Za korisnike (`/app`):**
- **Moji botovi**: kartice sa statusom uživo, serverima i korisnicima, te limit po paketu
- **Novi bot**: odabir predloška, upute za Developer Portal i token. Token se provjerava kod Discorda, kao i jesu li uključeni intenti, pa se bot odmah pokreće.
- **Pregled bota**: statistika, start/stop/restart, link za dodavanje na server, popis servera
- **Moduli**: uključivanje i isključivanje 25 modula. Slash komande se same ponovo registriraju.
- **Postavke**: status/aktivnost, ime i avatar bota, zamjena tokena, autostart, brisanje
- **Konzola**: log bota uživo
- **Server postavke**: svaki modul ima svoju stranicu, a vide se samo uključeni moduli

**Admin (`/admin`, korisnici iz `OWNER_IDS`):** svi botovi i korisnici, dodjela paketa (Free/Pro/Business), blokiranje korisnika, start/stop bilo kojeg bota.

**Službeni bot:** bot iz `.env` je All-in-One bot platforme. Svatko ga može dodati na svoj server i podesiti bez pravljenja vlastitog bota.

## Gotovi botovi (predlošci)

All-in-One · Moderator · Leveling · Ekonomija · Support · Welcome · Giveaway · Community · Voice Master · Notifier · Utility · Role Manager · Fun

Predložak je samo početna kombinacija modula, a svaki bot može uključiti bilo koji modul.

## Moduli (25) i komande (60)

| Modul | Što radi |
|---|---|
| Moderacija | `/ban` `/unban` `/kick` `/timeout` `/untimeout` `/warn` `/warnings` `/delwarn` `/purge` `/slowmode` `/lock` `/unlock` `/nick` `/role`, slučajevi s brojem |
| AutoMod | psovke (wildcard), invite, linkovi s whitelistom, spam, CAPS, masovni tagovi; automatska kazna nakon X upozorenja |
| Logovi | brisanje/uređivanje poruka, ulasci/izlasci, uloge, nadimci, timeout, voice, kanali, banovi |
| Verifikacija | panel s dugmetom i captcha kodom, daje ulogu i opcionalno skida "unverified" ulogu, `/verify-panel` |
| Dobrodošlica | poruka ulaska i izlaska (embed), DM, autorole za ljude i botove |
| Praćenje pozivnica | tko je koga pozvao, `{inviter}` u dobrodošlici, `/invites user/top` |
| Button role | paneli do 25 dugmadi, način "samo jedna uloga" |
| Leveling | XP, `/rank`, `/leaderboard`, `/xp`, nagradne uloge, multiplikator, kanali bez XP-a |
| Ekonomija | `/balance` `/daily` `/work` `/pay` `/deposit` `/withdraw` `/gamble` `/slots` `/rob` `/shop` `/buy` `/inventory` `/richest` `/eco`, shop s ulogama |
| Giveaway | `/giveaway start/end/reroll`, prijava dugmetom, pokretanje i s dashboarda |
| Brojanje | counting kanal s rekordom i pravilima |
| Zabava | `/rps` `/choose` `/rate` `/ship` `/8ball` `/coinflip` `/roll` `/trivia` |
| Tiketi | panel → modal → privatni kanal, preuzimanje, transkript u log i DM |
| Custom komande | `!okidač` komande + autoresponder (sadrži / točno / počinje s) + reakcija emojijem |
| Sticky poruke | poruka koja uvijek ostaje na dnu kanala, `/sticky` ili dashboard |
| Starboard | najbolje poruke po reakcijama |
| Prijedlozi | `/suggest` s glasanjem i threadom |
| Anonimne ispovijesti | `/confess`, privatni log autora za moderatore |
| Rođendani | `/birthday set/remove/list`, čestitka i uloga za taj dan |
| Privremeni voice | "uđi za kreiranje" kanal, `/voice name/limit/lock/unlock/kick/claim` |
| Statistika kanali | voice kanali s brojem članova/ljudi/botova/boostova, automatsko kreiranje |
| Podsjetnici | `/remind set/list/delete` |
| AFK | `/afk`, odgovor kad te netko tagne, automatski povratak |
| Obavijesti | novi YouTube videi i RSS/Atom objave u kanal |
| Korisno | `/serverinfo` `/userinfo` `/avatar` `/poll` `/say` `/embed` |

Uvijek uključeno: `/help` `/ping` `/botinfo` `/dashboard`.

## Postavljanje

### 1. Službena Discord aplikacija (za login i službeni bot)
1. <https://discord.com/developers/applications> → **New Application**
2. **Bot** → Reset Token → kopiraj. Uključi **Server Members Intent** i **Message Content Intent**.
3. **OAuth2** → kopiraj Client ID i Client Secret, a pod **Redirects** dodaj `DASHBOARD_URL/callback` (npr. `http://localhost:3000/callback`).

### 2. Pokretanje
Node.js 18.17+ (preporuka 20/22).

```bash
npm install
cp .env.example .env   # popuni
npm start
```

Važno u `.env`:
- `OWNER_IDS`: tvoj Discord ID, da dobiješ Admin panel i neograničen broj botova
- `ENCRYPTION_KEY`: postavi dugi random string **prije** nego korisnici dodaju botove i nikad ga ne mijenjaj (njime su šifrirani tokeni)
- `BRAND_NAME`, `SUPPORT_URL`: ime usluge i link na support

### 3. Paketi i cijene
Uređuju se u `src/plans.js` (ime, cijena, broj botova, popis pogodnosti). **Naplata nije integrirana.** Paket korisniku dodjeljuješ ručno u Admin panelu nakon što plati (PayPal, uplata, Ko-fi…). Stripe se može dodati kasnije.

## Hosting
Svi botovi rade u jednom Node procesu. Za par desetaka manjih botova dovoljan je VPS s 1–2 GB RAM-a.

- **VPS:** `pm2 start src/index.js --name botnica && pm2 save && pm2 startup`. Ispred stavi Nginx/Caddy s HTTPS-om i `DASHBOARD_URL=https://…`.
- **Railway/Render/Fly:** `npm start`, env varijable i **persistent volume** na `data/`, inače se gube svi botovi i podaci.

## Podaci
```
data/platform.db       korisnici, botovi (tokeni šifrirani AES-256-GCM), sesije
data/bots/<id>.db      zasebna baza za svakog bota (postavke, XP, novac, upozorenja…)
```

## Struktura
```
src/
  index.js               pokreće dashboard i sve botove
  config.js  plans.js  modules.js (katalog modula i predložaka)
  platform.js            korisnici, botovi, šifriranje tokena
  database.js            baza po botu
  bot/
    manager.js           start/stop/restart više botova, status i log
    createClient.js      discord.js klijent s uključenim modulima
    commands/ events/ systems/
  dashboard/
    server.js  helpers.js  routes/{app,guild,admin}.js
    views/               EJS (landing, app, guild, admin)
    public/              CSS + JS
```
