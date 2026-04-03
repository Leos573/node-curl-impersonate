import { native, NativeCurlEasy, NativeCurlMulti } from "./native";
import { ImpersonateHeaders } from "./headers";
import { CookieJar } from "./cookies";
import { ImpersonateResponse } from "./response";
import {
  BrowserType, ExtraFingerprints, HttpVersion,
  HTTP_VERSION_MAP, resolveBrowserTarget,
} from "./constants";

const { CurlOpt, CurlInfo, CurlHttpVersion } = native;

export interface ImpersonateRequestInit extends RequestInit {
  impersonate?: BrowserType;
  ja3?: string;
  akamai?: string;
  extraFingerprints?: ExtraFingerprints;
  httpVersion?: HttpVersion;
  proxy?: string;
  timeout?: number | [number, number]; // ms: total or [connect, total]
  maxRedirects?: number;
  verify?: boolean;
  interface?: string;
}

export interface SessionOptions {
  impersonate?: BrowserType;
  headers?: HeadersInit | Record<string, string>;
  cookies?: Record<string, string>;
  proxy?: string;
  timeout?: number | [number, number];
  maxRedirects?: number;
  verify?: boolean;
  ja3?: string;
  akamai?: string;
  extraFingerprints?: ExtraFingerprints;
}

/**
 * Session manages connection pooling, cookies, and default options.
 * Uses curl_multi for async non-blocking I/O via libuv integration.
 */
export class Session {
  readonly cookies: CookieJar;
  private multi: NativeCurlMulti;
  private defaults: SessionOptions;
  private defaultHeaders: ImpersonateHeaders;
  private closed = false;

  constructor(options: SessionOptions = {}) {
    this.defaults = options;
    this.multi = new native.CurlMulti();
    this.cookies = new CookieJar();
    this.defaultHeaders = new ImpersonateHeaders(options.headers);

    if (options.cookies) {
      for (const [name, value] of Object.entries(options.cookies)) {
        this.cookies.set(name, value);
      }
    }
  }

  /**
   * Perform an HTTP request (Fetch-compatible signature with extensions).
   */
  async fetch(url: string | URL, init: ImpersonateRequestInit = {}): Promise<ImpersonateResponse> {
    if (this.closed) throw new Error("Session is closed");

    const urlStr = url.toString();
    const easy = new native.CurlEasy();

    try {
      this.configureHandle(easy, urlStr, init);
      await this.multi.performAsync(easy);
      return this.buildResponse(easy, urlStr);
    } finally {
      easy.cleanup();
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.multi.close();
  }

  private configureHandle(easy: NativeCurlEasy, url: string, init: ImpersonateRequestInit): void {
    // 1. Impersonation (must be set before other options)
    const impersonate = init.impersonate ?? this.defaults.impersonate;
    if (impersonate) {
      const target = resolveBrowserTarget(impersonate);
      const code = easy.impersonate(target, true);
      if (code !== 0) {
        throw new Error(`Failed to impersonate "${target}": curl code ${code}`);
      }
    }

    // 2. URL
    easy.setoptString(CurlOpt.URL, url);

    // 3. Method
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "POST") {
      easy.setoptLong(CurlOpt.POST, 1);
    } else if (method === "HEAD") {
      easy.setoptLong(CurlOpt.NOBODY, 1);
    } else if (method !== "GET") {
      easy.setoptString(CurlOpt.CUSTOMREQUEST, method);
    }

    // 4. Headers
    const headers = new ImpersonateHeaders(this.defaultHeaders);
    if (init.headers) {
      const initHeaders = new ImpersonateHeaders(init.headers as any);
      for (const [key, value] of initHeaders) {
        headers.set(key, value);
      }
    }

    // 5. Body
    if (init.body != null) {
      let bodyStr: string;
      if (typeof init.body === "string") {
        bodyStr = init.body;
      } else if (init.body instanceof Uint8Array) {
        bodyStr = Buffer.from(init.body).toString();
      } else if (init.body instanceof ArrayBuffer) {
        bodyStr = Buffer.from(new Uint8Array(init.body)).toString();
      } else {
        bodyStr = String(init.body);
      }
      easy.setoptString(CurlOpt.POSTFIELDS, bodyStr);
      easy.setoptLong(CurlOpt.POSTFIELDSIZE, Buffer.byteLength(bodyStr));

      // Set content-type if not already set
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/x-www-form-urlencoded");
      }
    }

    // Set headers on handle
    const curlHeaders = headers.toCurlHeaders();
    if (curlHeaders.length > 0) {
      easy.setoptSlist(CurlOpt.HTTPHEADER, curlHeaders);
    }

