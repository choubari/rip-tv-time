// Minimal toast pub/sub (no dependency). Call toast("message") anywhere; the
// <Toaster/> rendered at the app root displays them.
export type ToastType = "error" | "success";
export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let toasts: Toast[] = [];
let listeners: ((t: Toast[]) => void)[] = [];
let nextId = 1;

const emit = () => listeners.forEach((l) => l(toasts));

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast(message: string, type: ToastType = "error") {
  const t: Toast = { id: nextId++, message, type };
  toasts = [...toasts, t];
  emit();
  setTimeout(() => dismissToast(t.id), 4000);
}

export function subscribeToasts(l: (t: Toast[]) => void) {
  listeners.push(l);
  l(toasts);
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
}
