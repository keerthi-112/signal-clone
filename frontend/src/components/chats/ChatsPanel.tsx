"use client";

import { ListFilter, MoreHorizontal, SquarePen, Users, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { conversationTitle } from "@/lib/names";
import { useAuth } from "@/store/auth";
import { sortedConversations, useChat } from "@/store/chat";
import { useUI } from "@/store/ui";
import { IconButton, SearchInput, Spinner } from "../ui/Controls";
import { Menu, useMenu } from "../ui/Menu";
import { ConversationListItem } from "./ConversationListItem";
import { FindPanel } from "./FindPanel";
import { NewChatPanel } from "./NewChatPanel";
import { NewGroupPanel } from "./NewGroupPanel";
import { SearchResults } from "./SearchResults";

export function ChatsPanel() {
  const pane = useUI((s) => s.pane);
  if (pane === "compose") return <NewChatPanel />;
  if (pane === "new-group") return <NewGroupPanel />;
  if (pane === "find-phone") return <FindPanel mode="phone" />;
  if (pane === "find-username") return <FindPanel mode="username" />;
  return <ChatList />;
}

function ChatList() {
  const meId = useAuth((s) => s.me?.id);
  const conversations = useChat((s) => s.conversations);
  const users = useChat((s) => s.users);
  const loaded = useChat((s) => s.conversationsLoaded);
  const selectedId = useChat((s) => s.selectedId);
  const select = useChat((s) => s.select);
  const connection = useChat((s) => s.connection);
  const { setPane, searchFocusTick } = useUI();

  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menu = useMenu();

  // Ctrl+F: focus on new presses only (mounting this pane must not steal focus).
  const seenFocusTick = useRef(searchFocusTick);
  useEffect(() => {
    if (searchFocusTick === seenFocusTick.current) return;
    seenFocusTick.current = searchFocusTick;
    searchRef.current?.focus();
  }, [searchFocusTick]);

  const list = useMemo(() => {
    const all = sortedConversations(conversations);
    return unreadOnly ? all.filter((c) => c.unread_count > 0 || c.id === selectedId) : all;
  }, [conversations, unreadOnly, selectedId]);

  const onSelect = useCallback(
    (id: number) => {
      select(id);
      setQuery("");
    },
    [select],
  );

  const markAllRead = () => {
    for (const c of Object.values(conversations)) if (c.unread_count) useChat.getState().markRead(c.id);
  };

  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center gap-1 pl-4 pr-2">
        <h1 className="flex-1 text-[20px] font-semibold">Chats</h1>
        <IconButton label="New chat" onClick={() => setPane("compose")}>
          <SquarePen size={18} />
        </IconButton>
        <IconButton label="More options" onClick={(e) => menu.open(e.currentTarget)}>
          <MoreHorizontal size={18} />
        </IconButton>
        {menu.anchor && (
          <Menu
            anchor={menu.anchor}
            onClose={menu.close}
            items={[
              { label: "New group", icon: <Users size={15} />, onSelect: () => setPane("new-group") },
              { label: "Mark all as read", onSelect: markAllRead },
            ]}
          />
        )}
      </header>

      <div className="px-4 pb-2">
        <SearchInput
          ref={searchRef}
          value={query}
          onChange={setQuery}
          trailing={
            <button
              aria-label="Filter by unread"
              aria-pressed={unreadOnly}
              title="Filter by unread"
              onClick={() => setUnreadOnly((v) => !v)}
              className={`-mr-1 flex h-6 w-6 items-center justify-center rounded ${
                unreadOnly ? "bg-accent text-white" : "text-tertiary hover:text-primary"
              }`}
            >
              <ListFilter size={14} />
            </button>
          }
        />
      </div>

      {connection === "offline" && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-chip px-3 py-2 text-[12px] text-secondary">
          <WifiOff size={14} className="shrink-0" />
          Offline. Signal will reconnect automatically.
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {query.trim() ? (
          <SearchResults
            query={query.trim()}
            conversations={list.filter((c) =>
              conversationTitle(c, meId, users).toLowerCase().includes(query.trim().toLowerCase()),
            )}
            onSelectConversation={onSelect}
          />
        ) : !loaded ? (
          <div className="flex justify-center pt-10">
            <Spinner />
          </div>
        ) : (
          <>
            {unreadOnly && (
              <div className="flex items-center justify-between px-4 pb-1 pt-1 text-[12px] text-secondary">
                <span>Filtered by unread</span>
                <button className="text-link hover:underline" onClick={() => setUnreadOnly(false)}>
                  Clear filter
                </button>
              </div>
            )}
            {list.map((c) => (
              <ConversationListItem key={c.id} conversation={c} selected={c.id === selectedId} onSelect={onSelect} />
            ))}
            {!list.length && (
              <p className="px-8 pt-10 text-center text-[13px] text-secondary">
                {unreadOnly ? "No unread chats." : "No chats yet. Start one with the compose button."}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
