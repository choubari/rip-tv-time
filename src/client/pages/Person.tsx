import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TMDB_IMG } from "../../../shared/types";
import type { PersonDetail, PersonCredit } from "../../worker/tmdb";
import { api } from "../lib/api";
import { Loading } from "../components/Loading";

export function Person() {
  const { id = "" } = useParams();
  const [p, setP] = useState<PersonDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    setP(null);
    setNotFound(false);
    api
      .person(id)
      .then(setP)
      .catch(() => setNotFound(true));
  }, [id]);

  // Tapping a credit opens its show/movie page (creating the title record if
  // needed) so you can track it straight away — same flow as search results.
  async function open(c: PersonCredit) {
    const key = `${c.kind}:${c.tmdb_id}`;
    setOpening(key);
    try {
      const { ref } = await api.ensure(c.kind, c.tmdb_id);
      nav(`/${c.kind}/${ref}`);
    } finally {
      setOpening(null);
    }
  }

  if (notFound)
    return (
      <>
        <div className="topbar">
          <button onClick={() => nav(-1)} style={backBtn}>
            ‹
          </button>
          <h1 style={{ fontSize: 18 }}>Not found</h1>
        </div>
        <div className="empty">This person couldn't be loaded.</div>
      </>
    );
  if (!p) return <Loading />;

  return (
    <>
      <div className="topbar">
        <button onClick={() => nav(-1)} style={backBtn}>
          ‹
        </button>
        <h1 style={{ fontSize: 18 }}>{p.name}</h1>
      </div>

      <div className="person-head">
        {p.profile_path ? (
          <img
            className="person-photo"
            src={TMDB_IMG(p.profile_path, "w185")}
            alt={p.name}
          />
        ) : (
          <div className="person-photo person-photo-empty">
            {p.name.charAt(0)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>{p.name}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {[
              p.known_for_department,
              p.birthday ? `Born ${p.birthday}` : null,
              p.place_of_birth,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {p.biography && (
        <p style={{ padding: "0 16px", lineHeight: 1.55, fontSize: 14 }}>
          {p.biography.length > 320
            ? p.biography.slice(0, 320).trimEnd() + "…"
            : p.biography}
        </p>
      )}

      <div className="section-head">
        <h2>Known for</h2>
      </div>
      {p.credits.length === 0 ? (
        <div className="empty">No shows or movies found.</div>
      ) : (
        <div className="grid">
          {p.credits.map((c) => {
            const key = `${c.kind}:${c.tmdb_id}`;
            return (
              <button
                className="poster"
                key={key}
                onClick={() => open(c)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                }}
              >
                <div className="art">
                  {c.poster_path ? (
                    <img
                      src={TMDB_IMG(c.poster_path)}
                      alt={c.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="placeholder">{c.name}</div>
                  )}
                  {opening === key && (
                    <div
                      className="placeholder"
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(0,0,0,.5)",
                      }}
                    >
                      <div className="spinner" />
                    </div>
                  )}
                </div>
                <div className="title">{c.name}</div>
                <div className="sub">
                  {[
                    c.kind === "movie" ? "Movie" : "TV",
                    c.date?.slice(0, 4),
                    c.character,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

const backBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text)",
  fontSize: 22,
};
