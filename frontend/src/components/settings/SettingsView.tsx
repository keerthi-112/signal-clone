"use client";

import { ArrowLeft, Bell, Camera, ChevronRight, Keyboard, Laptop, Lock, LogOut, MessageSquare, Palette, UserRound } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { Me } from "@/lib/types";
import { AVATAR_COLORS } from "@/lib/avatar";
import { formatPhone } from "@/lib/format";
import type { ThemePref } from "@/lib/prefs";
import { useAuth } from "@/store/auth";
import { usePrefs } from "@/store/prefs";
import { useUI } from "@/store/ui";
import { Avatar } from "../ui/Avatar";
import { IconButton, Toggle } from "../ui/Controls";
import { Button, ConfirmDialog } from "../ui/Modal";
import { toast } from "../ui/Toast";

type Section = "profile" | "appearance" | "chats" | "notifications" | "privacy" | "devices";

const SECTIONS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: "profile", label: "Profile", icon: <UserRound size={18} /> },
  { id: "appearance", label: "Appearance", icon: <Palette size={18} /> },
  { id: "chats", label: "Chats", icon: <MessageSquare size={18} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={18} /> },
  { id: "privacy", label: "Privacy", icon: <Lock size={18} /> },
  { id: "devices", label: "Linked devices", icon: <Laptop size={18} /> },
];

/** Full-window settings, mirroring Signal Desktop's preferences window. */
export function SettingsView() {
  const setSettingsOpen = useUI((s) => s.setSettingsOpen);
  const setShortcutsOpen = useUI((s) => s.setShortcutsOpen);
  const [section, setSection] = useState<Section>("profile");
  const [mobileShowContent, setMobileShowContent] = useState(false);

  return (
    <div className="flex h-full bg-app">
      <aside
        className={`${mobileShowContent ? "hidden md:flex" : "flex"} w-full flex-col border-r border-line bg-sidebar md:w-[280px]`}
      >
        <header className="flex h-[52px] shrink-0 items-center gap-2 px-2">
          <IconButton label="Close settings" onClick={() => setSettingsOpen(false)}>
            <ArrowLeft size={20} />
          </IconButton>
          <h1 className="text-[20px] font-semibold">Settings</h1>
        </header>
        <nav className="flex-1 overflow-y-auto px-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSection(s.id);
                setMobileShowContent(true);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] ${
                section === s.id ? "md:bg-selected" : ""
              } hover:bg-hover`}
            >
              <span className="text-icon">{s.icon}</span>
              <span className="flex-1">{s.label}</span>
              <ChevronRight size={16} className="text-tertiary md:hidden" />
            </button>
          ))}
          <button
            onClick={() => setShortcutsOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] hover:bg-hover"
          >
            <span className="text-icon">
              <Keyboard size={18} />
            </span>
            Keyboard shortcuts
          </button>
        </nav>
      </aside>
      <main className={`${mobileShowContent ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        <header className="flex h-[52px] shrink-0 items-center gap-2 px-2 md:px-8">
          <IconButton label="Back" className="md:hidden" onClick={() => setMobileShowContent(false)}>
            <ArrowLeft size={20} />
          </IconButton>
          <h2 className="text-[18px] font-semibold">{SECTIONS.find((s) => s.id === section)?.label}</h2>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 md:px-8">
          <div className="max-w-[560px]">
            {section === "profile" && <ProfileSettings />}
            {section === "appearance" && <AppearanceSettings />}
            {section === "chats" && <ChatSettings />}
            {section === "notifications" && <NotificationSettings />}
            {section === "privacy" && <PrivacySettings />}
            {section === "devices" && <ComingSoonBlock text="Link Signal on another computer or tablet. Coming soon." />}
          </div>
        </div>
      </main>
    </div>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="pt-4">
      {title && <h3 className="pb-2 text-[13px] font-semibold text-secondary">{title}</h3>}
      <div className="divide-y divide-[var(--border)] rounded-xl border border-line">{children}</div>
    </section>
  );
}

function SettingRow({ label, hint, control }: { label: string; hint?: ReactNode; control: ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[14px]">{label}</div>
        {hint && <div className="text-[12px] text-secondary">{hint}</div>}
      </div>
      {control}
    </div>
  );
}

function ComingSoonBlock({ text }: { text: string }) {
  return (
    <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <span className="rounded-full bg-chip px-3 py-1 text-[12px] font-semibold text-secondary">Coming soon</span>
      <p className="mt-3 text-[13px] text-secondary">{text}</p>
    </div>
  );
}

const field = "h-10 w-full rounded-lg bg-input px-3 text-[14px] outline-none focus:ring-2 focus:ring-[var(--focus-ring)]";

function ProfileSettings() {
  const me = useAuth((s) => s.me);
  return me ? <ProfileForm me={me} /> : null;
}

