import type { ReactNode } from "react";
import { formatPhone } from "@/lib/format";
import type { User } from "@/lib/types";
import { Avatar } from "../ui/Avatar";

export function ContactRow({
  user,
  subtitle,
  trailing,
  onClick,
  online,
}: {
  user: User;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  online?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-2 flex w-[calc(100%-16px)] items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-hover"
    >
      <Avatar name={user.display_name} color={user.avatar_color} url={user.avatar_url} size={36} online={online} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{user.display_name || formatPhone(user.phone)}</div>
        <div className="truncate text-[12px] text-secondary">
          {subtitle ?? (user.about || (user.username ? `@${user.username}` : formatPhone(user.phone)))}
        </div>
      </div>
      {trailing}
    </button>
  );
}

/** A full-width action row with a round icon (e.g. "New group", "Find by phone number"). */
export function ActionRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-2 flex w-[calc(100%-16px)] items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-hover"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chip text-primary">{icon}</span>
      <span className="text-[14px] font-medium">{label}</span>
    </button>
  );
}
