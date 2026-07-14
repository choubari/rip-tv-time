import { Link } from "react-router-dom";
import type { LibraryItem } from "../../../shared/types";
import { TMDB_IMG } from "../../../shared/types";
import { StarIcon } from "./icons";

export function Poster({ item, showProgress = false }: { item: LibraryItem; showProgress?: boolean }) {
  const year = item.release_date?.slice(0, 4);
  const pct =
    showProgress && item.total_episodes && item.episodes_watched
      ? Math.min(100, Math.round((item.episodes_watched / item.total_episodes) * 100))
      : 0;
  return (
    <Link className="poster" to={`/title/${encodeURIComponent(item.id)}`}>
      <div className="art">
        {item.poster_path ? (
          <img src={TMDB_IMG(item.poster_path, "w342")} alt={item.name} loading="lazy" />
        ) : (
          <div className="placeholder">{item.name}</div>
        )}
        {item.is_favorite && <span className="fav"><StarIcon size={18} filled /></span>}
      </div>
      <div className="title">{item.name}</div>
      {year && <div className="sub">{year}</div>}
      {pct > 0 && (
        <div className="progressbar"><span style={{ width: `${pct}%` }} /></div>
      )}
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
