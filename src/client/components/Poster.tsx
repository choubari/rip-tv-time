import { Link } from "react-router-dom";
import type { LibraryItem } from "../../../shared/types";
import { TMDB_IMG, STATUS_COLOR } from "../../../shared/types";
import { StarIcon } from "./icons";

export function Poster({ item }: { item: LibraryItem; showProgress?: boolean }) {
  // Colored bar (TV Time style): red=stopped, green=finished, yellow=watching/paused
  // (filled to progress). No bar for "haven't started" or "watch next".
  const inProgress = item.status === "watching" || item.status === "paused";
  const showBar = item.status === "finished" || item.status === "stopped" || inProgress;
  const pct = inProgress && item.total_episodes && item.episodes_watched
    ? Math.min(100, Math.round((item.episodes_watched / item.total_episodes) * 100))
    : 100;
  return (
    <Link className="poster" to={`/${item.kind}/${item.ref}`}>
      <div className="art">
        {item.poster_path ? (
          <img src={TMDB_IMG(item.poster_path, "w342")} alt={item.name} loading="lazy" />
        ) : (
          <div className="placeholder">{item.name}</div>
        )}
        {item.is_favorite && <span className="fav"><StarIcon size={18} filled /></span>}
        {showBar && (
          <div className="status-bar" style={{ background: "rgba(255,255,255,.18)" }}>
            <span style={{ width: `${pct}%`, background: STATUS_COLOR[item.status] }} />
          </div>
        )}
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
