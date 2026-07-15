import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { LibraryItem } from "../../../shared/types";
import { api } from "../lib/api";
import { PosterGrid } from "../components/Poster";
import { Loading } from "../components/Loading";

// Opens a list or the favorites collection as a full poster grid.
export function Collection({ mode }: { mode: "list" | "favorites" }) {
  const { id = "", kind = "" } = useParams();
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (mode === "list") {
      api.lists().then((lists) => {
        const l = lists.find((x) => String(x.id) === id);
        setTitle(l?.name ?? "List");
        setItems(l?.items ?? []);
      }).catch(() => setItems([]));
    } else {
      setTitle(kind === "movie" ? "Favorite movies" : "Favorite shows");
      api.library(kind).then((lib) => setItems(lib.filter((i) => i.is_favorite))).catch(() => setItems([]));
    }
  }, [mode, id, kind]);

  if (!items) return <Loading />;
  return (
    <>
      <div className="topbar">
        <button onClick={() => nav(-1)} style={{ background: "none", border: "none", color: "var(--text)", fontSize: 22 }}>‹</button>
        <h1 style={{ fontSize: 18 }}>{title}</h1>
        <div className="spacer" />
        <span className="count">{items.length}</span>
      </div>
      {items.length ? <PosterGrid items={items} /> : <div className="empty">Nothing here yet.</div>}
    </>
  );
}
