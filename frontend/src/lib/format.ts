// Time formatting following Signal's conventions.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const longWeekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const monthDayFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const fullDateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const longDateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const detailFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** Conversation list: "Now", "5m", "10:42 AM", "Mon", "Mar 3", "Mar 3, 2024". */
export function formatListTime(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const diff = now - d.getTime();
  if (diff < MINUTE) return "Now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (startOfDay(d) === startOfDay(new Date(now))) return timeFmt.format(d);
  if (diff < 6 * DAY) return weekdayFmt.format(d);
  if (d.getFullYear() === new Date(now).getFullYear()) return monthDayFmt.format(d);
  return fullDateFmt.format(d);
}

/** Message bubble metadata: "Now", "5m", otherwise the clock time. */
export function formatBubbleTime(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const diff = now - d.getTime();
  if (diff < MINUTE) return "Now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  return timeFmt.format(d);
}

/** Date separator in the timeline: "Today", "Yesterday", "Monday", "Tue, Mar 3". */
export function formatDayHeader(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(d)) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return longWeekdayFmt.format(d);
  if (d.getFullYear() === new Date(now).getFullYear()) return longDateFmt.format(d);
  return fullDateFmt.format(d);
}

export function formatDetailTime(iso: string): string {
  return detailFmt.format(new Date(iso));
}

export function formatLastSeen(iso: string | null, now = Date.now()): string {
  if (!iso) return "Last seen recently";
  const d = new Date(iso);
  const diff = now - d.getTime();
  if (diff < MINUTE) return "Last seen just now";
  if (diff < HOUR) return `Last seen ${Math.floor(diff / MINUTE)}m ago`;
  if (startOfDay(d) === startOfDay(new Date(now))) return `Last seen today at ${timeFmt.format(d)}`;
  if (diff < 2 * DAY) return `Last seen yesterday at ${timeFmt.format(d)}`;
  return `Last seen ${monthDayFmt.format(d)}`;
}

/** Disappearing message timer labels, e.g. "1 hour", "1 week". */
export const TIMER_OPTIONS: { seconds: number; label: string }[] = [
  { seconds: 0, label: "Off" },
  { seconds: 30, label: "30 seconds" },
  { seconds: 5 * 60, label: "5 minutes" },
  { seconds: 60 * 60, label: "1 hour" },
  { seconds: 8 * 60 * 60, label: "8 hours" },
  { seconds: 24 * 60 * 60, label: "1 day" },
  { seconds: 7 * 24 * 60 * 60, label: "1 week" },
  { seconds: 28 * 24 * 60 * 60, label: "4 weeks" },
];

export function formatTimer(seconds: number): string {
  const known = TIMER_OPTIONS.find((o) => o.seconds === seconds);
  if (known) return known.label;
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86400)} days`;
}

/** Compact timer used inside bubbles ("1h", "5m"). */
export function formatTimerShort(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 7 * 86400) return `${Math.round(seconds / 86400)}d`;
  return `${Math.round(seconds / (7 * 86400))}w`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPhone(phone: string): string {
  const m = phone.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+1 ${m[1]}-${m[2]}-${m[3]}`;
  return phone;
}
