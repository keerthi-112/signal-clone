"use client";

import { FileText, Mic, Paperclip, SendHorizontal, Smile, X } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, forwardRef } from "react";
import { formatBytes } from "@/lib/format";
import type { Conversation, Message } from "@/lib/types";
import { sendTyping } from "@/hooks/useRealtime";
import { useChat } from "@/store/chat";
import { usePrefs } from "@/store/prefs";
import { useUI } from "@/store/ui";
import { IconButton } from "../ui/Controls";
import { toast } from "../ui/Toast";
import { EmojiPicker } from "./EmojiPicker";
import { Quote } from "./Quote";

const MAX_FILE_MB = 25;
const TYPING_IDLE_MS = 3000;
// Drafts survive switching between chats (Signal keeps per-chat drafts).
const drafts = new Map<number, string>();

export interface ComposerHandle {
  stageFile: (file: File) => void;
  focus: () => void;
}

export const Composer = forwardRef<ComposerHandle, { conversation: Conversation; replyTo: Message | null }>(
  function Composer({ conversation, replyTo }, ref) {
    const send = useChat((s) => s.send);
    const setReplyTo = useChat((s) => s.setReplyTo);
    const enterToSend = usePrefs((s) => s.prefs.enterToSend);
    const attachTick = useUI((s) => s.attachTick);

    const [text, setText] = useState(() => drafts.get(conversation.id) ?? "");
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const typingRef = useRef<{ active: boolean; timer: ReturnType<typeof setTimeout> | null }>({ active: false, timer: null });

    const stopTyping = useCallback(() => {
      const t = typingRef.current;
      if (t.timer) clearTimeout(t.timer);
      t.timer = null;
      if (t.active) sendTyping(conversation.id, false);
      t.active = false;
    }, [conversation.id]);

    useEffect(() => stopTyping, [stopTyping]);
    useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

    const stageFile = useCallback((f: File) => {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast(`Files must be smaller than ${MAX_FILE_MB} MB`);
        return;
      }
      setFile(f);
      setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
      inputRef.current?.focus();
    }, []);

    useImperativeHandle(ref, () => ({ stageFile, focus: () => inputRef.current?.focus() }), [stageFile]);

    // Ctrl+U: only react to presses made while this composer is mounted.
    const seenAttachTick = useRef(attachTick);
    useEffect(() => {
      if (attachTick === seenAttachTick.current) return;
      seenAttachTick.current = attachTick;
      fileRef.current?.click();
    }, [attachTick]);

    useEffect(() => {
      if (replyTo) inputRef.current?.focus();
    }, [replyTo]);

    // Auto-grow the textarea up to ~6 lines.
    useLayoutEffect(() => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }, [text]);

    const onChange = (value: string) => {
      setText(value);
      drafts.set(conversation.id, value);
      const t = typingRef.current;
      if (!value.trim()) {
        stopTyping();
        return;
      }
      if (!t.active) {
        sendTyping(conversation.id, true);
        t.active = true;
      }
      if (t.timer) clearTimeout(t.timer);
      t.timer = setTimeout(stopTyping, TYPING_IDLE_MS);
    };

    const submit = async () => {
      const body = text.trim();
      if (!body && !file) return;
      const staged = file;
      setText("");
      drafts.delete(conversation.id);
      setFile(null);
      setPreview(null);
      stopTyping();
      const error = await send(conversation.id, body, { replyTo, file: staged });
      if (error) toast(error);
    };

    const canSend = !!text.trim() || !!file;

    return (
      <div className="shrink-0 px-4 pb-4 pt-1">
        {(replyTo || file) && (
          <div className="mb-2 flex flex-col gap-2">
            {replyTo && (
              <Quote
                quote={{ id: replyTo.id, sender_id: replyTo.sender_id, body: replyTo.body, attachment: replyTo.attachment }}
                variant="composer"
                onDismiss={() => setReplyTo(conversation.id, null)}
              />
            )}
            {file && (
              <div className="relative self-start">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview
                  <img src={preview} alt={file.name} className="h-24 w-24 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-14 items-center gap-2 rounded-lg bg-input pl-3 pr-9 text-[13px]">
                    <FileText size={22} className="text-secondary" />
                    <div className="min-w-0">
                      <div className="max-w-[220px] truncate font-medium">{file.name}</div>
                      <div className="text-[12px] text-secondary">{formatBytes(file.size)}</div>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  aria-label="Remove attachment"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-1">
          <div className="flex min-h-9 flex-1 items-end rounded-[18px] bg-input">
            <IconButton label="Emoji" size={36} onClick={(e) => setEmojiAnchor(e.currentTarget)}>
              <Smile size={20} />
            </IconButton>
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              autoFocus
              placeholder="Message"
              aria-label="Message"
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && (enterToSend ? !e.shiftKey : e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              onPaste={(e) => {
                const pasted = Array.from(e.clipboardData.files)[0];
                if (pasted) {
                  e.preventDefault();
                  stageFile(pasted);
                }
              }}
              className="max-h-[140px] min-h-9 flex-1 resize-none bg-transparent focus-visible:outline-none py-2 pr-3 text-[14px] leading-5 outline-none placeholder:text-tertiary"
            />
          </div>
          <IconButton label="Attach file" size={36} onClick={() => fileRef.current?.click()}>
            <Paperclip size={20} />
          </IconButton>
          {canSend ? (
            <button
              onClick={() => void submit()}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-dark"
            >
              <SendHorizontal size={18} />
            </button>
          ) : (
            <IconButton label="Voice message" size={36} onClick={() => toast("Voice messages are coming soon")}>
              <Mic size={20} />
            </IconButton>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) stageFile(f);
            e.target.value = "";
          }}
        />
        {emojiAnchor && (
          <EmojiPicker
            anchor={emojiAnchor}
            onPick={(emoji) => {
              const el = inputRef.current;
              const start = el?.selectionStart ?? text.length;
              const end = el?.selectionEnd ?? text.length;
              onChange(text.slice(0, start) + emoji + text.slice(end));
              requestAnimationFrame(() => {
                el?.focus();
                el?.setSelectionRange(start + emoji.length, start + emoji.length);
              });
            }}
            onClose={() => setEmojiAnchor(null)}
          />
        )}
      </div>
    );
  },
);
