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
cp .dev.vars.example .dev.vars   # add a TMDB_API_KEY to get posters (optional)
npm run db:migrate:local         # create tables in the local D1
npm run dev                      # http://localhost:5173
```

Sign in: enter any email. Without `RESEND_API_KEY` set, the magic link is
printed in the terminal and shown in the UI — click it to log in. Then open
**Import**, drop your export `.zip`(s), and watch your library fill in.

> Posters are fetched lazily from TMDB after import, with a progress bar. No
> TMDB key? Everything still works; titles just show as text placeholders.

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
