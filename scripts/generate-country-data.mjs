import { writeFile } from "node:fs/promises";
import countries from "world-countries";

const output = countries.map((country) => ({
  code: country.cca2,
  numeric: country.ccn3 || "",
  name: country.translations.spa?.common || country.name.common,
  commonEnglish: country.name.common,
  officialEnglish: country.name.official,
  officialSpanish: country.translations.spa?.official || "",
  lat: country.latlng[0],
  lng: country.latlng[1],
}));

await writeFile(new URL("../lib/country-data.json", import.meta.url), `${JSON.stringify(output)}\n`, "utf8");
