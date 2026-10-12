import { create } from "zustand";
import { applyTheme, DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "@/lib/prefs";

interface PrefsState {
  prefs: Prefs;
  hydrate: () => void;
  update: (patch: Partial<Prefs>) => void;
}

export const usePrefs = create<PrefsState>((set, get) => ({
  prefs: DEFAULT_PREFS,
  hydrate: () => {
    const prefs = loadPrefs();
    set({ prefs });
    applyTheme(prefs.theme);
  },
  update: (patch) => {
    const prefs = { ...get().prefs, ...patch };
    set({ prefs });
    savePrefs(prefs);
    if (patch.theme) applyTheme(prefs.theme);
  },
}));
