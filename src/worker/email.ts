import type { Env } from "./types";

/**
 * Send the magic-link email. In development (no RESEND_API_KEY) the link is
 * returned to the caller and logged, so you can sign in without an email
 * provider. In production, set RESEND_API_KEY + MAIL_FROM secrets.
 */
export async function sendMagicLink(env: Env, email: string, link: string): Promise<{ delivered: boolean; devLink?: string }> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    console.log(`[dev] magic link for ${email}: ${link}`);
    return { delivered: false, devLink: link };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: email,
      subject: "Your rip tv time sign-in link",
      html: `<p>Click to sign in to <strong>rip tv time</strong>:</p>
             <p><a href="${link}" style="background:#e50914;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Sign in</a></p>
             <p>This link expires in 15 minutes.</p>`,
    }),
  });
  return { delivered: res.ok };
}
