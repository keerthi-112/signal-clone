import { useSyncExternalStore } from "react";

/**
 * One shared clock for relative timestamps ("Now", "5m").
 *
 * A single interval runs while anything is subscribed. Each subscriber's snapshot is
 * the *label bucket* for its timestamp (whole minutes elapsed, or -1 once it is older
 * than an hour), so a component re-renders only when its displayed label changes —
 * old messages that show a clock time never re-render.
 */
// 1s keeps labels within a second of exact; each tick is a cheap bucket comparison
// and only labels that actually change re-render.
const TICK_MS = 1_000;
const HOUR_MS = 60 * 60_000;

let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function minutesBucket(iso: string): number {
  const age = now - new Date(iso).getTime();
  return age >= HOUR_MS ? -1 : Math.max(0, Math.floor(age / 60_000));
}

/** Re-render the caller whenever the relative label for `iso` would change. */
export function useRelativeTimeRefresh(iso: string | undefined): void {
  useSyncExternalStore(
    subscribe,
    () => (iso ? minutesBucket(iso) : -1),
    () => -1,
  );
}
