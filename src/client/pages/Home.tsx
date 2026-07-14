import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LibraryItem, Status } from "../../../shared/types";
import { STATUS_ORDER, STATUS_LABEL } from "../../../shared/types";
import { api } from "../lib/api";
import { PosterGrid } from "../components/Poster";

type Filter = "all" | "show" | "movie";

export function Home() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    api.library().then(setItems).catch(() => setItems([]));
  }, []);

  if (!items) return <Loading />;

  if (items.length === 0) {
    return (
      <>
        <Bar />
        <div className="empty">
          <p>Your library is empty.</p>
          <Link className="btn" to="/import">Import your export</Link>
        </div>
      </>
    );
  }

  const filtered = items.filter((i) => filter === "all" || i.kind === filter);
  const groups = STATUS_ORDER.map((s) => [s, filtered.filter((i) => i.status === s)] as [Status, LibraryItem[]])
    .filter(([, list]) => list.length > 0);

  return (
    <>
      <Bar />
      <div className="chips">
        {(["all", "show", "movie"] as Filter[]).map((f) => (
          <button key={f} className={`chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "show" ? "TV Shows" : "Movies"}
          </button>
        ))}
      </div>
      {groups.map(([status, list]) => (
        <section key={status}>
          <div className="section-head">
            <h2>{STATUS_LABEL[status]}</h2>
            <span className="count">{list.length}</span>
          </div>
          <PosterGrid items={list} showProgress={status === "watching" || status === "up_to_date"} />
        </section>
      ))}
    </>
  );
}

function Bar() {
  return (
    <div className="topbar">
      <h1>rip <span className="accent">tv time</span></h1>
      <div className="spacer" />
      <Link to="/import" className="chip">Import</Link>
    </div>
  );
}

export function Loading() {
  return <div className="center-screen"><div className="spinner" /></div>;
}
