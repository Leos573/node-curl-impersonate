/**
 * Browser type literals matching curl_cffi's impersonate.py presets.
 * These map directly to curl_easy_impersonate() target strings.
 */
export type BrowserType =
  // Chrome
  | "chrome99" | "chrome100" | "chrome101" | "chrome104" | "chrome107"
  | "chrome110" | "chrome116" | "chrome119" | "chrome120" | "chrome123"
  | "chrome124" | "chrome131" | "chrome133a" | "chrome136" | "chrome142"
  | "chrome145" | "chrome146"
  // Chrome Android
  | "chrome99_android" | "chrome131_android"
  // Edge
  | "edge99" | "edge101"
  // Safari macOS
  | "safari153" | "safari155" | "safari170" | "safari180" | "safari184"
  | "safari260" | "safari2601"
  // Safari iOS
  | "safari172_ios" | "safari180_ios" | "safari184_ios" | "safari260_ios"
  // Firefox
  | "firefox133" | "firefox135" | "firefox144" | "firefox147"
  // Tor
  | "tor145"
  // Aliases (resolve to latest)
  | "chrome" | "firefox" | "safari" | "safari_ios" | "edge";

/** Default browser versions for aliases */
export const BROWSER_ALIAS_MAP: Record<string, string> = {
  chrome: "chrome146",
  firefox: "firefox147",
  safari: "safari2601",
  safari_ios: "safari260_ios",
  edge: "edge101",
};

/** Resolve alias to real target string */
export function resolveBrowserTarget(target: BrowserType): string {
  return BROWSER_ALIAS_MAP[target] ?? target;
}

/** Extra fingerprint options for fine-grained TLS/HTTP2 control */
export interface ExtraFingerprints {
  tlsMinVersion?: "1.0" | "1.1" | "1.2" | "1.3";
  tlsGrease?: boolean;
  tlsPermuteExtensions?: boolean;
  tlsCertCompression?: "zlib" | "brotli";
  tlsSignatureAlgorithms?: string[];
  http2StreamWeight?: number;
  http2StreamExclusive?: number;
  http2NoPriority?: boolean;
}

/** HTTP version literals */
export type HttpVersion = "1.1" | "2" | "2tls" | "3";

/** Map from HttpVersion to curl constant names */
export const HTTP_VERSION_MAP: Record<HttpVersion, string> = {
  "1.1": "V1_1",
  "2": "V2_0",
  "2tls": "V2TLS",
  "3": "V3",
};
