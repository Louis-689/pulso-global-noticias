/**
 * Fuentes confiables. Pulso Global only shows outlets with public editorial
 * standards and a corrections policy: news agencies, independent public
 * broadcasters, established newspapers, investigative and exiled newsrooms,
 * fact-checkers, and official scientific bodies. State propaganda outlets
 * (RT, Sputnik, CGTN, Xinhua, TASS, PressTV, Telesur…) are excluded.
 *
 * A domain matches itself and its subdomains. To propose a change, edit this
 * list in a pull request and cite the outlet's editorial standards page.
 */
export const TRUSTED_DOMAINS = [
  // Agencies and international broadcasters
  "reuters.com", "apnews.com", "afp.com", "efe.com", "ansa.it", "dpa.com", "europapress.es",
  "bbc.com", "bbc.co.uk", "dw.com", "france24.com", "rfi.fr", "aljazeera.com", "euronews.com", "swissinfo.ch",
  "npr.org", "pbs.org", "abc.net.au", "cbc.ca", "radio-canada.ca", "nhk.or.jp", "rferl.org", "voanews.com", "rfa.org",
  "news.un.org", "who.int", "unicef.org", "unhcr.org",
  // Newspapers and magazines (English)
  "theguardian.com", "nytimes.com", "washingtonpost.com", "wsj.com", "ft.com", "economist.com", "bloomberg.com",
  "latimes.com", "usatoday.com", "cnn.com", "cbsnews.com", "nbcnews.com", "abcnews.go.com", "politico.com", "politico.eu",
  "axios.com", "independent.co.uk", "telegraph.co.uk", "thetimes.co.uk", "irishtimes.com", "theatlantic.com", "newyorker.com",
  "time.com", "propublica.org", "theconversation.com", "japantimes.co.jp", "straitstimes.com", "scmp.com",
  "thehindu.com", "indianexpress.com", "hindustantimes.com", "ndtv.com", "scroll.in", "thewire.in", "dawn.com",
  "koreaherald.com", "en.yna.co.kr", "koreajoongangdaily.joins.com", "theinitium.com", "hongkongfp.com", "caixinglobal.com",
  "haaretz.com", "timesofisrael.com", "madamasr.com", "thenationalnews.com",
  "africanews.com", "dailymaverick.co.za", "news24.com", "mg.co.za", "premiumtimesng.com", "nation.africa", "theeastafrican.co.ke",
  "kyivindependent.com", "pravda.com.ua", "meduza.io", "themoscowtimes.com", "novayagazeta.eu", "iranwire.com", "dailynk.com", "nknews.org",
  "globalvoices.org", "bellingcat.com", "occrp.org", "icij.org", "rsf.org", "cpj.org", "hrw.org", "amnesty.org",
  // Spanish and Portuguese
  "elpais.com", "elmundo.es", "rtve.es", "lavanguardia.com", "abc.es", "eldiario.es", "elconfidencial.com",
  "clarin.com", "lanacion.com.ar", "infobae.com", "pagina12.com.ar", "eltiempo.com", "elespectador.com", "semana.com",
  "eluniversal.com.mx", "milenio.com", "animalpolitico.com", "proceso.com.mx", "jornada.com.mx", "expansion.mx",
  "elcomercio.pe", "larepublica.pe", "rpp.pe", "ojo-publico.com", "idl-reporteros.pe", "gestion.pe",
  "latercera.com", "emol.com", "biobiochile.cl", "ciperchile.cl", "elmostrador.cl", "eldeber.com.bo", "primicias.ec", "elcomercio.com",
  "elfaro.net", "laprensa.hn", "prensalibre.com", "confidencial.digital", "laprensani.com", "nuevodiario.com.ni",
  "efectococuyo.com", "elpitazo.net", "talcualdigital.com", "armando.info", "elestimulo.com", "14ymedio.com", "eltoque.com",
  "elnuevoherald.com", "univision.com",   "uol.com.br", "globo.com", "estadao.com.br", "publico.pt", "rtp.pt", "expresso.pt",
  // French, German, Italian
  "lemonde.fr", "lefigaro.fr", "liberation.fr", "francetvinfo.fr", "lesechos.fr", "ledevoir.com",
  "spiegel.de", "zeit.de", "faz.net", "sueddeutsche.de", "tagesschau.de", "zdf.de", "nzz.ch", "derstandard.at",
  "corriere.it", "repubblica.it", "rainews.it", "ilsole24ore.com", "lastampa.it",
  "lexpress.fr", "lepoint.fr", "ouest-france.fr", "20minutes.fr", "tv5monde.com", "jeuneafrique.com", "theafricareport.com",
  "tagesspiegel.de", "welt.de", "stern.de", "n-tv.de", "br.de", "ndr.de", "deutschlandfunk.de",
  "ilpost.it", "agi.it", "adnkronos.com",
  "20minutos.es", "cadenaser.com", "elperiodico.com", "elcolombiano.com", "eluniverso.com", "laprensagrafica.com", "nacion.com", "elnacional.com", "cnnbrasil.com.br",
  // Other languages: Japanese, Chinese, Russian, Arabic, Persian, Hindi
  "asahi.com", "mainichi.jp", "nikkei.com", "kyodonews.net", "cna.com.tw", "twreporter.org", "zaobao.com.sg",
  "svoboda.org", "currenttime.tv", "tvrain.tv", "istories.media", "aljazeera.net", "enabbaladi.net", "raseef22.net", "radiofarda.com",
  "theglobeandmail.com", "timesofindia.indiatimes.com",
  // Fact-checkers (IFCN signatories)
  "factcheck.org", "politifact.com", "snopes.com", "fullfact.org", "maldita.es", "newtral.es", "chequeado.com",
  "colombiacheck.com", "ecuadorchequea.com", "verificado.com.mx", "aosfatos.org", "africacheck.org", "boomlive.in", "altnews.in",
  // Science, technology, climate, education
  "nature.com", "science.org", "sciencedaily.com", "newscientist.com", "scientificamerican.com", "nasa.gov", "usgs.gov",
  "techcrunch.com", "arstechnica.com", "theverge.com", "wired.com", "technologyreview.com",
  "climatechangenews.com", "carbonbrief.org", "insideclimatenews.org", "edsurge.com",
];

const TRUSTED = new Set(TRUSTED_DOMAINS);

/** The list entry a host belongs to ("mundo.bbc.co.uk" → "bbc.co.uk"), or null. */
export function trustedDomainOf(host: string): string | null {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    if (TRUSTED.has(candidate)) return candidate;
  }
  return null;
}

export function isTrustedHost(host: string): boolean {
  return trustedDomainOf(host) !== null;
}
