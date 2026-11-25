type SocketEventType = "open" | "message" | "close" | "error";

/** A WebSocket stand-in a test drives by hand: open it, send it messages, close it with a code. */
export class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly url: string;
  private readonly listeners: Record<
    SocketEventType,
    Set<(...args: never[]) => void>
  > = {
    open: new Set(),
    message: new Set(),
    close: new Set(),
    error: new Set(),
  };

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  static latest(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) throw new Error("No socket was opened");
    return socket;
  }

  addEventListener(type: "open" | "error", listener: () => void): void;
  addEventListener(
    type: "message",
    listener: (event: { data: string }) => void,
  ): void;
  addEventListener(
    type: "close",
    listener: (event: { code: number; reason: string }) => void,
  ): void;
  addEventListener(
    type: SocketEventType,
    listener: (...args: never[]) => void,
  ): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(type: "open" | "error", listener: () => void): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: string }) => void,
  ): void;
  removeEventListener(
    type: "close",
    listener: (event: { code: number; reason: string }) => void,
  ): void;
  removeEventListener(
    type: SocketEventType,
    listener: (...args: never[]) => void,
  ): void {
    this.listeners[type].delete(listener);
  }

  private emit(type: SocketEventType, ...args: unknown[]): void {
    for (const listener of this.listeners[type]) {
      Reflect.apply(listener, this, args);
    }
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    const event = { code: 1005, reason: "" };
    this.onclose?.(event);
    this.emit("close", event);
  }

  serverOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
    this.emit("open");
  }

  serverMessage(message: unknown): void {
    const event = { data: JSON.stringify(message) };
    this.onmessage?.(event);
    this.emit("message", event);
  }

  serverClose(code: number, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED;
    const event = { code, reason };
    this.onclose?.(event);
    this.emit("close", event);
  }

  serverError(): void {
    this.onerror?.();
    this.emit("error");
  }
}
