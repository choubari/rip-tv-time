import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SearchResult } from "../../worker/tmdb";
import { TMDB_IMG } from "../../../shared/types";
import { api } from "../lib/api";

export function Discover() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);
  const nav = useNavigate();

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try { setResults(await api.search(q)); } finally { setBusy(false); }
  }

  // Tapping a result opens its show/movie page (creating the title record if
  // needed). You then track it / mark episodes from there — just like TV Time.
  async function open(r: SearchResult) {
    setOpening(r.tmdb_id);
    try {
      const { ref } = await api.ensure(r.kind, r.tmdb_id);
      nav(`/${r.kind}/${ref}`);
    } finally { setOpening(null); }
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
          <button className="poster" key={`${r.kind}-${r.tmdb_id}`} onClick={() => open(r)} style={{ background: "none", border: "none", padding: 0, textAlign: "left" }}>
            <div className="art">
              {r.poster_path ? <img src={TMDB_IMG(r.poster_path)} alt={r.name} loading="lazy" /> : <div className="placeholder">{r.name}</div>}
              {opening === r.tmdb_id && <div className="placeholder" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)" }}><div className="spinner" /></div>}
            </div>
            <div className="title">{r.name}</div>
            <div className="sub">{[r.kind === "movie" ? "Movie" : "TV", r.release_date?.slice(0, 4)].filter(Boolean).join(" · ")}</div>
          </button>
        ))}
      </div>
      {!busy && results.length === 0 && <div className="empty">Search to track a new show or movie.</div>}
    </>
  );
}
