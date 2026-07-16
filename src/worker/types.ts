export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_URL: string;
  TMDB_API_KEY?: string;
  TVDB_API_KEY?: string; // optional fallback for season/episode metadata
  OMDB_API_KEY?: string; // optional: real IMDb ratings on the detail page
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  // Deployment / access control
  INVITE_ONLY?: string; // "true" → only allowlisted emails (+ admin/demo) can sign in
  ADMIN_EMAIL?: string; // the platform owner: manages the allowlist + TMDB key
  DEMO_EMAIL?: string; // optional read-only demo account for the public OSS deploy
}

// Hono context variables set by the auth middleware.
export type Vars = { userId: string };
