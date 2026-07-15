import type { Env } from "./types";
import type { ParsedImport, LibraryItem, Stats, Status, TitleMeta } from "../../shared/types";
import { effectiveStatus } from "../../shared/types";
import { resolveMeta, fetchDetail, lastAiredEpisode } from "./tmdb";

// Stable title id derived from external ids, so the row keeps the same id before
// and after TMDB resolution (library rows never need rewriting). The name-based
// fallback hashes the full name (not a slug) so non-Latin titles (JP/KR/AR) stay
// unique instead of collapsing to the same stripped string.
function nameHash(name: string): string {
  let h = 5381;
  const s = name.toLowerCase().trim();
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function titleId(t: { kind: string; tvdb_id: number | null; imdb_id: string | null; name: string }): string {
  if (t.tvdb_id) return `tvdb:${t.kind}:${t.tvdb_id}`;
  if (t.imdb_id) return `imdb:${t.kind}:${t.imdb_id}`;
  return `name:${t.kind}:${nameHash(t.name)}`;
}

const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

/** Wipe a user's library and reseed it from a parsed export. */
export async function seedImport(env: Env, userId: string, data: ParsedImport): Promise<{ titles: number; episodes: number }> {
  const p = data.profile;
  if (p.name || p.bio || p.cover_url || p.avatar_url) {
    await env.DB.prepare("UPDATE users SET name = COALESCE(?, name), bio = COALESCE(?, bio), cover_url = COALESCE(?, cover_url), avatar_url = COALESCE(?, avatar_url) WHERE id = ?")
      .bind(p.name ?? null, p.bio ?? null, p.cover_url ?? null, p.avatar_url ?? null, userId)
      .run();
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE user_id = ?)").bind(userId),
    env.DB.prepare("DELETE FROM lists WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM watched_episodes WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM library WHERE user_id = ?").bind(userId),
  ]);

  let episodes = 0;
  for (const group of chunk(data.titles, 50)) {
    const stmts: D1PreparedStatement[] = [];
    for (const t of group) {
      const id = titleId(t);
      stmts.push(
        env.DB.prepare(
          // On re-import, force shows to re-resolve their episode total (so the
          // specials-excluding fix and newly-aired episodes are picked up) while
          // keeping the existing poster until the refresh lands.
          // total_episodes + runtime come from the export (authoritative). Keep
          // existing artwork; only re-resolve when the name changed or a poster is
          // still missing. A fresh (empty) DB resolves everything correctly on
          // first import, so we don't re-fetch on every re-import.
          `INSERT INTO titles (id, kind, tvdb_id, imdb_id, name, runtime, total_episodes) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             runtime = COALESCE(titles.runtime, excluded.runtime),
             total_episodes = COALESCE(excluded.total_episodes, titles.total_episodes),
             poster_path = CASE WHEN titles.name <> excluded.name THEN NULL ELSE titles.poster_path END,
             backdrop_path = CASE WHEN titles.name <> excluded.name THEN NULL ELSE titles.backdrop_path END,
             resolve_failed = CASE WHEN titles.name <> excluded.name OR titles.poster_path IS NULL THEN 0 ELSE titles.resolve_failed END`,
        ).bind(id, t.kind, t.tvdb_id, t.imdb_id, t.name, t.runtime, t.total_episodes ?? null),
      );
      stmts.push(
        env.DB.prepare(
          `INSERT INTO library (user_id, title_id, kind, status, is_favorite, rating, added_at, last_watched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, title_id) DO UPDATE SET status=excluded.status, is_favorite=excluded.is_favorite`,
        ).bind(userId, id, t.kind, t.status, t.is_favorite ? 1 : 0, t.rating, t.added_at, t.last_watched_at),
      );
      for (const e of t.watched_episodes) {
        if (e.watched) episodes++;
        stmts.push(
          env.DB.prepare(
            "INSERT INTO watched_episodes (user_id, title_id, season, episode, watched, watched_at, rating, runtime) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
          ).bind(userId, id, e.season, e.episode, e.watched ? 1 : 0, e.watched_at, e.rating, e.runtime),
        );
      }
    }
    await env.DB.batch(stmts);
  }

  // Lists: ensure each item's title exists (may not be in the library), then link.
  for (const list of data.lists) {
    const res = await env.DB.prepare("INSERT INTO lists (user_id, name) VALUES (?, ?)").bind(userId, list.name).run();
    const listId = res.meta.last_row_id;
    const stmts: D1PreparedStatement[] = [];
    list.items.forEach((it, i) => {
      const id = titleId(it);
      stmts.push(env.DB.prepare("INSERT INTO titles (id, kind, tvdb_id, imdb_id, name) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(id, it.kind, it.tvdb_id, it.imdb_id, it.name));
      stmts.push(env.DB.prepare("INSERT INTO list_items (list_id, title_id, ordering) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").bind(listId, id, i));
    });
    if (stmts.length) await env.DB.batch(stmts);
  }

  // Drop orphan titles referenced by no library and no list (e.g. leftovers from
  // opening a search result that was never tracked).
  await env.DB.prepare(
    `DELETE FROM titles WHERE id NOT IN (SELECT title_id FROM library) AND id NOT IN (SELECT title_id FROM list_items)`,
  ).run();

  return { titles: data.titles.length, episodes };
}

/**
 * Cron refresh: for finished shows, ask TMDB for the latest aired episode. If it's
 * beyond what the user has watched, new episodes have aired since the export —
 * flip the show back to "watching" so it resurfaces. Also fills missing posters.
 * Processes a bounded number of shows per run to respect subrequest limits.
 */
export async function refreshNewEpisodes(env: Env, limit = 60): Promise<{ checked: number; updated: number }> {
  const key = await tmdbKey(env);
  if (!key) return { checked: 0, updated: 0 };
  const { results } = await env.DB.prepare(
    `SELECT l.rowid AS lrid, l.user_id, l.title_id, t.tmdb_id,
            (SELECT MAX(w.season * 1000 + w.episode) FROM watched_episodes w WHERE w.user_id = l.user_id AND w.title_id = l.title_id AND w.season > 0 AND w.watched = 1) AS max_watched
     FROM library l JOIN titles t ON t.id = l.title_id
     WHERE l.kind = 'show' AND l.status = 'finished' AND t.tmdb_id IS NOT NULL AND t.tmdb_id > 0
     ORDER BY l.last_watched_at DESC LIMIT ?`,
  ).bind(limit).all<{ user_id: string; title_id: string; tmdb_id: number; max_watched: number }>();

  let updated = 0;
  for (const row of results) {
    const last = await lastAiredEpisode(key, row.tmdb_id);
    if (!last) continue;
    const lastKey = last.season * 1000 + last.episode;
    if (lastKey > (row.max_watched ?? 0)) {
      await env.DB.prepare("UPDATE library SET status = 'watching' WHERE user_id = ? AND title_id = ?").bind(row.user_id, row.title_id).run();
      updated++;
    }
  }
  return { checked: results.length, updated };
}

/** The clean numeric ref (rowid) for a title's string id. */
export async function refOf(env: Env, titleId: string): Promise<number> {
  const r = await env.DB.prepare("SELECT rowid AS ref FROM titles WHERE id = ?").bind(titleId).first<{ ref: number }>();
  return r?.ref ?? 0;
}

export async function getSetting(env: Env, key: string): Promise<string | null> {
  const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(key).first<{ value: string }>();
  return r?.value ?? null;
}

export async function setSetting(env: Env, key: string, value: string): Promise<void> {
  await env.DB.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value).run();
}

