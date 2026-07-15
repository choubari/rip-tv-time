import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./theme.css";

// In dev, kill any service worker left over from a production/PWA build — it
// otherwise caches stale CSS/JS and makes changes look like they never applied.
// If a SW was actively controlling the page, reload once to load fresh assets.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  Promise.all([
    navigator.serviceWorker
      .getRegistrations()
      .then((rs) => Promise.all(rs.map((r) => r.unregister()))),
    window.caches
      ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
      : Promise.resolve(),
  ]).then(() => {
    if (hadController) window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
