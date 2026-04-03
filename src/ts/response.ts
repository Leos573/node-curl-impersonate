import { ImpersonateHeaders } from "./headers";

/**
 * ImpersonateResponse extends the concept of Fetch Response
 * with additional curl metadata (httpVersion, elapsed, etc.)
 */
export class ImpersonateResponse {
  readonly headers: ImpersonateHeaders;
  readonly ok: boolean;
  readonly redirected: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly type: ResponseType = "basic";
  readonly url: string;

  // Extended fields (beyond Fetch spec)
  readonly httpVersion: number;
  readonly redirectCount: number;
  readonly downloadSize: number;
  readonly uploadSize: number;
  readonly primaryIp: string;
  readonly elapsed: number; // ms

  private _body: Buffer;
  private _bodyUsed: boolean = false;

  constructor(
    body: Buffer,
    init: {
      status: number;
      statusText?: string;
      headers: ImpersonateHeaders;
      url: string;
      httpVersion?: number;
      redirectCount?: number;
      downloadSize?: number;
      uploadSize?: number;
      primaryIp?: string;
      elapsed?: number;
    }
  ) {
    this._body = body;
    this.status = init.status;
    this.statusText = init.statusText ?? statusTextForCode(init.status);
    this.headers = init.headers;
    this.url = init.url;
    this.ok = init.status >= 200 && init.status < 300;
    this.redirected = (init.redirectCount ?? 0) > 0;
    this.httpVersion = init.httpVersion ?? 0;
    this.redirectCount = init.redirectCount ?? 0;
    this.downloadSize = init.downloadSize ?? 0;
    this.uploadSize = init.uploadSize ?? 0;
    this.primaryIp = init.primaryIp ?? "";
    this.elapsed = init.elapsed ?? 0;
  }

  get body(): ReadableStream<Uint8Array> | null {
    if (this._bodyUsed) return null;
    return new ReadableStream({
      start: (controller) => {
        controller.enqueue(new Uint8Array(this._body));
        controller.close();
      },
    });
  }

  get bodyUsed(): boolean {
    return this._bodyUsed;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    this.consumeBody();
    const copy = new Uint8Array(this._body.byteLength);
    copy.set(new Uint8Array(this._body.buffer, this._body.byteOffset, this._body.byteLength));
    return copy.buffer as ArrayBuffer;
  }

  async blob(): Promise<Blob> {
    this.consumeBody();
    return new Blob([new Uint8Array(this._body)]);
  }

  async bytes(): Promise<Uint8Array> {
    this.consumeBody();
    return new Uint8Array(this._body);
  }

  async formData(): Promise<FormData> {
    throw new Error("formData() is not supported");
  }

  async json(): Promise<any> {
    const text = await this.text();
    return JSON.parse(text);
  }

  async text(): Promise<string> {
    this.consumeBody();
    return this._body.toString("utf-8");
  }

  clone(): ImpersonateResponse {
    if (this._bodyUsed) {
      throw new TypeError("Cannot clone a response that has already been consumed");
    }
    return new ImpersonateResponse(Buffer.from(this._body), {
      status: this.status,
      statusText: this.statusText,
      headers: new ImpersonateHeaders(Array.from(this.headers.entries())),
      url: this.url,
      httpVersion: this.httpVersion,
      redirectCount: this.redirectCount,
      downloadSize: this.downloadSize,
      uploadSize: this.uploadSize,
      primaryIp: this.primaryIp,
      elapsed: this.elapsed,
    });
  }

  /** Get raw body buffer without consuming */
  get buffer(): Buffer {
    return this._body;
  }

  private consumeBody(): void {
    if (this._bodyUsed) {
      throw new TypeError("Body has already been consumed");
    }
    this._bodyUsed = true;
  }
}

function statusTextForCode(code: number): string {
  const map: Record<number, string> = {
    200: "OK", 201: "Created", 204: "No Content",
    301: "Moved Permanently", 302: "Found", 304: "Not Modified",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout",
    429: "Too Many Requests",
    500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
  };
  return map[code] ?? "";
}
