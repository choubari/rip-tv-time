import { Hono } from "hono";
import type { Env, Vars } from "./types";
import {
  createMagicToken,
  verifyMagicToken,
  setSessionCookie,
  clearSession,
  requireAuth,
  isEmailAllowed,
  isAdmin,
  isDemo,
  canManageKey,
  sessionEmail,
} from "./auth";
import type { Context, Next } from "hono";
import { sendMagicLink, sendInvite } from "./email";
import { parseZips } from "./import";
import { search, fetchSeasons, fetchExtra } from "./tmdb";
import { fetchTvdbSeasons } from "./tvdb";
import {
  seedImport,
  resolveBatch,
  retryUnresolved,
  getLibrary,
  getTitle,
  getStats,
  addTitle,
  updateLibrary,
  toggleEpisode,
  getSetting,
  setSetting,
  tmdbKey,
  getLists,
  addToList,
  ensureTitle,
  refOf,
  getUnmatched,
  relinkTitle,
  refreshNewEpisodes,
  rateLimit,
} from "./store";
import type { Status } from "../../shared/types";

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;
const clientIp = (c: Ctx) => c.req.header("cf-connecting-ip") || "unknown";

// Rate-limit middleware. keyFn identifies the actor+action.
const rl =
  (keyFn: (c: Ctx) => string, max: number, windowSec: number) =>
  async (c: Ctx, next: Next) => {
    if (!(await rateLimit(c.env, keyFn(c), max, windowSec)))
      return c.json({ error: "Too many requests — slow down." }, 429);
    await next();
  };

// Block writes for the read-only public demo account.
const blockDemo = async (c: Ctx, next: Next) => {
  const email = await sessionEmail(c.env, c.get("userId"));
  if (isDemo(c.env, email))
    return c.json({ error: "The demo is read-only." }, 403);
  await next();
};

// ---------------------------------------------------------------- auth
app.post(
  "/api/auth/request",
  rl((c) => `authreq:${clientIp(c)}`, 20, 900), // 6 per 15 min per IP (email-spam guard)
  async (c) => {
    const { email } = await c.req.json<{ email?: string }>();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return c.json({ error: "invalid email" }, 400);
    if (!(await isEmailAllowed(c.env, email)))
      return c.json(
        { error: "This app is invite-only. Ask the owner for access." },
        403,
      );
    const token = await createMagicToken(c.env, email);
    const link = `${c.env.APP_URL}/api/auth/verify?token=${token}`;
    const { delivered, devLink } = await sendMagicLink(c.env, email, link);
    // Only expose the link in the response when there is NO email provider (local
    // self-host). With email configured, the link is delivered by email only.
    const emailConfigured = !!(c.env.RESEND_API_KEY && c.env.MAIL_FROM);
    return c.json({
      ok: true,
      delivered,
      devLink: emailConfigured ? undefined : devLink,
    });
  },
);

// One-click demo sign-in (public OSS deploy). Only works if DEMO_EMAIL is set.
app.post(
  "/api/auth/demo",
  rl((c) => `demo:${clientIp(c)}`, 60, 3600),
  async (c) => {
    if (!c.env.DEMO_EMAIL) return c.json({ error: "demo not enabled" }, 404);
    const token = await createMagicToken(c.env, c.env.DEMO_EMAIL);
    const res = await verifyMagicToken(c.env, token);
    if (!res) return c.json({ error: "demo unavailable" }, 500);
    setSessionCookie(c, res.sessionId);
    return c.json({ ok: true });
  },
);

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
  const u = await c.env.DB.prepare(
    "SELECT id, email, name, bio, cover_url, avatar_url FROM users WHERE id = ?",
  )
    .bind(c.get("userId"))
    .first<{ email: string }>();
  const demo =
    !!c.env.DEMO_EMAIL &&
    u?.email.toLowerCase() === c.env.DEMO_EMAIL.toLowerCase();
  return c.json({ ...u, is_admin: isAdmin(c.env, u?.email), is_demo: demo });
});

