"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/types";
import { useChat } from "@/store/chat";
import { useUI } from "@/store/ui";
import { ConversationDetails } from "../details/ConversationDetails";
import { Composer, type ComposerHandle } from "./Composer";
import { ConversationHeader } from "./ConversationHeader";
import { DisappearingModal, MessageInfoModal, SafetyNumberModal } from "./ConversationModals";
import { MessageList } from "./MessageList";

/** Is the user actually looking at this chat? (Read receipts must not fire otherwise.) */
function useWindowActive() {
  const [active, setActive] = useState(() => typeof document !== "undefined" && !document.hidden && document.hasFocus());
  useEffect(() => {
    const update = () => setActive(!document.hidden && document.hasFocus());
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return active;
}

export function ConversationView({ conversationId }: { conversationId: number }) {
  const conversation = useChat((s) => s.conversations[conversationId]);
  const thread = useChat((s) => s.threads[conversationId]);
  const replyTo = useChat((s) => s.replyTo[conversationId] ?? null);
  const setReplyTo = useChat((s) => s.setReplyTo);
  const markRead = useChat((s) => s.markRead);
  const detailsOpen = useUI((s) => s.detailsOpen);
  const setDetailsOpen = useUI((s) => s.setDetailsOpen);
  const active = useWindowActive();

  const [initialUnread] = useState(() => useChat.getState().conversations[conversationId]?.unread_count ?? 0);
  const [timerOpen, setTimerOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [infoFor, setInfoFor] = useState<Message | null>(null);
  const [dragging, setDragging] = useState(false);
  const composerRef = useRef<ComposerHandle>(null);

  useEffect(() => () => setDetailsOpen(false), [setDetailsOpen]);

  // Mark as read whenever unread messages are on screen and the window is focused.
  const unread = conversation?.unread_count ?? 0;
  useEffect(() => {
    if (active && thread?.loaded && unread > 0) markRead(conversationId);
  }, [active, thread?.loaded, unread, conversationId, markRead, thread?.items.length]);

  const onReply = useCallback((m: Message) => setReplyTo(conversationId, m), [conversationId, setReplyTo]);
  const onInfo = useCallback((m: Message) => setInfoFor(m), []);

  if (!conversation) return null;

  const modals = (
    <>
      {timerOpen && <DisappearingModal conversation={conversation} onClose={() => setTimerOpen(false)} />}
      {safetyOpen && <SafetyNumberModal conversation={conversation} onClose={() => setSafetyOpen(false)} />}
      {infoFor && <MessageInfoModal message={infoFor} conversation={conversation} onClose={() => setInfoFor(null)} />}
    </>
  );

  if (detailsOpen) {
    return (
      <>
        <ConversationDetails
          conversation={conversation}
          onBack={() => setDetailsOpen(false)}
          onOpenTimer={() => setTimerOpen(true)}
          onOpenSafetyNumber={() => setSafetyOpen(true)}
        />
        {modals}
      </>
    );
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) composerRef.current?.stageFile(file);
      }}
    >
      <ConversationHeader
        conversation={conversation}
        onOpenTimer={() => setTimerOpen(true)}
        onOpenSafetyNumber={() => setSafetyOpen(true)}
      />
      <MessageList conversation={conversation} thread={thread} initialUnread={initialUnread} onReply={onReply} onInfo={onInfo} />
      <Composer key={conversationId} ref={composerRef} conversation={conversation} replyTo={replyTo} />

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent bg-[var(--bg-conversation)]/80">
          <span className="text-[15px] font-medium text-accent">Drop to attach</span>
        </div>
      )}
      {modals}
    </div>
  );
}
