import { useEffect, useState } from "react";

// A dismissible "install app" banner. On Android/Chrome we capture the native
// `beforeinstallprompt` and trigger it on tap. iOS Safari never fires that event
// (and has no auto-prompt), so we show a "Add to Home Screen" hint instead.
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as any).MSStream;
  const dismissed = localStorage.getItem("install-dismissed") === "1";

  useEffect(() => {
    if (isStandalone || dismissed) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e); setShow(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // iOS: no event — show the hint after a moment.
    if (isIOS) { const t = setTimeout(() => setShow(true), 1200); return () => clearTimeout(t); }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!show || isStandalone || dismissed) return null;

  const close = () => { setShow(false); localStorage.setItem("install-dismissed", "1"); };

  return (
    <div className="install-banner">
      <span style={{ fontSize: 22 }}>📺</span>
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.35 }}>
        {isIOS ? (
          <>Install the app: tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.</>
        ) : (
          <><strong>Install rip tv time</strong> for a full-screen app experience.</>
        )}
      </div>
      {!isIOS && deferred && (
        <button className="btn" style={{ padding: "8px 14px" }} onClick={async () => { deferred.prompt(); await deferred.userChoice; close(); }}>
          Install
        </button>
      )}
      <button onClick={close} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 18, padding: 4 }}>✕</button>
    </div>
  );
}
