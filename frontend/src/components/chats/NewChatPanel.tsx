"use client";

import { AtSign, Hash, Phone, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { useChat } from "@/store/chat";
import { useUI } from "@/store/ui";
import { SearchInput, SectionLabel } from "../ui/Controls";
import { toast } from "../ui/Toast";
import { ActionRow, ContactRow } from "./ContactRow";
import { PaneHeader } from "./PaneHeader";
import { useOpenDirect } from "./useOpenDirect";

/** "New chat" pane: contacts list plus entry points to find people and create groups. */
export function NewChatPanel() {
  const setPane = useUI((s) => s.setPane);
  const users = useChat((s) => s.users);
  const contactIds = useChat((s) => s.contactIds);
  const online = useChat((s) => s.online);
  const openDirect = useOpenDirect();
  const [query, setQuery] = useState("");

  const contacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contactIds
      .map((id) => users[id])
      .filter(Boolean)
      .filter(
        (u) =>
          !q ||
          u.display_name.toLowerCase().includes(q) ||
          u.phone.includes(q.replace(/[^\d+]/g, "") || "\u0000") ||
          (u.username ?? "").includes(q.replace(/^@/, "")),
      )
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [contactIds, users, query]);

  // Typing a full phone number offers to message it directly, as in Signal.
  const digits = query.replace(/[^\d+]/g, "");
  const phoneCandidate = digits.replace(/\D/g, "").length >= 7 ? (digits.startsWith("+") ? digits : `+${digits}`) : null;

  const startWithPhone = async (phone: string) => {
    try {
      const user = await api.addContact({ phone });
      useChat.getState().addContact(user);
      await openDirect(user.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't start chat");
    }
  };

  return (
    <>
      <PaneHeader title="New chat" onBack={() => setPane("list")} />
      <div className="px-4 pb-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Name, username or number" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {phoneCandidate && !contacts.length && (
          <ActionRow icon={<Hash size={18} />} label={`Message ${formatPhone(phoneCandidate)}`} onClick={() => startWithPhone(phoneCandidate)} />
        )}
        {!query && (
          <>
            <ActionRow icon={<Users size={18} />} label="New group" onClick={() => setPane("new-group")} />
            <ActionRow icon={<AtSign size={18} />} label="Find by username" onClick={() => setPane("find-username")} />
            <ActionRow icon={<Phone size={18} />} label="Find by phone number" onClick={() => setPane("find-phone")} />
          </>
        )}
        {!!contacts.length && <SectionLabel>Contacts</SectionLabel>}
        {contacts.map((u) => (
          <ContactRow
            key={u.id}
            user={u}
            online={!!online[u.id]}
            onClick={() => openDirect(u.id).catch((e) => toast(e.message))}
          />
        ))}
        {query && !contacts.length && !phoneCandidate && (
          <p className="px-8 pt-8 text-center text-[13px] text-secondary">No contacts found for “{query}”</p>
        )}
      </div>
    </>
  );
}
