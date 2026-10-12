import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "../ui/Controls";

export function PaneHeader({ title, onBack, trailing }: { title: string; onBack: () => void; trailing?: ReactNode }) {
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2 px-2">
      <IconButton label="Back" onClick={onBack}>
        <ArrowLeft size={20} />
      </IconButton>
      <h1 className="flex-1 truncate text-[16px] font-semibold">{title}</h1>
      {trailing}
    </header>
  );
}
