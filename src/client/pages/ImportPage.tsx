import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";

type Phase = "idle" | "uploading" | "done";

export function ImportPage({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  useEffect(() => { api.getSettings().then((s) => setHasKey(s.has_tmdb_key)).catch(() => setHasKey(false)); }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const zips = Array.from(files).filter((f) => f.name.endsWith(".zip"));
    if (!zips.length) { setMsg("Please drop a .zip export file."); return; }

    setPhase("uploading");
    setMsg(`Reading ${zips.map((z) => z.name).join(", ")}…`);
    try {
      const res = await api.importZips(zips);
      setPhase("done");
      // Poster fetching runs app-wide in the background (see App). No need to wait here.
      setMsg(`Imported ${res.titles} titles and ${res.episodes} watched episodes. Posters are loading in the background — you can start browsing.`);
      onDone();
      setTimeout(() => nav("/"), 1400);
    } catch (e: any) {
      setPhase("idle");
      setMsg(e.message || "Import failed");
    }
  }

  return (
    <>
      <div className="topbar"><h1>Import</h1></div>
      <div style={{ padding: 16 }}>
        <p className="muted">
          Upload <strong>both</strong> <code>tv-time-export.zip</code> <strong>and</strong> <code>gdpr-data.zip</code> together.
          The <code>tv-time-export.zip</code> is required for correct statuses (Watching / Haven't
          watched for a while / Finished), full episode lists, favorites and lists — the GDPR zip
          alone can't provide those. You can re-import anytime.
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          Posters load in the background afterward and keep going as you use the app (no need to
          wait on this screen) — they finish over the next little while.
        </p>

        {hasKey === false && (
          <div style={{ background: "var(--bg-elev)", border: "1px solid var(--primary)", borderRadius: 12, padding: 14 }}>
            <strong>No TMDB key set.</strong>
            <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
              Import will still work, but you'll get no posters or artwork. Add a free key in{" "}
              <Link to="/profile" style={{ color: "var(--primary)" }}>Profile → TMDB API key</Link>, then import.
            </p>
          </div>
        )}

        {phase === "idle" || phase === "uploading" ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--primary)" : "var(--border)"}`,
              borderRadius: 16, padding: "48px 24px", textAlign: "center",
              background: "var(--bg-elev)", cursor: "pointer", marginTop: 16,
            }}
          >
            <input ref={inputRef} type="file" accept=".zip" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
            <div style={{ fontSize: 40 }}>🎬</div>
            <p style={{ fontWeight: 700 }}>{phase === "uploading" ? "Importing…" : "Drop export .zip here"}</p>
            <p className="muted" style={{ fontSize: 13 }}>or tap to choose a file</p>
          </div>
        ) : null}

        {msg && <p style={{ marginTop: 16 }}>{msg}</p>}

        <div style={{ marginTop: 24, fontSize: 13 }} className="muted">
          <strong>Where to get the exports:</strong>
          <ul style={{ paddingLeft: 18, marginTop: 6, lineHeight: 1.6 }}>
            <li><code>tv-time-export.zip</code> — generate it with the{" "}
              <a style={{ color: "var(--primary)" }} href="https://github.com/hobo-Ware/tv-time-liberator" target="_blank" rel="noreferrer">tv-time-liberator</a> tool.
            </li>
            <li><code>gdpr-data.zip</code> — request it from TV Time (Settings → your account data / GDPR export).</li>
          </ul>
        </div>
      </div>
    </>
  );
}
