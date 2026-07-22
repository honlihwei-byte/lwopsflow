/** Result from OpenStreetMap Nominatim search (via our API proxy). */
export type NominatimPlace = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
};

/**
 * Search places/addresses using Nominatim (free OSM geocoder).
 * Calls our Next.js proxy so we can set User-Agent and avoid browser CORS limits.
 */
export async function searchPlaces(query: string): Promise<NominatimPlace[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "Place search failed");
  }
  return ((data as { results?: NominatimPlace[] }).results ?? []) as NominatimPlace[];
}

/** Prefer a short label for shop name from Nominatim display_name. */
export function suggestShopNameFromPlace(place: NominatimPlace): string {
  if (place.name?.trim()) return place.name.trim();
  const first = place.display_name.split(",")[0]?.trim();
  return first || place.display_name;
}
