import { Hono } from "hono";
import type { Env, Vars } from "./types";
import { createMagicToken, verifyMagicToken, setSessionCookie, clearSession, requireAuth } from "./auth";
import { sendMagicLink } from "./email";
import { parseZips } from "./import";
import { search } from "./tmdb";
import { seedImport, resolveBatch, getLibrary, getTitle, getStats, addTitle, updateLibrary, toggleEpisode } from "./store";
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

app.get("/api/upcoming", requireAuth, async (c) => {
  // "To watch": active shows ordered by recent activity + movies queued.
  const lib = await getLibrary(c.env, c.get("userId"));
  const upcoming = lib
    .filter((i) => i.status === "watching" || i.status === "up_to_date" || i.status === "watch_later")
    .slice(0, 60);
  return c.json(upcoming);
});

app.get("/api/title/:id", requireAuth, async (c) => {
  const t = await getTitle(c.env, c.get("userId"), c.req.param("id")!);
  return t ? c.json(t) : c.json({ error: "not found" }, 404);
});

app.get("/api/search", requireAuth, async (c) => {
  const q = c.req.query("q");
  if (!q) return c.json([]);
  return c.json(await search(c.env, q));
});

app.post("/api/library", requireAuth, async (c) => {
  const { kind, tmdb_id, status } = await c.req.json<{ kind: "show" | "movie"; tmdb_id: number; status?: Status }>();
  const id = await addTitle(c.env, c.get("userId"), kind, tmdb_id, status ?? (kind === "movie" ? "watch_later" : "not_started"));
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
