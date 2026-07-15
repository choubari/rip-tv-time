// Pure parsing logic for TV Time exports. No Worker/DOM APIs so it can be unit
// tested in Node. Accepts the decompressed files from either (or both) of:
//   - tv-time-export.zip  (JSON: shows.json, movies.json, favorites.json, lists.json)
//   - gdpr-data.zip       (CSV: tracking-prod-records-v2.csv, tracking-prod-records.csv,
//                          user_personal_data.csv, user_show_special_status.csv, …)
//
// Strategy: the JSON export is richer (per-episode watch dates + precise statuses),
// so when present it is authoritative. The GDPR export carries real runtimes and is
// the *only* source if you didn't use the third-party tool — so it is fully parsed
// as a fallback, and always used to enrich runtimes + profile.

import type { ParsedImport, ParsedList, ParsedTitle, Status } from "./types";

export type FileMap = Record<string, string>; // filename (basename) -> text contents

// TV Time's own status is authoritative — trust it rather than guessing from
// episode counts (TVDB episode totals are often padded/wrong).
const SHOW_STATUS: Record<string, Status> = {
  up_to_date: "finished", // caught up — watched everything aired
  continuing: "watching", // actively following an airing show
  watch_later: "watch_next",
  not_started_yet: "not_started",
  stopped: "stopped",
};

function toIso(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s.startsWith("0000")) return null;
  // Epoch microseconds/milliseconds (GDPR `followed_at` etc.)
  if (/^\d{13,}$/.test(s)) {
    const ms = s.length > 13 ? Number(s.slice(0, 13)) : Number(s);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const secToMin = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n / 60) : null;
};

function pickId(id: any): { tvdb: number | null; imdb: string | null } {
  const tvdb = id && typeof id.tvdb === "number" && id.tvdb > 0 ? id.tvdb : null;
  const imdb = id && typeof id.imdb === "string" && id.imdb !== "-1" ? id.imdb : null;
  return { tvdb, imdb };
}

