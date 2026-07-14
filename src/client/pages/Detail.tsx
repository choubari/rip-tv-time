import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Status } from "../../../shared/types";
import { STATUS_ORDER, STATUS_LABEL, TMDB_IMG } from "../../../shared/types";
import type { SeasonData } from "../../worker/tmdb";
import { api, type TitleDetail } from "../lib/api";
import { StarIcon, CheckIcon } from "../components/icons";
import { Loading } from "../components/Loading";

export function Detail() {
  const { id = "" } = useParams();
  const [t, setT] = useState<TitleDetail | null>(null);
  const [seasons, setSeasons] = useState<SeasonData[] | null>(null);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"about" | "episodes">("episodes");
  const nav = useNavigate();

  useEffect(() => {
    api.title(id).then((d) => {
      setT(d);
      setWatched(new Set(d.episodes.map((e) => `${e.season}:${e.episode}`)));
      if (d.kind === "show") api.seasons(id).then((r) => setSeasons(r.seasons)).catch(() => setSeasons([]));
    }).catch(() => setT(null));
  }, [id]);

  // Full episode list from TMDB when available; else fall back to what we know was
  // watched. Declared before any early return so hook order stays stable.
  const showSeasons: SeasonData[] = useMemo(() => {
    if (seasons && seasons.length) return seasons;
    if (!t) return [];
    const bySeason = new Map<number, SeasonData>();
    for (const e of t.episodes) {
      if (e.season <= 0) continue; // ignore specials
      if (!bySeason.has(e.season)) bySeason.set(e.season, { season: e.season, name: `Season ${e.season}`, episodes: [] });
      bySeason.get(e.season)!.episodes.push({ episode: e.episode, name: "", air_date: e.watched_at, runtime: null, still: null });
    }
    return [...bySeason.values()].map((s) => ({ ...s, episodes: s.episodes.sort((a, b) => a.episode - b.episode) })).sort((a, b) => a.season - b.season);
  }, [seasons, t]);

  if (!t) return <Loading />;
  const isShow = t.kind === "show";

  const patch = (p: Record<string, unknown>) => { setT({ ...t, ...p } as TitleDetail); api.update(id, p); };

  async function setEp(season: number, episode: number, on: boolean) {
    const key = `${season}:${episode}`;
    setWatched((cur) => { const n = new Set(cur); on ? n.add(key) : n.delete(key); return n; });
    await api.toggleEpisode(id, season, episode, on);
  }
  async function setSeasonAll(s: SeasonData, on: boolean) {
    for (const e of s.episodes) await setEp(s.season, e.episode, on);
  }

  const total = showSeasons.reduce((n, s) => n + s.episodes.length, 0) || t.total_episodes || 0;
  const watchedRegular = [...watched].filter((k) => Number(k.split(":")[0]) > 0).length;
  const pct = total ? Math.min(100, Math.round((watchedRegular / total) * 100)) : 0;

  // Next episode to watch (first unwatched in season/episode order).
  const nextEp = (() => {
    for (const s of showSeasons) for (const e of s.episodes) if (!watched.has(`${s.season}:${e.episode}`)) return { s: s.season, e };
    return null;
  })();

  return (
    <>
      <div className="detail-hero">
        {t.backdrop_path
          ? <img className="backdrop" src={TMDB_IMG(t.backdrop_path, "w500")} alt="" />
          : <div className="backdrop" style={{ background: "var(--bg-elev-2)" }} />}
        <div className="overlay" />
        <button onClick={() => nav(-1)} style={backBtn}>‹</button>
      </div>

      <div className="detail-head">
        {t.poster_path
          ? <img className="poster-sm" src={TMDB_IMG(t.poster_path)} alt={t.name} />
          : <div className="poster-sm" style={{ aspectRatio: "2/3", background: "var(--bg-elev-2)" }} />}
        <div className="detail-meta">
          <h1>{t.name}</h1>
          <p className="muted" style={{ margin: "0 0 6px", fontSize: 13 }}>
            {[
              isShow && showSeasons.length ? `${showSeasons.length} season${showSeasons.length > 1 ? "s" : ""}` : t.release_date?.slice(0, 4),
              STATUS_LABEL[t.status],
              t.genres.slice(0, 2).join(" · "),
            ].filter(Boolean).join(" · ")}
          </p>
          {isShow && total > 0 && <span className="score-badge">▸ {pct}%</span>}
        </div>
      </div>

      {isShow ? (
        <div className="tabs">
          <button className={tab === "about" ? "active" : ""} onClick={() => setTab("about")}>About</button>
          <button className={tab === "episodes" ? "active" : ""} onClick={() => setTab("episodes")}>Episodes</button>
        </div>
      ) : null}

      {(!isShow || tab === "about") && (
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <select className="input" style={{ flex: 1 }} value={t.status} onChange={(e) => patch({ status: e.target.value as Status })}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button className="btn ghost" style={{ color: t.is_favorite ? "var(--primary)" : undefined }} onClick={() => patch({ is_favorite: !t.is_favorite })}>
              <StarIcon filled={t.is_favorite} />
            </button>
          </div>
          {t.overview ? <p style={{ lineHeight: 1.55 }}>{t.overview}</p> : <p className="muted">No description available.</p>}
          {t.genres.length > 0 && <p className="muted" style={{ fontSize: 13 }}>{t.genres.join(" · ")}</p>}
        </div>
      )}

      {isShow && tab === "episodes" && (
        <>
          {seasons === null && <div style={{ padding: 16 }}><div className="spinner" /></div>}

          <div className="section-head"><h2>Continue watching</h2></div>
          {nextEp ? (
            <div className="continue-card" onClick={() => setEp(nextEp.s, nextEp.e.episode, true)} style={{ cursor: "pointer" }}>
              {nextEp.e.still ? <img className="ep-thumb" src={TMDB_IMG(nextEp.e.still, "w185")} alt="" /> : <div className="ep-thumb" />}
              <div style={{ flex: 1 }}>
                <strong>S{pad(nextEp.s)} | E{pad(nextEp.e.episode)}</strong>
                <div className="muted" style={{ fontSize: 13 }}>{nextEp.e.name || `Episode ${nextEp.e.episode}`}</div>
              </div>
              <button className="ep-check" title="Mark watched"><CheckIcon size={16} /></button>
            </div>
          ) : (
            <div className="continue-card"><div style={{ padding: "6px 4px" }}><strong>All caught up 🎉</strong><div className="muted" style={{ fontSize: 13 }}>You've watched every episode.</div></div></div>
          )}

          {showSeasons.map((s) => {
            const w = s.episodes.filter((e) => watched.has(`${s.season}:${e.episode}`)).length;
            const allOn = w === s.episodes.length && s.episodes.length > 0;
            return <SeasonBlock key={s.season} s={s} watched={watched} count={w} allOn={allOn} onToggle={setEp} onToggleAll={setSeasonAll} />;
          })}
        </>
      )}
    </>
  );
}

