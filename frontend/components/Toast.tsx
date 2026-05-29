"use client";

import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type Tone = "info" | "success" | "error" | "warning";
type Toast = { id: string; tone: Tone; title: string; description?: string };

const Ctx = createContext<((t: Omit<Toast, "id"> | string) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const counter = useRef(0);

  const toast = useCallback((t: Omit<Toast, "id"> | string) => {
    counter.current += 1;
    const normalized: Toast =
      typeof t === "string"
        ? { id: `${Date.now()}-${counter.current}`, tone: "info", title: t }
        : { id: `${Date.now()}-${counter.current}`, ...t };
    setItems((prev) => [...prev, normalized]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toast-stack" role="region" aria-live="polite">
        {items.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const handle = setTimeout(onDismiss, 4500);
    return () => clearTimeout(handle);
  }, [onDismiss]);

  const Icon = {
    info: Info,
    success: CheckCircle2,
    warning: TriangleAlert,
    error: XCircle,
  }[toast.tone];

  return (
    <div className={`toast tone-${toast.tone}`} role="status">
      <Icon size={16} className="toast-icon" />
      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.description && <div className="toast-description">{toast.description}</div>}
      </div>
      <button className="icon" onClick={onDismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
