import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";
import countryData from "./country-data.json";

export type PulseCountry = { code: string; name: string; lat: number; lng: number };
export type WorldFeature = {
  type: "Feature";
  id?: string | number;
  properties: { name: string; code: string; spanishName: string };
  geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };
};

export const countries: PulseCountry[] = countryData
  .map((country) => ({
    code: country.code,
    name: country.name,
    lat: country.lat,
    lng: country.lng,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "es"));

const numericCountries = new Map(countryData.filter((country) => country.numeric).map((country) => [String(Number(country.numeric)), country]));
const namedCountries = new Map(countryData.map((country) => [country.commonEnglish.toLowerCase(), country]));
const atlasFeatures = feature(
  worldAtlas as unknown as Parameters<typeof feature>[0],
  worldAtlas.objects.countries as unknown as Parameters<typeof feature>[1],
) as unknown as { features: WorldFeature[] };

export const worldFeatures: WorldFeature[] = atlasFeatures.features.map((item) => {
  const country = numericCountries.get(String(Number(item.id))) || namedCountries.get(item.properties.name.toLowerCase());
  return {
    ...item,
    properties: {
      ...item.properties,
      code: country?.code || "",
      spanishName: country?.name || item.properties.name,
    },
  };
});

/** Local, equirectangular map. Unwrap rings so the date line never draws a stripe across the world. */
export function worldFeaturePath(item: WorldFeature): string {
  const polygons = item.geometry.type === "Polygon" ? [item.geometry.coordinates] : item.geometry.coordinates;
  return polygons.flatMap((polygon) => [-360, 0, 360].map((offset) => polygon.map((ring) => {
    let previousLongitude = ring[0]?.[0] || 0;
    return ring.map(([longitude, latitude], index) => {
      let unwrapped = longitude;
      while (unwrapped - previousLongitude > 180) unwrapped -= 360;
      while (unwrapped - previousLongitude < -180) unwrapped += 360;
      previousLongitude = unwrapped;
      const x = ((unwrapped + offset + 180) / 360) * 1000;
      const y = ((90 - latitude) / 180) * 500;
      return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ") + "Z";
  }).join(" "))).join(" ");
}