/** The TMDB key from the UI setting, falling back to the TMDB_API_KEY secret. */
export async function tmdbKey(env: Env): Promise<string | undefined> {
  return (await getSetting(env, "tmdb_key")) || env.TMDB_API_KEY || undefined;
}

/** Resolve TMDB metadata for up to `limit` still-unresolved titles. Returns remaining count. */
export async function resolveBatch(env: Env, limit = 40): Promise<{ resolved: number; remaining: number }> {
  const key = await tmdbKey(env);
  const { results } = await env.DB.prepare(
    // Resolve anything still without a poster. `watched` guards against wrong
    // external-id matches (a show that maps to a smaller TMDB title).
    `SELECT t.id, t.kind, t.tvdb_id, t.imdb_id, t.name, t.runtime,
            (SELECT COUNT(DISTINCT w.season || ':' || w.episode) FROM watched_episodes w WHERE w.title_id = t.id AND w.season > 0 AND w.watched = 1) AS watched
     FROM titles t WHERE t.resolve_failed = 0 AND t.poster_path IS NULL LIMIT ?`,
  ).bind(limit).all<{ id: string; kind: "show" | "movie"; tvdb_id: number | null; imdb_id: string | null; name: string; runtime: number | null; watched: number }>();

  let resolved = 0;
  for (const row of results) {
    const meta = await resolveMeta(key, row.kind, row);
    if (meta && meta.tmdb_id > 0) {
      await env.DB.prepare(
        // Keep the export's own name, runtime + episode total (all more reliable
        // than TMDB, which e.g. drops the "(2027)" that distinguishes entries).
        // Mark resolve_failed=1 when matched but TMDB has no poster, so a
        // poster-less-but-resolved title isn't re-selected forever.
        `UPDATE titles SET tmdb_id=?, original_name=?, overview=?, poster_path=?, backdrop_path=?, release_date=?, runtime=COALESCE(runtime, ?), total_episodes=COALESCE(total_episodes, ?), genres=?, resolve_failed=?, updated_at=datetime('now') WHERE id=?`,
      ).bind(meta.tmdb_id, meta.original_name, meta.overview, meta.poster_path, meta.backdrop_path, meta.release_date, meta.runtime, meta.total_episodes, JSON.stringify(meta.genres), meta.poster_path ? 0 : 1, row.id).run();
      resolved++;
    } else {
      // No trustworthy TMDB match — keep the export name, don't retry, no wrong art.
      await env.DB.prepare("UPDATE titles SET resolve_failed = 1 WHERE id = ?").bind(row.id).run();
    }
  }
  const rem = await env.DB.prepare("SELECT COUNT(*) as c FROM titles WHERE resolve_failed = 0 AND poster_path IS NULL").first<{ c: number }>();
  await dedupeByTmdb(env); // always collapse tmdb_id duplicates (e.g. movie listed twice)
  return { resolved, remaining: rem?.c ?? 0 };
}

