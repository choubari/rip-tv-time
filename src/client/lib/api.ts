import type { LibraryItem, ListSummary, Stats, UserProfile } from "../../../shared/types";
import type { SearchResult, SeasonData } from "../../worker/tmdb";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as any).error || res.statusText);
  return res.json() as Promise<T>;
}

export class AuthError extends Error {}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export interface TitleDetail extends LibraryItem {
  episodes: { season: number; episode: number; watched: boolean; watched_at: string | null; rating: number | null }[];
}

export const api = {
  requestLink: (email: string) => req<{ ok: boolean; delivered: boolean; devLink?: string }>("/api/auth/request", json({ email })),
  demoLogin: () => req<{ ok: boolean }>("/api/auth/demo", { method: "POST" }),
  logout: () => req("/api/auth/logout", { method: "POST" }),
  me: () => req<UserProfile>("/api/me"),
  allowed: () => req<string[]>("/api/admin/allowed"),
  allow: (email: string) => req("/api/admin/allowed", json({ email })),
  disallow: (email: string) => req("/api/admin/allowed", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }),

  importZips: (files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("file", f));
    return req<{ ok: boolean; titles: number; episodes: number }>("/api/import", { method: "POST", body: fd });
  },
  resolve: (limit = 40) => req<{ resolved: number; remaining: number }>(`/api/resolve?limit=${limit}`, { method: "POST" }),

  getSettings: () => req<{ has_tmdb_key: boolean; can_edit: boolean; tmdb_key_hint: string | null }>("/api/settings"),
  setTmdbKey: (tmdb_key: string) => req<{ ok: boolean; valid: boolean }>("/api/settings", json({ tmdb_key })),

  library: (kind?: string) => req<LibraryItem[]>(`/api/library${kind ? `?kind=${kind}` : ""}`),
  stats: () => req<Stats>("/api/stats"),
  title: (ref: string | number) => req<TitleDetail>(`/api/t/${ref}`),
  seasons: (ref: string | number) => req<{ seasons: SeasonData[] }>(`/api/t/${ref}/seasons`),
  search: (q: string) => req<(SearchResult & { tracked_ref: number | null; status: string | null; watched: number; total_episodes: number | null })[]>(`/api/search?q=${encodeURIComponent(q)}`),

  lists: () => req<ListSummary[]>("/api/lists"),
  unmatched: () => req<{ ref: number; name: string; kind: string }[]>("/api/unmatched"),
  relink: (ref: number, tmdb_id: number) => req<{ ok: boolean }>("/api/relink", json({ ref, tmdb_id })),
  ensure: (kind: "show" | "movie", tmdb_id: number) => req<{ id: string; ref: number }>("/api/title/ensure", json({ kind, tmdb_id })),
  add: (kind: "show" | "movie", tmdb_id: number, status?: string) => req<{ id: string; ref: number }>("/api/library", json({ kind, tmdb_id, status })),
  update: (id: string, patch: Record<string, unknown>) => req(`/api/library/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }),
  toggleEpisode: (id: string, season: number, episode: number, watched: boolean) =>
    req(`/api/title/${encodeURIComponent(id)}/episode`, json({ season, episode, watched })),
};
