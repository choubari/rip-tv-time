import type { Env } from "./types";

/**
 * Send the magic-link email. In development (no RESEND_API_KEY) the link is
 * returned to the caller and logged, so you can sign in without an email
 * provider. In production, set RESEND_API_KEY + MAIL_FROM secrets.
 */
export async function sendMagicLink(
  env: Env,
  email: string,
  link: string,
): Promise<{ delivered: boolean; devLink?: string }> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    console.log(`[dev] magic link for ${email}: ${link}`);
    return { delivered: false, devLink: link };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: email,
      subject: "Your rip tv time sign-in link",
      html: `<p>Click to sign in to <strong>rip tv time</strong>:</p>
             <p><a href="${link}" style="background:#21d07a;color:#0f0f0f;font-weight:700;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Sign in</a></p>
             <p>This link expires in 15 minutes.</p>`,
    }),
  });
  return { delivered: res.ok };
}

/**
 * Notify a newly-invited user that they can sign in, with the app link. No-op
 * (returns false) when Resend isn't configured.
 */
export async function sendInvite(
  env: Env,
  email: string,
): Promise<{ delivered: boolean }> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !env.APP_URL) {
    console.log(
      `[dev] invited ${email} — share ${env.APP_URL ?? "(no APP_URL)"}`,
    );
    return { delivered: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: email,
      subject: "You've been invited to rip tv time",
      html: `<p>You've been invited to <strong>rip tv time</strong> — your self-hosted TV Time library.</p>
             <p>Open the app and sign in with this email address (${email}) to get your one-time sign-in link:</p>
             <p><a href="${env.APP_URL}" style="background:#21d07a;color:#0f0f0f;font-weight:700;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Open rip tv time</a></p>
             <p style="color:#888;font-size:13px">${env.APP_URL}</p>`,
    }),
  });
  return { delivered: res.ok };
}
