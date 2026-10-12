"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Signal's confirmation dialogs have no header close button. */
  hideClose?: boolean;
}

export function Modal({ title, onClose, children, footer, width = 440, hideClose }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>("input, textarea"))?.focus();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-pop-in shadow-popup flex max-h-[90vh] w-full flex-col rounded-xl bg-elevated"
        style={{ maxWidth: width }}
      >
        {(title || !hideClose) && (
          <div className="flex items-center gap-2 px-4 pb-2 pt-4">
            <h2 className="flex-1 text-[15px] font-semibold leading-5">{title}</h2>
            {!hideClose && (
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-full text-icon hover:bg-hover"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-4 pb-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-dark disabled:opacity-50",
    secondary: "bg-chip text-primary hover:bg-selected disabled:opacity-50",
    danger: "bg-danger text-white hover:brightness-95 disabled:opacity-50",
    ghost: "text-accent hover:bg-hover disabled:opacity-50",
  }[variant];
  return (
    <button
      {...props}
      className={`h-9 rounded-full px-5 text-[13px] font-medium transition-colors ${styles} ${className}`}
    />
  );
}

/** Small confirmation dialog in Signal's style. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      hideClose
      width={360}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            data-autofocus
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <div className="text-[13px] text-secondary">{body}</div>}
    </Modal>
  );
}
