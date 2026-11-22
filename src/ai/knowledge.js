// Knowledge base for the AI support agent, generated from the live catalog so it never drifts.
const { MODULES, TEMPLATES } = require('../modules');
const plans = require('../plans');
const config = require('../config');

const FAQ = [
  ['Kako napraviti bota', 'U dashboardu otvori "Novi bot". U Discord Developer Portalu napravi aplikaciju, u Bot tabu uključi "Server Members Intent" i "Message Content Intent", klikni Reset Token i kopiraj token. Zalijepi token, odaberi predložak i bot je odmah online. Zatim ga dodaj na server gumbom "Dodaj na server".'],
  ['Bot je offline ili se ne pokreće', 'Najčešći razlog: u Developer Portalu (Bot tab) nisu uključena oba intenta — "Server Members Intent" i "Message Content Intent". Drugi razlog: token je resetiran; tada unesi novi token u Postavke bota. Konzola bota pokazuje točnu grešku.'],
  ['Bot je pauziran', 'Bot se pauzira kad pretplata nije aktivna (npr. nakon povrata novca, storniranja ili isteka). Botovi iznad limita besplatnog paketa se zaustave. Čim obnoviš pretplatu, pauzirani botovi se vrate i ponovo pokrenu automatski.'],
  ['Koliko botova mogu imati', `Free paket: ${plans.free.maxBots} bot. Pro: ${plans.pro.maxBots} botova. Business: ${plans.business.maxBots} botova. Paket mijenjaš na stranici Cijene.`],
  ['Kako promijeniti ime ili avatar bota', 'U Postavke bota promijeniš ime i daš URL slike za avatar. Discord dopušta promjenu imena otprilike dvaput na sat.'],
  ['Je li moj token siguran', 'Token se sprema šifriran (AES-256-GCM) i nikad se ne prikazuje u dashboardu. Možeš ga resetirati u Developer Portalu kad god želiš.'],
  ['Mogu li jednog bota koristiti na više servera', 'Da. Svaki server ima svoje, potpuno odvojene postavke, XP, novac i statistiku.'],
  ['Jezik bota', 'Svaki server bira jezik bota na stranici Općenito. Slash komande se automatski prevode prema jeziku Discord klijenta korisnika.'],
  ['Povrat novca i otkazivanje', 'Pretplatu otkazuješ ili tražiš povrat preko gumba "Upravljaj pretplatom" na stranici Cijene/Naplata. Nakon povrata ili otkazivanja paket pada na Free, a botovi iznad limita se pauziraju dok ponovo ne platiš.'],
  ['Slash komande se ne pojavljuju', 'Globalne slash komande znaju kasniti do sat vremena prvi put. Provjeri i je li modul te komande uključen u "Moduli".'],
];

function build() {
  const mods = Object.values(MODULES).map((m) => `- ${m.name}: ${m.desc}`).join('\n');
  const tpls = Object.values(TEMPLATES).map((t) => `- ${t.name}: ${t.desc}`).join('\n');
  const pl = Object.values(plans).map((p) => `- ${p.name} (${p.price}/${p.period}): do ${p.maxBots} bota`).join('\n');
  const faq = FAQ.map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n');
  return `Ovo je platforma "${config.brand}" na kojoj korisnici sami prave Discord botove bez kodiranja: prijave se Discordom, odaberu gotovog bota (predložak), zalijepe token svog bota i platforma ga hosta 24/7.

PAKETI:
${pl}

PREDLOŠCI BOTOVA:
${tpls}

MODULI:
${mods}

ČESTA PITANJA:
${faq}`;
}

module.exports = { build, FAQ };
