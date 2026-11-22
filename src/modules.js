// Katalog modula i gotovih "botova" (predložaka). Svaki bot na platformi = skup uključenih modula.
const MODULES = {
  moderation: { name: 'Moderacija', icon: 'shield', group: 'Moderacija', desc: 'Ban, kick, timeout, upozorenja, purge, lock, slučajevi.' },
  automod: { name: 'AutoMod', icon: 'bot', group: 'Moderacija', desc: 'Filter psovki, linkova, invite-a, spama, CAPS-a i tagova.' },
  logging: { name: 'Logovi', icon: 'scroll', group: 'Moderacija', desc: 'Sve promjene na serveru u log kanalu.' },
  verification: { name: 'Verifikacija', icon: 'badge', group: 'Moderacija', desc: 'Dugme + captcha kod prije pristupa serveru.' },
  welcome: { name: 'Dobrodošlica', icon: 'hand', group: 'Članovi', desc: 'Poruke ulaska/izlaska, DM i autorole.' },
  invites: { name: 'Praćenje pozivnica', icon: 'link', group: 'Članovi', desc: 'Tko je koga pozvao, leaderboard pozivnica.' },
  roles: { name: 'Button role', icon: 'layers', group: 'Članovi', desc: 'Paneli s dugmadima za samostalne uloge.' },
  leveling: { name: 'Leveling', icon: 'trending', group: 'Angažman', desc: 'XP, rangovi, leaderboard i nagradne uloge.' },
  economy: { name: 'Ekonomija', icon: 'coins', group: 'Angažman', desc: 'Novac, daily, posao, banka, shop, kockanje, pljačka.' },
  giveaways: { name: 'Giveaway', icon: 'gift', group: 'Angažman', desc: 'Nagradne igre s dugmetom i automatskim izvlačenjem.' },
  counting: { name: 'Brojanje', icon: 'hash', group: 'Angažman', desc: 'Igra brojanja s rekordom i pravilima.' },
  fun: { name: 'Zabava', icon: 'smile', group: 'Angažman', desc: '8ball, kamen-škare-papir, ship, ocjene, kocke…' },
  tickets: { name: 'Tiketi', icon: 'ticket', group: 'Podrška', desc: 'Privatni support kanali s transkriptom.' },
  customcommands: { name: 'Custom komande', icon: 'terminal', group: 'Podrška', desc: 'Vlastite komande i autoresponder na ključne riječi.' },
  sticky: { name: 'Sticky poruke', icon: 'pin', group: 'Podrška', desc: 'Poruka koja uvijek ostaje na dnu kanala.' },
  starboard: { name: 'Starboard', icon: 'star', group: 'Zajednica', desc: 'Najbolje poruke po reakcijama.' },
  suggestions: { name: 'Prijedlozi', icon: 'bulb', group: 'Zajednica', desc: '/suggest s glasanjem i threadom.' },
  confessions: { name: 'Anonimne ispovijesti', icon: 'mask', group: 'Zajednica', desc: 'Anonimne poruke s log-om za moderatore.' },
  birthdays: { name: 'Rođendani', icon: 'cake', group: 'Zajednica', desc: 'Čestitke i rođendanska uloga za taj dan.' },
  tempvoice: { name: 'Privremeni voice', icon: 'mic', group: 'Voice', desc: 'Uđi u kanal → dobij vlastiti voice kanal.' },
  serverstats: { name: 'Statistika kanali', icon: 'chart', group: 'Voice', desc: 'Voice kanali koji prikazuju broj članova, botova, boostova.' },
  reminders: { name: 'Podsjetnici', icon: 'clock', group: 'Alati', desc: '/remind za osobne podsjetnike.' },
  afk: { name: 'AFK', icon: 'moon', group: 'Alati', desc: 'AFK status s automatskim odgovorom na tagove.' },
  notifications: { name: 'Obavijesti (YouTube/RSS)', icon: 'bell', group: 'Alati', desc: 'Novi YouTube videi i RSS objave u kanal.' },
  utility: { name: 'Korisno', icon: 'wrench', group: 'Alati', desc: 'Serverinfo, userinfo, avatar, ankete, say, embed.' },
};

const ALL = Object.keys(MODULES);

const TEMPLATES = {
  allinone: { name: 'All-in-One', icon: 'sparkles', tagline: 'Sve u jednom botu', desc: 'Svi moduli uključeni. Jedan bot za cijeli server.', modules: ALL, color: '#7c5cff' },
  moderation: { name: 'Moderator', icon: 'shield', tagline: 'Sigurnost servera', desc: 'Moderacija, AutoMod, logovi i verifikacija.', modules: ['moderation', 'automod', 'logging', 'verification', 'utility'], color: '#ef4444' },
  leveling: { name: 'Leveling', icon: 'trending', tagline: 'Rangovi i XP', desc: 'XP za aktivnost, leaderboard, nagradne uloge.', modules: ['leveling', 'utility'], color: '#22c55e' },
  economy: { name: 'Ekonomija', icon: 'coins', tagline: 'Virtualna valuta', desc: 'Novac, posao, banka, shop s ulogama, kockanje.', modules: ['economy', 'fun'], color: '#eab308' },
  tickets: { name: 'Support', icon: 'ticket', tagline: 'Tiketi i podrška', desc: 'Tiket sistem s transkriptima, custom komande, sticky poruke.', modules: ['tickets', 'customcommands', 'sticky', 'utility'], color: '#3b82f6' },
  welcome: { name: 'Welcome', icon: 'hand', tagline: 'Doček članova', desc: 'Dobrodošlica, autorole, verifikacija i praćenje pozivnica.', modules: ['welcome', 'verification', 'invites', 'roles'], color: '#06b6d4' },
  giveaway: { name: 'Giveaway', icon: 'gift', tagline: 'Nagradne igre', desc: 'Giveawayi s dugmetom, reroll, više pobjednika.', modules: ['giveaways'], color: '#ec4899' },
  community: { name: 'Community', icon: 'users', tagline: 'Aktivna zajednica', desc: 'Starboard, prijedlozi, ispovijesti, brojanje, rođendani.', modules: ['starboard', 'suggestions', 'confessions', 'counting', 'birthdays', 'fun'], color: '#f97316' },
  voice: { name: 'Voice Master', icon: 'mic', tagline: 'Voice kanali', desc: 'Privremeni voice kanali i statistika kanali.', modules: ['tempvoice', 'serverstats'], color: '#8b5cf6' },
  notifier: { name: 'Notifier', icon: 'bell', tagline: 'YouTube & RSS', desc: 'Automatske obavijesti o novim videima i objavama.', modules: ['notifications'], color: '#f43f5e' },
  utility: { name: 'Utility', icon: 'wrench', tagline: 'Alati za svaki dan', desc: 'Podsjetnici, AFK, ankete, info komande, sticky poruke.', modules: ['utility', 'reminders', 'afk', 'sticky'], color: '#14b8a6' },
  roles: { name: 'Role Manager', icon: 'layers', tagline: 'Samostalne uloge', desc: 'Button role paneli i autorole.', modules: ['roles', 'welcome'], color: '#a855f7' },
  fun: { name: 'Fun', icon: 'smile', tagline: 'Zabava i igre', desc: 'Igre, brojanje, ekonomija i zabavne komande.', modules: ['fun', 'counting', 'economy'], color: '#84cc16' },
};

module.exports = { MODULES, TEMPLATES, ALL };
