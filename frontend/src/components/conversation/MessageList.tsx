"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatDayHeader, isSameDay } from "@/lib/format";
import type { Conversation, Message } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useChat, type Thread } from "@/store/chat";
import { Spinner } from "../ui/Controls";
import { MessageBubble } from "./MessageBubble";
import { ConversationHero, DaySeparator, SystemNotice, TypingBubble, UnreadSeparator } from "./TimelineParts";

const GROUP_GAP_MS = 10 * 60_000;
const META_COLLAPSE_MS = 60_000;
const NEAR_BOTTOM_PX = 120;
const MAX_JUMP_PAGES = 20;

function sameRun(a: Message | undefined, b: Message | undefined): boolean {
  return (
    !!a &&
    !!b &&
    a.kind === "text" &&
    b.kind === "text" &&
    a.sender_id === b.sender_id &&
    isSameDay(a.created_at, b.created_at) &&
    Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < GROUP_GAP_MS
  );
}

/** Ticks while disappearing messages are on screen so expired ones vanish on time. */
function useExpiryClock(items: Message[]): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const upcoming = items
      .map((m) => (m.expires_at ? new Date(m.expires_at).getTime() : Infinity))
      .filter((t) => t > now)
      .sort((a, b) => a - b)[0];
    if (!Number.isFinite(upcoming)) return;
    const t = setTimeout(() => setNow(Date.now()), Math.min(Math.max(upcoming - Date.now(), 250), 60_000));
    return () => clearTimeout(t);
  }, [items, now]);
  return now;
}

interface Props {
  conversation: Conversation;
  thread: Thread | undefined;
  initialUnread: number;
  onReply: (m: Message) => void;
  onInfo: (m: Message) => void;
}

export function MessageList({ conversation, thread, initialUnread, onReply, onInfo }: Props) {
  const meId = useAuth((s) => s.me?.id);
  const loadOlder = useChat((s) => s.loadOlder);
  const jumpTo = useChat((s) => s.jumpTo);
  const setJumpTo = useChat((s) => s.setJumpTo);
  const typingMap = useChat((s) => s.typing[conversation.id]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const prevHeightRef = useRef(0);
  const prevFirstIdRef = useRef<number | null>(null);
  const prevLastKeyRef = useRef<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const now = useExpiryClock(thread?.items ?? []);
  const items = useMemo(
    () => (thread?.items ?? []).filter((m) => !m.expires_at || new Date(m.expires_at).getTime() > now),
    [thread?.items, now],
  );
  const typingIds = Object.keys(typingMap ?? {}).map(Number).filter((id) => id !== meId);

  // The "N unread messages" divider sits before the first unread message seen on open.
  const unreadStartId = useMemo(() => {
    if (!initialUnread) return null;
    const fromOthers = items.filter((m) => m.kind === "text" && m.sender_id !== meId && m.id > 0);
    return fromOthers[Math.max(0, fromOthers.length - initialUnread)]?.id ?? null;
    // Computed once per open: only when the first page arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUnread, thread?.loaded]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Keep the viewport stable: preserve position when older history is prepended,
  // stick to the bottom for new messages when the user is already there.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstId = items[0]?.id ?? null;
    const last = items.at(-1);
    const lastKey = last ? `${last.id}:${last.client_id}` : null;

    if (prevFirstIdRef.current !== null && firstId !== prevFirstIdRef.current && lastKey === prevLastKeyRef.current) {
      el.scrollTop += el.scrollHeight - prevHeightRef.current; // older page prepended
    } else if (lastKey !== prevLastKeyRef.current) {
      const mine = last?.sender_id === meId;
      if (prevLastKeyRef.current === null || atBottomRef.current || mine) scrollToBottom();
      else setShowJump(true);
    } else if (atBottomRef.current) {
      scrollToBottom();
    }
    prevHeightRef.current = el.scrollHeight;
    prevFirstIdRef.current = firstId;
    prevLastKeyRef.current = lastKey;
  }, [items, meId, scrollToBottom, typingIds.length]);

  // On open, land on the unread divider if there is one.
  useEffect(() => {
    if (!thread?.loaded || !unreadStartId) return;
    document.getElementById(`message-${unreadStartId}`)?.scrollIntoView({ block: "center" });
  }, [thread?.loaded, unreadStartId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    atBottomRef.current = atBottom;
    if (atBottom) setShowJump(false);
    if (el.scrollTop < 300 && thread?.hasMore && !thread.loadingOlder) {
      prevHeightRef.current = el.scrollHeight;
      void loadOlder(conversation.id);
    }
  };

  // Jump to a message (search hit or quoted reply), paging back through history if needed.
  const jumpToMessage = useCallback(
    async (messageId: number) => {
      for (let page = 0; page < MAX_JUMP_PAGES; page++) {
        const t = useChat.getState().threads[conversation.id];
        if (t?.items.some((m) => m.id === messageId)) break;
        if (!t?.hasMore) break;
        await useChat.getState().loadOlder(conversation.id);
      }
      requestAnimationFrame(() => {
        const el = document.getElementById(`message-${messageId}`);
        if (!el) return;
        atBottomRef.current = false;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setHighlightId(messageId);
        setTimeout(() => setHighlightId(null), 1600);
      });
    },
    [conversation.id],
  );

  useEffect(() => {
    if (jumpTo?.conversationId !== conversation.id || !thread?.loaded) return;
    setJumpTo(null);
    void jumpToMessage(jumpTo.messageId);
  }, [jumpTo, conversation.id, thread?.loaded, setJumpTo, jumpToMessage]);

  if (!thread?.loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto pb-3" role="log" aria-label="Messages">
        {thread.hasMore ? (
          <div className="flex justify-center py-4">{thread.loadingOlder && <Spinner />}</div>
        ) : (
          <ConversationHero conversation={conversation} />
        )}

        {items.map((m, i) => {
          const prev = items[i - 1];
          const next = items[i + 1];
          const newDay = !prev || !isSameDay(prev.created_at, m.created_at);
          const firstInGroup = newDay || !sameRun(prev, m) || m.id === unreadStartId;
          const lastInGroup = !sameRun(m, next) || next?.id === unreadStartId;
          const collapseMeta =
            !lastInGroup &&
            m.status !== "failed" &&
            !!next &&
            new Date(next.created_at).getTime() - new Date(m.created_at).getTime() < META_COLLAPSE_MS &&
            m.status === next.status;

          return (
            <Fragment key={m.client_id ?? m.id}>
              {newDay && <DaySeparator label={formatDayHeader(m.created_at)} />}
              {m.id === unreadStartId && <UnreadSeparator count={initialUnread} />}
              {m.kind === "system" ? (
                <SystemNotice message={m} />
              ) : (
                <MessageBubble
                  message={m}
                  conversation={conversation}
                  firstInGroup={firstInGroup}
                  lastInGroup={lastInGroup}
                  showMeta={!collapseMeta}
                  highlighted={highlightId === m.id}
                  onReply={onReply}
                  onJumpTo={jumpToMessage}
                  onInfo={onInfo}
                />
              )}
            </Fragment>
          );
        })}

        <TypingBubble userIds={typingIds} isGroup={conversation.kind === "group"} />
      </div>

      {showJump && (
        <button
          onClick={() => {
            scrollToBottom(true);
            setShowJump(false);
          }}
          aria-label="Scroll to latest message"
          className="shadow-popup absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-elevated text-icon"
        >
          <ChevronDown size={20} />
        </button>
      )}
    </div>
  );
}
