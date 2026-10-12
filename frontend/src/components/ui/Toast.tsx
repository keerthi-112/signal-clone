"use client";

import { create } from "zustand";

interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: ToastItem[];
  push: (text: string, action?: ToastItem["action"]) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, action) => {
    const id = nextId++;
    // Signal shows one toast at a time; newer ones replace older.
    set({ toasts: [{ id, text, action }] });
    setTimeout(() => get().dismiss(id), 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (text: string, action?: ToastItem["action"]) => useToasts.getState().push(text, action);

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="animate-toast-in pointer-events-auto flex max-w-md items-center gap-4 rounded-lg bg-toast px-4 py-3 text-[13px] text-[var(--bg-app)] shadow-lg"
        >
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && (
            <button
              className="shrink-0 font-semibold text-[var(--ultramarine-light)] hover:underline"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
