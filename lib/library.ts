/**
 * Biblioteca libre: outlets whose websites are publicly reported as blocked or
 * banned in at least one country. Inspired by the Uncensored Library: the
 * reporting lives here, outside the reach of the blocking jurisdiction.
 *
 * `blockedIn` lists ISO country codes from public reports (OONI, RSF, VE sin
 * Filtro, government orders). Blocking changes over time; the UI says so.
 * "EU" stands for every member state of the European Union.
 */
export type LibraryOutlet = {
  id: string;
  name: string;
  feed: string;
  home: string;
  language: string;
  blockedIn: string[];
  since: string;
  stateFunded?: boolean;
  about: { es: string; en: string };
};

export const EU_MEMBERS = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];

export const LIBRARY: LibraryOutlet[] = [
  {
    id: "meduza", name: "Meduza", feed: "https://meduza.io/rss/en/all", home: "https://meduza.io/en", language: "en",
    blockedIn: ["RU"], since: "2022",
    about: { es: "Medio ruso independiente en el exilio (Riga). Declarado «indeseable» en Rusia.", en: "Independent Russian outlet in exile (Riga). Declared “undesirable” in Russia." },
  },
  {
    id: "moscow-times", name: "The Moscow Times", feed: "https://www.themoscowtimes.com/rss/news", home: "https://www.themoscowtimes.com/", language: "en",
    blockedIn: ["RU"], since: "2022",
    about: { es: "Diario independiente en inglés sobre Rusia, bloqueado tras la invasión de Ucrania.", en: "Independent English-language daily on Russia, blocked after the invasion of Ukraine." },
  },
  {
    id: "bbc-russian", name: "BBC Русская служба", feed: "https://feeds.bbci.co.uk/russian/rss.xml", home: "https://www.bbc.com/russian", language: "ru",
    blockedIn: ["RU"], since: "2022",
    about: { es: "Servicio en ruso de la BBC.", en: "The BBC's Russian-language service." },
  },
  {
    id: "bbc-persian", name: "BBC فارسی", feed: "https://feeds.bbci.co.uk/persian/rss.xml", home: "https://www.bbc.com/persian", language: "fa",
    blockedIn: ["IR"], since: "2006",
    about: { es: "Servicio en persa de la BBC; filtrado en Irán desde hace años.", en: "The BBC's Persian service; filtered in Iran for years." },
  },
  {
    id: "bbc-chinese", name: "BBC 中文", feed: "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml", home: "https://www.bbc.com/zhongwen/simp", language: "zh",
    blockedIn: ["CN"], since: "2014",
    about: { es: "Servicio en chino de la BBC, bloqueado por el Gran Cortafuegos.", en: "The BBC's Chinese service, blocked by the Great Firewall." },
  },
  {
    id: "dw", name: "DW", feed: "https://rss.dw.com/xml/rss-en-all", home: "https://www.dw.com/en/", language: "en",
    blockedIn: ["CN", "RU"], since: "2019",
    about: { es: "Emisora pública internacional de Alemania.", en: "Germany's international public broadcaster." },
  },
  {
    id: "nyt", name: "The New York Times", feed: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", home: "https://www.nytimes.com/section/world", language: "en",
    blockedIn: ["CN"], since: "2012",
    about: { es: "Sección internacional del diario estadounidense, bloqueado en China.", en: "World section of the US daily, blocked in China." },
  },
  {
    id: "guardian", name: "The Guardian", feed: "https://www.theguardian.com/world/rss", home: "https://www.theguardian.com/world", language: "en",
    blockedIn: ["CN"], since: "2019",
    about: { es: "Diario británico; su web está bloqueada en China.", en: "British daily; its website is blocked in China." },
  },
  {
    id: "efecto-cocuyo", name: "Efecto Cocuyo", feed: "https://efectococuyo.com/feed/", home: "https://efectococuyo.com/", language: "es",
    blockedIn: ["VE"], since: "2019",
    about: { es: "Medio digital venezolano independiente, bloqueado por proveedores de Internet en Venezuela.", en: "Independent Venezuelan digital outlet, blocked by internet providers in Venezuela." },
  },
  {
    id: "el-pitazo", name: "El Pitazo", feed: "https://elpitazo.net/feed/", home: "https://elpitazo.net/", language: "es",
    blockedIn: ["VE"], since: "2019",
    about: { es: "Periodismo local venezolano; ha cambiado de dominio varias veces para esquivar bloqueos.", en: "Venezuelan local journalism; has changed domains several times to evade blocks." },
  },
  {
    id: "14ymedio", name: "14ymedio", feed: "https://www.14ymedio.com/rss/", home: "https://www.14ymedio.com/", language: "es",
    blockedIn: ["CU"], since: "2014",
    about: { es: "Primer diario digital independiente de Cuba, bloqueado en la isla desde su lanzamiento.", en: "Cuba's first independent digital daily, blocked on the island since launch." },
  },
  {
    id: "aljazeera", name: "Al Jazeera English", feed: "https://www.aljazeera.com/xml/rss/all.xml", home: "https://www.aljazeera.com/", language: "en",
    blockedIn: ["IL"], since: "2024",
    about: { es: "Cadena con sede en Catar; prohibida en Israel por la «ley Al Jazeera».", en: "Qatar-based network; banned in Israel under the “Al Jazeera law”." },
  },
  {
    id: "daily-nk", name: "Daily NK", feed: "https://www.dailynk.com/english/feed/", home: "https://www.dailynk.com/english/", language: "en",
    blockedIn: ["KP"], since: "2004",
    about: { es: "Noticias desde dentro de Corea del Norte con fuentes en el país; allí no existe Internet abierta.", en: "Reporting from inside North Korea through in-country sources; there is no open internet there." },
  },
  {
    id: "iranwire", name: "IranWire", feed: "https://iranwire.com/en/feed/", home: "https://iranwire.com/en/", language: "en",
    blockedIn: ["IR"], since: "2014",
    about: { es: "Periodistas iraníes dentro y fuera del país; filtrado en Irán.", en: "Iranian journalists inside and outside the country; filtered in Iran." },
  },
  {
    id: "confidencial", name: "Confidencial", feed: "https://confidencial.digital/feed/", home: "https://confidencial.digital/", language: "es",
    blockedIn: ["NI"], since: "2018",
    about: { es: "Diario nicaragüense independiente; su redacción fue confiscada y trabaja desde el exilio en Costa Rica.", en: "Independent Nicaraguan outlet; its newsroom was seized and it works from exile in Costa Rica." },
  },
  {
    id: "global-voices", name: "Global Voices", feed: "https://globalvoices.org/feed/", home: "https://globalvoices.org/", language: "en",
    blockedIn: [], since: "",
    about: { es: "Red global de periodistas ciudadanos que documenta censura y derechos digitales.", en: "Global network of citizen journalists documenting censorship and digital rights." },
  },
];

