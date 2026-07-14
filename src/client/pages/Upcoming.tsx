import { useEffect, useState } from "react";
import type { LibraryItem } from "../../../shared/types";
import { api } from "../lib/api";
import { PosterGrid } from "../components/Poster";
import { Loading } from "./Home";

// "To Watch": shows you're actively watching / caught up on, plus your queue.
export function Upcoming() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  useEffect(() => { api.upcoming().then(setItems).catch(() => setItems([])); }, []);
  if (!items) return <Loading />;

  const watching = items.filter((i) => i.status === "watching" || i.status === "up_to_date");
  const later = items.filter((i) => i.status === "watch_later");

  return (
    <>
      <div className="topbar"><h1>To Watch</h1></div>
      {items.length === 0 && <div className="empty">Nothing queued yet.</div>}
      {watching.length > 0 && (
        <section>
          <div className="section-head"><h2>Watching</h2><span className="count">{watching.length}</span></div>
          <PosterGrid items={watching} showProgress />
        </section>
      )}
      {later.length > 0 && (
        <section>
          <div className="section-head"><h2>Watch later</h2><span className="count">{later.length}</span></div>
          <PosterGrid items={later} />
        </section>
      )}
    </>
  );
}
