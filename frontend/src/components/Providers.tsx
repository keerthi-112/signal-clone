"use client";

import { useEffect } from "react";
import { applyTheme } from "@/lib/prefs";
import { useAuth } from "@/store/auth";
import { usePrefs } from "@/store/prefs";
import { Toaster } from "./ui/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  const init = useAuth((s) => s.init);
  const hydrate = usePrefs((s) => s.hydrate);
  const theme = usePrefs((s) => s.prefs.theme);

  useEffect(() => {
    hydrate();
    void init();
  }, [hydrate, init]);

  // Follow OS theme changes while the preference is "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