/** Expand the "EU" marker into member states for the map. */
export function blockingCountries(outlet: Pick<LibraryOutlet, "blockedIn">): string[] {
  return outlet.blockedIn.flatMap((code) => code === "EU" ? EU_MEMBERS : [code]);
}

/** Alternative routes to reach an article when the original domain is blocked. */
export function accessRoutes(url: string, targetLanguage: string) {
  const routes: Array<{ id: "original" | "archive" | "archive-today" | "translate"; href: string }> = [{ id: "original", href: url }];
  routes.push({ id: "archive", href: `https://web.archive.org/web/${url}` });
  routes.push({ id: "archive-today", href: `https://archive.ph/newest/${url}` });
  const proxied = translateProxyUrl(url, targetLanguage);
  if (proxied) routes.push({ id: "translate", href: proxied });
  return routes;
}

/** Google Translate's page proxy (`*.translate.goog`) also serves the page from Google's domain. */
export function translateProxyUrl(url: string, targetLanguage: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const host = parsed.hostname.replace(/-/g, "--").replace(/\./g, "-");
    const proxied = new URL(`https://${host}.translate.goog${parsed.pathname}`);
    parsed.searchParams.forEach((value, key) => proxied.searchParams.append(key, value));
    proxied.searchParams.set("_x_tr_sl", "auto");
    proxied.searchParams.set("_x_tr_tl", targetLanguage);
    proxied.searchParams.set("_x_tr_hl", targetLanguage);
    return proxied.href;
  } catch {
    return null;
  }
}
