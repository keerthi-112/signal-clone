import { WS_URL } from "./api";
import type { ServerEvent } from "./types";

export type ConnectionState = "connecting" | "online" | "offline";

type ClientFrame =
  | { type: "ping" }
  | { type: "typing"; conversation_id: number; is_typing: boolean }
  | { type: "delivered"; message_ids: number[] };

interface Handlers {
  onEvent: (event: ServerEvent) => void;
  onStateChange: (state: ConnectionState) => void;
  /** Fired on every successful (re)connect, after `hello`; used to resync missed state. */
  onReady: () => void;
  onUnauthorized: () => void;
}

const HEARTBEAT_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;
const WS_UNAUTHORIZED = 4401;

/**
 * Resilient WebSocket: exponential backoff with jitter, heartbeat pings (keeps proxies
 * from idling the socket out), and reconnect when the tab comes back online/visible.
 */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private token: string,
    private handlers: Handlers,
  ) {}

  start() {
    this.stopped = false;
    window.addEventListener("online", this.reconnectNow);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.connect();
  }

  stop() {
    this.stopped = true;
    window.removeEventListener("online", this.reconnectNow);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.clearTimers();
    this.ws?.close(1000);
    this.ws = null;
  }

  send(frame: ClientFrame): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(frame));
    return true;
  }

  private connect() {
    if (this.stopped) return;
    this.handlers.onStateChange("connecting");
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;

    ws.onmessage = (msg) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (event.type === "hello") {
        this.attempts = 0;
        this.handlers.onStateChange("online");
        this.handlers.onEvent(event);
        this.handlers.onReady();
        return;
      }
      this.handlers.onEvent(event);
    };

    ws.onopen = () => {
      this.heartbeat = setInterval(() => this.send({ type: "ping" }), HEARTBEAT_MS);
    };

    ws.onclose = (e) => {
      if (this.ws !== ws) return; // superseded by a newer socket
      this.clearTimers();
      this.ws = null;
      if (e.code === WS_UNAUTHORIZED) {
        this.handlers.onUnauthorized();
        return;
      }
      if (this.stopped) return;
      this.handlers.onStateChange("offline");
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempts);
    this.attempts += 1;
    const delay = base / 2 + Math.random() * (base / 2);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private reconnectNow = () => {
    if (this.stopped || this.ws) return;
    this.clearTimers();
    this.attempts = 0;
    this.connect();
  };

  private onVisibility = () => {
    if (document.visibilityState === "visible") this.reconnectNow();
  };

  private clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.reconnectTimer = null;
    this.heartbeat = null;
  }
}
