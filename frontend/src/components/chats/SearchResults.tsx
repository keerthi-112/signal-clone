"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatListTime } from "@/lib/format";
import { conversationPeer, conversationTitle } from "@/lib/names";
import type { Conversation, SearchResults as Results } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";
import { SectionLabel, Spinner } from "../ui/Controls";
import { toast } from "../ui/Toast";
import { ContactRow } from "./ContactRow";
import { ConversationListItem } from "./ConversationListItem";
import { useOpenDirect } from "./useOpenDirect";

function Highlight({ text, query }: { text: string; query: string }) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  // Show the match in context, like Signal's message snippets.
  const start = Math.max(0, idx - 24);
  return (
    <>
      {start > 0 && "…"}
      {text.slice(start, idx)}
      <mark className="bg-transparent font-bold text-primary">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function SearchResults({
  query,
  conversations,
  onSelectConversation,
}: {
  query: string;
  conversations: Conversation[];
  onSelectConversation: (id: number) => void;
}) {
  const meId = useAuth((s) => s.me?.id);
  const allConversations = useChat((s) => s.conversations);
  const users = useChat((s) => s.users);
  const selectedId = useChat((s) => s.selectedId);
  const setJumpTo = useChat((s) => s.setJumpTo);
  const openDirect = useOpenDirect();
  // Results are tagged with the query they answer, so stale ones never show as current.
  const [fetched, setFetched] = useState<{ query: string; results: Results | null } | null>(null);
  const loading = fetched?.query !== query;
  const results = fetched?.results ?? null;

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .search(query)
        .then((r) => !cancelled && setFetched({ query, results: r }))
        .catch(() => !cancelled && setFetched({ query, results: null }));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const chats = useMemo(() => {
    const ids = new Set(conversations.map((c) => c.id));
    const extra = (results?.conversations ?? []).filter((id) => !ids.has(id) && allConversations[id]);
    return [...conversations, ...extra.map((id) => allConversations[id])];
  }, [conversations, results, allConversations]);

  // Contacts that already appear as a 1:1 chat above aren't repeated.
  const contacts = useMemo(() => {
    const shown = new Set(chats.map((c) => conversationPeer(c, meId)?.id).filter(Boolean));
    return (results?.contacts ?? []).filter((u) => !shown.has(u.id));
  }, [results, chats, meId]);

  const messages = results?.messages ?? [];
  const nothing = !loading && !chats.length && !contacts.length && !messages.length;

  return (
    <div>
      {!!chats.length && (
        <>
          <SectionLabel>Chats</SectionLabel>
          {chats.map((c) => (
            <ConversationListItem key={c.id} conversation={c} selected={c.id === selectedId} onSelect={onSelectConversation} />
          ))}
        </>
      )}
      {!!contacts.length && (
        <>
          <SectionLabel>Contacts</SectionLabel>
          {contacts.map((u) => (
            <ContactRow key={u.id} user={u} onClick={() => openDirect(u.id).catch((e) => toast(e.message))} />
          ))}
        </>
      )}
      {!!messages.length && (
        <>
          <SectionLabel>Messages</SectionLabel>
          {messages.map(({ message: m, conversation_id }) => {
            const conv = allConversations[conversation_id];
            if (!conv) return null;
            const title = conversationTitle(conv, meId, users);
            const peer = conversationPeer(conv, meId);
            return (
              <button
                key={m.id}
                onClick={() => {
                  onSelectConversation(conversation_id);
                  setJumpTo({ conversationId: conversation_id, messageId: m.id });
                }}
                className="mx-2 flex w-[calc(100%-16px)] items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-hover"
              >
                <Avatar
                  name={title}
                  color={peer?.avatar_color ?? conv.avatar_color}
                  url={conv.kind === "group" ? conv.avatar_url : peer?.avatar_url}
                  isGroup={conv.kind === "group"}
                  size={48}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{title}</span>
                    <span className="shrink-0 text-[12px] text-secondary">{formatListTime(m.created_at)}</span>
                  </div>
                  <div className="line-clamp-2 text-[13px] text-secondary">
                    <Highlight text={m.body} query={query} />
                  </div>
                </div>
              </button>
            );
          })}
        </>
      )}
      {loading && !chats.length && (
        <div className="flex justify-center pt-8">
          <Spinner />
        </div>
      )}
      {nothing && <p className="px-8 pt-10 text-center text-[13px] text-secondary">No results for “{query}”</p>}
    </div>
  );
}
