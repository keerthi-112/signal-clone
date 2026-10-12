"use client";

import { useState } from "react";
import { userName } from "@/lib/names";
import type { ReactionEntry } from "@/lib/types";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";
import { Modal } from "../ui/Modal";

/** Reaction pill hanging off the bottom of a bubble; opens a viewer listing who reacted. */
export function ReactionsBar({
  reactions,
  own,
  meId,
  onToggle,
}: {
  reactions: ReactionEntry[];
  own: boolean;
  meId: number | undefined;
  onToggle: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const counts = new Map<string, number>();
  for (const r of reactions) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const mine = reactions.some((r) => r.user_id === meId);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="View reactions"
        className={`absolute -bottom-4 ${own ? "right-2" : "left-2"} flex h-6 items-center gap-0.5 rounded-full border-2 border-[var(--bg-conversation)] px-1.5 text-[13px] ${
          mine ? "bg-[var(--ultramarine-pastel,#abc4f8)] text-[#1b1b1b]" : "bg-bubble-in text-bubble-in-text"
        }`}
      >
        {top.map(([emoji]) => (
          <span key={emoji}>{emoji}</span>
        ))}
        {reactions.length > 1 && <span className="ml-0.5 text-[11px] font-semibold">{reactions.length}</span>}
      </button>
      {open && <ReactionViewer reactions={reactions} meId={meId} onToggle={onToggle} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReactionViewer({
  reactions,
  meId,
  onToggle,
  onClose,
}: {
  reactions: ReactionEntry[];
  meId: number | undefined;
  onToggle: (emoji: string) => void;
  onClose: () => void;
}) {
  const users = useChat((s) => s.users);
  const emojis = [...new Set(reactions.map((r) => r.emoji))];
  const [filter, setFilter] = useState<string | null>(null);
  const list = reactions.filter((r) => !filter || r.emoji === filter);

  return (
    <Modal title="Reactions" onClose={onClose} width={360}>
      <div className="flex gap-1.5 pb-3">
        <Chip active={!filter} onClick={() => setFilter(null)}>
          All · {reactions.length}
        </Chip>
        {emojis.map((e) => (
          <Chip key={e} active={filter === e} onClick={() => setFilter(e)}>
            {e} {reactions.filter((r) => r.emoji === e).length}
          </Chip>
        ))}
      </div>
      {list.map((r) => {
        const u = users[r.user_id];
        const isMe = r.user_id === meId;
        return (
          <div key={r.user_id} className="flex items-center gap-3 py-1.5">
            {u && <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size={32} />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px]">{userName(users, meId, r.user_id)}</div>
              {isMe && (
                <button
                  className="text-[12px] text-link hover:underline"
                  onClick={() => {
                    onToggle(r.emoji);
                    onClose();
                  }}
                >
                  Remove reaction
                </button>
              )}
            </div>
            <span className="text-[22px]">{r.emoji}</span>
          </div>
        );
      })}
    </Modal>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-7 rounded-full px-3 text-[13px] ${active ? "bg-selected font-semibold" : "bg-chip hover:bg-selected"}`}
    >
      {children}
    </button>
  );
}
