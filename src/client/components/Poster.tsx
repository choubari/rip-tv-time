import { Link } from "react-router-dom";
import type { LibraryItem } from "../../../shared/types";
import { TMDB_IMG, STATUS_COLOR } from "../../../shared/types";
import { StarIcon } from "./icons";

export function Poster({ item }: { item: LibraryItem; showProgress?: boolean }) {
  const year = item.release_date?.slice(0, 4);
  const color = STATUS_COLOR[item.status];
  // Colored bar under every poster (TV Time style): red=stopped, green=finished,
  // orange=watch next, yellow=watching/paused. Shows fill to progress %.
  const isShow = item.kind === "show";
  const pct = isShow && item.total_episodes && item.episodes_watched
    ? Math.min(100, Math.round((item.episodes_watched / item.total_episodes) * 100))
    : item.status === "finished" ? 100 : 0;
  const fill = item.status === "watching" || item.status === "paused" ? pct : 100;
  return (
    <Link className="poster" to={`/${item.kind}/${item.ref}`}>
      <div className="art">
        {item.poster_path ? (
          <img src={TMDB_IMG(item.poster_path, "w342")} alt={item.name} loading="lazy" />
        ) : (
          <div className="placeholder">{item.name}</div>
        )}
        {item.is_favorite && <span className="fav"><StarIcon size={18} filled /></span>}
        <div className="status-bar" style={{ background: "rgba(255,255,255,.18)" }}>
          <span style={{ width: `${fill}%`, background: color }} />
        </div>
      </div>
      <div className="title">{item.name}</div>
      {year && <div className="sub">{year}</div>}
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