function ProfileForm({ me }: { me: Me }) {
  const { setMe, logout } = useAuth();
  const [initialFirst, ...initialRest] = me.display_name.split(" ");
  const [first, setFirst] = useState(initialFirst ?? "");
  const [last, setLast] = useState(initialRest.join(" "));
  const [about, setAbout] = useState(me.about);
  const [username, setUsername] = useState(me.username ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const name = `${first.trim()} ${last.trim()}`.trim();
  const dirty = name !== me.display_name || about !== me.about || username !== (me.username ?? "");

  const guard = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center pt-4">
        <div className="relative">
          <Avatar name={me.display_name} color={me.avatar_color} url={me.avatar_url} size={88} />
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="Change photo"
            className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--bg-app)] bg-chip text-icon"
          >
            <Camera size={15} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void guard(async () => setMe(await api.uploadAvatar(f)), "Couldn't upload photo");
            }}
          />
        </div>
        {me.avatar_url ? (
          <button className="mt-2 text-[13px] text-link hover:underline" onClick={() => guard(async () => setMe(await api.removeAvatar()), "Couldn't remove photo")}>
            Remove photo
          </button>
        ) : (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Avatar color">
            {Object.entries(AVATAR_COLORS).map(([key, c]) => (
              <button
                key={key}
                role="radio"
                aria-checked={me.avatar_color === key}
                aria-label={`Color ${key}`}
                onClick={() => guard(async () => setMe(await api.updateMe({ avatar_color: key })), "Couldn't update color")}
                className={`h-6 w-6 rounded-full ${me.avatar_color === key ? "ring-2 ring-accent ring-offset-2 ring-offset-[var(--bg-app)]" : ""}`}
                style={{ background: c.bg, border: `2px solid ${c.fg}` }}
              />
            ))}
          </div>
        )}
      </div>

      <form
        className="pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!first.trim()) return;
          void guard(async () => {
            setMe(await api.updateMe({ display_name: name, about, username }));
            toast("Profile updated");
          }, "Couldn't save profile");
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[13px] text-secondary">
            First name
            <input value={first} maxLength={32} onChange={(e) => setFirst(e.target.value)} className={`${field} mt-1 text-primary`} />
          </label>
          <label className="text-[13px] text-secondary">
            Last name
            <input value={last} maxLength={31} onChange={(e) => setLast(e.target.value)} className={`${field} mt-1 text-primary`} />
          </label>
        </div>
        <label className="mt-3 block text-[13px] text-secondary">
          About
          <input value={about} maxLength={140} placeholder="Write a few words about yourself" onChange={(e) => setAbout(e.target.value)} className={`${field} mt-1 text-primary`} />
        </label>
        <label className="mt-3 block text-[13px] text-secondary">
          Username
          <div className={`${field} mt-1 flex items-center gap-1 text-primary`}>
            <span className="text-tertiary">@</span>
            <input
              value={username}
              maxLength={32}
              placeholder="username"
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </div>
          <span className="mt-1 block text-[12px] text-tertiary">People can find and message you by username without seeing your number.</span>
        </label>
        <div className="mt-3 text-[13px] text-secondary">
          Phone number <span className="ml-1 text-primary">{formatPhone(me.phone)}</span>
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="submit" disabled={busy || !dirty || !first.trim()}>
            Save
          </Button>
        </div>
      </form>

      <Group>
        <button onClick={() => setConfirmLogout(true)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] text-danger hover:bg-hover">
          <LogOut size={18} /> Log out
        </button>
      </Group>
      {confirmLogout && (
        <ConfirmDialog
          title="Log out?"
          body="You'll need to verify your phone number again to log back in on this device."
          confirmLabel="Log out"
          danger
          onConfirm={async () => {
            useUI.getState().setSettingsOpen(false);
            await logout();
          }}
          onClose={() => setConfirmLogout(false)}
        />
      )}
    </>
  );
}

function AppearanceSettings() {
  const { prefs, update } = usePrefs();
  const options: { value: ThemePref; label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];
  return (
    <Group title="Theme">
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-3 px-4 py-3 text-[14px]">
          <input
            type="radio"
            name="theme"
            checked={prefs.theme === o.value}
            onChange={() => update({ theme: o.value })}
            className="h-4 w-4 accent-[var(--ultramarine)]"
          />
          {o.label}
        </label>
      ))}
    </Group>
  );
}

function ChatSettings() {
  const { prefs, update } = usePrefs();
  return (
    <Group>
      <SettingRow
        label="Send with Enter"
        hint={prefs.enterToSend ? "Shift+Enter adds a new line" : "Ctrl+Enter sends; Enter adds a new line"}
        control={<Toggle label="Send with Enter" checked={prefs.enterToSend} onChange={(v) => update({ enterToSend: v })} />}
      />
    </Group>
  );
}

function NotificationSettings() {
  const { prefs, update } = usePrefs();
  const supported = typeof Notification !== "undefined";
  const [permission, setPermission] = useState(supported ? Notification.permission : "denied");

  const enable = async (v: boolean) => {
    update({ notifications: v });
    if (v && supported && Notification.permission === "default") setPermission(await Notification.requestPermission());
  };

  return (
    <>
      <Group>
        <SettingRow
          label="Enable notifications"
          hint={
            !supported
              ? "This browser doesn't support notifications"
              : permission === "denied"
                ? "Notifications are blocked in your browser settings"
                : undefined
          }
          control={<Toggle label="Enable notifications" checked={prefs.notifications} onChange={enable} disabled={!supported} />}
        />
        <SettingRow
          label="Show name and message"
          hint="Otherwise notifications only say “New message”"
          control={
            <Toggle
              label="Show name and message"
              checked={prefs.notificationPreview}
              disabled={!prefs.notifications}
              onChange={(v) => update({ notificationPreview: v })}
            />
          }
        />
      </Group>
    </>
  );
}

function PrivacySettings() {
  const soon = <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-semibold text-secondary">Coming soon</span>;
  return (
    <>
      <Group title="Messaging">
        <SettingRow label="Read receipts" hint="If turned off, you won't be able to see read receipts from others." control={soon} />
        <SettingRow label="Typing indicators" hint="If turned off, you won't be able to see typing indicators from others." control={soon} />
      </Group>
      <Group title="Disappearing messages">
        <SettingRow label="Default timer for new chats" hint="Set per chat from the chat menu for now." control={soon} />
      </Group>
      <Group title="Blocked">
        <SettingRow label="Blocked contacts" control={soon} />
      </Group>
    </>
  );
}
