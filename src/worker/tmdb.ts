// Thin TMDB v3 client. Requires a TMDB_API_KEY secret (free at
// https://www.themoviedb.org/settings/api). All calls are best-effort: on any
// error we return null so import/search degrades gracefully (no poster) rather
// than failing.

const BASE = "https://api.themoviedb.org/3";

export interface TmdbMeta {
  tmdb_id: number;
  name: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  runtime: number | null;
  total_episodes: number | null;
  genres: string[];
}

async function tmdb<T>(key: string | undefined, path: string, params: Record<string, string> = {}): Promise<T | null> {
  key = key?.trim();
  if (!key) return null;
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Support both a v3 API key (query param) and a v4 Read Access Token (JWT → Bearer).
  const isJwt = key.startsWith("eyJ");
  if (!isJwt) url.searchParams.set("api_key", key);
  try {
    const res = await fetch(url.toString(), isJwt ? { headers: { Authorization: `Bearer ${key}` } } : undefined);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function shapeTv(d: any): TmdbMeta {
  // Exclude specials (season 0) from the episode total, so a fully-watched show
  // isn't stuck "in progress" because of unwatched specials.
  const regular = (d.seasons ?? []).filter((s: any) => s.season_number > 0);
  const totalRegular = regular.reduce((n: number, s: any) => n + (s.episode_count ?? 0), 0);
  return {
    tmdb_id: d.id,
    name: d.name ?? d.original_name,
    overview: d.overview || null,
    poster_path: d.poster_path || null,
    backdrop_path: d.backdrop_path || null,
    release_date: d.first_air_date || null,
    runtime: Array.isArray(d.episode_run_time) && d.episode_run_time.length ? d.episode_run_time[0] : null,
    total_episodes: totalRegular || d.number_of_episodes || null,
    genres: (d.genres ?? []).map((g: any) => g.name),
  };
}

function shapeMovie(d: any): TmdbMeta {
  return {
    tmdb_id: d.id,
    name: d.title ?? d.original_title,
    overview: d.overview || null,
    poster_path: d.poster_path || null,
    backdrop_path: d.backdrop_path || null,
    release_date: d.release_date || null,
    runtime: d.runtime ?? null,
    total_episodes: null,
    genres: (d.genres ?? []).map((g: any) => g.name),
  };
}

const normName = (s: string) => s.toLowerCase().replace(/\(\d{4}\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const tokensOf = (s: string) => normName(s).split(" ").filter(Boolean);

/** True if the shorter token list is a contiguous run inside the longer one. */
function tokenSubsequence(a: string[], b: string[]): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (!short.length) return false;
  for (let i = 0; i + short.length <= long.length; i++) {
    if (short.every((t, j) => long[i + j] === t)) return true;
  }
  return false;
}

/** True if two titles are plausibly the same. Uses Jaccard + a token-prefix rule. */
function namesMatch(a: string, b: string): boolean {
  const ta = tokensOf(a), tb = tokensOf(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  // A short title that is a leading run of the longer one (e.g. "Weak Hero" ⊂
  // "Weak Hero Class 1") matches; a word buried mid-title (e.g. "Cream" inside
  // "The Ice Cream Girls") does not, because it's not a prefix run.
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length >= 2 && tokenSubsequence(short, long.slice(0, short.length + 1))) return true;
  const setA = new Set(ta), setB = new Set(tb);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  // Jaccard over union. 0.6 so a single shared common word (e.g. "Inside" vs
  // "Vandaag Inside", "Cream" vs "Ice Cream Girls") does NOT count as a match.
  return inter / (setA.size + setB.size - inter) >= 0.6;
}

/**
 * Resolve a title's TMDB metadata from a tvdb id, imdb id, or title search.
 * TMDB's external-ID (TVDB) mappings are sometimes wrong (e.g. tvdb 328489 →
 * "The Ice Cream Girls" instead of "Cream"), so an external-id hit is only
 * accepted when its name matches the export name. Otherwise we search by name.
 * If nothing matches, we return a name-only meta so the correct title is kept
 * without a wrong poster.
 */
export async function resolveMeta(
  key: string | undefined,
  kind: "show" | "movie",
  ids: { tvdb_id: number | null; imdb_id: string | null; name: string; watched?: number },
): Promise<TmdbMeta | null> {
  const findKind = kind === "show" ? "tv_results" : "movie_results";
  // A candidate show is rejected if TMDB says it has fewer episodes than the user
  // has watched — that means the external id mapped to the wrong (smaller) show.
  const enoughEpisodes = (m: TmdbMeta) =>
    kind === "movie" || !ids.watched || (m.total_episodes ?? 0) >= ids.watched;
  const acceptable = (m: TmdbMeta, trustName: boolean) =>
    (trustName || namesMatch(m.name, ids.name)) && enoughEpisodes(m);

  for (const ext of [
    ids.imdb_id ? { external_source: "imdb_id", id: ids.imdb_id, trust: true } : null, // imdb is reliable
    ids.tvdb_id ? { external_source: "tvdb_id", id: String(ids.tvdb_id), trust: false } : null,
  ]) {
    if (!ext) continue;
    const found = await tmdb<any>(key, `/find/${ext.id}`, { external_source: ext.external_source });
    const hit = found?.[findKind]?.[0];
    if (!hit) continue;
    const detail = await fetchDetail(key, kind, hit.id);
    if (detail && acceptable(detail, ext.trust)) return detail;
  }

  // Fallback: search by name, take the best name+episode match.
  const search = await tmdb<any>(key, `/search/${kind === "show" ? "tv" : "movie"}`, { query: ids.name });
  for (const r of (search?.results ?? []).slice(0, 5)) {
    if (!namesMatch(r.name ?? r.title ?? "", ids.name)) continue;
    const detail = await fetchDetail(key, kind, r.id);
    if (detail && acceptable(detail, false)) return detail;
  }

  // Nothing trustworthy: keep the export's own name, no poster/art.
  return { tmdb_id: 0, name: ids.name, overview: null, poster_path: null, backdrop_path: null, release_date: null, runtime: null, total_episodes: null, genres: [] };
}

async function fetchDetail(key: string | undefined, kind: "show" | "movie", id: number): Promise<TmdbMeta | null> {
  const d = await tmdb<any>(key, `/${kind === "show" ? "tv" : "movie"}/${id}`);
  if (!d) return null;
  return kind === "show" ? shapeTv(d) : shapeMovie(d);
}

export interface SearchResult {
  kind: "show" | "movie";
  tmdb_id: number;
  name: string;
  poster_path: string | null;
  release_date: string | null;
  overview: string | null;
}

/** Multi-search for the Discover/track page. */
export async function search(key: string | undefined, query: string): Promise<SearchResult[]> {
  const d = await tmdb<any>(key, "/search/multi", { query });
  if (!d?.results) return [];
  return d.results
    .filter((r: any) => r.media_type === "tv" || r.media_type === "movie")
    .map((r: any) => ({
      kind: (r.media_type === "tv" ? "show" : "movie") as "show" | "movie",
      tmdb_id: r.id,
      name: r.name ?? r.title,
      poster_path: r.poster_path || null,
      release_date: r.first_air_date ?? r.release_date ?? null,
      overview: r.overview || null,
    }))
    .slice(0, 30);
}

export { fetchDetail };

export interface SeasonData {
  season: number;
  name: string;
  episodes: { episode: number; name: string; air_date: string | null; runtime: number | null; still: string | null }[];
}

/** Full season/episode structure for a show, from TMDB. Empty if no key or not resolved. */
export async function fetchSeasons(key: string | undefined, tmdbId: number): Promise<SeasonData[]> {
  const show = await tmdb<any>(key, `/tv/${tmdbId}`);
  if (!show?.seasons) return [];
  const numbers: number[] = show.seasons.map((s: any) => s.season_number).filter((n: number) => n > 0);
  const out: SeasonData[] = [];
  for (const n of numbers) {
    const s = await tmdb<any>(key, `/tv/${tmdbId}/season/${n}`);
    if (!s?.episodes) continue;
    out.push({
      season: n,
      name: s.name ?? `Season ${n}`,
      episodes: s.episodes.map((e: any) => ({
        episode: e.episode_number,
        name: e.name ?? "",
        air_date: e.air_date || null,
        runtime: e.runtime ?? null,
        still: e.still_path || null,
      })),
    });
  }
  return out;
}