// Admin-only: manage the invite allowlist.
async function requireAdmin(c: any, next: any) {
  const email = await sessionEmail(c.env, c.get("userId"));
  if (!isAdmin(c.env, email)) return c.json({ error: "admin only" }, 403);
  await next();
}
app.get("/api/admin/allowed", requireAuth, requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT email FROM allowed_emails ORDER BY email",
  ).all();
  return c.json(results.map((r: any) => r.email));
});
app.post("/api/admin/allowed", requireAuth, requireAdmin, async (c) => {
  const { email } = await c.req.json<{ email?: string }>();
  if (!email) return c.json({ error: "email required" }, 400);
  const addr = email.toLowerCase().trim();
  await c.env.DB.prepare(
    "INSERT INTO allowed_emails (email) VALUES (?) ON CONFLICT DO NOTHING",
  )
    .bind(addr)
    .run();
  // Best-effort: email the invitee the app link so they can sign in.
  const { delivered } = await sendInvite(c.env, addr);
  return c.json({ ok: true, delivered });
});
app.delete("/api/admin/allowed", requireAuth, requireAdmin, async (c) => {
  const { email } = await c.req.json<{ email?: string }>();
  await c.env.DB.prepare("DELETE FROM allowed_emails WHERE email = ?")
    .bind((email ?? "").toLowerCase().trim())
    .run();
  return c.json({ ok: true });
});

app.post(
  "/api/import",
  requireAuth,
  blockDemo,
  rl((c) => `import:${c.get("userId")}`, 30, 3600),
  async (c) => {
    const form = await c.req.formData();
    const files = form
      .getAll("file")
      .filter((f): f is File => f instanceof File);
    if (!files.length) return c.json({ error: "no file" }, 400);
    const buffers = await Promise.all(
      files.map(async (f) => new Uint8Array(await f.arrayBuffer())),
    );
    let parsed;
    try {
      parsed = parseZips(buffers);
    } catch (e) {
      return c.json({ error: "could not read zip", detail: String(e) }, 400);
    }
    const result = await seedImport(c.env, c.get("userId"), parsed);
    return c.json({ ok: true, ...result });
  },
);

// Called repeatedly by the import UI to lazily fetch posters (respects subrequest limits).
app.post(
  "/api/resolve",
  requireAuth,
  blockDemo,
  rl((c) => `resolve:${c.get("userId")}`, 1500, 300),
  async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 40), 50);
    return c.json(await resolveBatch(c.env, limit));
  },
);

// Re-attempt every title that previously failed to match (clears the give-up
// flag; the background resolver then picks them up). Handy after matcher fixes.
app.post(
  "/api/resolve/retry",
  requireAuth,
  blockDemo,
  rl((c) => `resolveretry:${c.get("userId")}`, 20, 3600),
  async (c) => {
    const reset = await retryUnresolved(c.env);
    return c.json({ ok: true, reset });
  },
);

app.get("/api/library", requireAuth, async (c) => {
  const kind = c.req.query("kind");
  return c.json(await getLibrary(c.env, c.get("userId"), kind));
});

app.get("/api/stats", requireAuth, async (c) =>
  c.json(await getStats(c.env, c.get("userId"))),
);

app.get("/api/lists", requireAuth, async (c) =>
  c.json(await getLists(c.env, c.get("userId"))),
);

// Add a title to a list (creating the list if the name is new).
app.post(
  "/api/lists/add",
  requireAuth,
  blockDemo,
  rl((c) => `listadd:${c.get("userId")}`, 120, 60),
  async (c) => {
    const { ref, list } = await c.req.json<{ ref: number; list: string }>();
    const ok = await addToList(c.env, c.get("userId"), ref, list);
    return c.json({ ok });
  },
);

