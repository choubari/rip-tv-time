import { Hono } from "hono";
import type { Env, Vars } from "./types";
import { createMagicToken, verifyMagicToken, setSessionCookie, clearSession, requireAuth } from "./auth";
import { sendMagicLink } from "./email";
import { parseZips } from "./import";
import { search, fetchSeasons } from "./tmdb";
import { seedImport, resolveBatch, getLibrary, getTitle, getStats, addTitle, updateLibrary, toggleEpisode, getSetting, setSetting, tmdbKey, getLists, ensureTitle } from "./store";
import type { Status } from "../../shared/types";

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// ---------------------------------------------------------------- auth
app.post("/api/auth/request", async (c) => {
  const { email } = await c.req.json<{ email?: string }>();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "invalid email" }, 400);
  const token = await createMagicToken(c.env, email);
  const link = `${c.env.APP_URL}/api/auth/verify?token=${token}`;
  const { delivered, devLink } = await sendMagicLink(c.env, email, link);
  return c.json({ ok: true, delivered, devLink });
});

app.get("/api/auth/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.redirect("/login?error=missing");
  const res = await verifyMagicToken(c.env, token);
  if (!res) return c.redirect("/login?error=expired");
  setSessionCookie(c, res.sessionId);
  return c.redirect("/");
});

app.post("/api/auth/logout", async (c) => {
  await clearSession(c);
  return c.json({ ok: true });
});

// -------------------------------------------------------- authed routes
app.get("/api/me", requireAuth, async (c) => {
  const u = await c.env.DB.prepare("SELECT id, email, name, bio, cover_url FROM users WHERE id = ?").bind(c.get("userId")).first();
  return c.json(u);
});

app.post("/api/import", requireAuth, async (c) => {
  const form = await c.req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (!files.length) return c.json({ error: "no file" }, 400);
  const buffers = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
  let parsed;
  try {
    parsed = parseZips(buffers);
  } catch (e) {
    return c.json({ error: "could not read zip", detail: String(e) }, 400);
  }
  const result = await seedImport(c.env, c.get("userId"), parsed);
  return c.json({ ok: true, ...result });
});

// Called repeatedly by the import UI to lazily fetch posters (respects subrequest limits).
app.post("/api/resolve", requireAuth, async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 40), 50);
  return c.json(await resolveBatch(c.env, limit));
});

app.get("/api/library", requireAuth, async (c) => {
  const kind = c.req.query("kind");
  return c.json(await getLibrary(c.env, c.get("userId"), kind));
});

app.get("/api/stats", requireAuth, async (c) => c.json(await getStats(c.env, c.get("userId"))));

app.get("/api/lists", requireAuth, async (c) => c.json(await getLists(c.env, c.get("userId"))));

// Ensure a searched title exists in the DB so its detail page can open (without tracking it).
app.post("/api/title/ensure", requireAuth, async (c) => {
  const { kind, tmdb_id } = await c.req.json<{ kind: "show" | "movie"; tmdb_id: number }>();
  return c.json({ id: await ensureTitle(c.env, kind, tmdb_id) });
});

app.get("/api/title/:id", requireAuth, async (c) => {
  const t = await getTitle(c.env, c.get("userId"), c.req.param("id")!);
  return t ? c.json(t) : c.json({ error: "not found" }, 404);
});

app.get("/api/title/:id/seasons", requireAuth, async (c) => {
  const t = await getTitle(c.env, c.get("userId"), c.req.param("id")!);
  if (!t || t.kind !== "show" || !t.tmdb_id) return c.json({ seasons: [] });
  return c.json({ seasons: await fetchSeasons(await tmdbKey(c.env), t.tmdb_id) });
});

app.get("/api/search", requireAuth, async (c) => {
  const q = c.req.query("q");
  if (!q) return c.json([]);
  return c.json(await search(await tmdbKey(c.env), q));
});

// TMDB key management (entered in the UI so no file editing is needed).
app.get("/api/settings", requireAuth, async (c) => {
  const key = await getSetting(c.env, "tmdb_key");
  const envKey = !!c.env.TMDB_API_KEY;
  return c.json({ has_tmdb_key: !!(key || envKey), tmdb_key_hint: key ? key.slice(0, 4) + "…" : envKey ? "(from server secret)" : null });
});

app.post("/api/settings", requireAuth, async (c) => {
  const { tmdb_key } = await c.req.json<{ tmdb_key?: string }>();
  if (typeof tmdb_key !== "string") return c.json({ error: "tmdb_key required" }, 400);
  await setSetting(c.env, "tmdb_key", tmdb_key.trim());
  // Validate against TMDB so the user gets immediate feedback.
  const test = await search(tmdb_key.trim(), "breaking bad");
  return c.json({ ok: true, valid: test.length > 0 });
});

app.post("/api/library", requireAuth, async (c) => {
  const { kind, tmdb_id, status } = await c.req.json<{ kind: "show" | "movie"; tmdb_id: number; status?: Status }>();
  const id = await addTitle(c.env, c.get("userId"), kind, tmdb_id, status ?? (kind === "movie" ? "watch_next" : "not_started"));
  return c.json({ ok: true, id });
});

app.patch("/api/library/:id", requireAuth, async (c) => {
  await updateLibrary(c.env, c.get("userId"), c.req.param("id")!, await c.req.json());
  return c.json({ ok: true });
});

app.post("/api/title/:id/episode", requireAuth, async (c) => {
  const { season, episode, watched } = await c.req.json<{ season: number; episode: number; watched: boolean }>();
  await toggleEpisode(c.env, c.get("userId"), c.req.param("id")!, season, episode, watched);
  return c.json({ ok: true });
});

// SPA fallback: anything not matched above is served by the static assets binding.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
