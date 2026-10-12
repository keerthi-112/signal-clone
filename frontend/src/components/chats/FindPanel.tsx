"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useChat } from "@/store/chat";
import { useUI } from "@/store/ui";
import { Button, Modal } from "../ui/Modal";
import { PaneHeader } from "./PaneHeader";
import { useOpenDirect } from "./useOpenDirect";

/** "Find by phone number" / "Find by username": look up a Signal user, save as contact, open chat. */
export function FindPanel({ mode }: { mode: "phone" | "username" }) {
  const setPane = useUI((s) => s.setPane);
  const openDirect = useOpenDirect();
  const [country, setCountry] = useState("+1");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    try {
      const user = await api.addContact(
        mode === "phone" ? { phone: `${country}${value}` } : { username: value.trim() },
      );
      useChat.getState().addContact(user);
      await openDirect(user.id);
    } catch (err) {
      setNotFound(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const field = "h-9 rounded-lg bg-input px-3 text-[14px] outline-none focus:ring-2 focus:ring-[var(--focus-ring)]";

  return (
    <>
      <PaneHeader title={mode === "phone" ? "Find by phone number" : "Find by username"} onBack={() => setPane("compose")} />
      <form onSubmit={submit} className="flex flex-col gap-3 px-4 pt-2">
        {mode === "phone" ? (
          <div className="flex gap-2">
            <input
              aria-label="Country code"
              value={country}
              onChange={(e) => setCountry("+" + e.target.value.replace(/\D/g, "").slice(0, 4))}
              className={`${field} w-16 text-center`}
            />
            <input
              autoFocus
              inputMode="tel"
              placeholder="Phone number"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d\s()-]/g, ""))}
              className={`${field} min-w-0 flex-1`}
            />
          </div>
        ) : (
          <div className={`${field} flex items-center gap-1`}>
            <span className="text-tertiary">@</span>
            <input
              autoFocus
              placeholder="Username"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/\s/g, "").toLowerCase())}
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </div>
        )}
        <p className="text-[12px] text-secondary">
          {mode === "phone"
            ? "Enter the phone number of someone on Signal to start a chat."
            : "Enter a username to find someone on Signal. Try @priya or @jordan_lee."}
        </p>
        <Button type="submit" disabled={busy || !value.trim()} className="self-end">
          {busy ? "Finding…" : "Next"}
        </Button>
      </form>
      {notFound && (
        <Modal
          onClose={() => setNotFound(null)}
          hideClose
          width={340}
          footer={<Button data-autofocus onClick={() => setNotFound(null)}>OK</Button>}
        >
          <p className="pt-5 text-[14px]">{notFound}</p>
        </Modal>
      )}
    </>
  );
}
