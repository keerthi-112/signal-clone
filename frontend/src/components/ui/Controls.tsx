"use client";

import { Search, X } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: number; active?: boolean }
>(function IconButton({ label, size = 32, active, className = "", children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`flex shrink-0 items-center justify-center rounded-full text-icon transition-colors hover:bg-hover disabled:opacity-40 ${
        active ? "bg-selected" : ""
      } ${className}`}
      style={{ width: size, height: size }}
    >
      {children}
    </button>
  );
});

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-accent" : "bg-line-strong"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-[left] ${
          checked ? "left-[16px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

export const SearchInput = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; placeholder?: string; trailing?: ReactNode }
>(function SearchInput({ value, onChange, placeholder = "Search", trailing }, ref) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-lg bg-input px-2.5">
      <Search size={16} className="shrink-0 text-tertiary" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none focus-visible:outline-none placeholder:text-tertiary"
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange("")} className="text-tertiary hover:text-primary">
          <X size={14} />
        </button>
      )}
      {trailing}
    </div>
  );
});

export function Spinner({ size = 20, className = "text-accent" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`animate-spin ${className}`} aria-label="Loading">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Speech-bubble mark used on onboarding and the empty conversation pane. */
export function SignalMark({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <circle cx="32" cy="32" r="29" fill="none" stroke="#2c6bed" strokeWidth="3" strokeDasharray="5.5 3.2" />
      <path
        d="M32 12c-11 0-20 8.3-20 18.6 0 4.6 1.8 8.8 4.8 12L15 52l9.9-3.3A21.6 21.6 0 0 0 32 49.2c11 0 20-8.3 20-18.6S43 12 32 12Z"
        fill="#2c6bed"
      />
    </svg>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-1 pt-4 text-[13px] font-semibold text-primary">{children}</div>;
}
