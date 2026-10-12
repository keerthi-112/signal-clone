"use client";

import { Check, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
import { useChat } from "@/store/chat";
import { useUI } from "@/store/ui";
import { Avatar } from "../ui/Avatar";
import { SearchInput } from "../ui/Controls";
import { Button } from "../ui/Modal";
import { toast } from "../ui/Toast";
import { ContactRow } from "./ContactRow";
import { PaneHeader } from "./PaneHeader";

export function MemberPicker({
  selected,
  onToggle,
  exclude = [],
}: {
  selected: number[];
  onToggle: (u: User) => void;
  exclude?: number[];
}) {
  const users = useChat((s) => s.users);
  const contactIds = useChat((s) => s.contactIds);
  const [query, setQuery] = useState("");

  const contacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contactIds
      .filter((id) => !exclude.includes(id))
      .map((id) => users[id])
      .filter((u) => u && (!q || u.display_name.toLowerCase().includes(q) || (u.username ?? "").includes(q)))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [contactIds, users, query, exclude]);

  return (
    <>
      {!!selected.length && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {selected.map((id) => {
            const u = users[id];
            if (!u) return null;
            return (
              <button
                key={id}
                onClick={() => onToggle(u)}
                className="flex items-center gap-1.5 rounded-full bg-chip py-0.5 pl-0.5 pr-2 text-[12px] hover:bg-selected"
                aria-label={`Remove ${u.display_name}`}
              >
                <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size={20} />
                {u.display_name.split(" ")[0]}
                <X size={12} />
              </button>
            );
          })}
        </div>
      )}
      <div className="px-4 pb-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search name or username" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {contacts.map((u) => {
          const on = selected.includes(u.id);
          return (
            <ContactRow
              key={u.id}
              user={u}
              onClick={() => onToggle(u)}
              trailing={
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    on ? "border-accent bg-accent text-white" : "border-line-strong"
                  }`}
                  aria-hidden
                >
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
              }
            />
          );
        })}
        {!contacts.length && <p className="px-8 pt-8 text-center text-[13px] text-secondary">No contacts found</p>}
      </div>
    </>
  );
}

/** Two-step Signal flow: choose members, then name the group. */
export function NewGroupPanel() {
  const setPane = useUI((s) => s.setPane);
  const users = useChat((s) => s.users);
  const [step, setStep] = useState<"members" | "name">("members");
  const [selected, setSelected] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (u: User) =>
    setSelected((cur) => (cur.includes(u.id) ? cur.filter((id) => id !== u.id) : [...cur, u.id]));

  const create = async () => {
    setBusy(true);
    try {
      const conv = await api.createGroup(title.trim(), selected);
      const chat = useChat.getState();
      chat.upsertConversation(conv);
      setPane("list");
      chat.select(conv.id);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't create group");
    } finally {
      setBusy(false);
    }
  };

  if (step === "members") {
    return (
      <>
        <PaneHeader
          title="Add members"
          onBack={() => setPane("compose")}
          trailing={
            <Button className="h-8 px-4" disabled={!selected.length} onClick={() => setStep("name")}>
              Next
            </Button>
          }
        />
        <MemberPicker selected={selected} onToggle={toggle} />
      </>
    );
  }

  return (
    <>
      <PaneHeader title="Name this group" onBack={() => setStep("members")} />
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) void create();
        }}
      >
        <div className="flex flex-col items-center px-4 pt-4">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#cde4cd] text-[#067906]">
            <Users size={36} strokeWidth={1.6} />
          </span>
          <input
            autoFocus
            placeholder="Group name (required)"
            value={title}
            maxLength={64}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-5 h-10 w-full rounded-lg bg-input px-3 text-[14px] outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
          />
        </div>
        <div className="px-4 pb-1 pt-5 text-[13px] font-semibold">Members · {selected.length + 1}</div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {selected.map((id) => users[id] && <ContactRow key={id} user={users[id]} />)}
        </div>
        <div className="flex justify-end border-t border-line p-3">
          <Button type="submit" disabled={busy || !title.trim()}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </>
  );
}
