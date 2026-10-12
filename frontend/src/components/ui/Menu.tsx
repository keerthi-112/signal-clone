"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface MenuProps {
  anchor: HTMLElement;
  items: MenuItem[];
  onClose: () => void;
  align?: "start" | "end";
}

/** Popover menu anchored to an element; flips to stay inside the viewport. */
export function Menu({ anchor, items, onClose, align = "end" }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect();
    const m = ref.current!.getBoundingClientRect();
    let left = align === "end" ? a.right - m.width : a.left;
    let top = a.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = a.top - m.height - 4;
    left = Math.max(8, Math.min(left, window.innerWidth - m.width - 8));
    setPos({ top: Math.max(8, top), left });
  }, [anchor, align]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="animate-pop-in shadow-popup fixed z-[55] min-w-[200px] rounded-lg bg-elevated py-1.5"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={`flex w-full items-center gap-3 px-4 py-1.5 text-left text-[13px] hover:bg-hover disabled:opacity-40 ${
            item.danger ? "text-danger" : "text-primary"
          }`}
        >
          {item.icon && <span className="flex w-4 justify-center text-icon">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/** Icon button + menu toggle helper. */
export function useMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return {
    anchor,
    open: (el: HTMLElement) => setAnchor((cur) => (cur ? null : el)),
    close: () => setAnchor(null),
  };
}
