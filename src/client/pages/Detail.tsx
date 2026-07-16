import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import type { Status } from "../../../shared/types";
import { STATUS_LABEL, TMDB_IMG } from "../../../shared/types";
import type { SeasonData } from "../../worker/tmdb";
import { api, type TitleDetail } from "../lib/api";
import { StarIcon, CheckIcon, MoreIcon } from "../components/icons";
import { toast } from "../lib/toast";
import { Loading } from "../components/Loading";
import { RelinkHint, RelinkControls } from "../components/RelinkForm";

type Extra = Awaited<ReturnType<typeof api.extra>>;

export function Detail() {
  const { ref = "" } = useParams();
  const [t, setT] = useState<TitleDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [seasons, setSeasons] = useState<SeasonData[] | null>(null);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [watchedDates, setWatchedDates] = useState<Map<string, string | null>>(
    new Map(),
  );
  const [extra, setExtra] = useState<Extra | null>(null);
  const [sp, setSp] = useSearchParams();
  const tab: "about" | "episodes" =
    sp.get("tab") === "about" ? "about" : "episodes";
  const setTab = (t: "about" | "episodes") =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("tab", t);
        return n;
      },
      { replace: true },
    );
  const [modalEp, setModalEp] = useState<{
    season: number;
    ep: SeasonData["episodes"][number];
  } | null>(null);
  const nav = useNavigate();
  const id = t?.id ?? "";

  useEffect(() => {
    setNotFound(false);
    setT(null);
    setExtra(null);
    api
      .extra(ref)
      .then(setExtra)
      .catch(() => {});
    api
      .title(ref)
      .then((d) => {
        setT(d);
        // Only episodes actually watched go in the watched set (others are shown unticked).
        setWatched(
          new Set(
            d.episodes
              .filter((e) => e.watched)
              .map((e) => `${e.season}:${e.episode}`),
          ),
        );
        setWatchedDates(
          new Map(
            d.episodes.map((e) => [`${e.season}:${e.episode}`, e.watched_at]),
          ),
        );
        if (d.kind === "show")
          api
            .seasons(ref)
            .then((r) => setSeasons(r.seasons))
            .catch(() => setSeasons([]));
      })
      .catch(() => setNotFound(true));
  }, [ref]);

  // The export's season/episode structure (t.episodes) is authoritative — it's
  // where the user's watch data lives. TMDB only enriches matching episodes with
  // stills/names. TMDB-only episodes (e.g. upcoming) are added ONLY when the show
  // isn't finished, so a finished show with a different TMDB season layout (common
  // for anime: TVDB uses 2 seasons, TMDB one flat season) doesn't grow phantoms.
  const showSeasons: SeasonData[] = useMemo(() => {
    if (!t) return [];
    const finished = t.status === "finished";
    const watchedKeys = new Set(
      t.episodes.map((e) => `${e.season}:${e.episode}`),
    );
    const bySeason = new Map<
      number,
      Map<number, SeasonData["episodes"][number]>
    >();
    const put = (
      season: number,
      ep: SeasonData["episodes"][number],
      fromTmdb: boolean,
    ) => {
      if (season <= 0) return; // ignore specials
      // Don't introduce TMDB-only episodes on a finished show.
      if (fromTmdb && finished && !watchedKeys.has(`${season}:${ep.episode}`))
        return;
      if (!bySeason.has(season)) bySeason.set(season, new Map());
      const m = bySeason.get(season)!;
      const ex = m.get(ep.episode);
      if (!ex) m.set(ep.episode, ep);
      else {
        // fill gaps from whichever source has the detail
        if (!ex.name && ep.name) ex.name = ep.name;
        if (!ex.air_date && ep.air_date) ex.air_date = ep.air_date;
        if (ex.still == null && ep.still) ex.still = ep.still;
        if (ex.runtime == null && ep.runtime) ex.runtime = ep.runtime;
      }
    };
    // Export episodes first (authoritative), then TMDB enrichment.
    for (const e of t.episodes)
      put(
        e.season,
        {
          episode: e.episode,
          name: "",
          air_date: null,
          runtime: null,
          still: null,
        },
        false,
      );
    for (const s of seasons ?? [])
      for (const e of s.episodes) put(s.season, e, true);
    const out = [...bySeason.entries()]
      .map(([season, m]) => ({
        season,
        name:
          seasons?.find((s) => s.season === season)?.name ?? `Season ${season}`,
        episodes: [...m.values()].sort((a, b) => a.episode - b.episode),
      }))
      .sort((a, b) => a.season - b.season);

    // Absolute-order fallback: when the export and TMDB disagree on season layout
    // (common for anime), fill missing stills/names/dates by matching episodes in
    // flat order. Solo Leveling S2 gets TMDB's stills even though TMDB lists them
    // under one flat season.
    const tmdbFlat = (seasons ?? [])
      .filter((s) => s.season > 0)
      .flatMap((s) => s.episodes);
    if (tmdbFlat.length) {
      const ownFlat = out.flatMap((s) => s.episodes);
      ownFlat.forEach((e, i) => {
        const src = tmdbFlat[i];
        if (!src) return;
        if (!e.name && src.name) e.name = src.name;
        if (!e.air_date && src.air_date) e.air_date = src.air_date;
        if (e.still == null && src.still) e.still = src.still;
        if (e.runtime == null && src.runtime) e.runtime = src.runtime;
      });
    }
    return out;
  }, [seasons, t]);

  if (notFound)
    return (
      <>
        <div className="topbar">
          <button
            onClick={() => nav(-1)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text)",
              fontSize: 22,
            }}
          >
            ‹
          </button>
          <h1 style={{ fontSize: 18 }}>Not found</h1>
        </div>
        <div className="empty">
          This title doesn't exist (or was removed). <br />
          <button
            className="btn ghost"
            style={{ marginTop: 12 }}
            onClick={() => nav("/")}
          >
            Go home
          </button>
        </div>
      </>
    );
  if (!t) return <Loading />;
  const isShow = t.kind === "show";

  const patch = (p: Record<string, unknown>) => {
    setT({ ...t, ...p } as TitleDetail);
    api.update(id, p);
  };

  async function setEp(season: number, episode: number, on: boolean) {
    const key = `${season}:${episode}`;
    setWatched((cur) => {
      const n = new Set(cur);
      on ? n.add(key) : n.delete(key);
      return n;
    });
    setWatchedDates((cur) => {
      const n = new Map(cur);
      on ? n.set(key, new Date().toISOString()) : n.delete(key);
      return n;
    });
    await api.toggleEpisode(id, season, episode, on);
  }
  async function setSeasonAll(s: SeasonData, on: boolean) {
    for (const e of s.episodes) await setEp(s.season, e.episode, on);
  }

  const total =
    showSeasons.reduce((n, s) => n + s.episodes.length, 0) ||
    t.total_episodes ||
    0;
  const watchedRegular = [...watched].filter(
    (k) => Number(k.split(":")[0]) > 0,
  ).length;
  const pct = total
    ? Math.min(100, Math.round((watchedRegular / total) * 100))
    : 0;
  // Live status from the current watched count, so marking episodes updates the
  // badge/labels immediately (no refresh needed).
  const liveStatus: Status = (() => {
    if (
      !isShow ||
      !t.tracked ||
      t.status === "stopped" ||
      t.status === "watch_next"
    )
      return t.status;
    if (total > 0 && watchedRegular >= total) return "finished";
    if (watchedRegular === 0) return "not_started";
    if (t.status === "finished") return "watching"; // was finished, now some unmarked
    return t.status;
  })();

  // Next episode to watch (first unwatched in season/episode order).
  const nextEp = (() => {
    for (const s of showSeasons)
      for (const e of s.episodes)
        if (!watched.has(`${s.season}:${e.episode}`)) return { s: s.season, e };
    return null;
  })();

  return (
    <>
      <div className="detail-hero">
        {t.backdrop_path ? (
          <img
            className="backdrop"
            src={TMDB_IMG(t.backdrop_path, "w500")}
            alt=""
          />
        ) : (
          <div
            className="backdrop"
            style={{ background: "var(--bg-elev-2)" }}
          />
        )}
        <div className="overlay" />
        <button onClick={() => nav(-1)} style={backBtn}>
          ‹
        </button>
      </div>

      <div className="detail-head">
        {t.poster_path ? (
          <img
            className="poster-sm"
            src={TMDB_IMG(t.poster_path)}
            alt={t.name}
          />
        ) : (
          <div
            className="poster-sm"
            style={{ aspectRatio: "2/3", background: "var(--bg-elev-2)" }}
          />
        )}
        <div className="detail-meta">
          <div className="detail-title-row">
            <h1>{t.name}</h1>
            {t.tracked && (
              <DetailActions
                kind={t.kind}
                refId={t.ref}
                status={liveStatus}
                isFavorite={t.is_favorite}
                onPatch={patch}
              />
            )}
          </div>
          {t.original_name && (
            <p
              className="muted"
              style={{ margin: "0 0 4px", fontSize: 13, fontStyle: "italic" }}
            >
              {t.original_name}
            </p>
          )}
          <p className="muted" style={{ margin: "0 0 6px", fontSize: 13 }}>
            {[
              isShow && showSeasons.length
                ? `${showSeasons.length} season${showSeasons.length > 1 ? "s" : ""}`
                : t.release_date?.slice(0, 4),
              t.tracked ? STATUS_LABEL[liveStatus] : "Not tracked",
              t.genres.slice(0, 2).join(" · "),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {isShow && total > 0 && <span className="score-badge">▸ {pct}%</span>}
        </div>
      </div>

      {isShow ? (
        <div className="tabs">
          <button
            className={tab === "about" ? "active" : ""}
            onClick={() => setTab("about")}
          >
            About
          </button>
          <button
            className={tab === "episodes" ? "active" : ""}
            onClick={() => setTab("episodes")}
          >
            Episodes
          </button>
        </div>
      ) : null}

      {(!isShow || tab === "about") && (
        <div style={{ padding: 16 }}>
          {t.overview ? (
            <p style={{ lineHeight: 1.55 }}>{t.overview}</p>
          ) : (
            <p className="muted">No description available.</p>
          )}
          {t.genres.length > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              {t.genres.join(" · ")}
            </p>
          )}
          {extra && extra.tmdb_rating != null && (
            <div style={{ display: "flex", gap: 16, margin: "12px 0" }}>
              <span className="rating-badge">
                <b>TMDB</b> {extra.tmdb_rating.toFixed(1)}
                {extra.tmdb_votes ? (
                  <span className="muted" style={{ marginLeft: 4 }}>
                    ({extra.tmdb_votes.toLocaleString()})
                  </span>
                ) : null}
              </span>
              {extra.imdb_id && (
                <a
                  className="rating-badge"
                  href={`https://www.imdb.com/title/${extra.imdb_id}/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <b>IMDb</b> ↗
                </a>
              )}
            </div>
          )}
          {extra && extra.cast.length > 0 && (
            <div style={{ margin: "16px 0" }}>
              <h2 style={{ fontSize: 15, marginBottom: 8 }}>Cast</h2>
              <div className="cast-row">
                {extra.cast.map((c, i) => (
                  <div className="cast-card" key={i}>
                    {c.profile_path ? (
                      <img
                        className="cast-photo"
                        src={TMDB_IMG(c.profile_path, "w185")}
                        alt={c.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="cast-photo cast-photo-empty">
                        {c.name.charAt(0)}
                      </div>
                    )}
                    <div className="cast-name">{c.name}</div>
                    {c.character && (
                      <div className="cast-role muted">{c.character}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <Relink refId={t.ref} onDone={() => location.reload()} />
        </div>
      )}

      {isShow && tab === "episodes" && (
        <>
          {seasons === null && (
            <div style={{ padding: 16 }}>
              <div className="spinner" />
            </div>
          )}

          {/* Only offer "Continue watching" for shows actually in progress. */}
          {liveStatus !== "finished" && liveStatus !== "stopped" && nextEp && (
            <>
              <div className="section-head">
                <h2>Continue watching</h2>
              </div>
              <div
                className="continue-card"
                onClick={() => setEp(nextEp.s, nextEp.e.episode, true)}
                style={{ cursor: "pointer" }}
              >
                {nextEp.e.still ? (
                  <img
                    className="ep-thumb"
                    src={TMDB_IMG(nextEp.e.still, "w185")}
                    alt=""
                  />
                ) : (
                  <div className="ep-thumb" />
                )}
                <div style={{ flex: 1 }}>
                  <strong>
                    S{pad(nextEp.s)} | E{pad(nextEp.e.episode)}
                  </strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {nextEp.e.name || `Episode ${nextEp.e.episode}`}
                  </div>
                </div>
                <button className="ep-check" title="Mark watched">
                  <CheckIcon size={16} />
                </button>
              </div>
            </>
          )}

          {showSeasons.map((s) => {
            const w = s.episodes.filter((e) =>
              watched.has(`${s.season}:${e.episode}`),
            ).length;
            const allOn = w === s.episodes.length && s.episodes.length > 0;
            return (
              <SeasonBlock
                key={s.season}
                s={s}
                watched={watched}
                count={w}
                allOn={allOn}
                onToggle={setEp}
                onToggleAll={setSeasonAll}
                onOpen={(ep) => setModalEp({ season: s.season, ep })}
              />
            );
          })}
        </>
      )}

      {modalEp && (
        <EpisodeModal
          show={t.name}
          season={modalEp.season}
          ep={modalEp.ep}
          watched={watched.has(`${modalEp.season}:${modalEp.ep.episode}`)}
          watchedAt={
            watchedDates.get(`${modalEp.season}:${modalEp.ep.episode}`) ?? null
          }
          onToggle={(on) => {
            setEp(modalEp.season, modalEp.ep.episode, on);
          }}
          onClose={() => setModalEp(null)}
        />
      )}

      {(!t.tracked ||
        (isShow && (t.status === "stopped" || t.status === "watch_next")) ||
        (!isShow && liveStatus !== "finished")) && (
        <div style={{ height: 84 }} />
      )}
      {!t.tracked ? (
        <div className="track-footer">
          <button
            className="btn"
            style={{ width: "100%" }}
            onClick={() => {
              const s: Status = isShow ? "watching" : "watch_next";
              setT({ ...t, tracked: true, status: s });
              api.update(id, { status: s });
            }}
          >
            + Track this {isShow ? "show" : "movie"}
          </button>
        </div>
      ) : isShow && (t.status === "stopped" || t.status === "watch_next") ? (
        <div className="track-footer">
          <button
            className="btn"
            style={{ width: "100%" }}
            onClick={() => patch({ status: "watching" })}
          >
            ▶ Resume watching
          </button>
        </div>
      ) : !isShow && liveStatus !== "finished" ? (
        // Movies don't have episodes/resume — the action is simply "mark watched".
        <div className="track-footer">
          <button
            className="btn"
            style={{ width: "100%" }}
            onClick={() => patch({ status: "finished" })}
          >
            ✓ Mark as watched
          </button>
        </div>
      ) : null}
    </>
  );
}

// Favorite toggle + a three-dots menu (add to list / watch later / stop / resume)
// shown next to the title. Replaces the action chips that used to be in About.
function DetailActions({
  kind,
  refId,
  status,
  isFavorite,
  onPatch,
}: {
  kind: "show" | "movie";
  refId: number;
  status: Status;
  isFavorite: boolean;
  onPatch: (p: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [lists, setLists] = useState<{ id: number; name: string }[]>([]);
  const isShow = kind === "show";

  function openMenu() {
    setOpen((o) => !o);
    if (lists.length === 0)
      api
        .lists()
        .then((ls) => setLists(ls.map((l) => ({ id: l.id, name: l.name }))))
        .catch(() => {});
  }
  async function addTo(name: string) {
    await api.addToList(refId, name);
    toast(`Added to “${name}”`, "success");
    setOpen(false);
    setListOpen(false);
  }
  function newList() {
    const name = window.prompt("New list name")?.trim();
    if (name) addTo(name);
  }

  return (
    <div className="detail-actions">
      <button
        className="icon-btn"
        title={isFavorite ? "Remove favorite" : "Add to favorites"}
        style={{ color: isFavorite ? "var(--primary)" : undefined }}
        onClick={() => onPatch({ is_favorite: !isFavorite })}
      >
        <StarIcon filled={isFavorite} />
      </button>
      <div style={{ position: "relative" }}>
        <button className="icon-btn" title="More" onClick={openMenu}>
          <MoreIcon />
        </button>
        {open && (
          <>
            <div className="menu-scrim" onClick={() => setOpen(false)} />
            <div className="menu">
              <button
                className="menu-item"
                onClick={() => setListOpen((v) => !v)}
              >
                Add to list ▸
              </button>
              {listOpen && (
                <div className="menu-sub">
                  {lists.map((l) => (
                    <button
                      key={l.id}
                      className="menu-item"
                      onClick={() => addTo(l.name)}
                    >
                      {l.name}
                    </button>
                  ))}
                  <button className="menu-item" onClick={newList}>
                    + New list…
                  </button>
                </div>
              )}
              {status !== "watch_next" && (
                <button
                  className="menu-item"
                  onClick={() => {
                    onPatch({ status: "watch_next" });
                    setOpen(false);
                  }}
                >
                  Watch later
                </button>
              )}
              {isShow &&
                (status === "stopped" || status === "watch_next" ? (
                  <button
                    className="menu-item"
                    onClick={() => {
                      onPatch({ status: "watching" });
                      setOpen(false);
                    }}
                  >
                    Resume watching
                  </button>
                ) : (
                  <button
                    className="menu-item"
                    onClick={() => {
                      onPatch({ status: "stopped" });
                      setOpen(false);
                    }}
                  >
                    Stop watching
                  </button>
                ))}
              {!isShow && status !== "finished" && (
                <button
                  className="menu-item"
                  onClick={() => {
                    onPatch({ status: "finished" });
                    setOpen(false);
                  }}
                >
                  Mark as watched
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EpisodeModal({
  show,
  season,
  ep,
  watched,
  watchedAt,
  onToggle,
  onClose,
}: {
  show: string;
  season: number;
  ep: SeasonData["episodes"][number];
  watched: boolean;
  watchedAt: string | null;
  onToggle: (on: boolean) => void;
  onClose: () => void;
}) {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {ep.still ? (
          <img
            className="modal-still"
            src={TMDB_IMG(ep.still, "w500")}
            alt=""
          />
        ) : (
          <div
            className="modal-still"
            style={{ background: "var(--bg-elev-2)" }}
          />
        )}
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>
        <div style={{ padding: 16 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
            {show} · S{pad(season)}E{pad(ep.episode)}
          </div>
          <h2 style={{ margin: "4px 0 8px", fontSize: 19 }}>
            {ep.name || `Episode ${ep.episode}`}
          </h2>
          <div
            className="muted"
            style={{
              fontSize: 13,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {ep.air_date && <span>📅 Aired {fmt(ep.air_date)}</span>}
            {watched && watchedAt && (
              <span style={{ color: "#21d07a" }}>
                ✓ Watched {fmt(watchedAt)}
              </span>
            )}
            {watched && !watchedAt && (
              <span style={{ color: "#21d07a" }}>✓ Watched</span>
            )}
            {ep.runtime ? <span>⏱ {ep.runtime} min</span> : null}
          </div>
          <button
            className="btn"
            style={{
              marginTop: 16,
              width: "100%",
              background: watched ? "var(--bg-elev-2)" : "var(--primary)",
            }}
            onClick={() => {
              onToggle(!watched);
              onClose();
            }}
          >
            {watched ? "Mark as unwatched" : "Mark as watched"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SeasonBlock({
  s,
  watched,
  count,
  allOn,
  onToggle,
  onToggleAll,
  onOpen,
}: {
  s: SeasonData;
  watched: Set<string>;
  count: number;
  allOn: boolean;
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
        <span className="prog">
          {count}/{s.episodes.length}
        </span>
        <button
          className={`ep-check ${allOn ? "done" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleAll(s, !allOn);
          }}
          title="Mark whole season"
        >
          <CheckIcon size={16} />
        </button>
      </div>
      {open &&
        s.episodes.map((e) => {
          const on = watched.has(`${s.season}:${e.episode}`);
          return (
            <div
              className="ep-row"
              key={e.episode}
              style={{ padding: "10px 16px" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flex: 1,
                  minWidth: 0,
                  cursor: "pointer",
                }}
                onClick={() => onOpen(e)}
              >
                {e.still ? (
                  <img
                    className="ep-thumb"
                    src={TMDB_IMG(e.still, "w185")}
                    alt=""
                  />
                ) : (
                  <div className="ep-thumb" />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    S{pad(s.season)} | E{pad(e.episode)}
                  </div>
                  <div
                    className="muted"
                    style={{
                      fontSize: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {e.name || `Episode ${e.episode}`}
                  </div>
                </div>
              </div>
              <button
                className={`ep-check ${on ? "done" : ""}`}
                onClick={() => onToggle(s.season, e.episode, !on)}
                title={on ? "Mark unwatched" : "Mark watched"}
              >
                <CheckIcon size={16} />
              </button>
            </div>
          );
        })}
    </>
  );
}

// Fix a wrong/missing match by pasting the correct TMDB or TVDB id.
function Relink({ refId, onDone }: { refId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button
        className="chip"
        style={{ marginTop: 12 }}
        onClick={() => setOpen(true)}
      >
        Wrong poster / show?
      </button>
    );
  return (
    <div style={{ marginTop: 12 }}>
      <RelinkHint />
      <RelinkControls refId={refId} onDone={onDone} saveLabel="Fix" />
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const backBtn: React.CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  background: "rgba(0,0,0,.5)",
  border: "none",
  color: "#fff",
  borderRadius: 999,
  width: 36,
  height: 36,
  fontSize: 24,
  lineHeight: 1,
};
