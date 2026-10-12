import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import type { Conversation, Message, MessageStatus, ReactionEntry, User } from "@/lib/types";
import { useAuth } from "./auth";

export interface Thread {
  items: Message[];
  hasMore: boolean;
  loaded: boolean;
  loadingOlder: boolean;
}

interface OutboxEntry {
  conversationId: number;
  clientId: string;
  body: string;
  replyToId: number | null;
  file: File | null;
  attachmentId: number | null;
  previewUrl: string | null;
  /** Network-level failure: retried automatically with backoff and on reconnect. */
  retryable: boolean;
  attempts: number;
  inFlight: boolean;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

const MAX_AUTO_RETRIES = 8;
const MAX_RETRY_DELAY_MS = 30_000;

export interface SendOptions {
  replyTo?: Message | null;
  file?: File | null;
}

type ConnectionState = "connecting" | "online" | "offline";

interface ChatState {
  conversations: Record<number, Conversation>;
  conversationsLoaded: boolean;
  threads: Record<number, Thread>;
  users: Record<number, User>;
  contactIds: number[];
  online: Record<number, boolean>;
  /** conversationId -> userId -> expiry timestamp */
  typing: Record<number, Record<number, number>>;
  selectedId: number | null;
  replyTo: Record<number, Message | null>;
  jumpTo: { conversationId: number; messageId: number } | null;
  connection: ConnectionState;