/** Minimal RFC-4180-ish CSV parser (handles quoted fields, commas, newlines). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* ignore */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function safeJson<T>(files: FileMap, name: string): T | null {
  const raw = files[name];
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function parseExport(files: FileMap): ParsedImport {
  const titles: ParsedTitle[] = [];
  const byKey = new Map<string, ParsedTitle>();
  const keyOf = (t: Pick<ParsedTitle, "kind" | "tvdb_id" | "imdb_id" | "name">) =>
    t.tvdb_id ? `tvdb:${t.kind}:${t.tvdb_id}` : t.imdb_id ? `imdb:${t.kind}:${t.imdb_id}` : `name:${t.kind}:${t.name.toLowerCase()}`;

  const add = (t: ParsedTitle) => {
    const k = keyOf(t);
    const existing = byKey.get(k);
    if (existing) {
      existing.is_favorite ||= t.is_favorite;
      // Union watched episodes across sources (JSON + GDPR), filling runtimes.
      const seen = new Map(existing.watched_episodes.map((e) => [`${e.season}:${e.episode}`, e]));
      for (const e of t.watched_episodes) {
        const kk = `${e.season}:${e.episode}`;
        const ex = seen.get(kk);
        if (!ex) { existing.watched_episodes.push(e); seen.set(kk, e); }
        else if (ex.runtime == null && e.runtime != null) ex.runtime = e.runtime;
      }
      if (t.last_watched_at && (!existing.last_watched_at || t.last_watched_at > existing.last_watched_at)) existing.last_watched_at = t.last_watched_at;
      if (existing.runtime == null) existing.runtime = t.runtime;
      if (existing.total_episodes == null && t.total_episodes != null) existing.total_episodes = t.total_episodes;
      if (t.status === "finished" && existing.status === "watch_next") existing.status = "finished";
      return existing;
    }
    byKey.set(k, t);
    titles.push(t);
    return t;
  };

  // ------------------------------------------------ tv-time-export JSON
  const parseShow = (s: any, favorite = false): ParsedTitle => {
    const { tvdb, imdb } = pickId(s.id);
    const eps: ParsedTitle["watched_episodes"] = [];
    let last: string | null = null;
    let totalRegular = 0; // full episode count (season > 0) from the export itself
    for (const season of s.seasons ?? []) {
      if (season.number > 0) totalRegular += (season.episodes ?? []).length;
      for (const ep of season.episodes ?? []) {
        if (ep.is_watched) {
          const w = toIso(ep.watched_at);
          eps.push({ season: season.number, episode: ep.number, watched_at: w, rating: ep.rating ?? null, runtime: null });
          if (w && (!last || w > last)) last = w;
        }
      }
    }
    return {
      kind: "show", uuid: s.uuid ?? null, tvdb_id: tvdb, imdb_id: imdb, name: s.title ?? "Untitled",
      status: SHOW_STATUS[s.status] ?? (eps.length ? "watching" : "not_started"),
      is_favorite: favorite, rating: s.rating ?? null, runtime: null, total_episodes: totalRegular || null,
      added_at: toIso(s.created_at), last_watched_at: last, watched_episodes: eps,
    };
  };

  const parseMovie = (m: any): ParsedTitle => {
    const { tvdb, imdb } = pickId(m.id);
    return {
      kind: "movie", uuid: m.uuid ?? null, tvdb_id: tvdb, imdb_id: imdb, name: m.title ?? "Untitled",
      status: m.is_watched ? "finished" : "watch_next", is_favorite: false, rating: m.rating ?? null,
      // `added_at` is when the movie was added to the watchlist (real order);
      // `created_at` on list items is just the export-render time. Prefer added_at.
      runtime: m.runtime ?? null, added_at: toIso(m.added_at ?? m.created_at), last_watched_at: toIso(m.watched_at), watched_episodes: [],
    };
  };

  const jsonShows = safeJson<any[]>(files, "shows.json");
  const hasJsonShows = Array.isArray(jsonShows) && jsonShows.length > 0;
  if (hasJsonShows) jsonShows!.forEach((s) => add(parseShow(s)));

  const jsonMovies = safeJson<any[]>(files, "movies.json");
  const hasJsonMovies = Array.isArray(jsonMovies) && jsonMovies.length > 0;
  if (hasJsonMovies) jsonMovies!.forEach((m) => add(parseMovie(m)));

  const favorites = safeJson<any>(files, "favorites.json");
  if (favorites) {
    (favorites.shows ?? []).forEach((s: any) => add(parseShow(s, true)));
    (favorites.movies ?? []).forEach((m: any) => add({ ...parseMovie(m), is_favorite: true }));
  }

  const listMovies = safeJson<any[]>(files, "lists.json");
  if (Array.isArray(listMovies)) {
    for (const list of listMovies) {
      for (const m of list.movies ?? []) {
        const t = add(parseMovie({ ...m, is_watched: false }));
        if (t.status === "not_started") t.status = "watch_next";
      }
    }
  }

  // ------------------------------------------------ GDPR CSVs
  const profile: ParsedImport["profile"] = {};
  const personal = files["user_personal_data.csv"];
  if (personal) {
    for (const row of parseCsv(personal)) {
      if (row.name === "bio" && row.value) profile.bio = row.value;
      if (row.name === "cover" && row.value) profile.cover_url = row.value;
    }
  }
  const userCsv = files["user.csv"];
  if (userCsv) {
    const u = parseCsv(userCsv)[0];
    if (u?.name && u.name !== u.id) profile.name = u.name;
  }
  // Display name + avatar come from the social profile (screen_name / picture_url).
  const social = files["user_social_data.csv"];
  if (social) {
    const s = parseCsv(social)[0];
    if (s?.screen_name) profile.name = s.screen_name;
    if (s?.picture_url) profile.avatar_url = s.picture_url;
  }

  // The v2 tracking table: one row per watched episode + one "user-series-*" row per show.
  const v2 = files["tracking-prod-records-v2.csv"];
  if (v2) {
    const rows = parseCsv(v2);
    const showRows = rows.filter((r) => !r.episode_number && (r.s_id || r.series_name) && !r.movie_name);
    const epRows = rows.filter((r) => r.episode_number);

    // Group watched episodes by show tvdb id.
    const epsByShow = new Map<string, ParsedTitle["watched_episodes"]>();
    const lastByShow = new Map<string, string | null>();
    for (const e of epRows) {
      const sid = e.s_id || e.series_name;
      if (!sid) continue;
      const list = epsByShow.get(sid) ?? [];
      const w = toIso(e.created_at);
      list.push({ season: Number(e.season_number) || 1, episode: Number(e.episode_number) || 0, watched_at: w, rating: null, runtime: secToMin(e.runtime) });
      epsByShow.set(sid, list);
      const prev = lastByShow.get(sid);
      if (w && (!prev || w > prev)) lastByShow.set(sid, w);
    }

    const gdprStatus = (r: Record<string, string>, watchedCount: number): Status =>
      r.is_archived === "true" ? "stopped"
        : r.is_for_later === "true" ? "watch_next"
        : watchedCount > 0 ? "watching"
        : "not_started";

    // Build every GDPR show and merge it in. add() unions watched episodes into a
    // matching JSON show (or creates the show if the JSON export missed it), so we
    // get the most complete watch history from both sources.
    for (const r of showRows) {
      const sid = r.s_id;
      const tvdb = sid && /^\d+$/.test(sid) ? Number(sid) : null;
      const eps = (sid && epsByShow.get(sid)) || (r.series_name && epsByShow.get(r.series_name)) || [];
      const seen = new Set<string>(); // de-dup repeated (season, episode) rows (rewatches)
      const uniqueEps = eps.filter((e) => { const k = `${e.season}:${e.episode}`; if (seen.has(k)) return false; seen.add(k); return true; });
      const candidate: ParsedTitle = {
        kind: "show", uuid: r.uuid ?? null, tvdb_id: tvdb, imdb_id: null, name: r.series_name || "Untitled",
        status: gdprStatus(r, uniqueEps.length), is_favorite: false, rating: null, runtime: null,
        added_at: toIso(r.followed_at || r.created_at), last_watched_at: lastByShow.get(sid || r.series_name) ?? null,
        watched_episodes: uniqueEps,
      };
      const existed = byKey.has(keyOf(candidate));
      const t = add(candidate);
      // Only set status from GDPR for shows NOT already described by the richer
      // JSON export (whose TV Time status is authoritative).
      if (!existed) {
        if (r.is_archived === "true") t.status = "stopped";
        else if (r.is_for_later === "true" && t.status === "not_started") t.status = "watch_next";
      }
    }
  }

  // Movies from GDPR (only if the JSON export didn't provide them).
  const recs = files["tracking-prod-records.csv"];
  if (recs && !hasJsonMovies) {
    for (const r of parseCsv(recs)) {
      if (r.entity_type !== "movie" || !r.movie_name) continue;
      if (r.type !== "watch" && r.type !== "towatch") continue;
      add({
        kind: "movie", uuid: r.uuid ?? null, tvdb_id: null, imdb_id: null, name: r.movie_name,
        status: r.type === "watch" ? "finished" : "watch_next", is_favorite: false, rating: null,
        runtime: secToMin(r.runtime), added_at: toIso(r.created_at),
        last_watched_at: r.type === "watch" ? toIso(r.created_at) : null, watched_episodes: [],
      });
    }
  }

  // Extra "watch later" statuses (GDPR).
  const special = files["user_show_special_status.csv"];
  if (special) {
    for (const row of parseCsv(special)) {
      if (row.status === "for_later" && row.tv_show_name) {
        const key = `name:show:${row.tv_show_name.toLowerCase()}`;
        const t = byKey.get(key);
        if (t && t.status === "not_started") t.status = "watch_next";
      }
    }
  }

  // Favorites from GDPR (the JSON favorites.json is handled above).
  const utsd = files["user_tv_show_data.csv"];
  if (utsd) {
    for (const row of parseCsv(utsd)) {
      if (row.is_favorited === "1" && row.tv_show_id) {
        const t = byKey.get(`tvdb:show:${row.tv_show_id}`);
        if (t) t.is_favorite = true;
      }
    }
  }

  // ------------------------------------------------ Lists
  const lists: ParsedImport["lists"] = [];
  const seenList = new Set<string>();
  const jsonLists = safeJson<any[]>(files, "lists.json");
  if (Array.isArray(jsonLists)) {
    for (const l of jsonLists) {
      const items: ParsedList["items"] = [];
      for (const s of l.shows ?? []) { const { tvdb, imdb } = pickId(s.id); items.push({ kind: "show", tvdb_id: tvdb, imdb_id: imdb, name: s.title ?? "Untitled" }); }
      for (const m of l.movies ?? []) { const { tvdb, imdb } = pickId(m.id); items.push({ kind: "movie", tvdb_id: tvdb, imdb_id: imdb, name: m.title ?? "Untitled" }); }
      const name = (l.name ?? "").trim() || "Untitled list";
      if (items.length && !seenList.has(name)) { seenList.add(name); lists.push({ name, items }); }
    }
  }

  return { profile, titles, lists };
}
