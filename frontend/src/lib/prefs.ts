// Per-device preferences (Signal stores these locally too, not on the server).

export type ThemePref = "system" | "light" | "dark";

export interface Prefs {
  theme: ThemePref;
  notifications: boolean;
  notificationPreview: boolean;
  enterToSend: boolean;
}

const KEY = "signal.prefs";
export const DEFAULT_PREFS: Prefs = {
  theme: "system",
  notifications: true,
  notificationPreview: true,
  enterToSend: true,
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(pref: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(pref);
}

/** Inlined in <head> so the correct theme is applied before first paint. */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}").theme||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;
