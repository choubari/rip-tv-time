// Types shared between the Worker (server) and the React client.

export type Kind = "show" | "movie";

// Ordered by how TV Time surfaces things: things you're actively watching first,
// then things queued, then finished/abandoned. `sortRank` drives list ordering.
export type Status =
  | "watching" // show in progress (TV Time: "continuing")
  | "up_to_date" // caught up, waiting for new episodes
  | "watch_later" // queued / for later
  | "not_started" // added but not begun
  | "watched" // movie watched (or fully-watched show)
  | "stopped"; // stopped watching

export const STATUS_ORDER: Status[] = [
  "watching",
  "up_to_date",
  "watch_later",
  "not_started",
  "watched",
  "stopped",
];

export const STATUS_LABEL: Record<Status, string> = {
  watching: "Watching",
  up_to_date: "Up to date",
  watch_later: "Watch later",
  not_started: "Haven't watched",
  watched: "Watched",
  stopped: "Stopped watching",
};

export interface TitleMeta {
  id: string;
  kind: Kind;
  tmdb_id: number | null;
  imdb_id: string | null;
  tvdb_id: number | null;
  name: string;
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
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  bio: string | null;
  cover_url: string | null;
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
  added_at: string | null;
  last_watched_at: string | null;
  watched_episodes: { season: number; episode: number; watched_at: string | null; rating: number | null; runtime: number | null }[];
}

export interface ParsedImport {
  profile: { name?: string; bio?: string; cover_url?: string };
  titles: ParsedTitle[];
}

export const TMDB_IMG = (path: string, size: "w185" | "w342" | "w500" | "original" = "w342") =>
  `https://image.tmdb.org/t/p/${size}${path}`;
