# rip tv time

TV Time is shutting down. **rip tv time** is a small, self-hostable app that
reads your exported TV Time data and gives you back the experience: your shows
and movies as poster grids, watch stats, statuses, search, and tracking — in a
TV Time-style responsive PWA.

- 📦 **Import** your `tv-time-export.zip` and/or GDPR `gdpr-data.zip`
- 📺 Poster library grouped by status (watching, up to date, watch later, haven't watched, stopped)
- 📊 Stats: total watch time, episodes and movies watched
- 🔎 Search TMDB and track new shows & movies
- 🔗 Passwordless **magic-link** login
- 📱 Installable **PWA**, red theme (one CSS variable to re-skin)
- ☁️ Runs on **Cloudflare Workers + D1** — cheap (free tier is plenty for one person)

Fully open source (MIT).

## Tech stack

| Layer     | Choice                                        |
|-----------|-----------------------------------------------|
| UI        | React + Vite + React Router, PWA              |
| API       | Hono on Cloudflare Workers                    |
| Database  | Cloudflare D1 (SQLite)                        |
| Metadata  | TMDB (posters, artwork, runtimes, search)     |
| Email     | Resend (optional; console fallback in dev)    |

One `vite dev` runs the React client **and** the Worker with a local D1 database.

## Quick start (local)

```bash
npm install
npm run db:migrate:local         # create tables in the local D1
npm run dev                      # http://localhost:5173
```

1. **Sign in** — enter any email. Without `RESEND_API_KEY`, the magic link is
   printed in the terminal and shown in the UI — click it to log in.
2. **Add a TMDB key** — go to **Profile → TMDB API key**, paste a free key from
   [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
   (either the v3 "API Key" or the v4 Read Access Token works). It's validated
   instantly. This powers posters, artwork, episode lists and search.
3. **Import** — open **Import**, drop your export `.zip`(s). Upload **both**
   `tv-time-export.zip` and `gdpr-data.zip` for the full picture: **favorites and
   lists exist only in `tv-time-export.zip`**, while `gdpr-data.zip` carries real
   episode runtimes and your profile cover. Either one works on its own, but
   both together is best.
4. Posters are then fetched from TMDB with a progress bar. Re-import anytime.

> No TMDB key? Everything still works — titles just show as text placeholders.
> Added the key after importing? Just hit **Re-import** and posters will fill in.

> **Upgrading an existing local checkout?** Run `npm run db:migrate:local` — it's
> additive (`CREATE TABLE IF NOT EXISTS`), so it adds any new tables **without
> deleting your data**. Then just re-import (titles dedupe by id, so nothing is
> duplicated). Only use `npm run db:reset:local` if you want a clean slate.

## Deploy to Cloudflare

```bash
npx wrangler d1 create rip_tv_time          # paste the database_id into wrangler.jsonc
npm run db:migrate:remote                    # create tables in prod
npx wrangler secret put TMDB_API_KEY         # posters + search
npx wrangler secret put RESEND_API_KEY       # magic-link email
npx wrangler secret put MAIL_FROM            # e.g. login@yourdomain.com
# set APP_URL in wrangler.jsonc "vars" to your deployed URL, then:
npm run deploy
```

Cloudflare's free tier (Workers + D1) comfortably hosts a personal instance.

### Access control (public deploys)

By default the app is **open** (anyone can sign in — good for a private personal
instance). To run a **public, invite-only** instance:

```bash
npx wrangler secret put ADMIN_EMAIL     # you — manage invites + the TMDB key
# set INVITE_ONLY = "true" in wrangler.jsonc "vars"
npx wrangler secret put DEMO_EMAIL       # optional: enables the "Try the demo" button
```

- **Invite-only**: only your `ADMIN_EMAIL`, the `DEMO_EMAIL`, and emails you add
  under **Profile → Invited users** can sign in.
- **Admin-managed TMDB key**: on an invite-only instance the TMDB key is set once
  by the admin and shared by everyone (users never enter it). On an open instance
  the single user manages their own key.
- **Demo**: seed the demo account by signing in as `DEMO_EMAIL` once and importing
  a sample export; visitors then get a one-click read-through via "Try the demo".

### Keeping data fresh

A Cron Trigger (`wrangler.jsonc` → `triggers.crons`, 3×/day) refreshes posters and
moves finished shows back to **Watching** when TMDB reports newly-aired episodes.

## Your data & how it maps

The importer prefers the richer JSON export (`tv-time-export.zip`) and merges
extra bits from the GDPR export (`gdpr-data.zip`):

| Source file                       | Used for                                    |
|-----------------------------------|---------------------------------------------|
| `shows.json`                      | shows, seasons, watched episodes, status    |
| `movies.json` / `lists.json`      | movies (watched / watch-later)              |
| `favorites.json`                  | favorites                                   |
| `user_personal_data.csv` (GDPR)   | profile bio & cover image                   |
| `user_show_special_status.csv`    | extra "watch later" statuses                |

TV Time statuses map to: `continuing → watching`, `up_to_date`, `watch_later`,
`not_started_yet → haven't watched`, `stopped`. Titles carry TVDB/IMDB ids,
which are resolved to TMDB for artwork.

## Project layout

```
shared/        types + pure export parser (unit-testable)
src/worker/    Hono API: auth, import, TMDB, D1 store
src/client/    React PWA (pages + components)
schema.sql     D1 schema
```

## Re-skin

Change `--primary` in `src/client/theme.css` (default TV Time-red `#e50914`).

## License

MIT — see [LICENSE](./LICENSE). Not affiliated with TV Time / TVDB.
Metadata by [TMDB](https://www.themoviedb.org/) (this product uses the TMDB API
but is not endorsed or certified by TMDB).
