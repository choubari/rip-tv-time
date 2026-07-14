export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_URL: string;
  TMDB_API_KEY?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}

// Hono context variables set by the auth middleware.
export type Vars = { userId: string };
