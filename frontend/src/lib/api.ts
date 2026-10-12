import type {
  AuthResponse,
  Attachment,
  Conversation,
  Me,
  MessageInfo,
  Message,
  MessagePage,
  ReactionEntry,
  SearchResults,
  User,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const WS_URL = API_URL.replace(/^http/, "ws") + "/ws";

const TOKEN_KEY = "signal.token";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable (private mode) — session lasts for this tab only */
    }
  },
};

/** Called when the server rejects our token; wired to logout by the auth store. */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    // FastAPI validation errors: [{msg: "..."}]
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, "");
  }
  return fallback;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, errorMessage(data, `Request failed (${res.status})`));
  }
  return data as T;
}

function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return request<T>("POST", path, form);
}

export const api = {
  // auth
  requestCode: (phone: string) =>
    request<{ phone: string; is_registered: boolean; mock_code: string }>("POST", "/api/auth/request-code", { phone }),
  verifyCode: (phone: string, code: string) => request<AuthResponse>("POST", "/api/auth/verify", { phone, code }),
  logout: () => request<void>("POST", "/api/auth/logout"),

  // profile
  me: () => request<Me>("GET", "/api/users/me"),
  updateMe: (data: Partial<Pick<Me, "display_name" | "about" | "username" | "avatar_color">>) =>
    request<Me>("PATCH", "/api/users/me", data),
  uploadAvatar: (file: File) => upload<Me>("/api/users/me/avatar", file),
  removeAvatar: () => request<Me>("DELETE", "/api/users/me/avatar"),

  // contacts
  contacts: () => request<User[]>("GET", "/api/contacts"),
  addContact: (query: { phone?: string; username?: string }) => request<User>("POST", "/api/contacts", query),
  removeContact: (userId: number) => request<void>("DELETE", `/api/contacts/${userId}`),

  // conversations
  conversations: () => request<Conversation[]>("GET", "/api/conversations"),
  conversation: (id: number) => request<Conversation>("GET", `/api/conversations/${id}`),
  openDirect: (userId: number) => request<Conversation>("POST", "/api/conversations/direct", { user_id: userId }),
  createGroup: (title: string, memberIds: number[]) =>
    request<Conversation>("POST", "/api/conversations/group", { title, member_ids: memberIds }),
  updateConversation: (id: number, data: { title?: string; description?: string; disappearing_seconds?: number }) =>
    request<Conversation>("PATCH", `/api/conversations/${id}`, data),
  uploadGroupAvatar: (id: number, file: File) => upload<Conversation>(`/api/conversations/${id}/avatar`, file),
  addMembers: (id: number, userIds: number[]) =>
    request<Conversation>("POST", `/api/conversations/${id}/members`, { user_ids: userIds }),
  removeMember: (id: number, userId: number) => request<void>("DELETE", `/api/conversations/${id}/members/${userId}`),
  setMemberRole: (id: number, userId: number, role: "admin" | "member") =>
    request<Conversation>("PATCH", `/api/conversations/${id}/members/${userId}`, { role }),
  markRead: (id: number, upToId?: number) =>
    request<void>("POST", `/api/conversations/${id}/read`, { up_to_id: upToId ?? null }),

  // messages
  messages: (conversationId: number, beforeId?: number, limit = 50) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (beforeId) qs.set("before_id", String(beforeId));
    return request<MessagePage>("GET", `/api/conversations/${conversationId}/messages?${qs}`);
  },
  sendMessage: (
    conversationId: number,
    data: { client_id: string; body: string; reply_to_id?: number | null; attachment_id?: number | null },
  ) => request<Message>("POST", `/api/conversations/${conversationId}/messages`, data),
  messageInfo: (messageId: number) => request<MessageInfo>("GET", `/api/messages/${messageId}/info`),
  react: (messageId: number, emoji: string) =>
    request<{ reactions: ReactionEntry[] }>("PUT", `/api/messages/${messageId}/reaction`, { emoji }),
  unreact: (messageId: number) => request<{ reactions: ReactionEntry[] }>("DELETE", `/api/messages/${messageId}/reaction`),
  uploadAttachment: (file: File) => upload<Attachment>("/api/attachments", file),

  search: (q: string) => request<SearchResults>("GET", `/api/search?q=${encodeURIComponent(q)}`),
};
