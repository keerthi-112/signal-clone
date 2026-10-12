"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatDetailTime, TIMER_OPTIONS } from "@/lib/format";
import { conversationPeer, userName } from "@/lib/names";
import type { Conversation, Message, MessageInfo } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";
import { Spinner, Toggle } from "../ui/Controls";
import { Button, Modal } from "../ui/Modal";
import { toast } from "../ui/Toast";

export function DisappearingModal({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const [value, setValue] = useState(conversation.disappearing_seconds);
  const [busy, setBusy] = useState(false);
  const canEdit = conversation.kind === "direct" || conversation.my_role === "admin";

  const save = async () => {
    setBusy(true);
    try {
      useChat.getState().upsertConversation(await api.updateConversation(conversation.id, { disappearing_seconds: value }));
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't update timer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Disappearing messages"
      onClose={onClose}
      width={380}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !canEdit || value === conversation.disappearing_seconds}>
            Save
          </Button>
        </>
      }
    >
      <p className="pb-3 text-[13px] text-secondary">
        When enabled, new messages sent and received in this chat will disappear once the selected time has passed
        since they were sent.
        {!canEdit && " Only admins can change this setting."}
      </p>
      <div role="radiogroup" aria-label="Timer">
        {TIMER_OPTIONS.map((o) => (
          <label key={o.seconds} className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-2 hover:bg-hover">
            <input
              type="radio"
              name="timer"
              checked={value === o.seconds}
              disabled={!canEdit}
              onChange={() => setValue(o.seconds)}
              className="h-4 w-4 accent-[var(--ultramarine)]"
            />
            <span className="text-[14px]">{o.label}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

/** Deterministic 60-digit "safety number" for the pair (simulated — no real key exchange). */
async function safetyNumber(a: string, b: string): Promise<string[]> {
  const [lo, hi] = [a, b].sort();
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-512", new TextEncoder().encode(`${lo}|${hi}|signal-clone`)));
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const n = ((bytes[i * 5] << 24) | (bytes[i * 5 + 1] << 16) | (bytes[i * 5 + 2] << 8) | bytes[i * 5 + 3]) >>> 0;
    groups.push(String(n % 100000).padStart(5, "0"));
  }
  return groups;
}

/** Pseudo-random 21x21 grid with QR-style finder squares, seeded so it is stable per chat. */
function qrCells(seed: string): boolean[] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const cells: boolean[] = [];
  for (let i = 0; i < 21 * 21; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const x = i % 21;
    const y = Math.floor(i / 21);
    const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    if (finder) {
      const fx = x > 13 ? x - 14 : x;
      const fy = y > 13 ? y - 14 : y;
      cells.push(fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx > 1 && fx < 5 && fy > 1 && fy < 5));
    } else {
      cells.push((h >> 16) % 2 === 0);
    }
  }
  return cells;
}

function QrPattern({ seed }: { seed: string }) {
  // Visual stand-in for Signal's scannable code.
  const cells = useMemo(() => qrCells(seed), [seed]);
  return (
    <svg viewBox="0 0 21 21" width={150} height={150} className="rounded-md bg-white p-2" shapeRendering="crispEdges">
      {cells.map((on, i) => on && <rect key={i} x={i % 21} y={Math.floor(i / 21)} width={1} height={1} fill="#1b1b1b" />)}
    </svg>
  );
}

export function SafetyNumberModal({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const me = useAuth((s) => s.me);
  const users = useChat((s) => s.users);
  const peer = conversationPeer(conversation, me?.id);
  const [groups, setGroups] = useState<string[] | null>(null);
  const storageKey = `signal.verified.${conversation.id}`;
  const [verified, setVerified] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (me && peer) void safetyNumber(me.phone, peer.phone).then(setGroups);
  }, [me, peer]);

  if (!peer) return null;
  const name = userName(users, me?.id, peer.id);

  return (
    <Modal title="Safety number" onClose={onClose} width={420}>
      <div className="flex flex-col items-center">
        {groups ? (
          <>
            <QrPattern seed={groups.join("")} />
            <div className="mt-4 grid grid-cols-4 gap-x-4 gap-y-1 font-mono text-[15px] tracking-wider">
              {groups.map((g, i) => (
                <span key={i}>{g}</span>
              ))}
            </div>
          </>
        ) : (
          <Spinner />
        )}
        <p className="mt-4 text-center text-[13px] text-secondary">
          If you wish to verify the security of your end-to-end encryption with {name}, compare the numbers above with their
          device.
        </p>
        <label className="mt-4 flex items-center gap-3 text-[14px]">
          <Toggle
            label="Mark as verified"
            checked={verified}
            onChange={(v) => {
              setVerified(v);
              try {
                localStorage.setItem(storageKey, v ? "1" : "0");
              } catch {
                /* ignore */
              }
              toast(v ? `${name} marked as verified` : `${name} marked as unverified`);
            }}
          />
          Mark as verified
        </label>
        <p className="mt-4 text-center text-[11px] text-tertiary">
          Encryption is simulated in this demo; this number is derived from both phone numbers.
        </p>
      </div>
    </Modal>
  );
}

export function MessageInfoModal({ message, conversation, onClose }: { message: Message; conversation: Conversation; onClose: () => void }) {
  const meId = useAuth((s) => s.me?.id);
  const users = useChat((s) => s.users);
  const own = message.sender_id === meId;
  const [info, setInfo] = useState<MessageInfo | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!own) return;
    api.messageInfo(message.id).then(setInfo, () => setError(true));
  }, [own, message.id]);

  const groups = info
    ? [
        { label: "Read", list: info.recipients.filter((r) => r.read_at), time: (r: (typeof info.recipients)[0]) => r.read_at },
        {
          label: "Delivered",
          list: info.recipients.filter((r) => r.delivered_at && !r.read_at),
          time: (r: (typeof info.recipients)[0]) => r.delivered_at,
        },
        { label: "Sent", list: info.recipients.filter((r) => !r.delivered_at), time: () => null },
      ].filter((g) => g.list.length)
    : [];

  return (
    <Modal title="Message details" onClose={onClose} width={400}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        <dt className="text-secondary">{own ? "Sent" : "Received"}</dt>
        <dd>{formatDetailTime(message.created_at)}</dd>
        {!own && (
          <>
            <dt className="text-secondary">From</dt>
            <dd>{userName(users, meId, message.sender_id)}</dd>
          </>
        )}
        {conversation.kind === "group" && (
          <>
            <dt className="text-secondary">Group</dt>
            <dd>{conversation.title}</dd>
          </>
        )}
      </dl>
      {own && !info && !error && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}
      {error && <p className="pt-4 text-[13px] text-danger">Couldn&apos;t load delivery details.</p>}
      {groups.map((g) => (
        <section key={g.label} className="pt-4">
          <h3 className="pb-1 text-[13px] font-semibold">{g.label}</h3>
          {g.list.map((r) => {
            const u = users[r.user_id];
            const t = g.time(r);
            return (
              <div key={r.user_id} className="flex items-center gap-3 py-1.5">
                {u && <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size={28} />}
                <span className="min-w-0 flex-1 truncate text-[14px]">{userName(users, meId, r.user_id)}</span>
                {t && <span className="text-[12px] text-secondary">{formatDetailTime(t)}</span>}
              </div>
            );
          })}
        </section>
      ))}
    </Modal>
  );
}