/**
 * Some exports list the same title under two different ids, and opening a search
 * result can create another. Once they share a tmdb_id, collapse them into the
 * canonical title — the one that actually has watch history — so the merged row
 * keeps the user's episodes and status.
 */
async function dedupeByTmdb(env: Env): Promise<void> {
  const { results: dupes } = await env.DB.prepare(
    // Canonical = the id the user actually uses: most watched episodes, then
    // most library rows (tracked), then MIN id. Keeps the tracked/watched copy.
    `SELECT t.kind, t.tmdb_id,
            (SELECT t2.id FROM titles t2
             WHERE t2.kind = t.kind AND t2.tmdb_id = t.tmdb_id
             ORDER BY (SELECT COUNT(*) FROM watched_episodes w WHERE w.title_id = t2.id AND w.watched = 1) DESC,
                      (SELECT COUNT(*) FROM library l WHERE l.title_id = t2.id) DESC,
                      t2.id ASC
             LIMIT 1) AS keep
     FROM titles t
     WHERE t.tmdb_id IS NOT NULL AND t.tmdb_id > 0
     GROUP BY t.kind, t.tmdb_id HAVING COUNT(*) > 1`,
  ).all<{ kind: string; tmdb_id: number; keep: string }>();
  for (const d of dupes) {
    const { results: others } = await env.DB.prepare(
      "SELECT id FROM titles WHERE kind = ? AND tmdb_id = ? AND id <> ?",
    ).bind(d.kind, d.tmdb_id, d.keep).all<{ id: string }>();
    for (const o of others) {
      await env.DB.batch([
        // Move any library/episode/list rows to the canonical id, then drop the dup.
        env.DB.prepare("UPDATE OR IGNORE library SET title_id = ? WHERE title_id = ?").bind(d.keep, o.id),
        env.DB.prepare("UPDATE OR IGNORE watched_episodes SET title_id = ? WHERE title_id = ?").bind(d.keep, o.id),
        env.DB.prepare("UPDATE OR IGNORE list_items SET title_id = ? WHERE title_id = ?").bind(d.keep, o.id),
        env.DB.prepare("DELETE FROM library WHERE title_id = ?").bind(o.id),
        env.DB.prepare("DELETE FROM watched_episodes WHERE title_id = ?").bind(o.id),
        env.DB.prepare("DELETE FROM list_items WHERE title_id = ?").bind(o.id),
        env.DB.prepare("DELETE FROM titles WHERE id = ?").bind(o.id),
      ]);
    }
  }
}

