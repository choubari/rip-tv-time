import { useEffect, useState } from "react";
import { subscribeToasts, dismissToast, type Toast } from "../lib/toast";

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          onClick={() => dismissToast(t.id)}
        >
          <span>{t.type === "success" ? "✓" : "!"}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
