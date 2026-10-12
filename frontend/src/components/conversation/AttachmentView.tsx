"use client";

import { Download, FileText } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { mediaUrl } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type { Attachment } from "@/lib/types";

export function isImage(a: Attachment) {
  return a.content_type.startsWith("image/");
}

export function attachmentHref(a: Attachment) {
  // Optimistic attachments use a local blob: URL until the upload finishes.
  return a.url.startsWith("blob:") ? a.url : (mediaUrl(a.url) ?? "");
}

export function ImageAttachment({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="block w-full overflow-hidden" aria-label={`Open ${attachment.file_name}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- user uploads served by the API */}
      <img
        src={attachmentHref(attachment)}
        alt={attachment.file_name}
        className="block max-h-[360px] min-h-[80px] w-full min-w-[160px] object-cover"
        loading="lazy"
        draggable={false}
      />
    </button>
  );
}

export function FileAttachment({ attachment, outgoing }: { attachment: Attachment; outgoing: boolean }) {
  const ext = attachment.file_name.split(".").pop()?.slice(0, 4).toUpperCase() ?? "";
  return (
    <a
      href={attachmentHref(attachment)}
      download={attachment.file_name}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-[200px] items-center gap-3 py-1"
    >
      <span className="relative flex h-10 w-8 shrink-0 items-center justify-center">
        <FileText size={36} strokeWidth={1.2} className={outgoing ? "text-white/80" : "text-secondary"} />
        <span className={`absolute bottom-2 text-[7px] font-bold ${outgoing ? "text-white" : "text-primary"}`}>{ext}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{attachment.file_name}</span>
        <span className={`block text-[12px] ${outgoing ? "text-white/80" : "text-secondary"}`}>
          {formatBytes(attachment.size_bytes)}
        </span>
      </span>
      <Download size={16} className={outgoing ? "text-white/80" : "text-secondary"} />
    </a>
  );
}

/** Full-screen image viewer (Signal's lightbox). */
export function Lightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose} role="dialog" aria-label="Image viewer">
      <div className="flex justify-end gap-2 p-3">
        <a
          href={attachmentHref(attachment)}
          download={attachment.file_name}
          onClick={(e) => e.stopPropagation()}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10"
          aria-label="Download"
        >
          <Download size={20} />
        </a>
        <button className="h-9 rounded-full px-4 text-[13px] text-white hover:bg-white/10" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- user uploads served by the API */}
        <img
          src={attachmentHref(attachment)}
          alt={attachment.file_name}
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>,
    document.body,
  );
}