function rowToMeta(r: any): TitleMeta {
  return {
    id: r.id, ref: r.ref ?? r.rowid ?? 0, kind: r.kind, tmdb_id: r.tmdb_id === -1 ? null : r.tmdb_id, imdb_id: r.imdb_id, tvdb_id: r.tvdb_id,
    name: r.name, original_name: r.original_name ?? null, overview: r.overview, poster_path: r.poster_path, backdrop_path: r.backdrop_path,
    release_date: r.release_date, runtime: r.runtime, total_episodes: r.total_episodes,
    genres: r.genres ? JSON.parse(r.genres) : [],
  };
}

function rowToItem(r: any): LibraryItem {
  const base = {
    ...rowToMeta(r),
    status: (r.status ?? "not_started") as Status,
    is_favorite: !!r.is_favorite,
    rating: r.rating ?? null,
    added_at: r.added_at ?? null,
    last_watched_at: r.last_watched_at ?? null,
    episodes_watched: r.episodes_watched ?? 0,
  };
  // Grouping uses the *derived* status (watching vs paused vs finished).
  return { ...base, status: effectiveStatus(base) };
}

export async function getLibrary(env: Env, userId: string, kind?: string): Promise<LibraryItem[]> {
  const where = kind ? "AND l.kind = ?" : "";
  const stmt = env.DB.prepare(
    `SELECT t.*, t.rowid AS ref, l.status, l.is_favorite, l.rating, l.added_at, l.last_watched_at,
            (SELECT COUNT(*) FROM watched_episodes w WHERE w.user_id = l.user_id AND w.title_id = l.title_id AND w.season > 0 AND w.watched = 1) AS episodes_watched
     FROM library l JOIN titles t ON t.id = l.title_id
     WHERE l.user_id = ? ${where}
     ORDER BY l.last_watched_at DESC NULLS LAST, l.added_at DESC NULLS LAST, t.name COLLATE NOCASE ASC`,
  );
  const { results } = await (kind ? stmt.bind(userId, kind) : stmt.bind(userId)).all<any>();
  return results.map(rowToItem);
}

/** Manually attach a TMDB id to a title (by ref) and pull its artwork/metadata. */
export async function relinkTitle(env: Env, ref: number, tmdbId: number): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id, kind FROM titles WHERE rowid = ?").bind(ref).first<{ id: string; kind: "show" | "movie" }>();
  if (!row) return false;
  const meta = await fetchDetail(await tmdbKey(env), row.kind, tmdbId);
  if (!meta) return false;
  await env.DB.prepare(
    // Keep the export's own name; take episode total + everything else from TMDB
    // (the user explicitly chose this id, so trust its episode count).
    `UPDATE titles SET tmdb_id=?, original_name=?, overview=?, poster_path=?, backdrop_path=?, release_date=?, runtime=COALESCE(runtime, ?), total_episodes=?, genres=?, resolve_failed=0, updated_at=datetime('now') WHERE id=?`,
  ).bind(meta.tmdb_id, meta.original_name, meta.overview, meta.poster_path, meta.backdrop_path, meta.release_date, meta.runtime, meta.total_episodes, JSON.stringify(meta.genres), row.id).run();
  await dedupeByTmdb(env); // collapse into the copy that has the watch history
  return true;
}

/** Titles in the user's library that TMDB couldn't confidently match (no poster). */
export async function getUnmatched(env: Env, userId: string): Promise<{ ref: number; name: string; kind: string }[]> {
  const { results } = await env.DB.prepare(
    `SELECT t.rowid AS ref, t.name, t.kind FROM library l JOIN titles t ON t.id = l.title_id
     WHERE l.user_id = ? AND t.resolve_failed = 1 AND t.poster_path IS NULL
     ORDER BY t.kind, t.name COLLATE NOCASE`,
  ).bind(userId).all<{ ref: number; name: string; kind: string }>();
  return results;
}

