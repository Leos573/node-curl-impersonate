/**
 * Headers implementation compatible with Web Fetch API.
 * Case-insensitive key lookup, multi-value support.
 */
export class ImpersonateHeaders implements Headers {
  private map: Map<string, string[]> = new Map();

  constructor(init?: HeadersInit | ImpersonateHeaders | Record<string, string> | [string, string][]) {
    if (!init) return;
    if (init instanceof ImpersonateHeaders) {
      init.map.forEach((values, key) => this.map.set(key, [...values]));
    } else if (Array.isArray(init)) {
      for (const pair of init) {
        const [key, value] = pair as [string, string];
        this.append(key, value);
      }
    } else if (typeof init === "object") {
      for (const [key, value] of Object.entries(init)) {
        this.append(key, value);
      }
    }
  }

  append(name: string, value: string): void {
    const key = name.toLowerCase();
    const existing = this.map.get(key);
    if (existing) {
      existing.push(value);
    } else {
      this.map.set(key, [value]);
    }
  }

  delete(name: string): void {
    this.map.delete(name.toLowerCase());
  }

  get(name: string): string | null {
    const values = this.map.get(name.toLowerCase());
    return values ? values.join(", ") : null;
  }

  getSetCookie(): string[] {
    return this.map.get("set-cookie") ?? [];
  }

  has(name: string): boolean {
    return this.map.has(name.toLowerCase());
  }

  set(name: string, value: string): void {
    this.map.set(name.toLowerCase(), [value]);
  }

  forEach(callbackfn: (value: string, key: string, parent: Headers) => void): void {
    this.map.forEach((values, key) => {
      callbackfn(values.join(", "), key, this);
    });
  }

  *entries(): IterableIterator<[string, string]> {
    for (const [key, values] of this.map) {
      yield [key, values.join(", ")];
    }
  }

  *keys(): IterableIterator<string> {
    for (const key of this.map.keys()) {
      yield key;
    }
  }

  *values(): IterableIterator<string> {
    for (const values of this.map.values()) {
      yield values.join(", ");
    }
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }

  /** Get all values for a key (multi-value support) */
  getAll(name: string): string[] {
    return this.map.get(name.toLowerCase()) ?? [];
  }

  /** Convert to curl header format: ["Key: Value", ...] */
  toCurlHeaders(): string[] {
    const result: string[] = [];
    for (const [key, values] of this.map) {
      for (const value of values) {
        result.push(`${key}: ${value}`);
      }
    }
    return result;
  }

  /** Parse raw HTTP headers string into Headers */
  static fromRaw(raw: string): ImpersonateHeaders {
    const headers = new ImpersonateHeaders();
    const lines = raw.split("\r\n");
    for (const line of lines) {
      // Skip status lines and empty lines
      if (line.startsWith("HTTP/") || line.trim() === "") continue;
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      headers.append(key, value);
    }
    return headers;
  }
}
