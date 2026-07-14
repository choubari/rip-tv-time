import { NavLink } from "react-router-dom";
import { TvIcon, FilmIcon, SearchIcon, UserIcon } from "./icons";

const tabs = [
  { to: "/", label: "Shows", Icon: TvIcon, end: true },
  { to: "/movies", label: "Movies", Icon: FilmIcon },
  { to: "/explore", label: "Explore", Icon: SearchIcon },
  { to: "/profile", label: "Profile", Icon: UserIcon },
];

export function BottomNav() {
  return (
    <nav className="bottomnav">
      {tabs.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? "active" : "")}>
          <Icon />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