  reset: () => void;
  loadInitial: () => Promise<void>;
  resync: () => Promise<void>;
  select: (id: number | null) => void;
  upsertConversation: (c: Conversation) => void;
  removeConversation: (id: number) => void;
  upsertUsers: (users: User[]) => void;
  addContact: (u: User) => void;
  removeContactId: (id: number) => void;
  loadThread: (id: number) => Promise<void>;
  loadOlder: (id: number) => Promise<void>;
  send: (conversationId: number, body: string, opts?: SendOptions) => Promise<string | null>;
  retry: (clientId: string) => Promise<string | null>;
  retryAllFailed: () => void;
  receiveMessage: (m: Message) => void;
  applyStatuses: (updates: { message_id: number; conversation_id: number; status: MessageStatus }[]) => void;
  applyReactions: (conversationId: number, messageId: number, reactions: ReactionEntry[]) => void;
  react: (m: Message, emoji: string) => Promise<void>;
  deleteMessage: (conversationId: number, messageId: number) => void;
  markRead: (conversationId: number) => void;
  markReadLocally: (conversationId: number) => void;
  setTyping: (conversationId: number, userId: number, isTyping: boolean) => void;
  setOnline: (ids: number[]) => void;
  setPresence: (userId: number, online: boolean, lastSeen: string | null) => void;
  setReplyTo: (conversationId: number, m: Message | null) => void;
  setJumpTo: (target: { conversationId: number; messageId: number } | null) => void;
  setConnection: (s: ConnectionState) => void;
}

const STATUS_RANK: Record<MessageStatus, number> = { failed: 0, sending: 0, sent: 1, delivered: 2, read: 3 };
const TYPING_TTL_MS = 6000;

const outbox = new Map<string, OutboxEntry>();
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const readInFlight = new Set<number>();

const emptyThread = (): Thread => ({ items: [], hasMore: false, loaded: false, loadingOlder: false });

const meId = () => useAuth.getState().me?.id;

/** Never let a late/duplicated event move ticks backwards (e.g. read -> delivered). */
function maxStatus(a: MessageStatus | null, b: MessageStatus | null): MessageStatus | null {
  if (!a) return b;
  if (!b) return a;
  return STATUS_RANK[b] >= STATUS_RANK[a] ? b : a;
}

function isPending(m: Message) {
  return m.id < 0;
}

/**
 * Insert or replace a message. Confirmed messages are kept in id order; optimistic
 * (negative id) messages stay at the tail until the server confirms them.
 */
function mergeMessage(items: Message[], incoming: Message): Message[] {
  const idx = items.findIndex(
    (m) => m.id === incoming.id || (!!incoming.client_id && m.client_id === incoming.client_id),
  );
  if (idx >= 0) {
    const prev = items[idx];
    const merged = { ...incoming, status: maxStatus(prev.status, incoming.status) };
    const next = items.slice();
    next[idx] = merged;
    // A pending message just got its real id: move it into id order.
    return isPending(prev) && !isPending(merged) ? sortThread(next) : next;
  }
  return sortThread([...items, incoming]);
}

function sortThread(items: Message[]): Message[] {
  const confirmed = items.filter((m) => !isPending(m)).sort((a, b) => a.id - b.id);
  const pending = items.filter(isPending);
  return [...confirmed, ...pending];
}

function mergePage(existing: Message[], page: Message[]): Message[] {
  return page.reduce(mergeMessage, existing);
}

function usersFromConversations(convs: Conversation[]): User[] {
  return convs.flatMap((c) => c.members.map((m) => m.user));
}

export const useChat = create<ChatState>((set, get) => {
  const patchThread = (id: number, fn: (t: Thread) => Partial<Thread>) =>
    set((s) => {
      const t = s.threads[id] ?? emptyThread();
      return { threads: { ...s.threads, [id]: { ...t, ...fn(t) } } };
    });

  const patchConversation = (id: number, fn: (c: Conversation) => Partial<Conversation>) =>
    set((s) => {
      const c = s.conversations[id];
      return c ? { conversations: { ...s.conversations, [id]: { ...c, ...fn(c) } } } : {};
    });

  const patchMessage = (conversationId: number, messageId: number, fn: (m: Message) => Partial<Message>) => {
    patchThread(conversationId, (t) => ({
      items: t.items.map((m) => (m.id === messageId ? { ...m, ...fn(m) } : m)),
    }));
    patchConversation(conversationId, (c) =>
      c.last_message?.id === messageId ? { last_message: { ...c.last_message, ...fn(c.last_message) } } : {},
    );
  };

  /** Push an outbox entry to the server. Returns an error message for the UI, or null. */
  const deliver = async (clientId: string): Promise<string | null> => {
    const entry = outbox.get(clientId);
    if (!entry || entry.inFlight) return null;
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
    entry.inFlight = true;
    const replaceLocal = (patch: Partial<Message>) =>
      patchThread(entry.conversationId, (t) => ({
        items: t.items.map((m) => (m.client_id === clientId ? { ...m, ...patch } : m)),
      }));
    replaceLocal({ status: "sending" });
    try {
      if (entry.file && entry.attachmentId == null) {
        entry.attachmentId = (await api.uploadAttachment(entry.file)).id;
      }
      const saved = await api.sendMessage(entry.conversationId, {
        client_id: clientId,
        body: entry.body,
        reply_to_id: entry.replyToId,
        attachment_id: entry.attachmentId,
      });
      outbox.delete(clientId);
      get().receiveMessage(saved);
      if (entry.previewUrl) {
        const url = entry.previewUrl;
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
      return null;
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, "Message failed to send");
      entry.retryable = apiErr.status === 0 || apiErr.status >= 500;
      entry.attempts += 1;
      replaceLocal({ status: "failed" });
      // Transient failures retry on their own (safe: the server dedupes on client_id).
      if (entry.retryable && entry.attempts < MAX_AUTO_RETRIES) {
        const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** entry.attempts);
        entry.retryTimer = setTimeout(() => void deliver(clientId), delay);
      }
      return apiErr.message;
    } finally {
      entry.inFlight = false;
    }
  };

  return {
    conversations: {},
    conversationsLoaded: false,
    threads: {},
    users: {},
    contactIds: [],
    online: {},
    typing: {},
    selectedId: null,
    replyTo: {},
    jumpTo: null,
    connection: "connecting",

    reset: () => {
      for (const entry of outbox.values()) if (entry.retryTimer) clearTimeout(entry.retryTimer);
      outbox.clear();
      set({
        conversations: {},
        conversationsLoaded: false,
        threads: {},
        users: {},
        contactIds: [],
        online: {},
        typing: {},
        selectedId: null,
        replyTo: {},
        jumpTo: null,
      });
    },

    loadInitial: async () => {
      const [convs, contacts] = await Promise.all([api.conversations(), api.contacts()]);
      get().upsertUsers([...usersFromConversations(convs), ...contacts]);
      set({
        conversations: Object.fromEntries(convs.map((c) => [c.id, c])),
        contactIds: contacts.map((u) => u.id),
        conversationsLoaded: true,
      });
    },

    /** After a reconnect: refresh everything we may have missed while offline. */
    resync: async () => {
      try {
        await get().loadInitial();
        const { selectedId, conversations } = get();
        // Other threads are refetched lazily when reopened.
        set((s) => ({
          threads: Object.fromEntries(
            Object.entries(s.threads).map(([id, t]) => [id, Number(id) === selectedId ? t : { ...t, loaded: false }]),
          ),
        }));
        if (selectedId && conversations[selectedId]) {
          const page = await api.messages(selectedId);
          patchThread(selectedId, (t) => ({ items: mergePage(t.items, page.messages), loaded: true }));
        } else if (selectedId) {
          set({ selectedId: null });
        }
        get().retryAllFailed();
      } catch {
        /* transient; the next reconnect will try again */
      }
    },

    select: (id) => {
      set({ selectedId: id });
      if (id != null && !get().threads[id]?.loaded) void get().loadThread(id);
    },

    upsertConversation: (c) => {
      get().upsertUsers(c.members.map((m) => m.user));
      set((s) => ({ conversations: { ...s.conversations, [c.id]: c } }));
    },

    removeConversation: (id) =>
      set((s) => {
        const conversations = { ...s.conversations };
        delete conversations[id];
        const threads = { ...s.threads };
        delete threads[id];
        return { conversations, threads, selectedId: s.selectedId === id ? null : s.selectedId };
      }),

    upsertUsers: (users) =>
      set((s) => {
        const next = { ...s.users };
        const online = { ...s.online };
        for (const u of users) {
          next[u.id] = { ...next[u.id], ...u };
          if (u.is_online) online[u.id] = true;
        }
        return { users: next, online };
      }),

    addContact: (u) => {
      get().upsertUsers([u]);
      set((s) => ({ contactIds: s.contactIds.includes(u.id) ? s.contactIds : [...s.contactIds, u.id] }));
    },

    removeContactId: (id) => set((s) => ({ contactIds: s.contactIds.filter((c) => c !== id) })),

    loadThread: async (id) => {
      try {
        const page = await api.messages(id);
        patchThread(id, (t) => ({ items: mergePage(t.items, page.messages), hasMore: page.has_more, loaded: true }));
      } catch {
        patchThread(id, () => ({ loaded: true }));
      }
    },

    loadOlder: async (id) => {
      const t = get().threads[id];
      if (!t || !t.hasMore || t.loadingOlder) return;
      const oldest = t.items.find((m) => !isPending(m));
      patchThread(id, () => ({ loadingOlder: true }));
      try {
        const page = await api.messages(id, oldest?.id);
        patchThread(id, (cur) => ({
          items: mergePage(cur.items, page.messages),
          hasMore: page.has_more,
          loadingOlder: false,
        }));
      } catch {
        patchThread(id, () => ({ loadingOlder: false }));
      }
    },

    send: async (conversationId, body, opts = {}) => {
      const me = useAuth.getState().me;
      const conv = get().conversations[conversationId];
      if (!me || !conv) return "Conversation unavailable";
      const clientId = crypto.randomUUID();
      const now = new Date();
      const file = opts.file ?? null;
      const previewUrl = file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null;

      const local: Message = {
        id: -(now.getTime() + Math.random()),
        conversation_id: conversationId,
        sender_id: me.id,
        kind: "text",
        client_id: clientId,
        body: body.trim(),
        meta: null,
        created_at: now.toISOString(),
        expires_at: conv.disappearing_seconds
          ? new Date(now.getTime() + conv.disappearing_seconds * 1000).toISOString()
          : null,
        reply_to: opts.replyTo
          ? {
              id: opts.replyTo.id,
              sender_id: opts.replyTo.sender_id,
              body: opts.replyTo.body,
              attachment: opts.replyTo.attachment,
            }
          : null,
        attachment: file
          ? { id: -1, url: previewUrl ?? "", file_name: file.name, content_type: file.type, size_bytes: file.size }
          : null,
        reactions: [],
        status: "sending",
      };
      outbox.set(clientId, {
        conversationId,
        clientId,
        body: local.body,
        replyToId: opts.replyTo?.id ?? null,
        file,
        attachmentId: null,
        previewUrl,
        retryable: false,
        attempts: 0,
        inFlight: false,
        retryTimer: null,
      });
      patchThread(conversationId, (t) => ({ items: [...t.items, local] }));
      patchConversation(conversationId, () => ({ last_message: local, last_activity_at: local.created_at }));
      set((s) => ({ replyTo: { ...s.replyTo, [conversationId]: null } }));
      return deliver(clientId);
    },

    retry: (clientId) => {
      const entry = outbox.get(clientId);
      if (entry) entry.attempts = 0; // a manual retry restarts the backoff budget
      return deliver(clientId);
    },

    retryAllFailed: () => {
      for (const [clientId, entry] of outbox) {
        if (!entry.retryable) continue;
        entry.attempts = 0;
        void deliver(clientId);
      }
    },

    receiveMessage: (m) => {
      const conv = get().conversations[m.conversation_id];
      if (!conv) {
        // First message of a chat someone else started: fetch it on demand.
        api
          .conversation(m.conversation_id)
          .then((c) => get().upsertConversation(c))
          .catch(() => {});
        return;
      }
      const thread = get().threads[m.conversation_id];
      if (thread) patchThread(m.conversation_id, (t) => ({ items: mergeMessage(t.items, m) }));

      const fromOther = m.sender_id !== meId();
      const isNew = !thread?.items.some((x) => x.id === m.id);
      patchConversation(m.conversation_id, (c) => {
        const newer = !c.last_message || isPending(c.last_message) || m.id >= c.last_message.id;
        return {
          last_message: newer
            ? { ...m, status: c.last_message?.id === m.id ? maxStatus(c.last_message.status, m.status) : m.status }
            : c.last_message,
          last_activity_at: newer ? m.created_at : c.last_activity_at,
          unread_count: fromOther && m.kind === "text" && isNew ? c.unread_count + 1 : c.unread_count,
        };
      });
      if (fromOther && m.sender_id != null) get().setTyping(m.conversation_id, m.sender_id, false);
    },

    applyStatuses: (updates) => {
      for (const u of updates) {
        patchMessage(u.conversation_id, u.message_id, (m) => ({ status: maxStatus(m.status, u.status) }));
      }
    },

    applyReactions: (conversationId, messageId, reactions) =>
      patchMessage(conversationId, messageId, () => ({ reactions })),

    react: async (m, emoji) => {
      const me = meId();
      if (me == null) return;
      const before = m.reactions;
      const mine = before.find((r) => r.user_id === me);
      const removing = mine?.emoji === emoji;
      const optimistic = removing
        ? before.filter((r) => r.user_id !== me)
        : [...before.filter((r) => r.user_id !== me), { user_id: me, emoji }];
      get().applyReactions(m.conversation_id, m.id, optimistic);
      try {
        const res = removing ? await api.unreact(m.id) : await api.react(m.id, emoji);
        get().applyReactions(m.conversation_id, m.id, res.reactions);
      } catch (err) {
        get().applyReactions(m.conversation_id, m.id, before);
        throw err;
      }
    },

    deleteMessage: (conversationId, messageId) => {
      patchThread(conversationId, (t) => ({ items: t.items.filter((m) => m.id !== messageId) }));
      if (get().conversations[conversationId]?.last_message?.id === messageId) {
        api
          .conversation(conversationId)
          .then((c) => get().upsertConversation(c))
          .catch(() => {});
      }
    },

    markRead: (conversationId) => {
      const conv = get().conversations[conversationId];
      if (!conv || conv.unread_count === 0 || readInFlight.has(conversationId)) return;
      const thread = get().threads[conversationId];
      const lastId = thread?.items.filter((m) => !isPending(m)).at(-1)?.id;
      readInFlight.add(conversationId);
      get().markReadLocally(conversationId);
      api
        .markRead(conversationId, lastId)
        .catch(() => patchConversation(conversationId, () => ({ unread_count: conv.unread_count })))
        .finally(() => readInFlight.delete(conversationId));
    },

    markReadLocally: (conversationId) => patchConversation(conversationId, () => ({ unread_count: 0 })),

    setTyping: (conversationId, userId, isTyping) => {
      const key = `${conversationId}:${userId}`;
      const timer = typingTimers.get(key);
      if (timer) clearTimeout(timer);
      typingTimers.delete(key);
      set((s) => {
        const conv = { ...(s.typing[conversationId] ?? {}) };
        if (isTyping) conv[userId] = Date.now() + TYPING_TTL_MS;
        else delete conv[userId];
        return { typing: { ...s.typing, [conversationId]: conv } };
      });
      // Safety net: if the "stopped typing" frame is lost, expire on our own.
      if (isTyping) {
        typingTimers.set(
          key,
          setTimeout(() => get().setTyping(conversationId, userId, false), TYPING_TTL_MS),
        );
      }
    },

    setOnline: (ids) => set({ online: Object.fromEntries(ids.map((id) => [id, true])) }),

    setPresence: (userId, online, lastSeen) =>
      set((s) => {
        const next = { ...s.online };
        if (online) next[userId] = true;
        else delete next[userId];
        const u = s.users[userId];
        return {
          online: next,
          users: u && lastSeen ? { ...s.users, [userId]: { ...u, last_seen_at: lastSeen } } : s.users,
        };
      }),

    setReplyTo: (conversationId, m) => set((s) => ({ replyTo: { ...s.replyTo, [conversationId]: m } })),
    setJumpTo: (target) => set({ jumpTo: target }),
    setConnection: (connection) => set({ connection }),
  };
});

/** Conversations sorted by most recent activity (Signal's chat list order). */
export function sortedConversations(conversations: Record<number, Conversation>): Conversation[] {
  return Object.values(conversations).sort(
    (a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime(),
  );
}
