// Mirrors backend/app/schemas.py — the API contract.

export interface User {
  id: number;
  phone: string;
  username: string | null;
  display_name: string;
  about: string;
  avatar_url: string | null;
  avatar_color: string;
  last_seen_at: string | null;
  is_online: boolean;
}

export interface Me extends User {
  is_profile_complete: boolean;
}

export interface AuthResponse {
  token: string;
  user: Me;
  is_new_user: boolean;
}

export interface Attachment {
  id: number;
  url: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
}

export interface Quote {
  id: number;
  sender_id: number | null;
  body: string;
  attachment: Attachment | null;
}

export interface ReactionEntry {
  user_id: number;
  emoji: string;
}

/** Server-confirmed statuses plus the client-only states of the optimistic outbox. */
export type MessageStatus = "sending" | "failed" | "sent" | "delivered" | "read";

export interface SystemMeta {
  event:
    | "group_created"
    | "title_changed"
    | "timer_changed"
    | "members_added"
    | "member_removed"
    | "member_left"
    | "admin_granted"
    | "admin_revoked";
  actor_id: number | null;
  user_ids?: number[];
  title?: string;
  seconds?: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  kind: "text" | "system";
  client_id: string | null;
  body: string;
  meta: SystemMeta | null;
  created_at: string;
  expires_at: string | null;
  reply_to: Quote | null;
  attachment: Attachment | null;
  reactions: ReactionEntry[];
  status: MessageStatus | null;
}

export interface Member {
  user: User;
  role: "admin" | "member";
  joined_at: string;
}

export interface Conversation {
  id: number;
  kind: "direct" | "group";
  title: string | null;
  description: string;
  avatar_url: string | null;
  avatar_color: string;
  created_at: string;
  last_activity_at: string;
  disappearing_seconds: number;
  members: Member[];
  my_role: "admin" | "member";
  unread_count: number;
  last_message: Message | null;
}

export interface MessagePage {
  messages: Message[];
  has_more: boolean;
}

export interface SearchResults {
  conversations: number[];
  contacts: User[];
  messages: { message: Message; conversation_id: number }[];
}

export interface MessageInfo {
  message_id: number;
  recipients: { user_id: number; delivered_at: string | null; read_at: string | null }[];
}

// ---- WebSocket events (server -> client) ----

export type ServerEvent =
  | { type: "hello"; data: { user_id: number; online_user_ids: number[] } }
  | { type: "pong"; data: Record<string, never> }
  | { type: "presence"; data: { user_id: number; online: boolean; last_seen_at: string | null } }
  | { type: "typing"; data: { conversation_id: number; user_id: number; is_typing: boolean } }
  | { type: "message.created"; data: Message }
  | {
      type: "message.status";
      data: { updates: { message_id: number; conversation_id: number; status: MessageStatus }[] };
    }
  | {
      type: "message.reactions";
      data: { conversation_id: number; message_id: number; reactions: ReactionEntry[] };
    }
  | { type: "message.deleted"; data: { conversation_id: number; message_id: number } }
  | { type: "conversation.created"; data: Conversation }
  | { type: "conversation.updated"; data: Conversation }
  | { type: "conversation.removed"; data: { conversation_id: number } }
  | { type: "conversation.read"; data: { conversation_id: number; last_read_message_id: number } }
  | { type: "user.updated"; data: User };
