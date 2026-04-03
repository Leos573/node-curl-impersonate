import { EventEmitter } from "events";
import { native, NativeCurlEasy } from "./native";
import { BrowserType, resolveBrowserTarget } from "./constants";

const { CurlOpt, CurlWsFlag } = native;

export interface WebSocketOptions {
  impersonate?: BrowserType;
  headers?: Record<string, string>;
  proxy?: string;
  timeout?: number;
  verify?: boolean;
}

/**
 * WebSocket client with browser TLS fingerprint impersonation.
 * Uses curl's WebSocket API under the hood.
 *
 * @example
 * ```ts
 * const ws = await ImpersonateWebSocket.connect("wss://echo.websocket.org", {
 *   impersonate: "chrome146"
 * });
 * ws.on("message", (data) => console.log(data));
 * ws.send("hello");
 * ws.close();
 * ```
 */
export class ImpersonateWebSocket extends EventEmitter {
  private easy: NativeCurlEasy;
  private closed = false;
  private polling = false;

  private constructor(easy: NativeCurlEasy) {
    super();
    this.easy = easy;
  }

  static async connect(url: string | URL, options: WebSocketOptions = {}): Promise<ImpersonateWebSocket> {
    const easy = new native.CurlEasy();
    const urlStr = url.toString();

    // Impersonate
    if (options.impersonate) {
      const target = resolveBrowserTarget(options.impersonate);
      easy.impersonate(target, true);
    }

    // URL (convert ws/wss to http/https for curl)
    const curlUrl = urlStr.replace(/^ws(s?):\/\//, "http$1://");
    easy.setoptString(CurlOpt.URL, curlUrl);

    // Enable WebSocket upgrade
    easy.setoptLong(CurlOpt.HTTP_VERSION, native.CurlHttpVersion.V1_1);

    // Headers
    const headerList: string[] = [];
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        headerList.push(`${key}: ${value}`);
      }
    }
    if (headerList.length > 0) {
      easy.setoptSlist(CurlOpt.HTTPHEADER, headerList);
    }

    // SSL
    const verify = options.verify ?? true;
    easy.setoptLong(CurlOpt.SSL_VERIFYPEER, verify ? 1 : 0);
    easy.setoptLong(CurlOpt.SSL_VERIFYHOST, verify ? 2 : 0);

    // Proxy
    if (options.proxy) {
      easy.setoptString(CurlOpt.PROXY, options.proxy);
    }

    // Timeout
    if (options.timeout) {
      easy.setoptLong(CurlOpt.CONNECTTIMEOUT_MS, options.timeout);
    }

    // Perform the HTTP upgrade (connect_only mode for WebSocket)
    // Note: curl handles the upgrade automatically when using ws_recv/ws_send
    easy.setoptLong(78, 2); // CURLOPT_CONNECT_ONLY = 78, value 2 for WebSocket

    const code = easy.perform();
    if (code !== 0) {
      easy.cleanup();
      throw new Error(`WebSocket connection failed: curl code ${code}`);
    }

    const ws = new ImpersonateWebSocket(easy);
    ws.startPolling();
    return ws;
  }

  /** Send a text message */
  send(data: string): void;
  /** Send a binary message */
  send(data: Buffer): void;
  send(data: string | Buffer): void {
    if (this.closed) throw new Error("WebSocket is closed");

    let buf: Buffer;
    let flags: number;

    if (typeof data === "string") {
      buf = Buffer.from(data, "utf-8");
      flags = CurlWsFlag.TEXT;
    } else {
      buf = data;
      flags = CurlWsFlag.BINARY;
    }

    const code = native.wsSend(this.easy, buf, flags);
    if (code !== 0) {
      this.emit("error", new Error(`WebSocket send failed: curl code ${code}`));
    }
  }

  /** Close the WebSocket connection */
  close(code: number = 1000, reason: string = ""): void {
    if (this.closed) return;
    this.closed = true;
    this.polling = false;

    try {
      const buf = Buffer.alloc(0);
      native.wsSend(this.easy, buf, CurlWsFlag.CLOSE);
    } catch {
      // Best effort close
    }

    this.easy.cleanup();
    this.emit("close", code, reason);
  }

  get readyState(): number {
    return this.closed ? 3 : 1; // CLOSED or OPEN
  }

  private startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    this.poll();
  }

  private poll(): void {
    if (!this.polling || this.closed) return;

    try {
      const result = native.wsRecv(this.easy);

      if (result.code === 0 && result.data) {
        if (result.flags != null) {
          if (result.flags & CurlWsFlag.TEXT) {
            this.emit("message", result.data.toString("utf-8"));
          } else if (result.flags & CurlWsFlag.BINARY) {
            this.emit("message", result.data);
          } else if (result.flags & CurlWsFlag.CLOSE) {
            this.close();
            return;
          } else if (result.flags & CurlWsFlag.PING) {
            // Respond with pong
            native.wsSend(this.easy, result.data, CurlWsFlag.PONG);
          }
        } else {
          this.emit("message", result.data);
        }
      }
    } catch (err) {
      if (!this.closed) {
        this.emit("error", err);
      }
      return;
    }

    // Schedule next poll
    if (this.polling) {
      setImmediate(() => this.poll());
    }
  }
}
