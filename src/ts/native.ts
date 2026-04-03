import * as path from "path";

/**
 * Load the native N-API addon.
 * Tries build/Release first (dev), then prebuilds (production).
 */
function loadNative(): NativeModule {
  const buildPath = path.join(__dirname, "..", "..", "build", "Release", "curl_napi.node");
  try {
    return require(buildPath);
  } catch {
    // Try node-gyp-build for prebuilds
    const gypBuild = require("node-gyp-build");
    return gypBuild(path.join(__dirname, "..", ".."));
  }
}

export interface NativeCurlEasy {
  setoptString(option: number, value: string): number;
  setoptLong(option: number, value: number): number;
  setoptSlist(option: number, values: string[]): number;
  getinfoString(option: number): string | null;
  getinfoLong(option: number): number | null;
  getinfoDouble(option: number): number | null;
  perform(): number;
  impersonate(target: string, defaultHeaders?: boolean): number;
  reset(): void;
  getResponseBody(): Buffer;
  getResponseHeaders(): string;
  cleanup(): void;
  upkeep(): number;
}

export interface NativeCurlMulti {
  performAsync(easy: NativeCurlEasy): Promise<number>;
  close(): void;
}

export interface WsRecvResult {
  code: number;
  data: Buffer | null;
  flags?: number;
  bytesleft?: number;
  offset?: number;
}

export interface NativeModule {
  CurlEasy: new () => NativeCurlEasy;
  CurlMulti: new () => NativeCurlMulti;
  curlVersion(): string;
  globalInit(): number;
  globalCleanup(): void;
  wsRecv(easy: NativeCurlEasy, bufferSize?: number): WsRecvResult;
  wsSend(easy: NativeCurlEasy, data: Buffer, flags: number): number;
  CurlOpt: Record<string, number>;
  CurlHttpVersion: Record<string, number>;
  CurlInfo: Record<string, number>;
  CurlWsFlag: Record<string, number>;
  CurlCode: Record<string, number>;
}

export const native: NativeModule = loadNative();
