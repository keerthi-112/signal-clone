# Signal Clone — Secure Messaging Platform

A functional clone of the Signal messenger: phone-number onboarding, a conversation list, real-time
one-on-one and group messaging with sent / delivered / read ticks, typing indicators, presence,
group admin controls, and Signal's desktop look and feel (light and dark).

| Layer     | Tech |
|-----------|------|
| Frontend  | Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4, Zustand, lucide-react |
| Backend   | Python 3.12+, FastAPI, SQLAlchemy 2, Pydantic 2, Uvicorn |
| Database  | SQLite (WAL mode, foreign keys enforced) |
| Real-time | Native WebSockets (FastAPI ⇄ browser) |

```
frontend/   Next.js app
backend/    FastAPI app, SQLite schema, seed data, tests
render.yaml Render blueprint for the backend
```

---

## Quick start

**Prerequisites:** Python 3.12+ and Node.js 20+.

```bash
# 1. Backend  → http://localhost:8000  (API docs at /docs)
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 2. Frontend → http://localhost:3000
cd frontend
cp .env.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```

The database is created and **seeded automatically** on first start. To reset it:
`python -m app.seed --reset`.

### Demo accounts

Verification is mocked: **every number accepts the code `123456`**. Seeded accounts
(country +1):

| Name          | Phone         | Username      |
|---------------|---------------|---------------|
| Alex Rivera   | 555-010-0001  | `alex_rivera` |
| Priya Sharma  | 555-010-0002  | `priya`       |
| Jordan Lee    | 555-010-0003  | `jordan_lee`  |
| Maya Chen     | 555-010-0004  | `maya_chen`   |
| Sam Okafor    | 555-010-0005  | `sam_okafor`  |
| Elena Petrova | 555-010-0006  | `elena_p`     |
| Diego Santos  | 555-010-0007  | `diego_s`     |
| Noah Williams | 555-010-0008  | `noah_w`      |

To see real-time messaging, open two browser windows (one of them private/incognito) and sign in as
two different users, for example Alex and Priya. A new phone number creates a new account.

### Tests

```bash
cd backend && pytest -q
```

The 15 API and WebSocket tests cover:

- auth
- contacts
- idempotent sending
- receipts
- pagination
- replies and reactions
- attachments
- disappearing messages
- group admin rules
- search
- the full real-time flow: presence → typing → push → delivered → read

---

## Features

### Core (from the brief)

**Onboarding**
- Phone number → OTP (fixed `123456`) → profile setup (name + photo).
- Sessions persist via a bearer token in `localStorage`.
- Log out from Settings → Profile.

**Chat list**
- Sorted by most recent activity.
- Unread badges and last-message preview (with sender prefix in groups).
- Your own last message shows its tick status.
- Typing animation in the list.

**Search**
- Global search across chats, contacts, and message text (with highlighted snippets; clicking one jumps to the message).
- "Filter by unread" toggle.

**Add a contact**
- New chat → *Find by phone number* or *Find by username*.
- Typing a full number in New chat offers "Message +1 …".
- Remove or re-add a contact from a 1:1 chat's settings.

**Presence**
- Online dot and "Online" / "Last seen …", derived from live WebSocket connections.

**1:1 messaging**
- Real-time delivery and timestamps.
- Signal's status icons: sending (dashed), sent (✓ in a circle), delivered (two outlined circles), read (two filled circles).
- Typing indicator.
- Everything persists.

**Groups**
- Create (choose members → name the group) and view members.
- Admins can add or remove members, make or revoke admins, rename the group, edit the description, and change the photo.
- Anyone can leave; if the last admin leaves, someone is promoted automatically.
- Membership changes appear as system notices in the timeline.

**Signal UX**
- Navigation rail (Chats / Calls / Stories), list pane plus conversation pane.
- Bubble grouping with tightened inner corners, day separators, an "N unread messages" divider, and a conversation hero with the encryption notice.
- Modals, menus, toasts, and desktop notifications.
- Settings sections: Profile, Appearance, Chats, Notifications, Privacy, Linked devices.

