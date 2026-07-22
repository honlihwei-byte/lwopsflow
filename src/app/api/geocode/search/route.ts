import { NextResponse } from "next/server";

const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
/** Nominatim requires a valid User-Agent identifying the app (usage policy). */
const USER_AGENT = "PunchCardSystem/1.0 (shop-admin-geocode)";

type NominatimRaw = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
};

/**
 * Proxy to OpenStreetMap Nominatim search (free, no Google billing).
 * Keeps User-Agent server-side and returns JSON the admin UI can consume.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  try {
    const nominatimUrl = new URL(NOMINATIM_SEARCH);
    nominatimUrl.searchParams.set("q", q);
    nominatimUrl.searchParams.set("format", "json");
    nominatimUrl.searchParams.set("limit", "6");
    nominatimUrl.searchParams.set("addressdetails", "0");

    const res = await fetch(nominatimUrl.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      // Nominatim asks clients to cache; short revalidate is enough for admin typing.
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error("Nominatim error", res.status, await res.text());
      return NextResponse.json({ error: "Geocoding service unavailable" }, { status: 502 });
    }

    const raw = (await res.json()) as NominatimRaw[];
    const results = raw.map((r) => ({
      place_id: r.place_id,
      display_name: r.display_name,
      lat: r.lat,
      lon: r.lon,
      name: r.name,
    }));

    return NextResponse.json({ results });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Geocoding search failed" }, { status: 500 });
  }
}