app.get("/api/unmatched", requireAuth, async (c) =>
  c.json(await getUnmatched(c.env, c.get("userId"))),
);

// Manually fix a wrong/missing match by pasting a TMDB id (default) or a TVDB id.
app.post(
  "/api/relink",
  requireAuth,
  blockDemo,
  rl((c) => `relink:${c.get("userId")}`, 60, 60),
  async (c) => {
    const { ref, tmdb_id, tvdb_id } = await c.req.json<{
      ref: number;
      tmdb_id?: number;
      tvdb_id?: number;
    }>();
    const ok = tvdb_id
      ? await relinkTitle(c.env, ref, tvdb_id, "tvdb")
      : await relinkTitle(c.env, ref, tmdb_id ?? 0, "tmdb");
    return c.json({ ok });
  },
);

// Ensure a searched title exists in the DB so its detail page can open (without tracking it).
app.post(
  "/api/title/ensure",
  requireAuth,
  rl((c) => `ensure:${c.get("userId")}`, 120, 60),
  async (c) => {
    const { kind, tmdb_id } = await c.req.json<{
      kind: "show" | "movie";
      tmdb_id: number;
    }>();
    const id = await ensureTitle(c.env, kind, tmdb_id);
    return c.json({ id, ref: await refOf(c.env, id) });
  },
);

// Clean numeric refs power the /show/:ref and /movie/:ref URLs.
app.get("/api/t/:ref", requireAuth, async (c) => {
  const t = await getTitle(c.env, c.get("userId"), c.req.param("ref")!, true);
  return t ? c.json(t) : c.json({ error: "not found" }, 404);
});

// Cast (with photos) + TMDB/IMDb ratings for the about page.
app.get(
  "/api/t/:ref/extra",
  requireAuth,
  rl((c) => `extra:${c.get("userId")}`, 300, 60),
  async (c) => {
    const t = await getTitle(c.env, c.get("userId"), c.req.param("ref")!, true);
    if (!t || !t.tmdb_id)
      return c.json({
        cast: [],
        imdb_id: null,
        tmdb_rating: null,
        tmdb_votes: null,
      });
    return c.json(await fetchExtra(await tmdbKey(c.env), t.kind, t.tmdb_id));
  },
);

app.get(
  "/api/t/:ref/seasons",
  requireAuth,
  rl((c) => `seasons:${c.get("userId")}`, 300, 60),
  async (c) => {
    const t = await getTitle(c.env, c.get("userId"), c.req.param("ref")!, true);
    if (!t || t.kind !== "show") return c.json({ seasons: [] });
    // Prefer TVDB: the exports are TVDB-based, so its season/episode numbering
    // matches the stored episodes exactly (TMDB sometimes flattens/miscounts).
    if (t.tvdb_id && c.env.TVDB_API_KEY) {
      const tvdb = await fetchTvdbSeasons(c.env.TVDB_API_KEY, t.tvdb_id);
      if (tvdb.length) return c.json({ seasons: tvdb });
    }
    if (t.tmdb_id)
      return c.json({
        seasons: await fetchSeasons(await tmdbKey(c.env), t.tmdb_id),
      });
    return c.json({ seasons: [] });
  },
);

