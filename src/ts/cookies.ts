export interface CookieOptions {
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expires?: number; // Unix timestamp
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expires: number;
}

/**
 * CookieJar manages cookies across requests within a Session.
 * Handles Set-Cookie parsing, domain/path matching, and serialization.
 */
export class CookieJar {
  private cookies: Cookie[] = [];

  set(name: string, value: string, options: CookieOptions = {}): void {
    const cookie: Cookie = {
      name,
      value,
      domain: options.domain ?? "",
      path: options.path ?? "/",
      secure: options.secure ?? false,
      httpOnly: options.httpOnly ?? false,
      expires: options.expires ?? 0,
    };

    // Replace existing cookie with same name+domain+path
    const idx = this.cookies.findIndex(
      (c) => c.name === name && c.domain === cookie.domain && c.path === cookie.path
    );
    if (idx >= 0) {
      this.cookies[idx] = cookie;
    } else {
      this.cookies.push(cookie);
    }
  }

  get(name: string, domain?: string): string | undefined {
    const cookie = this.cookies.find(
      (c) => c.name === name && (!domain || this.domainMatches(c.domain, domain))
    );
    return cookie?.value;
  }

  getAll(domain?: string, path?: string): Cookie[] {
    return this.cookies.filter((c) => {
      if (domain && !this.domainMatches(c.domain, domain)) return false;
      if (path && !c.path.startsWith(path)) return false;
      if (c.expires > 0 && c.expires < Date.now() / 1000) return false;
      return true;
    });
  }

  delete(name: string, domain?: string): void {
    this.cookies = this.cookies.filter(
      (c) => !(c.name === name && (!domain || c.domain === domain))
    );
  }

  clear(): void {
    this.cookies = [];
  }

  toJSON(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const c of this.cookies) {
      result[c.name] = c.value;
    }
    return result;
  }

  /** Serialize cookies for a specific URL into Cookie header value */
  getCookieString(url: string): string {
    const parsed = new URL(url);
    const matching = this.getAll(parsed.hostname, parsed.pathname);
    return matching.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  /** Parse Set-Cookie headers from a response */
  extractFromHeaders(setCookieHeaders: string[], requestUrl: string): void {
    const parsed = new URL(requestUrl);
    for (const header of setCookieHeaders) {
      this.parseSetCookie(header, parsed.hostname, parsed.pathname);
    }
  }

  private parseSetCookie(header: string, defaultDomain: string, defaultPath: string): void {
    const parts = header.split(";").map((s) => s.trim());
    if (parts.length === 0) return;

    const [nameValue, ...attrs] = parts;
    const eqIdx = nameValue.indexOf("=");
    if (eqIdx === -1) return;

    const name = nameValue.slice(0, eqIdx).trim();
    const value = nameValue.slice(eqIdx + 1).trim();

    const options: CookieOptions = {
      domain: defaultDomain,
      path: defaultPath,
    };

    for (const attr of attrs) {
      const [attrName, attrValue] = attr.split("=").map((s) => s.trim());
      const lowerName = attrName.toLowerCase();
      if (lowerName === "domain" && attrValue) {
        options.domain = attrValue.startsWith(".") ? attrValue.slice(1) : attrValue;
      } else if (lowerName === "path" && attrValue) {
        options.path = attrValue;
      } else if (lowerName === "secure") {
        options.secure = true;
      } else if (lowerName === "httponly") {
        options.httpOnly = true;
      } else if (lowerName === "expires" && attrValue) {
        options.expires = Math.floor(new Date(attrValue).getTime() / 1000);
      } else if (lowerName === "max-age" && attrValue) {
        options.expires = Math.floor(Date.now() / 1000) + parseInt(attrValue, 10);
      }
    }

    this.set(name, value, options);
  }

  private domainMatches(cookieDomain: string, requestDomain: string): boolean {
    if (!cookieDomain) return true;
    if (cookieDomain === requestDomain) return true;
    return requestDomain.endsWith("." + cookieDomain);
  }
}
