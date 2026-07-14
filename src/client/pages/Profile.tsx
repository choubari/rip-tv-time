import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { LibraryItem, Stats, UserProfile } from "../../../shared/types";
import { api } from "../lib/api";
import { PosterRow } from "../components/Poster";
import { StarIcon } from "../components/icons";

function hours(mins: number) {
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function Profile({ user, onChange }: { user: UserProfile; onChange: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [lib, setLib] = useState<LibraryItem[]>([]);
  const nav = useNavigate();

  useEffect(() => {
    api.stats().then(setStats).catch(() => {});
    api.library().then(setLib).catch(() => {});
  }, []);

  async function logout() { await api.logout(); onChange(); nav("/"); }

  const shows = lib.filter((i) => i.kind === "show");
  const favorites = lib.filter((i) => i.is_favorite);
  const movies = lib.filter((i) => i.kind === "movie");

  return (
    <>
      {/* Cover header */}
      <div style={{ position: "relative", aspectRatio: "16/8", overflow: "hidden", background: "var(--bg-elev-2)" }}>
        {user.cover_url && <img src={user.cover_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(transparent 40%, var(--bg))" }} />
        <div style={{ position: "absolute", bottom: 12, left: 16 }}>
          <h1 style={{ margin: 0, fontSize: 24 }}>{user.name || user.email.split("@")[0]}</h1>
          {user.bio && <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>{user.bio}</p>}
        </div>
      </div>

      {shows.length > 0 && <Showcase title="Shows" to="/" items={shows} />}
      {favorites.length > 0 && <Showcase title="Favorites" to="/" items={favorites} heart />}
      {movies.length > 0 && <Showcase title="Movies" to="/movies" items={movies} />}

      <div className="section-head"><h2>Stats</h2></div>
      <div className="stat-grid">
        <Stat num={stats?.shows} label="TV Shows" />
        <Stat num={stats?.movies_watched} label="Movies watched" />
        <Stat num={stats?.episodes_watched} label="Episodes watched" accent />
        <Stat num={stats?.movies} label="Movies tracked" />
        <Stat text={stats ? hours(stats.tv_minutes) : undefined} label="Time in TV shows" accent />
        <Stat text={stats ? hours(stats.movie_minutes) : undefined} label="Time in movies" />
      </div>

      <TmdbKeySettings />

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <Link className="btn ghost" to="/import" style={{ textAlign: "center" }}>Re-import data</Link>
        <button className="btn ghost" onClick={logout}>Log out</button>
      </div>
    </>
  );
}

function Showcase({ title, to, items, heart }: { title: string; to: string; items: LibraryItem[]; heart?: boolean }) {
  return (
    <section>
      <Link to={to} className="section-head link">
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {heart && <span className="heart"><StarIcon size={18} filled /></span>}{title}
        </h2>
        <span className="chev">›</span>
      </Link>
      <PosterRow items={items.slice(0, 20)} />
    </section>
  );
}

function Stat({ num, text, label, accent }: { num?: number; text?: string; label: string; accent?: boolean }) {
  const display = text ?? num;
  return (
    <div className="stat">
      <div className={`num ${accent ? "accent" : ""}`}>{display === undefined ? "—" : typeof display === "number" ? display.toLocaleString() : display}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function TmdbKeySettings() {
  const [has, setHas] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.getSettings().then((s) => setHas(s.has_tmdb_key)).catch(() => setHas(false)); }, []);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.setTmdbKey(key);
      setHas(r.valid);
      setMsg(r.valid ? "Key saved and working ✓ Re-import to fetch posters." : "Saved, but TMDB rejected this key. Check you copied the v3 API key (or v4 token).");
      setKey("");
    } catch { setMsg("Could not save key."); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 16 }}>TMDB API key {has === true && <span style={{ color: "var(--primary)" }}>· connected</span>}</h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Needed for posters, artwork, episode lists and search. Get a free key at{" "}
        <a style={{ color: "var(--primary)" }} href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">themoviedb.org</a>.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="input" placeholder={has ? "Replace key…" : "Paste TMDB key…"} value={key} onChange={(e) => setKey(e.target.value)} />
        <button className="btn" disabled={busy || !key.trim()} onClick={save}>{busy ? "…" : "Save"}</button>
      </div>
      {msg && <p style={{ fontSize: 13, marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
