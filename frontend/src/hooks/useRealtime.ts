"use client";

import { useEffect } from "react";
import { messagePreview, conversationTitle } from "@/lib/names";
import { RealtimeClient } from "@/lib/socket";
import type { Message, ServerEvent } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { usePrefs } from "@/store/prefs";
import { toast } from "@/components/ui/Toast";

let client: RealtimeClient | null = null;

/** Send a typing indicator. Silently dropped while offline (it's ephemeral anyway). */
export function sendTyping(conversationId: number, isTyping: boolean) {
  client?.send({ type: "typing", conversation_id: conversationId, is_typing: isTyping });
}

function notify(m: Message) {
  const { prefs } = usePrefs.getState();
  if (!prefs.notifications || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const chat = useChat.getState();
  const focusedOnIt = !document.hidden && document.hasFocus() && chat.selectedId === m.conversation_id;
  if (focusedOnIt) return;
  const conv = chat.conversations[m.conversation_id];
  if (!conv) return;
  const meId = useAuth.getState().me?.id;
  const n = new Notification(conversationTitle(conv, meId, chat.users), {
    body: prefs.notificationPreview ? messagePreview(m, conv, chat.users, meId) : "New message",
    tag: `conversation-${conv.id}`,
    silent: false,
  });
  n.onclick = () => {
    window.focus();
    useChat.getState().select(conv.id);
    n.close();
  };
}

function handleEvent(event: ServerEvent) {
  const chat = useChat.getState();
  const meId = useAuth.getState().me?.id;
  switch (event.type) {
    case "hello":
      chat.setOnline(event.data.online_user_ids);
      break;
    case "presence":
      chat.setPresence(event.data.user_id, event.data.online, event.data.last_seen_at);
      break;
    case "typing":
      chat.setTyping(event.data.conversation_id, event.data.user_id, event.data.is_typing);
      break;
    case "message.created": {
      const m = event.data;
      chat.receiveMessage(m);
      if (m.sender_id !== meId && m.kind === "text") {
        client?.send({ type: "delivered", message_ids: [m.id] });
        notify(m);
      }
      break;
    }
    case "message.status":
      chat.applyStatuses(event.data.updates);
      break;
    case "message.reactions":
      chat.applyReactions(event.data.conversation_id, event.data.message_id, event.data.reactions);
      break;
    case "message.deleted":
      chat.deleteMessage(event.data.conversation_id, event.data.message_id);
      break;
    case "conversation.created":
    case "conversation.updated":
      chat.upsertConversation(event.data);
      break;
    case "conversation.removed": {
      const conv = chat.conversations[event.data.conversation_id];
      chat.removeConversation(event.data.conversation_id);
      if (conv?.kind === "group") toast(`You're no longer a member of “${conv.title}”.`);
      break;
    }
    case "conversation.read":
      chat.markReadLocally(event.data.conversation_id);
      break;
    case "user.updated": {
      chat.upsertUsers([event.data]);
      const me = useAuth.getState().me;
      if (me && event.data.id === me.id) useAuth.getState().setMe({ ...me, ...event.data });
      break;
    }
  }
}

/** Owns the app's single WebSocket for the lifetime of the signed-in shell. */
export function useRealtime() {
  const token = useAuth((s) => s.token);

  useEffect(() => {
    if (!token) return;
    const chat = useChat.getState();
    chat.loadInitial().catch(() => toast("Couldn't load your chats. Retrying when connected…"));

    let firstReady = true;
    client = new RealtimeClient(token, {
      onEvent: handleEvent,
      onStateChange: (s) => useChat.getState().setConnection(s),
      onReady: () => {
        // Skip the first connect if the initial load already succeeded; any later
        // (re)connect resyncs whatever we missed while offline.
        const skip = firstReady && useChat.getState().conversationsLoaded;
        firstReady = false;
        if (!skip) void useChat.getState().resync();
      },
      onUnauthorized: () => useAuth.getState().clear(),
    });
    client.start();
    // The network can come back without the socket ever dropping; flush the outbox then too.
    const onOnline = () => useChat.getState().retryAllFailed();
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      client?.stop();
      client = null;
      useChat.getState().reset();
    };
  }, [token]);
}
