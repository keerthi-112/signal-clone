import { Users } from "lucide-react";
import { mediaUrl } from "@/lib/api";
import { avatarColors, initials } from "@/lib/avatar";

interface AvatarProps {
  name: string;
  color: string;
  url?: string | null;
  size?: number;
  isGroup?: boolean;
  online?: boolean;
  className?: string;
}

/** Signal avatar: photo, or initials on the user's pastel color. Groups fall back to a people glyph. */
export function Avatar({ name, color, url, size = 36, isGroup, online, className = "" }: AvatarProps) {
  const { bg, fg } = avatarColors(color);
  const src = mediaUrl(url);
  const text = initials(name);
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user uploads from the API origin
        <img src={src} alt="" className="h-full w-full rounded-full object-cover" draggable={false} />
      ) : (
        <div
          className="flex h-full w-full select-none items-center justify-center rounded-full font-medium"
          style={{ background: bg, color: fg, fontSize: Math.round(size * 0.4) }}
          aria-hidden
        >
          {isGroup || !text ? <Users style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={1.8} /> : text}
        </div>
      )}
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-sidebar bg-[#4caf50]"
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }}
          aria-label="Online"
        />
      )}
    </div>
  );
}
