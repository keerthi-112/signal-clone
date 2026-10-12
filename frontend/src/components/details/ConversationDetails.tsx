"use client";

import { ArrowLeft, Camera, LogOut, Pencil, Phone, ShieldCheck, Timer, UserMinus, UserPlus, Video } from "lucide-react";
import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatPhone, formatTimer } from "@/lib/format";
import { conversationPeer, conversationTitle, userName } from "@/lib/names";
import type { Conversation, Member } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { MemberPicker } from "../chats/NewGroupPanel";
import { useOpenDirect } from "../chats/useOpenDirect";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/Controls";
import { Menu, type MenuItem } from "../ui/Menu";
import { Button, ConfirmDialog, Modal } from "../ui/Modal";
import { toast } from "../ui/Toast";

interface Props {
  conversation: Conversation;
  onBack: () => void;
  onOpenTimer: () => void;
  onOpenSafetyNumber: () => void;
}

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Signal's "Chat settings" / "Group settings" pane. */
export function ConversationDetails({ conversation: c, onBack, onOpenTimer, onOpenSafetyNumber }: Props) {
  const meId = useAuth((s) => s.me?.id);
  const users = useChat((s) => s.users);
  const online = useChat((s) => s.online);
  const isGroup = c.kind === "group";
  const isAdmin = isGroup && c.my_role === "admin";
  const title = conversationTitle(c, meId, users);
  const peer = conversationPeer(c, meId);
  const peerUser = peer ? (users[peer.id] ?? peer) : undefined;

  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [memberMenu, setMemberMenu] = useState<{ anchor: HTMLElement; member: Member } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);
  const [confirmUncontact, setConfirmUncontact] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const openDirect = useOpenDirect();
  const isContact = useChat((s) => (peer ? s.contactIds.includes(peer.id) : false));

  const addToContacts = () =>
    run(async () => {
      const u = await api.addContact({ phone: peerUser!.phone });
      useChat.getState().addContact(u);
      toast(`${u.display_name} added to contacts`);
    }, "Couldn't add contact");

  // Admins first, then alphabetical, with "You" on top (Signal's ordering).
  const members = [...c.members].sort((a, b) => {
    if (a.user.id === meId) return -1;
    if (b.user.id === meId) return 1;
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return userName(users, meId, a.user.id).localeCompare(userName(users, meId, b.user.id));
  });

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    try {
      await fn();
    } catch (e) {
      toast(errorText(e, fallback));
    }
  };

  const memberItems = (m: Member): MenuItem[] => {
    const name = userName(users, meId, m.user.id);
    const items: MenuItem[] = [{ label: `Message ${name.split(" ")[0]}`, onSelect: () => void run(() => openDirect(m.user.id), "Couldn't open chat") }];
    if (isAdmin) {
      items.push(
        m.role === "admin"
          ? {
              label: "Remove as admin",
              onSelect: () =>
                void run(async () => useChat.getState().upsertConversation(await api.setMemberRole(c.id, m.user.id, "member")), "Couldn't update role"),
            }
          : {
              label: "Make admin",
              onSelect: () =>
                void run(async () => useChat.getState().upsertConversation(await api.setMemberRole(c.id, m.user.id, "admin")), "Couldn't update role"),
            },
        { label: "Remove from group", danger: true, onSelect: () => setConfirmRemove(m) },
      );
    }
    return items;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line px-2 md:px-4">
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="text-[15px] font-semibold">{isGroup ? "Group settings" : "Chat settings"}</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[560px] px-4 pb-10">
          <div className="flex flex-col items-center pt-8 text-center">
            <div className="relative">
              <Avatar
                name={title}
                color={peerUser?.avatar_color ?? c.avatar_color}
                url={isGroup ? c.avatar_url : peerUser?.avatar_url}
                isGroup={isGroup}
                size={80}
              />
              {isAdmin && (
                <button
                  onClick={() => avatarInput.current?.click()}
                  aria-label="Change group photo"
                  className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--bg-conversation)] bg-chip text-icon"
                >
                  <Camera size={14} />
                </button>
              )}
              <input
                ref={avatarInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void run(async () => useChat.getState().upsertConversation(await api.uploadGroupAvatar(c.id, f)), "Couldn't update photo");
                }}
              />
            </div>
            <div className="mt-3 flex items-center gap-1">
              <h2 className="text-[20px] font-semibold">{title}</h2>
              {isAdmin && (
                <IconButton label="Edit group" size={28} onClick={() => setEditOpen(true)}>
                  <Pencil size={14} />
                </IconButton>
              )}
            </div>
            {isGroup ? (
              <p className="mt-0.5 text-[13px] text-secondary">
                Group · {c.members.length} member{c.members.length === 1 ? "" : "s"}
              </p>
            ) : (
              peerUser && (
                <p className="mt-0.5 text-[13px] text-secondary">
                  {formatPhone(peerUser.phone)}
                  {peerUser.username && ` · @${peerUser.username}`}
                </p>
              )
            )}
            {(isGroup ? c.description : peerUser?.about) && (
              <p className="mt-2 max-w-sm text-[13px]">{isGroup ? c.description : peerUser?.about}</p>
            )}

            <div className="mt-5 flex gap-3">
              {[
                { label: "Video", icon: <Video size={20} /> },
                { label: "Audio", icon: <Phone size={18} /> },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => toast(`${a.label} calls are coming soon`)}
                  className="flex w-20 flex-col items-center gap-1 rounded-xl bg-chip py-2.5 text-[12px] hover:bg-selected"
                >
                  {a.icon}
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl bg-[var(--bg-sidebar)]">
            <Row icon={<Timer size={18} />} label="Disappearing messages" value={formatTimer(c.disappearing_seconds)} onClick={onOpenTimer} />
            {!isGroup && <Row icon={<ShieldCheck size={18} />} label="View safety number" onClick={onOpenSafetyNumber} />}
          </div>

          {!isGroup && peerUser && (
            <div className="mt-6 overflow-hidden rounded-xl bg-[var(--bg-sidebar)]">
              {isContact ? (
                <Row icon={<UserMinus size={18} />} label="Remove from contacts" danger onClick={() => setConfirmUncontact(true)} />
              ) : (
                <Row icon={<UserPlus size={18} />} label="Add to contacts" onClick={() => void addToContacts()} />
              )}
            </div>
          )}

          {isGroup && (
            <>
              <h3 className="px-1 pb-1 pt-6 text-[14px] font-semibold">
                {c.members.length} member{c.members.length === 1 ? "" : "s"}
              </h3>
              <div className="overflow-hidden rounded-xl bg-[var(--bg-sidebar)] py-1">
                {isAdmin && (
                  <button onClick={() => setAddOpen(true)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chip">
                      <UserPlus size={18} />
                    </span>
                    <span className="text-[14px]">Add members</span>
                  </button>
                )}
                {members.map((m) => {
                  const u = users[m.user.id] ?? m.user;
                  const isMe = m.user.id === meId;
                  return (
                    <button
                      key={m.user.id}
                      disabled={isMe}
                      onClick={(e) => setMemberMenu({ anchor: e.currentTarget, member: m })}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover disabled:hover:bg-transparent"
                    >
                      <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size={36} online={!isMe && !!online[u.id]} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px]">{isMe ? "You" : u.display_name}</span>
                        {u.about && <span className="block truncate text-[12px] text-secondary">{u.about}</span>}
                      </span>
                      {m.role === "admin" && <span className="text-[12px] text-secondary">Admin</span>}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 overflow-hidden rounded-xl bg-[var(--bg-sidebar)]">
                <Row icon={<LogOut size={18} />} label="Leave group" danger onClick={() => setConfirmLeave(true)} />
              </div>
            </>
          )}
        </div>
      </div>

      {memberMenu && (
        <Menu anchor={memberMenu.anchor} items={memberItems(memberMenu.member)} onClose={() => setMemberMenu(null)} align="end" />
      )}
      {confirmRemove && (
        <ConfirmDialog
          title={`Remove ${userName(users, meId, confirmRemove.user.id)} from “${c.title}”?`}
          confirmLabel="Remove"
          danger
          onConfirm={() => run(() => api.removeMember(c.id, confirmRemove.user.id), "Couldn't remove member")}
          onClose={() => setConfirmRemove(null)}
        />
      )}
      {confirmLeave && (
        <ConfirmDialog
          title="Leave group?"
          body="You will no longer be able to send or receive messages in this group."
          confirmLabel="Leave"
          danger
          onConfirm={() =>
            run(async () => {
              await api.removeMember(c.id, meId!);
              useChat.getState().removeConversation(c.id);
              toast(`You left “${c.title}”`);
            }, "Couldn't leave group")
          }
          onClose={() => setConfirmLeave(false)}
        />
      )}
      {confirmUncontact && peerUser && (
        <ConfirmDialog
          title={`Remove ${peerUser.display_name} from contacts?`}
          body="Your chat history stays. You can add them again any time."
          confirmLabel="Remove"
          danger
          onConfirm={() =>
            run(async () => {
              await api.removeContact(peerUser.id);
              useChat.getState().removeContactId(peerUser.id);
              toast(`${peerUser.display_name} removed from contacts`);
            }, "Couldn't remove contact")
          }
          onClose={() => setConfirmUncontact(false)}
        />
      )}
      {addOpen && <AddMembersModal conversation={c} onClose={() => setAddOpen(false)} />}
      {editOpen && <EditGroupModal conversation={c} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-hover ${danger ? "text-danger" : ""}`}>
      <span className={danger ? "text-danger" : "text-icon"}>{icon}</span>
      <span className="flex-1 text-[14px]">{label}</span>
      {value && <span className="text-[13px] text-secondary">{value}</span>}
    </button>
  );
}

function AddMembersModal({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const existing = conversation.members.map((m) => m.user.id);

  const save = async () => {
    setBusy(true);
    try {
      useChat.getState().upsertConversation(await api.addMembers(conversation.id, selected));
      toast(selected.length === 1 ? "Member added" : `${selected.length} members added`);
      onClose();
    } catch (e) {
      toast(errorText(e, "Couldn't add members"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add members"
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !selected.length}>
            Add{selected.length ? ` (${selected.length})` : ""}
          </Button>
        </>
      }
    >
      <div className="-mx-4 flex h-[50vh] flex-col">
        <MemberPicker
          selected={selected}
          exclude={existing}
          onToggle={(u) => setSelected((cur) => (cur.includes(u.id) ? cur.filter((id) => id !== u.id) : [...cur, u.id]))}
        />
      </div>
    </Modal>
  );
}

function EditGroupModal({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const [title, setTitle] = useState(conversation.title ?? "");
  const [description, setDescription] = useState(conversation.description);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      useChat.getState().upsertConversation(await api.updateConversation(conversation.id, { title: title.trim(), description }));
      onClose();
    } catch (e) {
      toast(errorText(e, "Couldn't save changes"));
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-lg bg-input px-3 text-[14px] outline-none focus:ring-2 focus:ring-[var(--focus-ring)]";
  return (
    <Modal
      title="Edit group"
      onClose={onClose}
      width={400}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !title.trim()}>
            Save
          </Button>
        </>
      }
    >
      <label className="block pb-1 text-[13px] text-secondary">Group name</label>
      <input value={title} maxLength={64} onChange={(e) => setTitle(e.target.value)} className={`${field} h-10`} />
      <label className="block pb-1 pt-4 text-[13px] text-secondary">Description</label>
      <textarea
        value={description}
        maxLength={480}
        rows={3}
        onChange={(e) => setDescription(e.target.value)}
        className={`${field} resize-none py-2`}
      />
    </Modal>
  );
}