app.get(
  "/api/search",
  requireAuth,
  rl((c) => `search:${c.get("userId")}`, 120, 60),
  async (c) => {
    const q = c.req.query("q");
    if (!q) return c.json([]);
    const results = await search(await tmdbKey(c.env), q);
    // Annotate results already in the user's library with their ref + progress (so
    // the UI links straight to the tracked title and shows a progress bar).
    const { results: mine } = await c.env.DB.prepare(
      `SELECT t.kind, t.tmdb_id, t.rowid AS ref, l.status, t.total_episodes,
            (SELECT COUNT(*) FROM watched_episodes w WHERE w.user_id = l.user_id AND w.title_id = l.title_id AND w.season > 0 AND w.watched = 1) AS watched
     FROM library l JOIN titles t ON t.id = l.title_id WHERE l.user_id = ? AND t.tmdb_id IS NOT NULL`,
    )
      .bind(c.get("userId"))
      .all<{
        kind: string;
        tmdb_id: number;
        ref: number;
        status: string;
        total_episodes: number | null;
        watched: number;
      }>();
    const byId = new Map(mine.map((m) => [`${m.kind}:${m.tmdb_id}`, m]));
    return c.json(
      results.map((r) => {
        const m = byId.get(`${r.kind}:${r.tmdb_id}`);
        return {
          ...r,
          tracked_ref: m?.ref ?? null,
          status: m?.status ?? null,
          watched: m?.watched ?? 0,
          total_episodes: m?.total_episodes ?? null,
        };
      }),
    );
  },
);

// TMDB key management (entered in the UI so no file editing is needed).
app.get("/api/settings", requireAuth, async (c) => {
  const key = await getSetting(c.env, "tmdb_key");
  const envKey = !!c.env.TMDB_API_KEY;
  const canEdit = canManageKey(
    c.env,
    await sessionEmail(c.env, c.get("userId")),
  );
  return c.json({
    has_tmdb_key: !!(key || envKey),
    can_edit: canEdit,
    tmdb_key_hint: key
      ? key.slice(0, 4) + "…"
      : envKey
        ? "(server secret)"
        : null,
  });
});

// The TMDB key is a single platform-wide key (admin on invite-only instances).
app.post("/api/settings", requireAuth, async (c) => {
  if (!canManageKey(c.env, await sessionEmail(c.env, c.get("userId"))))
    return c.json({ error: "admin only" }, 403);
  const { tmdb_key } = await c.req.json<{ tmdb_key?: string }>();
  if (typeof tmdb_key !== "string")
    return c.json({ error: "tmdb_key required" }, 400);
  await setSetting(c.env, "tmdb_key", tmdb_key.trim());
  const test = await search(tmdb_key.trim(), "breaking bad");
  return c.json({ ok: true, valid: test.length > 0 });
});

app.post("/api/library", requireAuth, blockDemo, async (c) => {
  const { kind, tmdb_id, status } = await c.req.json<{
    kind: "show" | "movie";
    tmdb_id: number;
    status?: Status;
  }>();
  const id = await addTitle(
    c.env,
    c.get("userId"),
    kind,
    tmdb_id,
    status ?? (kind === "movie" ? "watch_next" : "not_started"),
  );
  return c.json({ ok: true, id, ref: await refOf(c.env, id) });
});

app.patch("/api/library/:id", requireAuth, blockDemo, async (c) => {
  await updateLibrary(
    c.env,
    c.get("userId"),
    c.req.param("id")!,
    await c.req.json(),
  );
  return c.json({ ok: true });
});

app.post("/api/title/:id/episode", requireAuth, blockDemo, async (c) => {
  const { season, episode, watched } = await c.req.json<{
    season: number;
    episode: number;
    watched: boolean;
  }>();
  await toggleEpisode(
    c.env,
    c.get("userId"),
    c.req.param("id")!,
    season,
    episode,
    watched,
  );
  return c.json({ ok: true });
});

// Manual trigger for the same refresh the cron runs (handy for testing).
app.post("/api/refresh", requireAuth, blockDemo, async (c) => {
  const posters = await resolveBatch(c.env, 50);
  const episodes = await refreshNewEpisodes(c.env, 60);
  return c.json({ posters, episodes });
});

// SPA fallback: anything not matched above is served by the static assets binding.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  // Cloudflare Cron Trigger (see wrangler.jsonc). Keeps posters fresh and moves
  // finished shows back to "watching" when TMDB reports newly-aired episodes.
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      (async () => {
        await resolveBatch(env, 50);
        await refreshNewEpisodes(env, 100);
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