    // 6. Cookies — enable curl's built-in cookie engine + inject from jar
    easy.setoptString(CurlOpt.COOKIEFILE, ""); // activate in-memory cookie engine
    const cookieStr = this.cookies.getCookieString(url);
    if (cookieStr) {
      easy.setoptString(CurlOpt.COOKIE, cookieStr);
    }
    // Inject individual cookies into curl's cookie engine
    for (const cookie of this.cookies.getAll()) {
      const domain = cookie.domain || new URL(url).hostname;
      const secure = cookie.secure ? "TRUE" : "FALSE";
      const httpOnly = cookie.httpOnly ? "#HttpOnly_" : "";
      const expires = cookie.expires > 0 ? String(cookie.expires) : "0";
      const line = `${httpOnly}${domain}\tTRUE\t${cookie.path}\t${secure}\t${expires}\t${cookie.name}\t${cookie.value}`;
      easy.setoptString(CurlOpt.COOKIELIST, line);
    }

    // 7. Redirects
    const maxRedirects = init.maxRedirects ?? this.defaults.maxRedirects ?? 30;
    easy.setoptLong(CurlOpt.FOLLOWLOCATION, init.redirect === "manual" ? 0 : 1);
    easy.setoptLong(CurlOpt.MAXREDIRS, maxRedirects);

    // 8. Timeout
    const timeout = init.timeout ?? this.defaults.timeout;
    if (timeout != null) {
      if (Array.isArray(timeout)) {
        easy.setoptLong(CurlOpt.CONNECTTIMEOUT_MS, timeout[0]);
        easy.setoptLong(CurlOpt.TIMEOUT_MS, timeout[1]);
      } else {
        easy.setoptLong(CurlOpt.TIMEOUT_MS, timeout);
      }
    }

    // 9. SSL verification
    const verify = init.verify ?? this.defaults.verify ?? true;
    easy.setoptLong(CurlOpt.SSL_VERIFYPEER, verify ? 1 : 0);
    easy.setoptLong(CurlOpt.SSL_VERIFYHOST, verify ? 2 : 0);

    // 10. Proxy
    const proxy = init.proxy ?? this.defaults.proxy;
    if (proxy) {
      easy.setoptString(CurlOpt.PROXY, proxy);
    }

    // 11. HTTP version
    const httpVersion = init.httpVersion ?? (impersonate ? undefined : undefined);
    if (httpVersion) {
      const versionKey = HTTP_VERSION_MAP[httpVersion];
      if (versionKey && CurlHttpVersion[versionKey] != null) {
        easy.setoptLong(CurlOpt.HTTP_VERSION, CurlHttpVersion[versionKey]);
      }
    }

    // 12. Interface binding
    const iface = init.interface ?? (this.defaults as any).interface as string | undefined;
    if (iface) {
      easy.setoptString(CurlOpt.INTERFACE, iface);
    }
  }

  private buildResponse(easy: NativeCurlEasy, requestUrl: string): ImpersonateResponse {
    const status = easy.getinfoLong(CurlInfo.RESPONSE_CODE) ?? 0;
    const effectiveUrl = easy.getinfoString(CurlInfo.EFFECTIVE_URL) ?? requestUrl;
    const contentType = easy.getinfoString(CurlInfo.CONTENT_TYPE);
    const totalTime = easy.getinfoDouble(CurlInfo.TOTAL_TIME) ?? 0;
    const redirectCount = easy.getinfoLong(CurlInfo.REDIRECT_COUNT) ?? 0;
    const primaryIp = easy.getinfoString(CurlInfo.PRIMARY_IP) ?? "";
    const httpVersion = easy.getinfoLong(CurlInfo.HTTP_VERSION) ?? 0;

    const body = easy.getResponseBody();
    const rawHeaders = easy.getResponseHeaders();
    const headers = ImpersonateHeaders.fromRaw(rawHeaders);

    // Extract Set-Cookie and store in jar
    const setCookies = headers.getAll("set-cookie");
    if (setCookies.length > 0) {
      this.cookies.extractFromHeaders(setCookies, effectiveUrl);
    }

    return new ImpersonateResponse(body, {
      status,
      headers,
      url: effectiveUrl,
      httpVersion,
      redirectCount,
      primaryIp,
      elapsed: Math.round(totalTime * 1000),
    });
  }
}

/**
 * Global session for module-level fetch().
 * Created lazily on first use.
 */
let globalSession: Session | null = null;

function getGlobalSession(): Session {
  if (!globalSession) {
    globalSession = new Session();
  }
  return globalSession;
}

/**
 * Module-level fetch function — drop-in replacement with impersonation support.
 *
 * @example
 * ```ts
 * import { fetch } from "node-curl-impersonate";
 * const r = await fetch("https://example.com", { impersonate: "chrome146" });
 * console.log(await r.text());
 * ```
 */
export async function fetch(url: string | URL, init: ImpersonateRequestInit = {}): Promise<ImpersonateResponse> {
  return getGlobalSession().fetch(url, init);
}
