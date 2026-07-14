import { NavLink } from "react-router-dom";
import { HomeIcon, CalendarIcon, SearchIcon, UserIcon } from "./icons";

const tabs = [
  { to: "/", label: "Home", Icon: HomeIcon, end: true },
  { to: "/upcoming", label: "To Watch", Icon: CalendarIcon },
  { to: "/discover", label: "Discover", Icon: SearchIcon },
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
