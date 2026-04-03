/**
 * Detailed fingerprint comparison test.
 * Compares our TLS fingerprints against known real browser values.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { fetch } = require("../dist/index.js");

const BROWSERS = [
  "chrome146",
  "firefox147",
  "safari2601",
  "edge101",
  "chrome99",
  "chrome120",
  "safari180",
];

async function testBrowser(browser) {
  const r = await fetch("https://tls.peet.ws/api/all", { impersonate: browser });
  const data = await r.json();
  return {
    browser,
    ja3Hash: data.tls?.ja3_hash ?? "N/A",
    ja3: data.tls?.ja3 ?? "N/A",
    httpVersion: data.http_version,
    akamaiFingerprint: data.http2?.akamai_fingerprint ?? "N/A",
    userAgent: data.http2?.sent_frames?.[0]?.headers?.find(h => h[0] === "user-agent")?.[1]
      ?? data.http1?.headers?.find(h => h.startsWith("User-Agent:"))?.slice(12)
      ?? "N/A",
  };
}

async function main() {
  console.log("=== TLS Fingerprint Verification ===\n");
  console.log(`${"Browser".padEnd(16)} | ${"JA3 Hash".padEnd(34)} | ${"HTTP".padEnd(4)} | User-Agent (prefix)`);
  console.log("-".repeat(120));

  for (const browser of BROWSERS) {
    try {
      const result = await testBrowser(browser);
      const uaPrefix = result.userAgent.slice(0, 40);
      console.log(
        `${result.browser.padEnd(16)} | ${result.ja3Hash.padEnd(34)} | ${result.httpVersion.padEnd(4)} | ${uaPrefix}`
      );
    } catch (err) {
      console.log(`${browser.padEnd(16)} | FAILED: ${err.message}`);
    }
  }

  console.log("\n=== Done ===");
}

main();
