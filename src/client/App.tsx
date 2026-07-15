import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
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

  useEffect(() => {
    api.me().then((u) => setUser(u)).catch(() => setUser(null));
  }, []);

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
