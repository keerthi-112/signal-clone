"use client";

import { ArrowLeft, MoreHorizontal, Phone, Settings2, ShieldCheck, Timer, Users, Video } from "lucide-react";
import { formatLastSeen, formatTimerShort } from "@/lib/format";
import { conversationPeer, conversationTitle } from "@/lib/names";
import type { Conversation } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { useUI } from "@/store/ui";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/Controls";
import { Menu, useMenu } from "../ui/Menu";
import { toast } from "../ui/Toast";

interface Props {
  conversation: Conversation;
  onOpenTimer: () => void;
  onOpenSafetyNumber: () => void;
}

export function ConversationHeader({ conversation, onOpenTimer, onOpenSafetyNumber }: Props) {
  const meId = useAuth((s) => s.me?.id);
  const users = useChat((s) => s.users);
  const select = useChat((s) => s.select);
  const setDetailsOpen = useUI((s) => s.setDetailsOpen);
  const peer = conversationPeer(conversation, meId);
  const peerUser = peer ? (users[peer.id] ?? peer) : undefined;
  const online = useChat((s) => (peer ? !!s.online[peer.id] : false));
  const typing = useChat((s) => Object.keys(s.typing[conversation.id] ?? {}).length > 0);
  const menu = useMenu();

  const isGroup = conversation.kind === "group";
  const title = conversationTitle(conversation, meId, users);
  const subtitle = typing
    ? "typing…"
    : isGroup
      ? `${conversation.members.length} member${conversation.members.length === 1 ? "" : "s"}`
      : online
        ? "Online"
        : formatLastSeen(peerUser?.last_seen_at ?? null);

  const comingSoon = (what: string) => () => toast(`${what} calls are coming soon`);

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-1 border-b border-line px-2 md:px-4">
      <IconButton label="Back" className="md:hidden" onClick={() => select(null)}>
        <ArrowLeft size={20} />
      </IconButton>
      <button
        onClick={() => setDetailsOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg py-1 pr-2 text-left"
        aria-label={`${title} — chat settings`}
      >
        <Avatar
          name={title}
          color={peerUser?.avatar_color ?? conversation.avatar_color}
          url={isGroup ? conversation.avatar_url : peerUser?.avatar_url}
          isGroup={isGroup}
          size={32}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold leading-5">{title}</span>
            {conversation.disappearing_seconds > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-secondary" title="Disappearing messages on">
                <Timer size={12} />
                {formatTimerShort(conversation.disappearing_seconds)}
              </span>
            )}
          </div>
          <div className={`truncate text-[12px] leading-4 ${online && !isGroup && !typing ? "text-accent" : "text-secondary"}`}>
            {subtitle}
          </div>
        </div>
      </button>
      <IconButton label="Video call" size={36} onClick={comingSoon("Video")}>
        <Video size={20} />
      </IconButton>
      <IconButton label="Voice call" size={36} onClick={comingSoon("Voice")}>
        <Phone size={18} />
      </IconButton>
      <IconButton label="More options" size={36} onClick={(e) => menu.open(e.currentTarget)}>
        <MoreHorizontal size={20} />
      </IconButton>
      {menu.anchor && (
        <Menu
          anchor={menu.anchor}
          onClose={menu.close}
          items={[
            { label: "Disappearing messages", icon: <Timer size={15} />, onSelect: onOpenTimer },
            ...(isGroup
              ? [{ label: "Members", icon: <Users size={15} />, onSelect: () => setDetailsOpen(true) }]
              : [{ label: "View safety number", icon: <ShieldCheck size={15} />, onSelect: onOpenSafetyNumber }]),
            {
              label: isGroup ? "Group settings" : "Chat settings",
              icon: <Settings2 size={15} />,
              onSelect: () => setDetailsOpen(true),
            },
          ]}
        />
      )}
    </header>
  );
}
