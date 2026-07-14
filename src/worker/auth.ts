import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Env, Vars } from "./types";

const SESSION_COOKIE = "rtt_session";
const SESSION_TTL = 60 * 60 * 24 * 60; // 60 days
const TOKEN_TTL = 60 * 15; // 15 minutes

const rid = () => crypto.randomUUID().replace(/-/g, "");
const now = () => Math.floor(Date.now() / 1000);

/** Create a magic-link token for an email. Returns the token string. */
export async function createMagicToken(env: Env, email: string): Promise<string> {
  const token = rid() + rid();
  await env.DB.prepare("INSERT INTO auth_tokens (token, email, expires_at) VALUES (?, ?, ?)")
    .bind(token, email.toLowerCase().trim(), now() + TOKEN_TTL)
    .run();
  return token;
}

/** Consume a token, upsert the user, and start a session. Returns session id + user id. */
export async function verifyMagicToken(env: Env, token: string): Promise<{ sessionId: string; userId: string } | null> {
  const row = await env.DB.prepare("SELECT email, expires_at FROM auth_tokens WHERE token = ?").bind(token).first<{ email: string; expires_at: number }>();
  if (!row || row.expires_at < now()) return null;
  await env.DB.prepare("DELETE FROM auth_tokens WHERE token = ?").bind(token).run();

  let user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(row.email).first<{ id: string }>();
  if (!user) {
    const id = rid();
    await env.DB.prepare("INSERT INTO users (id, email) VALUES (?, ?)").bind(id, row.email).run();
    user = { id };
  }
  const sessionId = rid() + rid();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(sessionId, user.id, now() + SESSION_TTL)
    .run();
  return { sessionId, userId: user.id };
}

export function setSessionCookie(c: Context, sessionId: string) {
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: c.req.url.startsWith("https"),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function clearSession(c: Context<{ Bindings: Env; Variables: Vars }>) {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
  setCookie(c, SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

/** Middleware: require a valid session, set `userId` on the context. */
export async function requireAuth(c: Context<{ Bindings: Env; Variables: Vars }>, next: Next) {
  const sid = getCookie(c, SESSION_COOKIE);
  if (!sid) return c.json({ error: "unauthorized" }, 401);
  const s = await c.env.DB.prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?").bind(sid).first<{ user_id: string; expires_at: number }>();
  if (!s || s.expires_at < now()) return c.json({ error: "unauthorized" }, 401);
  c.set("userId", s.user_id);
  await next();
}
