import type { SeasonData } from "./tmdb";

// TheTVDB v4 client — used as a fallback source of season/episode metadata.
// The exports are TVDB-based, so TVDB's season/episode numbering matches the
// stored episodes exactly (unlike TMDB, which sometimes flattens seasons or has
// the wrong episode count). Requires a free TVDB_API_KEY (thetvdb.com/dashboard).

const BASE = "https://api4.thetvdb.com/v4";
const ART = "https://artworks.thetvdb.com";

// Cache the bearer token for the lifetime of the Worker isolate (valid ~1 month).
let cachedToken: { token: string; at: number } | null = null;

async function login(apikey: string): Promise<string | null> {
  if (cachedToken && Date.now() - cachedToken.at < 12 * 3600_000)
    return cachedToken.token;
  try {
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    const token = j?.data?.token;
    if (token) cachedToken = { token, at: Date.now() };
    return token ?? null;
  } catch {
    return null;
  }
}

const img = (p: string | null | undefined): string | null =>
  !p ? null : p.startsWith("http") ? p : ART + p;

export interface TvdbSeries {
  name: string;
  overview: string | null;
  poster_path: string | null;
  first_air_date: string | null;
}

/**
 * Basic series record from TVDB — used as a metadata fallback when a title isn't
 * on TMDB at all (poster URLs are already absolute, so they render as-is).
 */
export async function fetchTvdbSeries(
  apikey: string | undefined,
  tvdbId: number,
): Promise<TvdbSeries | null> {
  if (!apikey) return null;
  const token = await login(apikey);
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}/series/${tvdbId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const d = ((await res.json()) as any)?.data;
    if (!d) return null;
    return {
      name: d.name ?? "",
      overview: d.overview ?? null,
      poster_path: img(d.image),
      first_air_date: d.firstAired || null,
    };
  } catch {
    return null;
  }
}

/** Full season/episode structure for a show from TVDB (official season order). */
export async function fetchTvdbSeasons(
  apikey: string | undefined,
  tvdbId: number,
): Promise<SeasonData[]> {
  if (!apikey) return [];
  const token = await login(apikey);
  if (!token) return [];
  const bySeason = new Map<number, SeasonData>();
  let page = 0;
  try {
    while (page < 20) {
      // Request English episode names/overviews; TVDB falls back to the series'
      // default language for any episode without an English translation.
      const res = await fetch(
        `${BASE}/series/${tvdbId}/episodes/official/eng?page=${page}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) break;
      const j = (await res.json()) as any;
      const eps: any[] = j?.data?.episodes ?? [];
      for (const e of eps) {
        const s = e.seasonNumber;
        if (s == null || s <= 0) continue; // skip specials
        if (!bySeason.has(s))
          bySeason.set(s, { season: s, name: `Season ${s}`, episodes: [] });
        bySeason.get(s)!.episodes.push({
          episode: e.number,
          name: e.name ?? "",
          air_date: e.aired || null,
          runtime: e.runtime ?? null,
          still: img(e.image),
        });
      }
      if (!j?.links?.next) break;
      page++;
    }
  } catch {
    return [];
  }
  return [...bySeason.values()]
    .map((s) => ({
      ...s,
      episodes: s.episodes.sort((a, b) => a.episode - b.episode),
    }))
    .sort((a, b) => a.season - b.season);
}
