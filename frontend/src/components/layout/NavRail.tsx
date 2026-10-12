"use client";

import { CircleDashed, MessageCircle, Phone, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { useUI, type NavTab } from "@/store/ui";
import { Avatar } from "../ui/Avatar";

function TabButton({
  active,
  label,
  onClick,
  badge,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  badge?: number;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
        active ? "bg-selected text-primary" : "text-icon hover:bg-hover"
      }`}
    >
      {children}
      {!!badge && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold leading-none text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/** Signal Desktop's vertical tab bar: Chats / Calls / Stories, then settings + profile. */
export function NavRail() {
  const { tab, setTab, setSettingsOpen } = useUI();
  const me = useAuth((s) => s.me);
  const unreadChats = useChat((s) => Object.values(s.conversations).filter((c) => c.unread_count > 0).length);

  const tabs: { id: NavTab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: "chats", label: "Chats", icon: <MessageCircle size={20} strokeWidth={1.8} />, badge: unreadChats },
    { id: "calls", label: "Calls", icon: <Phone size={20} strokeWidth={1.8} /> },
    { id: "stories", label: "Stories", icon: <CircleDashed size={20} strokeWidth={1.8} /> },
  ];

  return (
    <nav className="flex w-[60px] shrink-0 flex-col items-center gap-1 border-r border-line bg-nav py-3">
      {tabs.map((t) => (
        <TabButton key={t.id} active={tab === t.id} label={t.label} badge={t.badge} onClick={() => setTab(t.id)}>
          {t.icon}
        </TabButton>
      ))}
      <div className="flex-1" />
      <TabButton label="Settings" onClick={() => setSettingsOpen(true)}>
        <Settings size={20} strokeWidth={1.8} />
      </TabButton>
      {me && (
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Profile"
          title={me.display_name}
          className="mt-1 rounded-full"
        >
          <Avatar name={me.display_name} color={me.avatar_color} url={me.avatar_url} size={32} />
        </button>
      )}
    </nav>
  );
}
