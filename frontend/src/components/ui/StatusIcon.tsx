import type { MessageStatus } from "@/lib/types";

/**
 * Signal's delivery indicators:
 *  sending   – dashed circle (spinning)
 *  sent      – one outlined circle with a check
 *  delivered – two overlapping outlined circles with checks
 *  read      – two overlapping filled circles with checks
 */
export function StatusIcon({ status, className = "" }: { status: MessageStatus; className?: string }) {
  const label = { sending: "Sending", failed: "Failed", sent: "Sent", delivered: "Delivered", read: "Read" }[status];

  if (status === "sending") {
    return (
      <svg viewBox="0 0 12 12" width={12} height={12} className={`animate-spin-slow ${className}`} aria-label={label}>
        <circle cx="6" cy="6" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg viewBox="0 0 16 16" width={14} height={14} className={className} aria-label={label}>
        <circle cx="8" cy="8" r="7" fill="#f44336" />
        <rect x="7.2" y="3.5" width="1.6" height="6" rx="0.8" fill="#fff" />
        <circle cx="8" cy="11.8" r="1" fill="#fff" />
      </svg>
    );
  }
  if (status === "sent") {
    return (
      <svg viewBox="0 0 12 12" width={12} height={12} className={className} aria-label={label}>
        <circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <path d="M3.6 6.2 5.3 7.8 8.4 4.5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const filled = status === "read";
  return (
    <svg viewBox="0 0 18 12" width={18} height={12} className={className} aria-label={label}>
      {filled ? (
        <>
          <circle cx="6" cy="6" r="5.6" fill="currentColor" />
          <path d="M3.6 6.2 5.3 7.8 8.4 4.5" fill="none" stroke="var(--check-cutout, #2c6bed)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="6" r="6.1" fill="var(--check-cutout, #2c6bed)" />
          <circle cx="12" cy="6" r="5.6" fill="currentColor" />
          <path d="M9.6 6.2 11.3 7.8 14.4 4.5" fill="none" stroke="var(--check-cutout, #2c6bed)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M9.2 1.6A5.2 5.2 0 1 0 9.2 10.4" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <path d="M3.6 6.2 5.3 7.8 8.4 4.5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <path d="M9.6 6.2 11.3 7.8 14.4 4.5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
