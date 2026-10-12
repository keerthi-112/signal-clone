"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import { useChat } from "@/store/chat";
import { useUI } from "@/store/ui";

/** Get-or-create the 1:1 chat with a user and open it. */
export function useOpenDirect() {
  return useCallback(async (userId: number) => {
    const conv = await api.openDirect(userId);
    const chat = useChat.getState();
    chat.upsertConversation(conv);
    useUI.getState().setPane("list");
    chat.select(conv.id);
  }, []);
}
