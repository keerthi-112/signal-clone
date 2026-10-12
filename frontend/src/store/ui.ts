import { create } from "zustand";

export type NavTab = "chats" | "calls" | "stories";
/** What the left pane of the Chats tab is showing (Signal swaps the list in place). */
export type ChatsPane = "list" | "compose" | "new-group" | "find-phone" | "find-username";

interface UIState {
  tab: NavTab;
  pane: ChatsPane;
  settingsOpen: boolean;
  detailsOpen: boolean;
  shortcutsOpen: boolean;
  searchFocusTick: number;
  attachTick: number;
  setTab: (t: NavTab) => void;
  setPane: (p: ChatsPane) => void;
  setSettingsOpen: (v: boolean) => void;
  setDetailsOpen: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
  focusSearch: () => void;
  openAttach: () => void;
}

export const useUI = create<UIState>((set) => ({
  tab: "chats",
  pane: "list",
  settingsOpen: false,
  detailsOpen: false,
  shortcutsOpen: false,
  searchFocusTick: 0,
  attachTick: 0,
  setTab: (tab) => set({ tab, pane: "list" }),
  setPane: (pane) => set({ pane, tab: "chats" }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  focusSearch: () => set((s) => ({ tab: "chats", pane: "list", searchFocusTick: s.searchFocusTick + 1 })),
  openAttach: () => set((s) => ({ attachTick: s.attachTick + 1 })),
}));
