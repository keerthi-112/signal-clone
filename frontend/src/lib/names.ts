import { formatPhone, formatTimer } from "./format";
import type { Conversation, Message, SystemMeta, User } from "./types";

export type Directory = Record<number, User>;

export function userName(users: Directory, meId: number | undefined, id: number | null | undefined): string {
  if (id == null) return "Unknown";
  if (id === meId) return "You";
  const u = users[id];
  return u?.display_name || (u ? formatPhone(u.phone) : "Unknown");
}

export function conversationPeer(conv: Conversation, meId: number | undefined): User | undefined {
  if (conv.kind !== "direct") return undefined;
  return conv.members.find((m) => m.user.id !== meId)?.user;
}

export function conversationTitle(conv: Conversation, meId: number | undefined, users: Directory): string {
  if (conv.kind === "group") return conv.title || "Group";
  const peer = conversationPeer(conv, meId);
  return peer ? userName(users, meId, peer.id) : "Note to Self";
}

function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Human text for a system notice, phrased from the viewer's perspective. */
export function systemText(meta: SystemMeta | null, users: Directory, meId: number | undefined): string {
  if (!meta) return "";
  const actor = userName(users, meId, meta.actor_id);
  const targets = (meta.user_ids ?? []).map((id) => userName(users, meId, id));
  const objects = targets.map((t) => (t === "You" ? "you" : t));
  switch (meta.event) {
    case "group_created":
      return `${actor} created the group.`;
    case "title_changed":
      return `${actor} changed the group name to “${meta.title}”.`;
    case "timer_changed":
      return meta.seconds
        ? `${actor} set the disappearing message time to ${formatTimer(meta.seconds)}.`
        : `${actor} disabled disappearing messages.`;
    case "members_added":
      return `${actor} added ${nameList(objects)}.`;
    case "member_removed":
      return `${actor} removed ${nameList(objects)}.`;
    case "member_left":
      return `${nameList(targets)} left the group.`;
    case "admin_granted":
      return `${actor} made ${nameList(objects)} an admin.`;
    case "admin_revoked":
      return `${actor} revoked admin privileges from ${nameList(objects)}.`;
    default:
      return "";
  }
}

export function attachmentLabel(contentType: string, fileName: string): string {
  if (contentType.startsWith("image/")) return "📷 Photo";
  if (contentType.startsWith("video/")) return "🎥 Video";
  if (contentType.startsWith("audio/")) return "🎤 Audio";
  return `📎 ${fileName}`;
}

/** Conversation-list preview of a message. */
export function messagePreview(
  m: Message,
  conv: Conversation,
  users: Directory,
  meId: number | undefined,
): string {
  if (m.kind === "system") return systemText(m.meta, users, meId);
  let text = m.body;
  if (m.attachment) {
    const label = attachmentLabel(m.attachment.content_type, m.attachment.file_name);
    text = m.body ? `${label.split(" ")[0]} ${m.body}` : label;
  }
  if (conv.kind === "group" && m.sender_id !== meId) {
    return `${userName(users, meId, m.sender_id).split(" ")[0]}: ${text}`;
  }
  return text;
}
