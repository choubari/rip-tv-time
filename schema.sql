-- rip tv time — D1 (SQLite) schema.
-- Apply locally:  npm run db:migrate:local
-- Apply to prod:  npm run db:migrate:remote

-- App-wide settings (e.g. the TMDB API key entered by the admin).
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Invite allowlist: when INVITE_ONLY is on, only these emails can sign in.
CREATE TABLE IF NOT EXISTS allowed_emails (
  email      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  name       TEXT,
  bio        TEXT,
  cover_url  TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Short-lived magic-link tokens.
CREATE TABLE IF NOT EXISTS auth_tokens (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Logged-in sessions (cookie value = session id).
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

-- Global, de-duplicated title metadata resolved from TMDB (shared across users).
CREATE TABLE IF NOT EXISTS titles (
  id             TEXT PRIMARY KEY,   -- `show:<tmdb>` / `movie:<tmdb>` or `x:<uuid>` fallback
  kind           TEXT NOT NULL,      -- 'show' | 'movie'
  tmdb_id        INTEGER,
  imdb_id        TEXT,
  tvdb_id        INTEGER,
  name           TEXT NOT NULL,
  overview       TEXT,
  poster_path    TEXT,
  backdrop_path  TEXT,
  release_date   TEXT,
  runtime        INTEGER,            -- movie runtime, or avg episode runtime (minutes)
  total_episodes INTEGER,           -- show: total aired episodes (for progress)
  genres         TEXT,               -- JSON array of genre names
  resolve_failed INTEGER NOT NULL DEFAULT 0, -- 1 = TMDB lookup attempted & failed
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A user's tracked shows & movies.
CREATE TABLE IF NOT EXISTS library (
  user_id         TEXT NOT NULL REFERENCES users(id),
  title_id        TEXT NOT NULL REFERENCES titles(id),
  kind            TEXT NOT NULL,
  status          TEXT NOT NULL,     -- see shared/types.ts Status
  is_favorite     INTEGER NOT NULL DEFAULT 0,
  rating          REAL,
  added_at        TEXT,
  last_watched_at TEXT,
  PRIMARY KEY (user_id, title_id)
);
CREATE INDEX IF NOT EXISTS idx_library_user ON library (user_id, kind, status);

-- Per-episode watch state for shows.
CREATE TABLE IF NOT EXISTS watched_episodes (
  user_id    TEXT NOT NULL,
  title_id   TEXT NOT NULL,
  season     INTEGER NOT NULL,
  episode    INTEGER NOT NULL,
  watched_at TEXT,
  rating     REAL,
  runtime    INTEGER,               -- minutes (from GDPR export when available)
  PRIMARY KEY (user_id, title_id, season, episode)
);
CREATE INDEX IF NOT EXISTS idx_watched_user_title ON watched_episodes (user_id, title_id);

-- User-created lists (imported from the export).
CREATE TABLE IF NOT EXISTS lists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS list_items (
  list_id  INTEGER NOT NULL REFERENCES lists(id),
  title_id TEXT NOT NULL REFERENCES titles(id),
  ordering INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (list_id, title_id)
);
CREATE INDEX IF NOT EXISTS idx_lists_user ON lists (user_id);
