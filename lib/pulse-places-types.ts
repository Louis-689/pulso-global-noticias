/** Public geographic features only; these records do not assert news coverage. */
export type PlaceLevel = "region" | "city" | "locality";

export type PlaceHierarchy = {
  id: string;
  name: string;
  level: "country" | "region" | "administrative";
  administrativeLevel?: number;
};

export type PlaceResult = {
  id: string;
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  type: "country" | "region" | "city" | "locality";
  /** Original GeoNames classification, not a population-based inference. */
  featureCode: string;
  countryCode: string;
  country: string;
  region: string | null;
  city: string | null;
  town: string | null;
  hierarchy: PlaceHierarchy[];
  sourceUrl: string;
  boundingBox?: { south: number; north: number; west: number; east: number };
};

export type PlacesResponse = {
  results: PlaceResult[];
  query: string;
  fetchedAt: string;
  cached: boolean;
  attribution: string;
  attributionUrl: string;
  providerUrl: string;
  coverageNote: string;
  error?: string;
};
