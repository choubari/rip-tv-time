import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Status } from "../../../shared/types";
import { STATUS_LABEL, TMDB_IMG } from "../../../shared/types";

// Full status menu for the detail dropdown (includes "finished", which the
// grouped tabs omit).
const STATUS_MENU: Status[] = ["watching", "paused", "finished", "not_started", "watch_next", "stopped"];
import type { SeasonData } from "../../worker/tmdb";
import { api, type TitleDetail } from "../lib/api";
import { StarIcon, CheckIcon } from "../components/icons";
import { Loading } from "../components/Loading";

export function Detail() {
  const { ref = "" } = useParams();
  const [t, setT] = useState<TitleDetail | null>(null);
  const [seasons, setSeasons] = useState<SeasonData[] | null>(null);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [watchedDates, setWatchedDates] = useState<Map<string, string | null>>(new Map());
  const [tab, setTab] = useState<"about" | "episodes">("episodes");
  const [modalEp, setModalEp] = useState<{ season: number; ep: SeasonData["episodes"][number] } | null>(null);
  const nav = useNavigate();
  const id = t?.id ?? "";

  useEffect(() => {
    api.title(ref).then((d) => {
      setT(d);
      setWatched(new Set(d.episodes.map((e) => `${e.season}:${e.episode}`)));
      setWatchedDates(new Map(d.episodes.map((e) => [`${e.season}:${e.episode}`, e.watched_at])));
      if (d.kind === "show") api.seasons(ref).then((r) => setSeasons(r.seasons)).catch(() => setSeasons([]));
    }).catch(() => setT(null));
  }, [ref]);

  // Merge TMDB's episode list with the episodes we know were watched, so every
  // watched episode always shows even when TMDB is missing/incomplete (e.g. a
  // local show TMDB thinks has 1 episode). Declared before any early return so
  // hook order stays stable.
  const showSeasons: SeasonData[] = useMemo(() => {
    if (!t) return [];
    const bySeason = new Map<number, Map<number, SeasonData["episodes"][number]>>();
    const put = (season: number, ep: SeasonData["episodes"][number]) => {
      if (season <= 0) return; // ignore specials
      if (!bySeason.has(season)) bySeason.set(season, new Map());
      const m = bySeason.get(season)!;
      const ex = m.get(ep.episode);
      if (!ex) m.set(ep.episode, ep);
      else { // fill gaps from whichever source has the detail
        if (!ex.name && ep.name) ex.name = ep.name;
        if (!ex.air_date && ep.air_date) ex.air_date = ep.air_date;
        if (ex.still == null && ep.still) ex.still = ep.still;
        if (ex.runtime == null && ep.runtime) ex.runtime = ep.runtime;
      }
    };
    for (const s of seasons ?? []) for (const e of s.episodes) put(s.season, e);
    for (const e of t.episodes) put(e.season, { episode: e.episode, name: "", air_date: null, runtime: null, still: null });
    return [...bySeason.entries()]
      .map(([season, m]) => ({ season, name: seasons?.find((s) => s.season === season)?.name ?? `Season ${season}`, episodes: [...m.values()].sort((a, b) => a.episode - b.episode) }))
      .sort((a, b) => a.season - b.season);
  }, [seasons, t]);

  if (!t) return <Loading />;
  const isShow = t.kind === "show";

  const patch = (p: Record<string, unknown>) => { setT({ ...t, ...p } as TitleDetail); api.update(id, p); };

  async function setEp(season: number, episode: number, on: boolean) {
    const key = `${season}:${episode}`;
    setWatched((cur) => { const n = new Set(cur); on ? n.add(key) : n.delete(key); return n; });
    setWatchedDates((cur) => { const n = new Map(cur); on ? n.set(key, new Date().toISOString()) : n.delete(key); return n; });
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
          {t.original_name && <p className="muted" style={{ margin: "0 0 4px", fontSize: 13, fontStyle: "italic" }}>{t.original_name}</p>}
          <p className="muted" style={{ margin: "0 0 6px", fontSize: 13 }}>
            {[
              isShow && showSeasons.length ? `${showSeasons.length} season${showSeasons.length > 1 ? "s" : ""}` : t.release_date?.slice(0, 4),
              t.tracked ? STATUS_LABEL[t.status] : "Not tracked",
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
          {t.tracked && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
              <select className="input" style={{ flex: 1 }} value={t.status} onChange={(e) => patch({ status: e.target.value as Status })}>
                {STATUS_MENU.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <button className="btn ghost" style={{ color: t.is_favorite ? "var(--primary)" : undefined }} onClick={() => patch({ is_favorite: !t.is_favorite })}>
                <StarIcon filled={t.is_favorite} />
              </button>
            </div>
          )}
          {t.overview ? <p style={{ lineHeight: 1.55 }}>{t.overview}</p> : <p className="muted">No description available.</p>}
          {t.genres.length > 0 && <p className="muted" style={{ fontSize: 13 }}>{t.genres.join(" · ")}</p>}
          <Relink refId={t.ref} onDone={() => location.reload()} />
        </div>
      )}

      {isShow && tab === "episodes" && (
        <>
          {seasons === null && <div style={{ padding: 16 }}><div className="spinner" /></div>}

          {/* Only offer "Continue watching" for shows actually in progress. */}
          {t.status !== "finished" && t.status !== "stopped" && nextEp && (
            <>
              <div className="section-head"><h2>Continue watching</h2></div>
              <div className="continue-card" onClick={() => setEp(nextEp.s, nextEp.e.episode, true)} style={{ cursor: "pointer" }}>
                {nextEp.e.still ? <img className="ep-thumb" src={TMDB_IMG(nextEp.e.still, "w185")} alt="" /> : <div className="ep-thumb" />}
                <div style={{ flex: 1 }}>
                  <strong>S{pad(nextEp.s)} | E{pad(nextEp.e.episode)}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>{nextEp.e.name || `Episode ${nextEp.e.episode}`}</div>
                </div>
                <button className="ep-check" title="Mark watched"><CheckIcon size={16} /></button>
              </div>
            </>
          )}

          {showSeasons.map((s) => {
            const w = s.episodes.filter((e) => watched.has(`${s.season}:${e.episode}`)).length;
            const allOn = w === s.episodes.length && s.episodes.length > 0;
            return <SeasonBlock key={s.season} s={s} watched={watched} count={w} allOn={allOn} onToggle={setEp} onToggleAll={setSeasonAll} onOpen={(ep) => setModalEp({ season: s.season, ep })} />;
          })}
        </>
      )}

      {modalEp && (
        <EpisodeModal
          show={t.name} season={modalEp.season} ep={modalEp.ep}
          watched={watched.has(`${modalEp.season}:${modalEp.ep.episode}`)}
          watchedAt={watchedDates.get(`${modalEp.season}:${modalEp.ep.episode}`) ?? null}
          onToggle={(on) => { setEp(modalEp.season, modalEp.ep.episode, on); }}
          onClose={() => setModalEp(null)}
        />
      )}

      {!t.tracked && (
        <div className="track-footer">
          <button className="btn" style={{ width: "100%" }} onClick={() => { setT({ ...t, tracked: true }); patch({ status: isShow ? "watching" : "watch_next" }); }}>
            + Track this {isShow ? "show" : "movie"}
          </button>
        </div>
      )}
    </>
  );
}