function SeasonBlock({ s, watched, count, allOn, onToggle, onToggleAll }: {
  s: SeasonData; watched: Set<string>; count: number; allOn: boolean;
  onToggle: (season: number, ep: number, on: boolean) => void;
  onToggleAll: (s: SeasonData, on: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <div className="season-head" onClick={() => setOpen((o) => !o)}>
        <span>{open ? "▾" : "▸"}</span>
        <h3>{s.name}</h3>
        <span className="prog">{count}/{s.episodes.length}</span>
        <button className={`ep-check ${allOn ? "done" : ""}`} onClick={(e) => { e.stopPropagation(); onToggleAll(s, !allOn); }} title="Mark whole season">
          <CheckIcon size={16} />
        </button>
      </div>
      {open && s.episodes.map((e) => {
        const on = watched.has(`${s.season}:${e.episode}`);
        return (
          <div className="ep-row" key={e.episode} style={{ padding: "10px 16px" }}>
            {e.still ? <img className="ep-thumb" src={TMDB_IMG(e.still, "w185")} alt="" /> : <div className="ep-thumb" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>S{pad(s.season)} | E{pad(e.episode)}</div>
              <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name || `Episode ${e.episode}`}</div>
            </div>
            <button className={`ep-check ${on ? "done" : ""}`} onClick={() => onToggle(s.season, e.episode, !on)} title={on ? "Mark unwatched" : "Mark watched"}>
              <CheckIcon size={16} />
            </button>
          </div>
        );
      })}
    </>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const backBtn: React.CSSProperties = { position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,.5)", border: "none", color: "#fff", borderRadius: 999, width: 36, height: 36, fontSize: 24, lineHeight: 1 };
