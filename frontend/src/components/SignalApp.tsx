"use client";

import { useEffect } from "react";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useRealtime } from "@/hooks/useRealtime";
import { useChat } from "@/store/chat";
import { usePrefs } from "@/store/prefs";
import { useUI } from "@/store/ui";
import { ChatsPanel } from "./chats/ChatsPanel";
import { ConversationView } from "./conversation/ConversationView";
import { EmptyConversation } from "./conversation/EmptyConversation";
import { NavRail } from "./layout/NavRail";
import { ComingSoonPane, ComingSoonPanel } from "./layout/ComingSoon";
import { SettingsView } from "./settings/SettingsView";
import { ShortcutsModal } from "./settings/ShortcutsModal";

/**
 * Signal Desktop layout: [nav rail | left pane (list) | conversation pane].
 * Below `md` only one pane is visible at a time, like Signal on a phone.
 */
export function SignalApp() {
  useRealtime();
  useKeyboardShortcuts();
  useNotificationPermission();

  const tab = useUI((s) => s.tab);
  const settingsOpen = useUI((s) => s.settingsOpen);
  const shortcutsOpen = useUI((s) => s.shortcutsOpen);
  const setShortcutsOpen = useUI((s) => s.setShortcutsOpen);
  const selectedId = useChat((s) => s.selectedId);
  const hasSelection = tab === "chats" && selectedId != null;

  // Keep the page title like Signal's window title: unread count first.
  const unread = useChat((s) => Object.values(s.conversations).reduce((n, c) => n + c.unread_count, 0));
  useEffect(() => {
    document.title = unread ? `(${unread}) Signal` : "Signal";
  }, [unread]);

  const shortcuts = shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />;

  if (settingsOpen) {
    return (
      <>
        <SettingsView />
        {shortcuts}
      </>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-app">
      <div className={`${hasSelection ? "hidden md:flex" : "flex"} w-full shrink-0 md:w-auto`}>
        <NavRail />
        <aside className="flex min-w-0 flex-1 flex-col border-r border-line bg-sidebar md:w-[320px] md:flex-none lg:w-[340px]">
          {tab === "chats" && <ChatsPanel />}
          {tab === "calls" && <ComingSoonPanel kind="calls" />}
          {tab === "stories" && <ComingSoonPanel kind="stories" />}
        </aside>
      </div>
      <main className={`${hasSelection ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-conversation`}>
        {tab === "chats" ? (
          selectedId != null ? <ConversationView key={selectedId} conversationId={selectedId} /> : <EmptyConversation />
        ) : (
          <ComingSoonPane kind={tab} />
        )}
      </main>
      {shortcuts}
    </div>
  );
}

/** Ask for desktop-notification permission on the first interaction (browsers require a gesture). */
function useNotificationPermission() {
  const enabled = usePrefs((s) => s.prefs.notifications);
  useEffect(() => {
    if (!enabled || typeof Notification === "undefined" || Notification.permission !== "default") return;
    const ask = () => void Notification.requestPermission();
    window.addEventListener("pointerdown", ask, { once: true });
    return () => window.removeEventListener("pointerdown", ask);
  }, [enabled]);
}