**Placeholders**
- Voice/video calls, Stories, Linked devices and some privacy toggles show "Coming soon".
- End-to-end encryption is simulated: the encryption notice, plus a safety-number dialog derived from both phone numbers.

### Bonus

- **Attachments:** images (inline, with a lightbox) and files (download). Upload by picker, paste, or drag and drop.
- **Emoji reactions:** one per person, Signal's six defaults plus a full picker, and a "who reacted" viewer.
- **Reply/quote:** click a quote to jump to the original.
- **Disappearing messages:** a per-chat timer, deleted server-side by a sweeper and hidden client-side on time.
- **Dark mode:** System / Light / Dark.
- **Responsive design:** on phones one pane is shown at a time.
- **Keyboard shortcuts:** press `Ctrl+/` to see the list.

---

## Architecture

```
┌──────────────── Browser (Next.js) ────────────────┐        ┌──────────── FastAPI ─────────────┐
│ components/  (UI, Signal design tokens)           │        │ routers/   HTTP + /ws endpoints  │
│ store/chat   Zustand: conversations, threads,     │  REST  │ services/  domain logic          │
│              outbox, presence, typing             │◄──────►│   conversations · messages       │
│ lib/api      typed fetch client                   │        │   serializers · media            │
│ lib/socket   WebSocket w/ backoff + heartbeat     │◄──WS──►│ realtime.py ConnectionManager    │
└───────────────────────────────────────────────────┘        │ models.py  SQLAlchemy ─► SQLite  │
                                                             └──────────────────────────────────┘
```

**Design decisions**

- **Writes go over REST; WebSocket is the push channel.**
  - Sending a message is a normal `POST` with a request/response and proper error codes.
  - The server then fans a `message.created` event out to every member's open sockets.
  - Ephemeral signals (typing, delivery acks, pings) go client → server over the socket.
- **Idempotent sends.** The client generates a `client_id` (UUID) per message, and `UNIQUE(sender_id, client_id)` makes retries safe. A request whose response is lost can be re-sent without creating a duplicate.
- **Optimistic outbox.**
  - Messages render immediately as *sending*.
  - On network failure they become *failed*: tap to retry, and they retry automatically when the socket reconnects.
  - Status updates never move backwards (read > delivered > sent), so out-of-order events are harmless.
- **Receipts.**
  - Each message gets one `message_receipts` row per recipient.
  - *Delivered* is stamped when the recipient's device acknowledges a pushed message, fetches history, or connects (pending messages are flushed).
  - *Read* is stamped when the chat is open **and** the window is focused.
  - The sender's tick is the aggregate across recipients: all read → read, all delivered → delivered. This is how groups work in Signal too.
- **Unread counts** come from a per-member read watermark (`last_read_message_id`), with no per-message flags to keep in sync.
- **Resilient socket.**
  - Exponential backoff with jitter, plus a 25 s heartbeat so proxies don't drop idle connections.
  - Reconnects when the tab becomes visible or the network returns.
  - A full **resync** after each reconnect recovers anything missed while offline.
- **Thread-safe fan-out.** Sync REST handlers run in a thread pool, so `ConnectionManager.emit()` schedules delivery on the event loop with `run_coroutine_threadsafe`. Replacing it with Redis pub/sub would allow multiple instances without changing callers.
- **Per-viewer projections.** Events are serialized per recipient (e.g. only the sender sees tick status, and unread counts differ per member).
- **Security.**
  - Tokens are 256-bit random values stored only as SHA-256 hashes.
  - Every conversation and message route checks membership and returns 404 for non-members.
  - Uploads are size-limited and only raster images are served inline; everything else is a forced download with `nosniff`.
  - `LIKE` wildcards in search are escaped.

### Frontend structure