export async function getLists(env: Env, userId: string): Promise<import("../../shared/types").ListSummary[]> {
  const { results: lists } = await env.DB.prepare("SELECT id, name FROM lists WHERE user_id = ? ORDER BY id").bind(userId).all<{ id: number; name: string }>();
  const out: import("../../shared/types").ListSummary[] = [];
  for (const l of lists) {
    const { results } = await env.DB.prepare(
      `SELECT t.*, t.rowid AS ref, li.ordering, lib.status, lib.is_favorite, lib.rating, lib.added_at, lib.last_watched_at,
              (SELECT COUNT(*) FROM watched_episodes w WHERE w.user_id = ? AND w.title_id = t.id AND w.season > 0 AND w.watched = 1) AS episodes_watched
       FROM list_items li JOIN titles t ON t.id = li.title_id
       LEFT JOIN library lib ON lib.title_id = t.id AND lib.user_id = ?
       WHERE li.list_id = ?
       ORDER BY lib.last_watched_at DESC NULLS LAST, lib.added_at DESC NULLS LAST, t.name COLLATE NOCASE ASC`,
    ).bind(userId, userId, l.id).all<any>();
    out.push({ id: l.id, name: l.name, count: results.length, items: results.map(rowToItem) });
  }
  return out;
}

export async function getTitle(env: Env, userId: string, titleId: string, byRef = false): Promise<(LibraryItem & { episodes: any[] }) | null> {
  const r = await env.DB.prepare(
    `SELECT t.*, t.rowid AS ref, l.status, l.is_favorite, l.rating, l.added_at, l.last_watched_at
     FROM titles t LEFT JOIN library l ON l.title_id = t.id AND l.user_id = ?
     WHERE ${byRef ? "t.rowid" : "t.id"} = ?`,
  ).bind(userId, titleId).first<any>();
  if (!r) return null;
  titleId = r.id; // normalize to the string id for the episodes query below
  const { results: episodes } = await env.DB.prepare(
    "SELECT season, episode, watched, watched_at, rating FROM watched_episodes WHERE user_id = ? AND title_id = ? ORDER BY season, episode",
  ).bind(userId, titleId).all<{ season: number; watched: number }>();
  const regularWatched = episodes.filter((e) => e.season > 0 && e.watched).length;
  const item = rowToItem({ ...r, episodes_watched: regularWatched });
  return { ...item, tracked: r.status != null, episodes: episodes.map((e) => ({ ...e, watched: !!e.watched })) };
}

export async function getStats(env: Env, userId: string): Promise<Stats> {
  const q = async (sql: string) => (await env.DB.prepare(sql).bind(userId).first<any>()) ?? {};
  const shows = await q("SELECT COUNT(*) c FROM library WHERE user_id = ? AND kind = 'show'");
  const movies = await q("SELECT COUNT(*) c FROM library WHERE user_id = ? AND kind = 'movie'");
  const eps = await q("SELECT COUNT(*) c FROM watched_episodes WHERE user_id = ? AND season > 0 AND watched = 1");
  const moviesWatched = await q("SELECT COUNT(*) c FROM library WHERE user_id = ? AND kind='movie' AND status='finished'");
  // Watch time: prefer the real per-episode runtime from the export, then the
  // show's average runtime, then a 40m default. Movies use their own runtime.
  const tv = await q("SELECT COALESCE(SUM(COALESCE(w.runtime, t.runtime, 40)),0) m FROM watched_episodes w JOIN titles t ON t.id=w.title_id WHERE w.user_id = ? AND w.season > 0 AND w.watched = 1");
  const mv = await q("SELECT COALESCE(SUM(COALESCE(t.runtime,100)),0) m FROM library l JOIN titles t ON t.id=l.title_id WHERE l.user_id = ? AND l.kind='movie' AND l.status='finished'");
  return { shows: shows.c, movies: movies.c, episodes_watched: eps.c, movies_watched: moviesWatched.c, tv_minutes: tv.m, movie_minutes: mv.m };
}

