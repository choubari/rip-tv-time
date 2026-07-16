// Types shared between the Worker (server) and the React client.

export type Kind = "show" | "movie";

// Effective status shown in the UI. Some values are *derived* at read time from
// watch activity (see effectiveStatus): "watching" vs "paused" vs "finished".
export type Status =
  | "watching" // in progress, watched recently
  | "paused" // in progress but no recent activity ("haven't watched for a while")
  | "not_started" // tracked but no episodes watched yet ("haven't started")
  | "watch_next" // hand-picked queue (was TV Time "watch later" / "for later")
  | "finished" // every episode watched, or a watched movie
  | "stopped"; // stopped watching

// Recent-activity window separating "watching" from "paused".
export const RECENT_DAYS = 90;

// Statuses shown in the Shows/Movies tabs, in order. "finished" is intentionally
// excluded — finished titles live in the Profile archive instead.
export const STATUS_ORDER: Status[] = [
  "watching",
  "paused",
  "not_started",
  "watch_next",
  "stopped",
];

// Wording mirrors the TV Time app.
export const STATUS_LABEL: Record<Status, string> = {
  watching: "Watching",
  paused: "Haven't watched for a while",
  not_started: "Haven't started",
  watch_next: "Watch later",
  finished: "Finished",
  stopped: "Stopped watching",
};

// TV Time's status color coding for the little bar under each poster.
export const STATUS_COLOR: Record<Status, string> = {
  stopped: "#e01e1e", // red
  finished: "#21d07a", // green
  watch_next: "#f5a623", // orange
  watching: "#f5c518", // yellow
  paused: "#f5c518", // yellow (haven't watched in a while)
  not_started: "#5a5a5f", // grey
};

/**
 * The status shown in the UI. TV Time's own status (stored as the base status)
 * is authoritative — we do NOT re-derive "finished" from episode counts, which
 * are unreliable. The only refinement: an actively-watched show ("watching")
 * that hasn't been touched in a while is surfaced as "paused".
 */
export function effectiveStatus(item: {
  kind: Kind;
  status: Status;
  episodes_watched?: number;
  total_episodes?: number | null;
  last_watched_at?: string | null;
}): Status {
  if (item.status !== "watching") return item.status;
  const watched = item.episodes_watched ?? 0;
  if (watched === 0) return "not_started";
  const total = item.total_episodes ?? 0;
  // All episodes watched → finished (totals now come from the export, so this is
  // reliable). Marking every episode moves a show into Finished.
  if (total > 0 && watched >= total) return "finished";
  const last = item.last_watched_at ? Date.parse(item.last_watched_at) : 0;
  const recent = last > 0 && Date.now() - last < RECENT_DAYS * 86400_000;
  return recent ? "watching" : "paused";
}

export interface TitleMeta {
  id: string;
  ref: number; // stable numeric id for clean URLs (/show/:ref, /movie/:ref)
  kind: Kind;
  tmdb_id: number | null;
  imdb_id: string | null;
  tvdb_id: number | null;
  name: string;
  original_name?: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  runtime: number | null;
  total_episodes: number | null;
  genres: string[];
}

export interface LibraryItem extends TitleMeta {
  status: Status;
  is_favorite: boolean;
  rating: number | null;
  added_at: string | null;
  last_watched_at: string | null;
  episodes_watched?: number;
  tracked?: boolean; // is this title in the user's library?
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  bio: string | null;
  cover_url: string | null;
  avatar_url: string | null;
  is_admin?: boolean;
  is_demo?: boolean;
}

export interface Stats {
  shows: number;
  movies: number;
  episodes_watched: number;
  movies_watched: number;
  tv_minutes: number;
  movie_minutes: number;
}

// The normalized shape produced by parsing an export zip, before DB insert.
export interface ParsedTitle {
  kind: Kind;
  uuid: string | null;
  tvdb_id: number | null;
  imdb_id: string | null;
  name: string;
  status: Status;
  is_favorite: boolean;
  rating: number | null;
  runtime: number | null; // movie runtime in minutes (shows: null)
  total_episodes?: number | null; // full episode count from the export (shows)
  added_at: string | null;
  last_watched_at: string | null;
  watched_episodes: {
    season: number;
    episode: number;
    watched: boolean;
    watched_at: string | null;
    rating: number | null;
    runtime: number | null;
  }[];
}

export interface ParsedList {
  name: string;
  items: {
    kind: Kind;
    tvdb_id: number | null;
    imdb_id: string | null;
    name: string;
  }[];
}

export interface ParsedImport {
  profile: {
    name?: string;
    bio?: string;
    cover_url?: string;
    avatar_url?: string;
  };
  titles: ParsedTitle[];
  lists: ParsedList[];
}

export interface ListSummary {
  id: number;
  name: string;
  count: number;
  items: LibraryItem[];
}

export const TMDB_IMG = (
  path: string,
  size: "w185" | "w342" | "w500" | "original" = "w342",
) =>
  // Stills/posters can come from TVDB (already absolute URLs) as well as TMDB
  // (relative paths). Only prepend the TMDB host for relative TMDB paths.
  path?.startsWith("http") ? path : `https://image.tmdb.org/t/p/${size}${path}`;
