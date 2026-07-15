import { Link } from "react-router-dom";
import type { LibraryItem, Status } from "../../../shared/types";
import { TMDB_IMG, STATUS_COLOR } from "../../../shared/types";
import { StarIcon } from "./icons";

// Reusable TV Time-style colored progress bar. Fills to watched % for in-progress
// and stopped shows (a show stopped at ep 2/10 shows a short red bar), full for
// finished. No bar for "haven't started" / "watch next". Used by posters + search.
export function StatusBar({ status, watched, total }: { status: Status; watched?: number; total?: number | null }) {
  if (status === "not_started" || status === "watch_next") return null;
  const partial = status === "watching" || status === "paused" || status === "stopped";
  const pct = partial && total && watched ? Math.min(100, Math.round((watched / total) * 100)) : 100;
  return (
    <div className="status-bar" style={{ background: "rgba(255,255,255,.18)" }}>
      <span style={{ width: `${pct}%`, background: STATUS_COLOR[status] }} />
    </div>
  );
}

export function Poster({ item }: { item: LibraryItem; showProgress?: boolean }) {
  return (
    <Link className="poster" to={`/${item.kind}/${item.ref}`}>
      <div className="art">
        {item.poster_path ? (
          <img src={TMDB_IMG(item.poster_path, "w342")} alt={item.name} loading="lazy" />
        ) : (
          <div className="placeholder">{item.name}</div>
        )}
        {item.is_favorite && <span className="fav"><StarIcon size={18} filled /></span>}
        <StatusBar status={item.status} watched={item.episodes_watched} total={item.total_episodes} />
      </div>
      <div className="title">{item.name}</div>
    </Link>
  );
}

export function PosterGrid({ items, showProgress }: { items: LibraryItem[]; showProgress?: boolean }) {
  return (
    <div className="grid">
      {items.map((i) => (
        <Poster key={i.id} item={i} showProgress={showProgress} />
      ))}
    </div>
  );
}

export function PosterRow({ items }: { items: LibraryItem[] }) {
  return (
    <div className="row">
      {items.map((i) => (
        <Poster key={i.id} item={i} />
      ))}
    </div>
  );
}
