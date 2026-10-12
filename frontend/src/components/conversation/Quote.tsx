"use client";

import { X } from "lucide-react";
import { avatarColors } from "@/lib/avatar";
import { attachmentLabel, userName } from "@/lib/names";
import type { Quote as QuoteData } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { attachmentHref, isImage } from "./AttachmentView";

/** Quoted message, used inside bubbles and above the composer while replying. */
export function Quote({
  quote,
  variant,
  onClick,
  onDismiss,
}: {
  quote: QuoteData;
  variant: "in" | "out" | "composer";
  onClick?: () => void;
  onDismiss?: () => void;
}) {
  const meId = useAuth((s) => s.me?.id);
  const users = useChat((s) => s.users);
  const author = userName(users, meId, quote.sender_id);
  const authorColor = quote.sender_id === meId ? null : avatarColors(users[quote.sender_id ?? 0]?.avatar_color).fg;
  const text = quote.body || (quote.attachment ? attachmentLabel(quote.attachment.content_type, quote.attachment.file_name) : "");

  const bg = variant === "out" ? "var(--quote-out-bg)" : variant === "in" ? "var(--quote-in-bg)" : "var(--bg-input)";
  const bar = variant === "out" ? "#ffffff" : (authorColor ?? "var(--ultramarine)");

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      className={`relative flex overflow-hidden rounded-lg ${onClick ? "cursor-pointer" : ""}`}
      style={{ background: bg }}
    >
      <span className="w-1 shrink-0" style={{ background: bar }} />
      <div className="min-w-0 flex-1 px-2.5 py-1.5">
        <div className="text-[13px] font-semibold" style={variant === "out" ? undefined : { color: authorColor ?? undefined }}>
          {author}
        </div>
        <div className={`line-clamp-2 text-[13px] ${variant === "out" ? "text-white/90" : "text-secondary"}`}>{text}</div>
      </div>
      {quote.attachment && isImage(quote.attachment) && (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnail of a user upload
        <img src={attachmentHref(quote.attachment)} alt="" className="h-[52px] w-[52px] shrink-0 object-cover" />
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Cancel reply"
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-elevated text-icon shadow"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
