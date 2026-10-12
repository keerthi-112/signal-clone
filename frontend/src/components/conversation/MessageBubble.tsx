"use client";

import { Copy, Download, Info, MoreHorizontal, Plus, Reply, SmilePlus, Timer } from "lucide-react";
import { memo, useState } from "react";
import { avatarColors } from "@/lib/avatar";
import { useRelativeTimeRefresh } from "@/lib/clock";
import { formatBubbleTime, formatDetailTime, formatTimer } from "@/lib/format";
import { userName } from "@/lib/names";
import type { Conversation, Message } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { Avatar } from "../ui/Avatar";
import { Menu, type MenuItem } from "../ui/Menu";
import { StatusIcon } from "../ui/StatusIcon";
import { toast } from "../ui/Toast";
import { attachmentHref, FileAttachment, ImageAttachment, isImage, Lightbox } from "./AttachmentView";
import { DEFAULT_REACTIONS, EmojiPicker } from "./EmojiPicker";
import { FloatingBar } from "./FloatingBar";
import { jumboEmojiCount, MessageBody } from "./MessageBody";
import { Quote } from "./Quote";
import { ReactionsBar } from "./Reactions";

export interface BubbleProps {
  message: Message;
  conversation: Conversation;
  firstInGroup: boolean;
  lastInGroup: boolean;
  showMeta: boolean;
  highlighted: boolean;
  onReply: (m: Message) => void;
  onJumpTo: (messageId: number) => void;
  onInfo: (m: Message) => void;
}

const RADIUS = 18;
const TIGHT = 4;

