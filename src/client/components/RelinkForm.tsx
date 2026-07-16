import { useState } from "react";
import { api } from "../lib/api";
import { toast } from "../lib/toast";

/**
 * Shared "fix a wrong/missing match" UI: a TMDB/TVDB source dropdown + id input
 * + save button, with a toast on no-match. Used on the Profile "Fix missing
 * posters" list and on a single title's about page.
 */

// The explanatory hint shown above the input(s).
export function RelinkHint() {
  return (
    <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
      Find the title on{" "}
      <a
        style={{ color: "var(--primary)" }}
        href="https://www.themoviedb.org"
        target="_blank"
        rel="noreferrer"
      >
        themoviedb.org
      </a>{" "}
      or{" "}
      <a
        style={{ color: "var(--primary)" }}
        href="https://thetvdb.com"
        target="_blank"
        rel="noreferrer"
      >
        thetvdb.com
      </a>
      , copy the id from its URL (TMDB e.g.{" "}
      <code>
        /tv/<b>1396</b>
      </code>
      ), pick the matching source, paste the id and save.
    </p>
  );
}

export function RelinkControls({
  refId,
  onDone,
  saveLabel = "Save",
}: {
  refId: number;
  onDone: () => void;
  saveLabel?: string;
}) {
  const [idText, setIdText] = useState("");
  const [source, setSource] = useState<"tmdb" | "tvdb">("tmdb");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function save() {
    const n = parseInt(idText.replace(/\D/g, ""), 10);
    if (!n) return;
    setBusy(true);
    setErr(false);
    try {
      const r = await api.relink(refId, n, source);
      if (r.ok) onDone();
      else {
        setErr(true);
        toast(
          `No ${source.toUpperCase()} match for id ${n} — check the id and source.`,
        );
      }
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select
        className="input"
        style={{ width: 68, padding: "6px 4px" }}
        value={source}
        onChange={(e) => setSource(e.target.value as "tmdb" | "tvdb")}
      >
        <option value="tmdb">TMDB</option>
        <option value="tvdb">TVDB</option>
      </select>
      <input
        className="input"
        style={{
          width: 90,
          padding: "6px 8px",
          borderColor: err ? "var(--primary)" : undefined,
        }}
        placeholder={source === "tvdb" ? "TVDB id" : "TMDB id"}
        value={idText}
        onChange={(e) => setIdText(e.target.value)}
      />
      <button
        className="chip"
        style={{ background: "var(--primary)", color: "#fff" }}
        disabled={busy || !idText.trim()}
        onClick={save}
      >
        {busy ? "…" : saveLabel}
      </button>
    </div>
  );
}
