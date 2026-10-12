import { CircleDashed, Phone } from "lucide-react";

const COPY = {
  calls: {
    title: "Calls",
    icon: Phone,
    heading: "Voice and video calls",
    body: "Private, end-to-end encrypted calls are coming soon.",
  },
  stories: {
    title: "Stories",
    icon: CircleDashed,
    heading: "Stories",
    body: "Share moments that disappear after 24 hours. Coming soon.",
  },
} as const;

/** Left-pane placeholder for the Calls / Stories tabs. */
export function ComingSoonPanel({ kind }: { kind: keyof typeof COPY }) {
  const c = COPY[kind];
  return (
    <>
      <header className="flex h-[52px] shrink-0 items-center px-4">
        <h1 className="text-[20px] font-semibold">{c.title}</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <c.icon size={40} strokeWidth={1.4} className="text-tertiary" />
        <p className="mt-3 text-[14px] font-semibold">Coming soon</p>
        <p className="mt-1 text-[13px] text-secondary">{c.body}</p>
      </div>
    </>
  );
}

export function ComingSoonPane({ kind }: { kind: keyof typeof COPY }) {
  const c = COPY[kind];
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
      <c.icon size={56} strokeWidth={1.2} className="text-tertiary" />
      <h2 className="mt-4 text-[18px] font-semibold">{c.heading}</h2>
      <p className="mt-1 max-w-xs text-[13px] text-secondary">{c.body}</p>
    </div>
  );
}