export const MessageBubble = memo(function MessageBubble({
  message: m,
  conversation,
  firstInGroup,
  lastInGroup,
  showMeta,
  highlighted,
  onReply,
  onJumpTo,
  onInfo,
}: BubbleProps) {
  const meId = useAuth((s) => s.me?.id);
  const sender = useChat((s) => (m.sender_id != null ? s.users[m.sender_id] : undefined));
  const users = useChat((s) => s.users);
  const react = useChat((s) => s.react);
  const retry = useChat((s) => s.retry);

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [reactAnchor, setReactAnchor] = useState<HTMLElement | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const [lightbox, setLightbox] = useState(false);

  const own = m.sender_id === meId;
  // Keeps "Now" / "5m" current while the chat is open.
  useRelativeTimeRefresh(m.created_at);
  const isGroup = conversation.kind === "group";
  const pending = m.id < 0;
  const failed = m.status === "failed";
  const att = m.attachment;
  const imageOnly = !!att && isImage(att) && !m.body && !m.reply_to;
  const jumbo = !att && !m.reply_to ? jumboEmojiCount(m.body) : 0;
  const senderColor = avatarColors(sender?.avatar_color).fg;
  const myReaction = m.reactions.find((r) => r.user_id === meId)?.emoji;

  // Signal tightens the corners on the "inside" of a run of consecutive bubbles.
  const r = (tight: boolean) => (tight ? TIGHT : RADIUS);
  const radius = own
    ? `${RADIUS}px ${r(!firstInGroup)}px ${r(!lastInGroup)}px ${RADIUS}px`
    : `${r(!firstInGroup)}px ${RADIUS}px ${RADIUS}px ${r(!lastInGroup)}px`;

  const doReact = (emoji: string) => {
    react(m, emoji).catch(() => toast("Couldn't send reaction"));
  };

  const menuItems: MenuItem[] = [
    { label: "Reply", icon: <Reply size={15} />, onSelect: () => onReply(m), disabled: pending },
    ...(m.body
      ? [
          {
            label: "Copy text",
            icon: <Copy size={15} />,
            onSelect: () => {
              navigator.clipboard?.writeText(m.body).then(
                () => toast("Copied to clipboard"),
                () => toast("Couldn't copy"),
              );
            },
          },
        ]
      : []),
    ...(att && !pending
      ? [
          {
            label: "Download",
            icon: <Download size={15} />,
            onSelect: () => {
              const a = document.createElement("a");
              a.href = attachmentHref(att);
              a.download = att.file_name;
              a.click();
            },
          },
        ]
      : []),
    { label: "Info", icon: <Info size={15} />, onSelect: () => onInfo(m), disabled: pending },
  ];

  const metaColor = own && !jumbo ? "text-white/80" : "text-secondary";
  const meta = (
    <span
      className={`ml-2 inline-flex translate-y-[3px] select-none items-center gap-1 whitespace-nowrap align-bottom text-[11px] leading-4 ${
        imageOnly ? "text-white" : metaColor
      }`}
      title={formatDetailTime(m.created_at)}
    >
      {m.expires_at && <Timer size={11} aria-label={`Disappears after ${formatTimer(conversation.disappearing_seconds || 0)}`} />}
      {formatBubbleTime(m.created_at)}
      {own && m.status && m.status !== "failed" && (
        <StatusIcon status={m.status} className={imageOnly ? "text-white" : metaColor} />
      )}
    </span>
  );

  const showAvatar = isGroup && !own;

  return (
    <div
      id={`message-${m.id}`}
      className={`group flex px-4 ${own ? "justify-end" : "justify-start"} ${firstInGroup ? "mt-2" : "mt-0.5"} ${
        highlighted ? "animate-highlight rounded-lg" : ""
      } ${m.reactions.length ? "mb-3" : ""}`}
    >
      {showAvatar && (
        <div className="mr-2 w-7 shrink-0 self-end">
          {lastInGroup && sender && (
            <Avatar name={sender.display_name} color={sender.avatar_color} url={sender.avatar_url} size={28} />
          )}
        </div>
      )}

      <div className={`flex min-w-0 max-w-[min(78%,520px)] items-center gap-1 ${own ? "flex-row-reverse" : ""}`}>
        <div className="relative min-w-0">
          <div
            className={`relative ${
              // Jumbo emoji have no bubble, so nothing should be clipped to its rounded corners.
              jumbo ? "pb-1" : own ? "overflow-hidden bg-bubble-out text-bubble-out-text [--check-cutout:var(--ultramarine)]" : "overflow-hidden bg-bubble-in text-bubble-in-text"
            } ${failed ? "opacity-70" : ""}`}
            style={jumbo ? undefined : { borderRadius: radius }}
          >
            {isGroup && !own && firstInGroup && !jumbo && (
              <div
                className={`truncate text-[13px] font-semibold ${imageOnly ? "absolute left-3 top-1.5 z-10 text-white drop-shadow" : "px-3 pt-1.5"}`}
                style={imageOnly ? undefined : { color: senderColor }}
              >
                {userName(users, meId, m.sender_id)}
              </div>
            )}

            {m.reply_to && (
              <div className="px-1.5 pt-1.5">
                <Quote quote={m.reply_to} variant={own ? "out" : "in"} onClick={() => onJumpTo(m.reply_to!.id)} />
              </div>
            )}

            {att && isImage(att) && (
              <div className={m.reply_to ? "pt-1.5" : ""}>
                <ImageAttachment attachment={att} onOpen={() => !pending && setLightbox(true)} />
              </div>
            )}
            {att && !isImage(att) && (
              <div className="px-3 pt-1.5">
                <FileAttachment attachment={att} outgoing={own} />
              </div>
            )}

            {imageOnly ? (
              <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/50 to-transparent px-2.5 pb-1.5 pt-6">
                {meta}
              </div>
            ) : jumbo ? (
              <div className="text-right">
                <div style={{ fontSize: jumbo === 1 ? 48 : 36, lineHeight: 1.2 }}>{m.body}</div>
                {showMeta && meta}
              </div>
            ) : (
              (m.body || showMeta) && (
                <div className="px-3 pb-[7px] pt-[7px] text-[14px] leading-5">
                  {m.body && <MessageBody text={m.body} linkClass={own ? "text-white" : "text-link"} />}
                  {showMeta && meta}
                </div>
              )
            )}
          </div>

          {m.reactions.length > 0 && (
            <ReactionsBar reactions={m.reactions} own={own} meId={meId} onToggle={doReact} />
          )}
        </div>

        {/* Hover actions, like Signal Desktop: react, reply, more. */}
        {!pending && (
          <div
            className={`flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 ${
              menuAnchor || reactAnchor || pickerAnchor ? "opacity-100" : ""
            }`}
          >
            <HoverButton label="React" onClick={(el) => setReactAnchor(el)}>
              <SmilePlus size={16} />
            </HoverButton>
            <HoverButton label="Reply" onClick={() => onReply(m)}>
              <Reply size={16} />
            </HoverButton>
            <HoverButton label="More actions" onClick={(el) => setMenuAnchor(el)}>
              <MoreHorizontal size={16} />
            </HoverButton>
          </div>
        )}
      </div>

      {failed && own && (
        <button
          onClick={() => retry(m.client_id!).then((err) => err && toast(err))}
          className="ml-2 flex shrink-0 items-center gap-1 self-end text-[12px] text-danger hover:underline"
        >
          <StatusIcon status="failed" />
          Not sent. Click to retry
        </button>
      )}

      {menuAnchor && <Menu anchor={menuAnchor} items={menuItems} onClose={() => setMenuAnchor(null)} align={own ? "end" : "start"} />}
      {reactAnchor && (
        <ReactionPicker
          anchor={reactAnchor}
          current={myReaction}
          onPick={(e) => {
            setReactAnchor(null);
            doReact(e);
          }}
          onMore={(el) => {
            setReactAnchor(null);
            setPickerAnchor(el);
          }}
          onClose={() => setReactAnchor(null)}
        />
      )}
      {pickerAnchor && (
        <EmojiPicker
          anchor={pickerAnchor}
          onPick={(e) => {
            setPickerAnchor(null);
            doReact(e);
          }}
          onClose={() => setPickerAnchor(null)}
        />
      )}
      {lightbox && att && <Lightbox attachment={att} onClose={() => setLightbox(false)} />}
    </div>
  );
});

function HoverButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (el: HTMLElement) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={(e) => onClick(e.currentTarget)}
      className="flex h-7 w-7 items-center justify-center rounded-full text-icon hover:bg-hover"
    >
      {children}
    </button>
  );
}

/** Quick reactions bar (Signal's six defaults + "more"). */
function ReactionPicker({
  anchor,
  current,
  onPick,
  onMore,
  onClose,
}: {
  anchor: HTMLElement;
  current?: string;
  onPick: (emoji: string) => void;
  onMore: (el: HTMLElement) => void;
  onClose: () => void;
}) {
  const options = current && !DEFAULT_REACTIONS.includes(current) ? [...DEFAULT_REACTIONS.slice(0, 5), current] : DEFAULT_REACTIONS;
  return (
    <FloatingBar anchor={anchor} onClose={onClose}>
      {options.map((e) => (
        <button
          key={e}
          onClick={() => onPick(e)}
          aria-label={`React with ${e}`}
          className={`flex h-9 w-9 items-center justify-center rounded-full text-[22px] transition-transform hover:scale-125 ${
            current === e ? "bg-selected" : ""
          }`}
        >
          {e}
        </button>
      ))}
      <button
        onClick={(ev) => onMore(ev.currentTarget)}
        aria-label="More reactions"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-chip text-icon hover:bg-selected"
      >
        <Plus size={18} />
      </button>
    </FloatingBar>
  );
}