```
src/
  app/                layout (theme boot script), / (auth gate → app), /register (onboarding)
  components/
    SignalApp.tsx     3-pane shell, responsive switching
    layout/           NavRail, Coming-soon placeholders
    chats/            list, list item, search results, new chat / find / new group panes
    conversation/     header, message list, bubble, composer, quotes, reactions, emoji, modals
    details/          chat & group settings (members, admin actions)
    settings/         settings window, shortcuts modal
    onboarding/       phone → code → profile
    ui/               Avatar, StatusIcon, Modal, Menu, Toast, controls
  hooks/              useRealtime (socket → store), useKeyboardShortcuts
  lib/                api client, socket client, types, formatting, names, prefs
  store/              auth, chat, prefs, ui (Zustand)
```

---

## Database schema

```
users ──┬──< sessions
        ├──< contacts >── users            (owner_id → contact_id)
        ├──< conversation_members >── conversations
        ├──< messages (sender_id)
        ├──< message_receipts
        ├──< reactions
        └──< attachments (uploader_id)
conversations ──< messages ──┬──< message_receipts
                             ├──< reactions
                             ├──── messages (reply_to_id, self-reference)
                             └──── attachments
```

| Table | Key columns | Notes |
|-------|-------------|-------|
| `users` | `id`, `phone` UNIQUE, `username` UNIQUE NULL, `display_name`, `about`, `avatar_path`, `avatar_color`, `last_seen_at` | `display_name` is empty until onboarding finishes. |
| `sessions` | `user_id` FK, `token_hash` UNIQUE, `expires_at` | Opaque bearer tokens, stored hashed. |
| `contacts` | `owner_id` FK, `contact_id` FK, UNIQUE(owner, contact), CHECK(owner ≠ contact) | Directed address-book edges. |
| `conversations` | `kind` CHECK('direct','group'), `title`, `description`, `avatar_path`, `direct_key` UNIQUE, `last_activity_at` (indexed), `disappearing_seconds` | `direct_key = "<lo_id>:<hi_id>"` guarantees a single 1:1 chat per pair. `last_activity_at` is denormalized for cheap sorting. |
| `conversation_members` | PK(`conversation_id`, `user_id`), `role` CHECK('admin','member'), `joined_at`, `last_read_message_id` | Membership + per-member read watermark. |
| `messages` | `conversation_id` FK, `sender_id` FK NULL, `kind` CHECK('text','system'), `client_id`, `body`, `meta` JSON, `reply_to_id` FK, `attachment_id` FK, `created_at`, `expires_at` (indexed) | UNIQUE(`sender_id`, `client_id`) for idempotency; index (`conversation_id`, `id`) for keyset pagination. System notices store structured `meta` (e.g. `{"event": "members_added", "actor_id": 1, "user_ids": [4]}`) and are rendered relative to the viewer ("You added Maya"). |
| `message_receipts` | PK(`message_id`, `user_id`), `delivered_at`, `read_at` | One row per recipient; index (`user_id`, `delivered_at`) for flushing pending deliveries. |
| `reactions` | PK(`message_id`, `user_id`), `emoji` | The primary key enforces Signal's one-reaction-per-person rule. |
| `attachments` | `key` UNIQUE (random), `uploader_id` FK, `file_name`, `content_type`, `size_bytes` | Files are stored on disk under `media/`. |

All foreign keys declare `ON DELETE` behaviour (CASCADE for owned rows, SET NULL for senders, quotes and attachments).

---

## API overview

Interactive docs are available at **`/docs`** (OpenAPI). All routes except auth require
`Authorization: Bearer <token>`.