/** Add a title from a TMDB search result to the user's library. */
export async function addTitle(env: Env, userId: string, kind: "show" | "movie", tmdbId: number, status: Status): Promise<string> {
  const meta = await fetchDetail(await tmdbKey(env), kind, tmdbId);
  const id = `tmdb:${kind}:${tmdbId}`;
  if (meta) {
    await env.DB.prepare(
      `INSERT INTO titles (id, kind, tmdb_id, name, overview, poster_path, backdrop_path, release_date, runtime, total_episodes, genres, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET poster_path=excluded.poster_path, updated_at=datetime('now')`,
    ).bind(id, kind, meta.tmdb_id, meta.name, meta.overview, meta.poster_path, meta.backdrop_path, meta.release_date, meta.runtime, meta.total_episodes, JSON.stringify(meta.genres)).run();
  }
  await env.DB.prepare(
    "INSERT INTO library (user_id, title_id, kind, status, added_at) VALUES (?, ?, ?, ?, datetime('now')) ON CONFLICT(user_id, title_id) DO UPDATE SET status=excluded.status",
  ).bind(userId, id, kind, status).run();
  return id;
}

/** Ensure a library row exists for a title the user is interacting with. */
async function ensureLibraryRow(env: Env, userId: string, titleId: string) {
  await env.DB.prepare(
    `INSERT INTO library (user_id, title_id, kind, status, added_at)
     SELECT ?, ?, kind, 'not_started', datetime('now') FROM titles WHERE id = ?
     ON CONFLICT(user_id, title_id) DO NOTHING`,
  ).bind(userId, titleId, titleId).run();
}

/** Insert a title's TMDB metadata (without adding it to the library). Returns the id. */
export async function ensureTitle(env: Env, kind: "show" | "movie", tmdbId: number): Promise<string> {
  // If a title with this tmdb_id already exists (e.g. a tracked show resolved
  // from its TVDB id), reuse it instead of creating a duplicate.
  const existing = await env.DB.prepare("SELECT id FROM titles WHERE kind = ? AND tmdb_id = ?").bind(kind, tmdbId).first<{ id: string }>();
  if (existing) return existing.id;
  const id = `tmdb:${kind}:${tmdbId}`;
  const exists = await env.DB.prepare("SELECT 1 FROM titles WHERE id = ?").bind(id).first();
  if (exists) return id;
  const meta = await fetchDetail(await tmdbKey(env), kind, tmdbId);
  if (meta) {
    await env.DB.prepare(
      `INSERT INTO titles (id, kind, tmdb_id, name, overview, poster_path, backdrop_path, release_date, runtime, total_episodes, genres, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(id) DO NOTHING`,
    ).bind(id, kind, meta.tmdb_id, meta.name, meta.overview, meta.poster_path, meta.backdrop_path, meta.release_date, meta.runtime, meta.total_episodes, JSON.stringify(meta.genres)).run();
  }
  return id;
}

export async function updateLibrary(env: Env, userId: string, titleId: string, patch: { status?: Status; is_favorite?: boolean; rating?: number | null }) {
  const sets: string[] = [];
  const binds: any[] = [];
  if (patch.status !== undefined) { sets.push("status = ?"); binds.push(patch.status); }
  if (patch.is_favorite !== undefined) { sets.push("is_favorite = ?"); binds.push(patch.is_favorite ? 1 : 0); }
  if (patch.rating !== undefined) { sets.push("rating = ?"); binds.push(patch.rating); }
  if (!sets.length) return;
  await ensureLibraryRow(env, userId, titleId);
  binds.push(userId, titleId);
  await env.DB.prepare(`UPDATE library SET ${sets.join(", ")} WHERE user_id = ? AND title_id = ?`).bind(...binds).run();
}

export async function toggleEpisode(env: Env, userId: string, titleId: string, season: number, episode: number, watched: boolean) {
  await ensureLibraryRow(env, userId, titleId);
  // Set the watched flag (row may already exist as an unwatched episode).
  await env.DB.prepare(
    `INSERT INTO watched_episodes (user_id, title_id, season, episode, watched, watched_at)
     VALUES (?, ?, ?, ?, ?, ${watched ? "datetime('now')" : "NULL"})
     ON CONFLICT(user_id, title_id, season, episode) DO UPDATE SET watched = excluded.watched, watched_at = excluded.watched_at`,
  ).bind(userId, titleId, season, episode, watched ? 1 : 0).run();
  if (watched) await env.DB.prepare("UPDATE library SET last_watched_at = datetime('now') WHERE user_id = ? AND title_id = ?").bind(userId, titleId).run();
}
