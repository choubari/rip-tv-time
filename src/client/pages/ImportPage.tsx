import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

type Phase = "idle" | "uploading" | "resolving" | "done";

export function ImportPage({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const zips = Array.from(files).filter((f) => f.name.endsWith(".zip"));
    if (!zips.length) { setMsg("Please drop a .zip export file."); return; }

    setPhase("uploading");
    setMsg(`Reading ${zips.map((z) => z.name).join(", ")}…`);
    try {
      const res = await api.importZips(zips);
      setMsg(`Imported ${res.titles} titles and ${res.episodes} watched episodes. Fetching posters…`);
      setPhase("resolving");

      // Lazily resolve TMDB metadata/posters in batches.
      let remaining = Infinity;
      let total = 0;
      while (remaining > 0) {
        const r = await api.resolve(40);
        if (total === 0) total = r.resolved + r.remaining;
        remaining = r.remaining;
        setProgress(total ? Math.round(((total - remaining) / total) * 100) : 100);
      }
      setPhase("done");
      setMsg("All done!");
      onDone();
      setTimeout(() => nav("/"), 800);
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
          Drop your <code>tv-time-export.zip</code> and/or <code>gdpr-data.zip</code>. Your
          watch history, statuses and profile will be imported. You can re-import anytime.
        </p>

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

        {phase === "resolving" && (
          <div style={{ marginTop: 24 }}>
            <div className="progress-line"><span style={{ width: `${progress}%` }} /></div>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Fetching posters… {progress}%</p>
          </div>
        )}

        {msg && <p style={{ marginTop: 16 }}>{msg}</p>}
      </div>
    </>
  );
}
