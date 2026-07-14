import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Status } from "../../../shared/types";
import { STATUS_ORDER, STATUS_LABEL, TMDB_IMG } from "../../../shared/types";
import type { SeasonData } from "../../worker/tmdb";
import { api, type TitleDetail } from "../lib/api";
import { StarIcon, CheckIcon } from "../components/icons";
import { Loading } from "./Home";

export function Detail() {
  const { id = "" } = useParams();
  const [t, setT] = useState<TitleDetail | null>(null);
  const [seasons, setSeasons] = useState<SeasonData[] | null>(null);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const nav = useNavigate();

  useEffect(() => {
    api.title(id).then((d) => {
      setT(d);
      setWatched(new Set(d.episodes.map((e) => `${e.season}:${e.episode}`)));
      if (d.kind === "show") api.seasons(id).then((r) => setSeasons(r.seasons)).catch(() => setSeasons([]));
    }).catch(() => setT(null));
  }, [id]);

  if (!t) return <Loading />;

  const patch = (p: Record<string, unknown>) => { setT({ ...t, ...p } as TitleDetail); api.update(id, p); };

  async function toggle(season: number, episode: number) {
    const key = `${season}:${episode}`;
    const isOn = watched.has(key);
    const next = new Set(watched);
    isOn ? next.delete(key) : next.add(key);
    setWatched(next);
    await api.toggleEpisode(id, season, episode, !isOn);
  }

  // Full episode list from TMDB when available; otherwise fall back to the
  // episodes we know were watched (from the export).
  const fallbackSeasons: SeasonData[] = (() => {
    const bySeason = new Map<number, SeasonData>();
    for (const e of t.episodes) {
      if (!bySeason.has(e.season)) bySeason.set(e.season, { season: e.season, name: `Season ${e.season}`, episodes: [] });
      bySeason.get(e.season)!.episodes.push({ episode: e.episode, name: "", air_date: e.watched_at, runtime: null });
    }
    return [...bySeason.values()].sort((a, b) => a.season - b.season);
  })();
  const showSeasons = (seasons && seasons.length ? seasons : fallbackSeasons);

  const total = seasons?.length ? seasons.reduce((n, s) => n + s.episodes.length, 0) : t.total_episodes ?? 0;
  const pct = total ? Math.min(100, Math.round((watched.size / total) * 100)) : 0;

  return (
    <>
      <div className="detail-hero">
        {t.backdrop_path
          ? <img className="backdrop" src={TMDB_IMG(t.backdrop_path, "w500")} alt="" />
          : <div className="backdrop" style={{ background: "var(--bg-elev-2)" }} />}
        <div className="overlay" />
        <button onClick={() => nav(-1)} style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,.5)", border: "none", color: "#fff", borderRadius: 999, width: 36, height: 36, fontSize: 18 }}>←</button>
      </div>

      <div className="detail-head">
        {t.poster_path
          ? <img className="poster-sm" src={TMDB_IMG(t.poster_path)} alt={t.name} />
          : <div className="poster-sm" style={{ aspectRatio: "2/3", background: "var(--bg-elev-2)" }} />}
        <div className="detail-meta">
          <h1>{t.name}</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {[t.release_date?.slice(0, 4), t.kind === "movie" ? "Movie" : "TV Show", t.genres.slice(0, 2).join(" · ")].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "16px", alignItems: "center" }}>
        <select className="input" style={{ flex: 1 }} value={t.status} onChange={(e) => patch({ status: e.target.value as Status })}>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button className="btn ghost" style={{ color: t.is_favorite ? "var(--primary)" : undefined }} onClick={() => patch({ is_favorite: !t.is_favorite })}>
          <StarIcon filled={t.is_favorite} />
        </button>
      </div>

      {t.kind === "show" && total > 0 && (
        <div style={{ padding: "0 16px" }}>
          <div className="progress-line"><span style={{ width: `${pct}%` }} /></div>
          <p className="muted" style={{ fontSize: 13 }}>{watched.size} / {total} episodes watched ({pct}%)</p>
        </div>
      )}

      {t.overview && <p style={{ padding: "0 16px", lineHeight: 1.5 }}>{t.overview}</p>}

      {t.kind === "show" && seasons === null && <div style={{ padding: 16 }}><div className="spinner" /></div>}

      {t.kind === "show" && showSeasons.map((s) => (
        <div className="season" key={s.season}>
          <h3>{s.name}</h3>
          {s.episodes.sort((a, b) => a.episode - b.episode).map((e) => {
            const on = watched.has(`${s.season}:${e.episode}`);
            return (
              <div className="ep-row" key={e.episode}>
                <button className={`ep-check ${on ? "on" : ""}`} onClick={() => toggle(s.season, e.episode)} title={on ? "Mark unwatched" : "Mark watched"}>
                  <CheckIcon size={16} />
                </button>
                <span className="ep-num">S{s.season}E{e.episode}</span>
                <span style={{ flex: 1 }}>{e.name || <span className="muted">Episode {e.episode}</span>}</span>
                {e.air_date && <span className="muted" style={{ fontSize: 12 }}>{new Date(e.air_date).getFullYear()}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
