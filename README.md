# rip tv time

TV Time is shutting down. **rip tv time** is a small, self-hostable app that
reads your exported TV Time data and gives you back the experience: your shows
and movies as poster grids, watch stats, statuses, search, and tracking — in a
TV Time-style responsive PWA.

▶️ **Live demo:** https://rip-tv-time.choub.workers.dev (tap **Try the demo**)

- 📦 **Import** your `tv-time-export.zip` (from
  [tv-time-liberator](https://github.com/hobo-Ware/tv-time-liberator)) and/or your
  GDPR `gdpr-data.zip` (requested from TV Time) — see
  [Getting your export](#getting-your-export)
- 📺 Poster library grouped by status: Watching · Haven't watched for a while ·
  Haven't started · Watch later · Finished · Stopped
- 📊 Stats: total watch time, episodes and movies watched
- 🔎 Search TMDB and track new shows & movies
- 🖼️ Artwork & episode data from **TMDB**, with a **TVDB fallback** (correct
  seasons/episodes for anime & localized shows)
- 🔗 Passwordless **magic-link** login; optional **invite-only** mode + read-only **demo**
- 📱 Installable **PWA**, dark theme, one CSS variable to re-skin
- ☁️ Runs on **Cloudflare Workers + D1** — free tier is plenty ($0/mo)

Fully open source (MIT).

## Tech stack

| Layer    | Choice                                        |
| -------- | --------------------------------------------- |
| UI       | React + Vite + React Router, PWA              |
| API      | Hono on Cloudflare Workers                    |
| Database | Cloudflare D1 (SQLite)                        |
| Metadata | TMDB (primary) + TheTVDB (fallback)           |
| Email    | Resend (magic links; console fallback in dev) |

One `vite dev` runs the React client **and** the Worker with a local D1 database.

## Getting your export

- **`tv-time-export.zip`** — generate it with
  [**tv-time-liberator**](https://github.com/hobo-Ware/tv-time-liberator). This is
  the important one: it has full episode lists, per-episode watch dates, precise
  statuses, favorites and lists.
- **`gdpr-data.zip`** — request it from TV Time (account data / GDPR export). It
  adds real episode runtimes and your profile cover. Optional but nice.

Upload **both together** for the best result.

## Quick start (local)

```bash
npm install
npm run db:migrate:local         # create tables in the local D1
npm run dev                      # http://localhost:5173
```

1. **Sign in** — enter any email. Without `RESEND_API_KEY`, the magic link is
   printed in the terminal and shown in the UI — click it to log in.
2. **Add a TMDB key** — Profile → TMDB API key, paste a free key from
   [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) (v3 "API
   Key" or v4 Read Access Token). Powers posters, artwork, episode lists, search.
3. _(optional)_ **Add a TVDB key** — set `TVDB_API_KEY` for correct season/episode
   layouts when TMDB is wrong (free at [thetvdb.com/dashboard](https://www.thetvdb.com/dashboard)).
4. **Import** — open Import, drop your `.zip`(s). Posters then load in the
   background as you browse (no need to wait). Re-import anytime.

> No TMDB key? Everything still works — titles just show as text placeholders.

> **Upgrading a local checkout?** `npm run db:migrate:local` is additive
> (`CREATE TABLE IF NOT EXISTS` + safe `ALTER`s), so it never deletes your data.
> Use `npm run db:reset:local` only for a clean slate.

## How statuses work

TV Time's own status is the source of truth; the rest is derived from your watch
progress (so marking every episode moves a show to **Finished** automatically):

| Status                      | Meaning                                            |
| --------------------------- | -------------------------------------------------- |
| Watching                    | in progress, watched recently                      |
| Haven't watched for a while | in progress, no recent activity                    |
| Finished                    | every episode watched (shown in Profile, not tabs) |
| Haven't started             | tracked, nothing watched                           |
| Watch later                 | your hand-picked queue                             |
| Stopped                     | you stopped watching                               |

You only ever set **Watch later** / **Stop watching** / **Resume** by hand — the
others are automatic.

## Deploy to Cloudflare (free)

```bash
npx wrangler login
npx wrangler d1 create rip_tv_time          # paste the database_id into wrangler.jsonc
npm run db:migrate:remote                    # create tables in prod

# Secrets (set what you need):
printf 'KEY' | npx wrangler secret put TMDB_API_KEY    # posters + search (required for art)
printf 'KEY' | npx wrangler secret put TVDB_API_KEY    # optional metadata fallback
printf 'KEY' | npx wrangler secret put RESEND_API_KEY  # magic-link email (required for real login)
printf 'login@yourdomain.com' | npx wrangler secret put MAIL_FROM

# In wrangler.jsonc → vars, set APP_URL to your deployed URL, then:
npm run deploy
```

Everything fits Cloudflare's free tier (Workers + D1) + Resend's free tier =
**$0/month** (plus an optional custom domain).

### Access control (public deploys)

By default the app is **open** (anyone can sign in — fine for a private personal
instance). For a **public, invite-only** instance:

```bash
printf 'you@example.com' | npx wrangler secret put ADMIN_EMAIL
printf 'demo@example.com' | npx wrangler secret put DEMO_EMAIL   # optional demo
# set "INVITE_ONLY": "true" in wrangler.jsonc → vars, then: npm run deploy
```

- **Invite-only** — only `ADMIN_EMAIL`, `DEMO_EMAIL`, and emails you add under
  **Profile → Invited users** can sign in.
- **Admin-managed TMDB key** — on an invite-only instance the key is set once by
  the admin (secret) and shared; users never see it. Open instances let the single
  user manage their own key.
- **Read-only demo** — set `DEMO_EMAIL`, sign in as it once and import a sample
  export; visitors get a one-click **Try the demo** button (they can browse but
  not modify anything).

### Security

- Every data endpoint is scoped to the signed-in user — no cross-user access.
- The demo account is **read-only** (all writes return 403).
- **Rate limiting** (per user / per IP) on login, search, import, and the
  metadata endpoints so the app can't be looped to spam email or scrape TMDB/TVDB.

### Keeping data fresh

A Cron Trigger (`wrangler.jsonc` → `triggers.crons`, 3×/day) refreshes posters
and moves finished shows back to **Watching** when new episodes air.

## Your data & how it maps

| Source file (zip)                                 | Used for                                    |
| ------------------------------------------------- | ------------------------------------------- |
| `shows.json` (tv-time-export)                     | shows, seasons, all episodes, statuses      |
| `movies.json` / `lists.json`                      | movies, lists                               |
| `favorites.json`                                  | favorites                                   |
| `tracking-prod-records*.csv` (GDPR)               | watched episodes + real runtimes (fallback) |
| `user_personal_data.csv` / `user_social_data.csv` | profile name, bio, cover                    |

Titles carry TVDB/IMDB ids from the export and are resolved to TMDB for artwork
(validated by name + episode count to avoid wrong matches; TVDB is used for
season/episode metadata). Unmatched titles can be fixed manually via
**Profile → Fix missing posters** (paste the correct TMDB id).

## Scripts

```bash
npm run dev              # local dev (client + worker + local D1)
npm run build            # production build
npm run deploy           # build + wrangler deploy
npm run format           # prettier --write .
npm run db:migrate:local # create/upgrade local D1 tables (safe, additive)
npm run db:migrate:remote# same for prod
```

## Project layout

```
shared/        types + pure export parser (unit-testable)
src/worker/    Hono API: auth, import, TMDB/TVDB, D1 store, rate limiting
src/client/    React PWA (pages + components)
schema.sql     D1 schema
```

## Re-skin

Change `--primary` in `src/client/theme.css` (default: TV Time-style green).

## License

MIT — see [LICENSE](./LICENSE). Not affiliated with TV Time, TheTVDB, or TMDB.
Metadata by [TMDB](https://www.themoviedb.org/) and [TheTVDB](https://thetvdb.com/)
(this product uses their APIs but is not endorsed or certified by them).
