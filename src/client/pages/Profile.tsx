import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  LibraryItem,
  ListSummary,
  Stats,
  UserProfile,
} from "../../../shared/types";
import { TMDB_IMG } from "../../../shared/types";
import { api } from "../lib/api";
import { RelinkHint, RelinkControls } from "../components/RelinkForm";
import { PosterRow } from "../components/Poster";
import { StarIcon } from "../components/icons";

function hours(mins: number) {
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// Same order as the library API: most recent activity first, then when added.
const key = (i: LibraryItem) =>
  (i.last_watched_at ?? "") + "|" + (i.added_at ?? "");
const byTracked = (a: LibraryItem, b: LibraryItem) =>
  key(b).localeCompare(key(a));

export function Profile({
  user,
  onChange,
}: {
  user: UserProfile;
  onChange: () => void;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [lib, setLib] = useState<LibraryItem[]>([]);
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [unmatched, setUnmatched] = useState<
    { ref: number; name: string; kind: string }[]
  >([]);
  const nav = useNavigate();

  useEffect(() => {
    api
      .stats()
      .then(setStats)
      .catch(() => {});
    api
      .library()
      .then(setLib)
      .catch(() => {});
    api
      .lists()
      .then(setLists)
      .catch(() => {});
    api
      .unmatched()
      .then(setUnmatched)
      .catch(() => {});
  }, []);

  async function logout() {
    await api.logout();
    onChange();
    nav("/");
  }

  const shows = lib.filter((i) => i.kind === "show").sort(byTracked);
  const movies = lib.filter((i) => i.kind === "movie").sort(byTracked);
  const favShows = shows.filter((i) => i.is_favorite);
  const favMovies = movies.filter((i) => i.is_favorite);

  return (
    <>
      {/* Cover header with avatar */}
      <div
        style={{
          position: "relative",
          aspectRatio: "16/8",
          overflow: "hidden",
          background: "var(--bg-elev-2)",
        }}
      >
        {user.cover_url && (
          <img
            src={user.cover_url}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.7,
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(transparent 40%, var(--bg))",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 16,
            display: "flex",
            alignItems: "flex-end",
            gap: 12,
          }}
        >
          <div className="avatar">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" />
            ) : (
              <span>{(user.name || user.email)[0]?.toUpperCase()}</span>
            )}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>
              {user.name || user.email.split("@")[0]}
            </h1>
            {user.bio && (
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
                {user.bio}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="section-head static">
        <h2>Stats</h2>
      </div>
      <div className="stat-grid">
        <Stat num={stats?.shows} label="TV Shows" />
        <Stat num={stats?.movies_watched} label="Movies watched" />
        <Stat num={stats?.episodes_watched} label="Episodes watched" accent />
        <Stat num={stats?.movies} label="Movies tracked" />
        <Stat
          text={stats ? hours(stats.tv_minutes) : undefined}
          label="Time in TV shows"
          accent
        />
        <Stat
          text={stats ? hours(stats.movie_minutes) : undefined}
          label="Time in movies"
        />
      </div>

      {lists.length > 0 && (
        <section>
          <div className="section-head static">
            <h2>Lists</h2>
            <span className="count">{lists.length}</span>
          </div>
          <div className="row">
            {lists.map((l) => (
              <ListCard key={l.id} list={l} />
            ))}
          </div>
        </section>
      )}

      {shows.length > 0 && (
        <Showcase title="Shows" to="/all/show" items={shows} />
      )}
      {favShows.length > 0 && (
        <Showcase
          title="Favorite shows"
          to="/favorites/show"
          items={favShows}
          heart
        />
      )}
      {movies.length > 0 && (
        <Showcase title="Movies" to="/all/movie" items={movies} />
      )}
      {favMovies.length > 0 && (
        <Showcase
          title="Favorite movies"
          to="/favorites/movie"
          items={favMovies}
          heart
        />
      )}

      <TmdbKeySettings />

      {user.is_admin && <AdminPanel />}

      {unmatched.length > 0 && (
        <div style={{ padding: 16 }}>
          <h2 style={{ fontSize: 16 }}>
            Fix missing posters{" "}
            <span className="count">{unmatched.length}</span>
          </h2>
          <RelinkHint />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {unmatched.map((u) => (
              <RelinkRow
                key={u.ref}
                item={u}
                onDone={() =>
                  setUnmatched((cur) => cur.filter((x) => x.ref !== u.ref))
                }
              />
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <Link
          className="btn ghost"
          to="/import"
          style={{ textAlign: "center" }}
        >
          Re-import data
        </Link>
        <button className="btn ghost" onClick={logout}>
          Log out
        </button>
      </div>
    </>
  );
}

function Showcase({
  title,
  to,
  items,
  heart,
}: {
  title: string;
  to: string;
  items: LibraryItem[];
  heart?: boolean;
}) {
  return (
    <section>
      <Link to={to} className="section-head link">
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {heart && (
            <span className="heart">
              <StarIcon size={18} filled />
            </span>
          )}
          {title}
        </h2>
        <span className="chev">›</span>
      </Link>
      <PosterRow items={items.slice(0, 20)} />
    </section>
  );
}

// A list rendered as a wide collage banner (like TV Time), with the name overlaid.
function ListCard({ list }: { list: ListSummary }) {
  const posters = list.items.filter((i) => i.poster_path).slice(0, 4);
  return (
    <Link className="list-card" to={`/list/${list.id}`}>
      <div className="list-collage">
        {posters.length ? (
          posters.map((i) => (
            <img key={i.id} src={TMDB_IMG(i.poster_path!, "w342")} alt="" />
          ))
        ) : (
          <div className="placeholder">{list.name}</div>
        )}
      </div>
      <div className="list-overlay" />
      <div className="list-name">
        {list.name} <span className="muted">· {list.count}</span>
      </div>
    </Link>
  );
}

// Admin-only: invite allowlist management.
function AdminPanel() {
  const [emails, setEmails] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  useEffect(() => {
    api
      .allowed()
      .then(setEmails)
      .catch(() => {});
  }, []);
  async function add() {
    const e = email.trim().toLowerCase();
    if (!e) return;
    await api.allow(e);
    setEmails((c) => [...new Set([...c, e])].sort());
    setEmail("");
  }
  async function remove(e: string) {
    await api.disallow(e);
    setEmails((c) => c.filter((x) => x !== e));
  }
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 16 }}>
        Invited users <span className="count">{emails.length}</span>
      </h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Only these emails (plus you) can sign in when invite-only mode is on.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          type="email"
          placeholder="friend@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn" disabled={!email.trim()} onClick={add}>
          Invite
        </button>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          marginTop: 8,
        }}
      >
        {emails.map((e) => (
          <div
            key={e}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 0",
              borderBottom: "1px solid var(--border)",
              fontSize: 14,
            }}
          >
            <span>{e}</span>
            <button className="chip" onClick={() => remove(e)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RelinkRow({
  item,
  onDone,
}: {
  item: { ref: number; name: string; kind: string };
  onDone: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "6px 0",
        borderBottom: "1px solid var(--border)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link to={`/${item.kind}/${item.ref}`} style={{ fontSize: 14 }}>
          {item.name}
        </Link>
      </div>
      <RelinkControls refId={item.ref} onDone={onDone} />
    </div>
  );
}

function Stat({
  num,
  text,
  label,
  accent,
}: {
  num?: number;
  text?: string;
  label: string;
  accent?: boolean;
}) {
  const display = text ?? num;
  return (
    <div className="stat">
      <div className={`num ${accent ? "accent" : ""}`}>
        {display === undefined
          ? "—"
          : typeof display === "number"
            ? display.toLocaleString()
            : display}
      </div>
      <div className="label">{label}</div>
    </div>
  );
}

function TmdbKeySettings() {
  const [has, setHas] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setHas(s.has_tmdb_key);
        setCanEdit(s.can_edit);
      })
      .catch(() => setHas(false));
  }, []);

  // Fetch posters/artwork for everything still unresolved (no re-import needed).
  async function fetchArtwork() {
    setProgress(0);
    let total = 0,
      remaining = Infinity;
    while (remaining > 0) {
      const r = await api.resolve(40);
      if (total === 0) total = r.resolved + r.remaining || 1;
      remaining = r.remaining;
      setProgress(Math.round(((total - remaining) / total) * 100));
    }
    setProgress(100);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.setTmdbKey(key);
      setHas(r.valid);
      setKey("");
      if (r.valid) {
        setMsg("Key saved ✓ Fetching posters…");
        await fetchArtwork();
        setMsg("Posters fetched ✓ Your library is up to date.");
      } else {
        setMsg(
          "Saved, but TMDB rejected this key. Check you copied the v3 API key (or v4 token).",
        );
      }
    } catch {
      setMsg("Could not save key.");
    } finally {
      setBusy(false);
    }
  }

  // The TMDB key is platform-wide and managed by the admin only.
  if (!canEdit) return null;

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 16 }}>
        TMDB API key{" "}
        {has === true && (
          <span style={{ color: "var(--primary)" }}>· connected</span>
        )}
      </h2>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Platform-wide key (admin). Needed for posters, artwork, episode lists
        and search. Get a free key at{" "}
        <a
          style={{ color: "var(--primary)" }}
          href="https://www.themoviedb.org/settings/api"
          target="_blank"
          rel="noreferrer"
        >
          themoviedb.org
        </a>
        .
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          placeholder={has ? "Replace key…" : "Paste TMDB key…"}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <button className="btn" disabled={busy || !key.trim()} onClick={save}>
          {busy ? "…" : "Save"}
        </button>
      </div>
      {has && !key && (
        <button
          className="btn ghost"
          style={{ marginTop: 8 }}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            // Re-attempt previously-failed matches too (matcher may have improved).
            api
              .retryResolve()
              .catch(() => {})
              .then(fetchArtwork)
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Fetching…" : "Fetch missing posters"}
        </button>
      )}
      {progress !== null && progress < 100 && (
        <div className="progress-line" style={{ marginTop: 10 }}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      {msg && <p style={{ fontSize: 13, marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
