import { useState } from "react";
import { Link } from "react-router-dom";
import type { SearchResult } from "../../worker/tmdb";
import { TMDB_IMG } from "../../../shared/types";
import { api } from "../lib/api";

export function Discover() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Record<number, string>>({});

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try { setResults(await api.search(q)); } finally { setBusy(false); }
  }

  async function add(r: SearchResult) {
    const status = r.kind === "movie" ? "watch_later" : "not_started";
    const { id } = await api.add(r.kind, r.tmdb_id, status);
    setAdded((a) => ({ ...a, [r.tmdb_id]: id }));
  }

  return (
    <>
      <div className="topbar"><h1>Explore</h1></div>
      <form onSubmit={run} style={{ padding: 16, display: "flex", gap: 8 }}>
        <input className="input" placeholder="Search shows & movies…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <button className="btn" disabled={busy}>{busy ? "…" : "Go"}</button>
      </form>

      <div className="grid">
        {results.map((r) => (
          <div className="poster" key={`${r.kind}-${r.tmdb_id}`}>
            <Link className="art" to={added[r.tmdb_id] ? `/title/${encodeURIComponent(added[r.tmdb_id])}` : "#"} onClick={(e) => !added[r.tmdb_id] && e.preventDefault()}>
              {r.poster_path ? <img src={TMDB_IMG(r.poster_path)} alt={r.name} loading="lazy" /> : <div className="placeholder">{r.name}</div>}
              <span className="badge">{r.kind === "movie" ? "Movie" : "TV"}</span>
            </Link>
            <div className="title">{r.name}</div>
            <div className="sub">{r.release_date?.slice(0, 4)}</div>
            <button
              className="chip"
              style={{ marginTop: 6, width: "100%", background: added[r.tmdb_id] ? "var(--bg-elev-2)" : "var(--primary)", color: "#fff" }}
              disabled={!!added[r.tmdb_id]}
              onClick={() => add(r)}
            >
              {added[r.tmdb_id] ? "Added ✓" : "+ Track"}
            </button>
          </div>
        ))}
      </div>
      {!busy && results.length === 0 && <div className="empty">Search TMDB to track something new.</div>}
    </>
  );
}
