import { useState } from "react";
import { api } from "../lib/api";
import { Attribution } from "../components/Attribution";

export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.requestLink(email);
      setSent(true);
      if (r.devLink) setDevLink(r.devLink);
      // If magic link isn't emailed (dev), poll for the session after the user clicks it.
      const poll = setInterval(async () => {
        try {
          await api.me();
          clearInterval(poll);
          onDone();
        } catch {}
      }, 1500);
    } catch (e: any) {
      setErr(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="center-screen">
        <div className="card">
          <h1 style={{ marginTop: 0, letterSpacing: "-.5px" }}>
            rip <span style={{ color: "var(--primary)" }}>tv time</span>
          </h1>
          <p className="muted" style={{ marginTop: -4 }}>
            Browse your exported watch history.
          </p>
          {sent ? (
            <>
              <p>Check your email for a sign-in link. Keep this tab open.</p>
              {devLink && (
                <p className="muted" style={{ fontSize: 13 }}>
                  Dev mode:{" "}
                  <a style={{ color: "var(--primary)" }} href={devLink}>
                    open magic link
                  </a>
                </p>
              )}
            </>
          ) : (
            <form onSubmit={submit}>
              <input
                className="input"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
              {err && (
                <p style={{ color: "var(--primary)", fontSize: 13 }}>{err}</p>
              )}
              <button
                className="btn"
                style={{ width: "100%", marginTop: 12 }}
                disabled={busy}
              >
                {busy ? "Sending…" : "Send magic link"}
              </button>
              <button
                type="button"
                className="btn ghost"
                style={{ width: "100%", marginTop: 8 }}
                onClick={async () => {
                  try {
                    await api.demoLogin();
                    onDone();
                  } catch {
                    setErr("Demo isn't available on this instance.");
                  }
                }}
              >
                Try the demo
              </button>
            </form>
          )}
        </div>
      </div>
      <Attribution />
    </div>
  );
}