| Method & path | Purpose |
|---|---|
| `POST /api/auth/request-code` | Start login/registration for a phone number (mock: returns the code) |
| `POST /api/auth/verify` | Verify code → `{token, user, is_new_user}` (creates the account if new) |
| `POST /api/auth/logout` | Revoke the current session |
| `GET/PATCH /api/users/me` | Get / update profile (name, about, username, avatar color) |
| `POST/DELETE /api/users/me/avatar` | Upload / remove profile photo |
| `GET /api/users/{id}` | Public profile |
| `GET/POST /api/contacts` · `DELETE /api/contacts/{user_id}` | List / add (by `phone` or `username`) / remove contacts |
| `GET /api/conversations` | Chat list with members, unread counts and last message, newest first |
| `POST /api/conversations/direct` | Get or create a 1:1 chat `{user_id}` |
| `POST /api/conversations/group` | Create a group `{title, member_ids}` |
| `GET/PATCH /api/conversations/{id}` | Details / update title, description, disappearing timer |
| `POST /api/conversations/{id}/avatar` | Group photo (admin) |
| `POST /api/conversations/{id}/members` | Add members (admin) |
| `PATCH /api/conversations/{id}/members/{uid}` | Make or revoke admin (admin) |
| `DELETE /api/conversations/{id}/members/{uid}` | Remove a member (admin) or leave (self) |
| `POST /api/conversations/{id}/read` | Mark read up to a message |
| `GET /api/conversations/{id}/messages?before_id=&limit=` | Keyset-paginated history |
| `POST /api/conversations/{id}/messages` | Send `{client_id, body, reply_to_id?, attachment_id?}` (idempotent) |
| `GET /api/messages/{id}/info` | Per-recipient delivered/read times (sender only) |
| `PUT/DELETE /api/messages/{id}/reaction` | Set / remove your reaction |
| `POST /api/attachments` | Upload a file (multipart) → attachment id |
| `GET /api/search?q=` | Matching chats, contacts and messages |
| `WS /ws?token=` | Real-time channel (below) |

**WebSocket events.** Server → client frames are `{type, data}`:

- `hello`
- `presence`
- `typing`
- `message.created`
- `message.status`
- `message.reactions`
- `message.deleted`
- `conversation.created` | `updated` | `removed` | `read`
- `user.updated`

Client → server: `ping`, `typing {conversation_id, is_typing}`, `delivered {message_ids}`.

---

## Deployment

**Backend on Render.** Use the included `render.yaml` blueprint (root dir `backend/`), and set
`CORS_ORIGINS` to the frontend URL.

**Frontend on Vercel.** Import the repo with root directory `frontend/` and set
`NEXT_PUBLIC_API_URL` to the backend URL (e.g. `https://signal-clone-api.onrender.com`).

> On Render's free tier the filesystem is ephemeral, so the SQLite file and uploads reset on
> redeploy or restart. The app re-seeds itself on startup, so the demo is always usable. For
> durable storage, attach a persistent disk and point `DATABASE_URL` / `MEDIA_DIR` at it.

---

## Assumptions and simplifications

- **Verification is mocked.** There is no SMS; the code is always `123456`, and the API returns it (`mock_code`) to make that explicit.
- **Encryption is simulated.**
  - Messages are stored in plaintext.
  - The "end-to-end encrypted" notice and the safety number are UI only; the number is a SHA-512 of both phone numbers.
  - No real key exchange happens.
- **Presence is a mock.** It is derived from open sockets (real Signal doesn't expose online status).
- **Disappearing timers start when a message is sent** (Signal starts the recipient's timer when they read it). The setting applies to new messages only.
- **Read receipts and typing indicators are always on**; the Privacy toggles are placeholders.
- **Removed members lose access.** A removed group member loses access to the group's history, and their outstanding receipts are dropped so senders' ticks don't get stuck.
- **Attachment URLs are unguessable capability URLs** (random 128-bit key), so `<img>` tags work without auth headers.
- **Single process.** Real-time fan-out is in-process; horizontal scaling would need a shared pub/sub (see Architecture).
- **Keyboard shortcuts** follow Signal Desktop where the browser allows. Ctrl+N is reserved by browsers, so new chat is `Ctrl+Alt+N`.
- **Profile names** are stored as one `display_name`; the UI collects first and last name like Signal.
