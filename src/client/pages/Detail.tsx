import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Status } from "../../../shared/types";
import { STATUS_ORDER, STATUS_LABEL, TMDB_IMG } from "../../../shared/types";
import { api, type TitleDetail } from "../lib/api";
import { StarIcon, CheckIcon } from "../components/icons";
import { Loading } from "./Home";

export function Detail() {
  const { id = "" } = useParams();
  const [t, setT] = useState<TitleDetail | null>(null);
  const nav = useNavigate();

  useEffect(() => { api.title(id).then(setT).catch(() => setT(null)); }, [id]);
  if (!t) return <Loading />;

  const patch = (p: Record<string, unknown>) => { setT({ ...t, ...p } as TitleDetail); api.update(id, p); };

  const bySeason = new Map<number, typeof t.episodes>();
  for (const e of t.episodes) {
    if (!bySeason.has(e.season)) bySeason.set(e.season, []);
    bySeason.get(e.season)!.push(e);
  }
  const seasons = [...bySeason.keys()].sort((a, b) => a - b);

  async function untoggle(season: number, episode: number) {
    await api.toggleEpisode(id, season, episode, false);
    setT((cur) => cur && { ...cur, episodes: cur.episodes.filter((e) => !(e.season === season && e.episode === episode)) });
  }

  const pct = t.total_episodes ? Math.min(100, Math.round((t.episodes.length / t.total_episodes) * 100)) : 0;

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
        <select
          className="input" style={{ flex: 1 }} value={t.status}
          onChange={(e) => patch({ status: e.target.value as Status })}
        >
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <button className="btn ghost" style={{ color: t.is_favorite ? "var(--primary)" : undefined }} onClick={() => patch({ is_favorite: !t.is_favorite })}>
          <StarIcon filled={t.is_favorite} />
        </button>
      </div>

      {t.kind === "show" && t.total_episodes ? (
        <div style={{ padding: "0 16px" }}>
          <div className="progress-line"><span style={{ width: `${pct}%` }} /></div>
          <p className="muted" style={{ fontSize: 13 }}>{t.episodes.length} / {t.total_episodes} episodes watched ({pct}%)</p>
        </div>
      ) : null}

      {t.overview && <p style={{ padding: "0 16px", lineHeight: 1.5 }}>{t.overview}</p>}

      {t.kind === "show" && seasons.map((s) => (
        <div className="season" key={s}>
          <h3>Season {s}</h3>
          {bySeason.get(s)!.sort((a, b) => a.episode - b.episode).map((e) => (
            <div className="ep-row" key={e.episode}>
              <button className="ep-check on" onClick={() => untoggle(e.season, e.episode)} title="Mark unwatched"><CheckIcon size={16} /></button>
              <span className="ep-num">S{s}E{e.episode}</span>
              <span style={{ flex: 1 }} className="muted">{e.watched_at ? new Date(e.watched_at).toLocaleDateString() : "Watched"}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
