import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import type { UserProfile } from "../../shared/types";
import { api, AuthError } from "./lib/api";
import { BottomNav } from "./components/BottomNav";
import { Login } from "./pages/Login";
import { ImportPage } from "./pages/ImportPage";
import { Shows, Movies } from "./pages/Library";
import { Discover } from "./pages/Discover";
import { Profile } from "./pages/Profile";
import { Detail } from "./pages/Detail";
import { Collection } from "./pages/Collection";

export default function App() {
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined); // undefined = loading

  const location = useLocation();

  useEffect(() => {
    api.me().then((u) => setUser(u)).catch(() => setUser(null));
  }, []);

  // Reset scroll to top whenever the route changes (grids/detail should open at top).
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  // Background poster resolver: keeps fetching missing posters while ANY tab is
  // open, regardless of which page you're on — so leaving the Import screen no
  // longer stops it. Gentle pacing to respect TMDB limits.
  useEffect(() => {
    if (!user) return;
    let stop = false;
    (async () => {
      while (!stop) {
        try {
          const r = await api.resolve(20);
          if (r.remaining === 0) break;
        } catch { break; }
        await new Promise((res) => setTimeout(res, 2500));
      }
    })();
    return () => { stop = true; };
  }, [user]);

  if (user === undefined) {
    return <div className="center-screen"><div className="spinner" /></div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login onDone={() => api.me().then(setUser).catch(() => {})} />} />
      </Routes>
    );
  }

  const refresh = () => api.me().then(setUser).catch((e) => { if (e instanceof AuthError) setUser(null); });

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Shows />} />
        <Route path="/movies" element={<Movies />} />
        <Route path="/explore" element={<Discover />} />
        <Route path="/profile" element={<Profile user={user} onChange={refresh} />} />
        <Route path="/import" element={<ImportPage onDone={refresh} />} />
        <Route path="/show/:ref" element={<Detail />} />
        <Route path="/movie/:ref" element={<Detail />} />
        <Route path="/list/:id" element={<Collection mode="list" />} />
        <Route path="/favorites/:kind" element={<Collection mode="favorites" />} />
        <Route path="/all/:kind" element={<Collection mode="all" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
