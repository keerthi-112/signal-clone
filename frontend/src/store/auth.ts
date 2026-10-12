import { create } from "zustand";
import { api, ApiError, setUnauthorizedHandler, tokenStore } from "@/lib/api";
import type { AuthResponse, Me } from "@/lib/types";

type AuthStatus = "loading" | "anonymous" | "authenticated" | "error";

interface AuthState {
  status: AuthStatus;
  token: string | null;
  me: Me | null;
  init: () => Promise<void>;
  signIn: (auth: AuthResponse) => void;
  setMe: (me: Me) => void;
  logout: () => Promise<void>;
  /** Local-only sign-out, used when the server says our session is gone. */
  clear: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "loading",
  token: null,
  me: null,

  init: async () => {
    const token = tokenStore.get();
    if (!token) {
      set({ status: "anonymous" });
      return;
    }
    set({ token, status: "loading" });
    try {
      set({ me: await api.me(), status: "authenticated" });
    } catch (err) {
      // Network failure ≠ logged out: keep the token and let the user retry.
      if (err instanceof ApiError && err.status === 401) get().clear();
      else set({ status: "error" });
    }
  },

  signIn: ({ token, user }) => {
    tokenStore.set(token);
    set({ token, me: user, status: "authenticated" });
  },

  setMe: (me) => set({ me }),

  logout: async () => {
    try {
      await api.logout();
    } catch {
      /* already invalid server-side; clear locally regardless */
    }
    get().clear();
  },

  clear: () => {
    tokenStore.set(null);
    set({ token: null, me: null, status: "anonymous" });
  },
}));

setUnauthorizedHandler(() => useAuth.getState().clear());
