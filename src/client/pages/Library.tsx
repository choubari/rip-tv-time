import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Kind, LibraryItem, Status } from "../../../shared/types";
import { STATUS_ORDER, STATUS_LABEL } from "../../../shared/types";
import { api } from "../lib/api";
import { PosterGrid } from "../components/Poster";
import { Loading } from "../components/Loading";

// The Shows and Movies tabs: a title's library grouped by status, in TV Time order.
export function Library({ kind, heading }: { kind: Kind; heading: string }) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);

  useEffect(() => { api.library(kind).then(setItems).catch(() => setItems([])); }, [kind]);
  if (!items) return <Loading />;

  if (items.length === 0) {
    return (
      <>
        <div className="topbar"><h1>{heading}</h1></div>
        <div className="empty">
          <p>No {heading.toLowerCase()} yet.</p>
          <Link className="btn" to="/import">Import your export</Link>
        </div>
      </>
    );
  }

  const groups = STATUS_ORDER
    .map((s) => [s, items.filter((i) => i.status === s)] as [Status, LibraryItem[]])
    .filter(([, list]) => list.length > 0);

  return (
    <>
      <div className="topbar">
        <h1>{heading}</h1>
        <div className="spacer" />
        <Link to="/import" className="chip">Import</Link>
      </div>
      {groups.map(([status, list]) => (
        <section key={status}>
          <div className="section-head">
            <h2>{STATUS_LABEL[status]} <span className="count">({list.length})</span></h2>
          </div>
          <PosterGrid items={list} showProgress={kind === "show" && (status === "watching" || status === "paused")} />
        </section>
      ))}
    </>
  );
}

export const Shows = () => <Library kind="show" heading="Shows" />;
export const Movies = () => <Library kind="movie" heading="Movies" />;
