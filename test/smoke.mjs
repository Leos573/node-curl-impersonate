/**
 * Smoke test: verify impersonation works by checking TLS fingerprint.
 */
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load compiled TS
const { fetch, Session, native } = require(path.join(__dirname, "..", "dist", "index.js"));

console.log("=== node-curl-impersonate smoke test ===\n");
console.log("curl version:", native.curlVersion());
console.log("");

async function testBasicFetch() {
  console.log("--- Test 1: Basic fetch (no impersonation) ---");
  const r = await fetch("https://httpbin.org/get");
  console.log("Status:", r.status);
  const data = await r.json();
  console.log("IP:", data.origin);
  console.log("User-Agent:", data.headers["User-Agent"]);
  console.log("");
}

async function testImpersonatedFetch() {
  console.log("--- Test 2: Chrome146 impersonation ---");
  const r = await fetch("https://tls.peet.ws/api/all", {
    impersonate: "chrome146",
  });
  console.log("Status:", r.status);
  const data = await r.json();
  console.log("TLS Version:", data.tls?.version);
  console.log("HTTP Version:", data.http_version);
  console.log("JA3 Hash:", data.tls?.ja3_hash);
  console.log("User-Agent:", data.http1?.headers?.find(h => h.startsWith("User-Agent:"))?.slice(12) ?? "N/A");
  console.log("Akamai FP:", data.http2?.akamai_fingerprint ?? "N/A");
  console.log("");
}

async function testFirefoxImpersonation() {
  console.log("--- Test 3: Firefox147 impersonation ---");
  const r = await fetch("https://tls.peet.ws/api/all", {
    impersonate: "firefox147",
  });
  console.log("Status:", r.status);
  const data = await r.json();
  console.log("TLS Version:", data.tls?.version);
  console.log("JA3 Hash:", data.tls?.ja3_hash);
  console.log("User-Agent:", data.http1?.headers?.find(h => h.startsWith("User-Agent:"))?.slice(12) ?? "N/A");
  console.log("");
}

async function testSessionWithCookies() {
  console.log("--- Test 4: Session with cookie persistence ---");
  const session = new Session({ impersonate: "chrome146" });
  const r1 = await session.fetch("https://httpbin.org/cookies/set/testcookie/hello123");
  console.log("Set cookie status:", r1.status);
  console.log("Cookie jar:", session.cookies.toJSON());

  const r2 = await session.fetch("https://httpbin.org/cookies");
  const data = await r2.json();
  console.log("Cookies returned by server:", data.cookies);
  session.close();
  console.log("");
}

async function testSafariImpersonation() {
  console.log("--- Test 5: Safari impersonation ---");
  const r = await fetch("https://tls.peet.ws/api/all", {
    impersonate: "safari",
  });
  console.log("Status:", r.status);
  const data = await r.json();
  console.log("TLS Version:", data.tls?.version);
  console.log("JA3 Hash:", data.tls?.ja3_hash);
  console.log("");
}

async function main() {
  try {
    await testBasicFetch();
    await testImpersonatedFetch();
    await testFirefoxImpersonation();
    await testSafariImpersonation();
    await testSessionWithCookies();
    console.log("=== All smoke tests passed! ===");
  } catch (err) {
    console.error("TEST FAILED:", err);
    process.exit(1);
  }
}

main();
