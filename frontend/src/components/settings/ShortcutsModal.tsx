"use client";

import { SHORTCUTS } from "@/hooks/useKeyboardShortcuts";
import { Modal } from "../ui/Modal";

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width={460}>
      <ul className="divide-y divide-[var(--border)]">
        {SHORTCUTS.map((s) => (
          <li key={s.description} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
            <span>{s.description}</span>
            <span className="flex shrink-0 gap-1">
              {s.keys.map((k) => (
                <kbd key={k} className="rounded-md border border-line bg-chip px-1.5 py-0.5 font-sans text-[12px]">
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
