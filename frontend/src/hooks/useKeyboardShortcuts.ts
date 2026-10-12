"use client";

import { useEffect } from "react";
import { sortedConversations, useChat } from "@/store/chat";
import { useUI } from "@/store/ui";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl";
export const ALT = isMac ? "⌥" : "Alt";

/** Shortcuts modelled on Signal Desktop's (where the browser doesn't reserve the combo). */
export const SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: [MOD, "F"], description: "Search" },
  { keys: [MOD, ALT, "N"], description: "Start new chat" },
  { keys: [MOD, ALT, "G"], description: "Create new group" },
  { keys: [ALT, "↑ / ↓"], description: "Previous / next chat" },
  { keys: [ALT, "Shift", "↑ / ↓"], description: "Previous / next unread chat" },
  { keys: [MOD, "U"], description: "Attach file" },
  { keys: [MOD, ","], description: "Preferences" },
  { keys: [MOD, "/"], description: "Show keyboard shortcuts" },
  { keys: ["Esc"], description: "Cancel reply / close panel" },
  { keys: ["Enter"], description: "Send message" },
  { keys: ["Shift", "Enter"], description: "New line" },
];

function step(direction: 1 | -1, unreadOnly: boolean) {
  const chat = useChat.getState();
  const list = sortedConversations(chat.conversations);
  if (!list.length) return;
  const idx = list.findIndex((c) => c.id === chat.selectedId);
  for (let i = 1; i <= list.length; i++) {
    const candidate = list[(idx + direction * i + list.length * 2) % list.length];
    if (!unreadOnly || candidate.unread_count > 0) {
      useUI.getState().setTab("chats");
      chat.select(candidate.id);
      return;
    }
  }
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const ui = useUI.getState();
      const key = e.key.toLowerCase();

      if (mod && e.altKey && key === "n") {
        e.preventDefault();
        ui.setPane("compose");
      } else if (mod && e.altKey && key === "g") {
        e.preventDefault();
        ui.setPane("new-group");
      } else if (mod && !e.altKey && key === "f") {
        e.preventDefault();
        ui.focusSearch();
      } else if (mod && key === "u" && useChat.getState().selectedId) {
        e.preventDefault();
        ui.openAttach();
      } else if (mod && key === ",") {
        e.preventDefault();
        ui.setSettingsOpen(true);
      } else if (mod && key === "/") {
        e.preventDefault();
        ui.setShortcutsOpen(true);
      } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        step(e.key === "ArrowUp" ? -1 : 1, e.shiftKey);
      } else if (e.key === "Escape") {
        const chat = useChat.getState();
        if (ui.shortcutsOpen) ui.setShortcutsOpen(false);
        else if (ui.settingsOpen) ui.setSettingsOpen(false);
        else if (chat.selectedId && chat.replyTo[chat.selectedId]) chat.setReplyTo(chat.selectedId, null);
        else if (ui.detailsOpen) ui.setDetailsOpen(false);
        else if (ui.pane !== "list") ui.setPane("list");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
