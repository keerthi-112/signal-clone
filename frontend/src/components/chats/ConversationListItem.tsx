"use client";

import { memo } from "react";
import { formatListTime } from "@/lib/format";
import { useRelativeTimeRefresh } from "@/lib/clock";
import { conversationPeer, conversationTitle, messagePreview } from "@/lib/names";
import type { Conversation } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";
import { StatusIcon } from "../ui/StatusIcon";

export function TypingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`} aria-label="Typing">
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-current" />
    </span>
  );
}

interface Props {
  conversation: Conversation;
  selected: boolean;
  onSelect: (id: number) => void;
}

export const ConversationListItem = memo(function ConversationListItem({ conversation: c, selected, onSelect }: Props) {
  const meId = useAuth((s) => s.me?.id);
  const users = useChat((s) => s.users);
  const typingMap = useChat((s) => s.typing[c.id]);
  const peer = conversationPeer(c, meId);
  const peerOnline = useChat((s) => (peer ? !!s.online[peer.id] : false));

  const title = conversationTitle(c, meId, users);
  const peerUser = peer ? (users[peer.id] ?? peer) : undefined;
  const isTyping = !!typingMap && Object.keys(typingMap).length > 0;
  const last = c.last_message;
  useRelativeTimeRefresh(last?.created_at);
  const ownLast = last && last.kind === "text" && last.sender_id === meId ? last.status : null;
  const unread = c.unread_count > 0;

  return (
    <button
      onClick={() => onSelect(c.id)}
      aria-current={selected ? "true" : undefined}
      className={`mx-2 flex w-[calc(100%-16px)] items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
        selected ? "bg-selected" : "hover:bg-hover"
      }`}
    >
      <Avatar
        name={title}
        color={peerUser?.avatar_color ?? c.avatar_color}
        url={c.kind === "group" ? c.avatar_url : peerUser?.avatar_url}
        isGroup={c.kind === "group"}
        online={peerOnline}
        size={48}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`min-w-0 flex-1 truncate text-[14px] ${unread ? "font-bold" : "font-semibold"}`}>{title}</span>
          {last && (
            <span className={`shrink-0 text-[12px] ${unread ? "font-semibold text-primary" : "text-secondary"}`}>
              {formatListTime(last.created_at)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-start gap-2">
          <span
            className={`line-clamp-2 min-w-0 flex-1 break-words text-[13px] leading-[18px] ${
              unread ? "text-primary" : "text-secondary"
            }`}
          >
            {isTyping ? (
              <TypingDots className="mt-1.5 text-secondary" />
            ) : last ? (
              messagePreview(last, c, users, meId)
            ) : (
              <span className="italic">No messages yet</span>
            )}
          </span>
          {unread ? (
            <span className="mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
              {c.unread_count > 999 ? "999+" : c.unread_count}
            </span>
          ) : (
            ownLast && !isTyping && <StatusIcon status={ownLast} className="mt-1 shrink-0 text-secondary [--check-cutout:var(--bg-sidebar)]" />
          )}
        </div>
      </div>
    </button>
  );
});