function EpisodeModal({ show, season, ep, watched, watchedAt, onToggle, onClose }: {
  show: string; season: number; ep: SeasonData["episodes"][number]; watched: boolean; watchedAt: string | null;
  onToggle: (on: boolean) => void; onClose: () => void;
}) {
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {ep.still ? <img className="modal-still" src={TMDB_IMG(ep.still, "w500")} alt="" /> : <div className="modal-still" style={{ background: "var(--bg-elev-2)" }} />}
        <button className="modal-close" onClick={onClose}>✕</button>
        <div style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{show} · S{pad(season)}E{pad(ep.episode)}</div>
          <h2 style={{ margin: "4px 0 8px", fontSize: 19 }}>{ep.name || `Episode ${ep.episode}`}</h2>
          <div className="muted" style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
            {ep.air_date && <span>📅 Aired {fmt(ep.air_date)}</span>}
            {watched && watchedAt && <span style={{ color: "#21d07a" }}>✓ Watched {fmt(watchedAt)}</span>}
            {watched && !watchedAt && <span style={{ color: "#21d07a" }}>✓ Watched</span>}
            {ep.runtime ? <span>⏱ {ep.runtime} min</span> : null}
          </div>
          <button className="btn" style={{ marginTop: 16, width: "100%", background: watched ? "var(--bg-elev-2)" : "var(--primary)" }} onClick={() => { onToggle(!watched); onClose(); }}>
            {watched ? "Mark as unwatched" : "Mark as watched"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SeasonBlock({ s, watched, count, allOn, onToggle, onToggleAll, onOpen }: {
  s: SeasonData; watched: Set<string>; count: number; allOn: boolean;
  onToggle: (season: number, ep: number, on: boolean) => void;
  onToggleAll: (s: SeasonData, on: boolean) => void;
  onOpen: (ep: SeasonData["episodes"][number]) => void;
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
            <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onOpen(e)}>
              {e.still ? <img className="ep-thumb" src={TMDB_IMG(e.still, "w185")} alt="" /> : <div className="ep-thumb" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>S{pad(s.season)} | E{pad(e.episode)}</div>
                <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name || `Episode ${e.episode}`}</div>
              </div>
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

// Fix a wrong TMDB match by pasting the correct id from themoviedb.org.
function Relink({ refId, onDone }: { refId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <button className="chip" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>Wrong poster / show?</button>;
  return (
    <div style={{ marginTop: 12 }}>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 6px" }}>
        Find the correct title on <a style={{ color: "var(--primary)" }} href="https://www.themoviedb.org" target="_blank" rel="noreferrer">themoviedb.org</a> and paste the number from its URL (e.g. <code>/tv/1396</code>).
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="input" placeholder="TMDB id" value={id} onChange={(e) => setId(e.target.value)} />
        <button className="btn" disabled={busy || !id.trim()} onClick={async () => { setBusy(true); const n = parseInt(id.replace(/\D/g, ""), 10); if (n) { await api.relink(refId, n); onDone(); } setBusy(false); }}>
          {busy ? "…" : "Fix"}
        </button>
      </div>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const backBtn: React.CSSProperties = { position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,.5)", border: "none", color: "#fff", borderRadius: 999, width: 36, height: 36, fontSize: 24, lineHeight: 1 };
