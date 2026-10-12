"use client";

import { Lock, Timer, UserRound, Users } from "lucide-react";
import { formatPhone } from "@/lib/format";
import { conversationPeer, conversationTitle, systemText } from "@/lib/names";
import type { Conversation, Message } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";
import { TypingDots } from "../chats/ConversationListItem";

export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-3">
      <span className="rounded-full bg-system-pill px-3 py-0.5 text-[12px] font-medium text-secondary">{label}</span>
    </div>
  );
}

export function UnreadSeparator({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" role="separator">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[12px] font-medium text-secondary">
        {count} unread message{count === 1 ? "" : "s"}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

const SYSTEM_ICONS = {
  timer_changed: Timer,
  members_added: Users,
  member_removed: Users,
  member_left: Users,
  group_created: Users,
  title_changed: Users,
  admin_granted: UserRound,
  admin_revoked: UserRound,
} as const;

/** Centered timeline notice for system events (Signal's "group updates"). */
export function SystemNotice({ message }: { message: Message }) {
  const meId = useAuth((s) => s.me?.id);
  const users = useChat((s) => s.users);
  const Icon = message.meta ? SYSTEM_ICONS[message.meta.event] : Users;
  return (
    <div className="flex justify-center px-8 py-2">
      <span className="flex max-w-md items-start gap-1.5 text-center text-[13px] text-secondary">
        <Icon size={14} className="mt-[3px] shrink-0" />
        {systemText(message.meta, users, meId)}
      </span>
    </div>
  );
}

/** Typing bubble with the bouncing dots (and the typer's avatar in groups). */
export function TypingBubble({ userIds, isGroup }: { userIds: number[]; isGroup: boolean }) {
  const users = useChat((s) => s.users);
  if (!userIds.length) return null;
  const first = users[userIds[0]];
  return (
    <div className="mt-2 flex items-end px-4" aria-live="polite">
      {isGroup && first && (
        <Avatar name={first.display_name} color={first.avatar_color} url={first.avatar_url} size={28} className="mr-2" />
      )}
      <div className="flex h-9 items-center rounded-[18px] bg-bubble-in px-4 text-secondary">
        <TypingDots />
      </div>
    </div>
  );
}

/** Conversation header at the top of the timeline (Signal's "conversation hero"). */
export function ConversationHero({ conversation }: { conversation: Conversation }) {
  const meId = useAuth((s) => s.me?.id);
  const users = useChat((s) => s.users);
  const contactIds = useChat((s) => s.contactIds);
  const title = conversationTitle(conversation, meId, users);
  const peer = conversationPeer(conversation, meId);
  const peerUser = peer ? (users[peer.id] ?? peer) : undefined;
  const isGroup = conversation.kind === "group";

  return (
    <div className="flex flex-col items-center px-6 pb-4 pt-10 text-center">
      <Avatar
        name={title}
        color={peerUser?.avatar_color ?? conversation.avatar_color}
        url={isGroup ? conversation.avatar_url : peerUser?.avatar_url}
        isGroup={isGroup}
        size={80}
      />
      <h2 className="mt-3 text-[20px] font-semibold">{title}</h2>
      {isGroup ? (
        <p className="mt-1 text-[13px] text-secondary">
          {conversation.members.length} member{conversation.members.length === 1 ? "" : "s"}
          {conversation.description && ` · ${conversation.description}`}
        </p>
      ) : (
        peerUser && (
          <p className="mt-1 text-[13px] text-secondary">
            {peerUser.about && <span className="block">{peerUser.about}</span>}
            {formatPhone(peerUser.phone)}
            {peerUser.username && ` · @${peerUser.username}`}
          </p>
        )
      )}
      {!isGroup && peer && !contactIds.includes(peer.id) && (
        <p className="mt-2 text-[12px] text-tertiary">Not in your contacts</p>
      )}
      <div className="mt-5 flex max-w-sm items-start gap-2 rounded-xl bg-system-pill px-4 py-3 text-left text-[12px] leading-[17px] text-secondary">
        <Lock size={14} className="mt-[1px] shrink-0" />
        <span>
          Messages and calls are end-to-end encrypted. No one outside of this chat, not even Signal, can read or listen to
          them.
        </span>
      </div>
    </div>
  );
}
