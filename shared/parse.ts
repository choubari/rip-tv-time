// Pure parsing logic for TV Time exports. No Worker/DOM APIs so it can be unit
// tested in Node. Accepts the decompressed files from either (or both) of:
//   - tv-time-export.zip  (JSON: shows.json, movies.json, favorites.json, lists.json)  ← preferred
//   - gdpr-data.zip       (CSV: user_personal_data.csv, user_show_special_status.csv, …)
//
// It produces a normalized ParsedImport that the Worker turns into DB rows.

import type { ParsedImport, ParsedTitle, Status } from "./types";

export type FileMap = Record<string, string>; // filename (basename) -> text contents

const SHOW_STATUS: Record<string, Status> = {
  continuing: "watching",
  up_to_date: "up_to_date",
  watch_later: "watch_later",
  not_started_yet: "not_started",
  stopped: "stopped",
};

function toIso(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.startsWith("0000")) return null;
  const d = new Date(t.includes("T") ? t : t.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

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
  const byKey = new Map<string, ParsedTitle>(); // dedupe key -> title
  const keyOf = (t: ParsedTitle) =>
    t.tvdb_id ? `tvdb:${t.kind}:${t.tvdb_id}` : t.imdb_id ? `imdb:${t.kind}:${t.imdb_id}` : `name:${t.kind}:${t.name.toLowerCase()}`;

  const add = (t: ParsedTitle) => {
    const k = keyOf(t);
    const existing = byKey.get(k);
    if (existing) {
      existing.is_favorite ||= t.is_favorite;
      if (t.watched_episodes.length > existing.watched_episodes.length) existing.watched_episodes = t.watched_episodes;
      return existing;
    }
    byKey.set(k, t);
    titles.push(t);
    return t;
  };

  const parseShow = (s: any, favorite = false): ParsedTitle => {
    const { tvdb, imdb } = pickId(s.id);
    const eps: ParsedTitle["watched_episodes"] = [];
    let last: string | null = null;
    for (const season of s.seasons ?? []) {
      for (const ep of season.episodes ?? []) {
        if (ep.is_watched) {
          const w = toIso(ep.watched_at);
          eps.push({ season: season.number, episode: ep.number, watched_at: w, rating: ep.rating ?? null });
          if (w && (!last || w > last)) last = w;
        }
      }
    }
    return {
      kind: "show",
      uuid: s.uuid ?? null,
      tvdb_id: tvdb,
      imdb_id: imdb,
      name: s.title ?? "Untitled",
      status: SHOW_STATUS[s.status] ?? (eps.length ? "watching" : "not_started"),
      is_favorite: favorite,
      rating: s.rating ?? null,
      added_at: toIso(s.created_at),
      last_watched_at: last,
      watched_episodes: eps,
    };
  };

  const parseMovie = (m: any): ParsedTitle => {
    const { tvdb, imdb } = pickId(m.id);
    return {
      kind: "movie",
      uuid: m.uuid ?? null,
      tvdb_id: tvdb,
      imdb_id: imdb,
      name: m.title ?? "Untitled",
      status: m.is_watched ? "watched" : "watch_later",
      is_favorite: false,
      rating: m.rating ?? null,
      added_at: toIso(m.created_at ?? m.added_at),
      last_watched_at: toIso(m.watched_at),
      watched_episodes: [],
    };
  };

  // --- Preferred source: tv-time-export JSON ---
  const shows = safeJson<any[]>(files, "shows.json");
  if (Array.isArray(shows)) shows.forEach((s) => add(parseShow(s)));

  const movies = safeJson<any[]>(files, "movies.json");
  if (Array.isArray(movies)) movies.forEach((m) => add(parseMovie(m)));

  const favorites = safeJson<any>(files, "favorites.json");
  if (favorites) {
    (favorites.shows ?? []).forEach((s: any) => add(parseShow(s, true)));
    (favorites.movies ?? []).forEach((m: any) => { add({ ...parseMovie(m), is_favorite: true }); });
  }

  // Watch-later movies from lists ("list_movies_"-style lists in the JSON export).
  const lists = safeJson<any[]>(files, "lists.json");
  if (Array.isArray(lists)) {
    for (const list of lists) {
      for (const m of list.movies ?? []) {
        const t = add(parseMovie({ ...m, is_watched: false }));
        if (t.status === "not_started") t.status = "watch_later";
      }
    }
  }

  // --- GDPR CSVs: profile + extra statuses (merge, don't override richer JSON) ---
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

  const special = files["user_show_special_status.csv"];
  if (special) {
    for (const row of parseCsv(special)) {
      if (row.status === "for_later" && row.tv_show_name) {
        const key = `name:show:${row.tv_show_name.toLowerCase()}`;
        const t = byKey.get(key);
        if (t && t.status === "not_started") t.status = "watch_later";
        else if (!t) {
          add({
            kind: "show", uuid: null, tvdb_id: null, imdb_id: null, name: row.tv_show_name,
            status: "watch_later", is_favorite: false, rating: null,
            added_at: toIso(row.created_at), last_watched_at: null, watched_episodes: [],
          });
        }
      }
    }
  }

  return { profile, titles };
}
