import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Stats, UserProfile } from "../../../shared/types";
import { api } from "../lib/api";

function hours(mins: number) {
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function Profile({ user, onChange }: { user: UserProfile; onChange: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const nav = useNavigate();
  useEffect(() => { api.stats().then(setStats).catch(() => {}); }, []);

  async function logout() {
    await api.logout();
    onChange();
    nav("/");
  }

  return (
    <>
      {user.cover_url ? (
        <div style={{ position: "relative", aspectRatio: "16/7", overflow: "hidden" }}>
          <img src={user.cover_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.65 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(transparent, var(--bg))" }} />
        </div>
      ) : (
        <div className="topbar"><h1>Profile</h1></div>
      )}

      <div style={{ padding: "8px 16px 0" }}>
        <h1 style={{ margin: "0 0 2px" }}>{user.name || user.email.split("@")[0]}</h1>
        <p className="muted" style={{ marginTop: 0 }}>{user.email}</p>
        {user.bio && <p>{user.bio}</p>}
      </div>

      <div className="stat-grid">
        <Stat num={stats?.shows} label="TV Shows" />
        <Stat num={stats?.movies_watched} label="Movies watched" />
        <Stat num={stats?.episodes_watched} label="Episodes watched" accent />
        <Stat num={stats?.movies} label="Movies tracked" />
        <Stat text={stats ? hours(stats.tv_minutes) : undefined} label="Time in TV shows" accent />
        <Stat text={stats ? hours(stats.movie_minutes) : undefined} label="Time in movies" />
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <Link className="btn ghost" to="/import" style={{ textAlign: "center" }}>Re-import data</Link>
        <button className="btn ghost" onClick={logout}>Log out</button>
      </div>
    </>
  );
}

function Stat({ num, text, label, accent }: { num?: number; text?: string; label: string; accent?: boolean }) {
  const display = text ?? (num ?? undefined);
  return (
    <div className="stat">
      <div className={`num ${accent ? "accent" : ""}`}>{display === undefined ? "—" : display.toLocaleString?.() ?? display}</div>
      <div className="label">{label}</div>
    </div>
  );
}
