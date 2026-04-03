#!/usr/bin/env node

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import os from "os";

const VERSION = "1.5.2";
const DEPS_DIR = join(import.meta.dirname, "..", "deps");

function getArch() {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === "darwin" && arch === "arm64") {
    return { sysname: "macos", arch: "arm64" };
  }
  if (platform === "darwin" && arch === "x64") {
    return { sysname: "macos", arch: "x86_64" };
  }
  if (platform === "linux" && arch === "x64") {
    return { sysname: "linux-gnu", arch: "x86_64" };
  }
  if (platform === "linux" && arch === "arm64") {
    return { sysname: "linux-gnu", arch: "aarch64" };
  }
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

const { sysname, arch } = getArch();
const url = `https://github.com/lexiforest/curl-impersonate/releases/download/v${VERSION}/libcurl-impersonate-v${VERSION}.${arch}-${sysname}.tar.gz`;
const tarball = join(DEPS_DIR, "libcurl-impersonate.tar.gz");

if (!existsSync(DEPS_DIR)) {
  mkdirSync(DEPS_DIR, { recursive: true });
}

if (existsSync(join(DEPS_DIR, "libcurl-impersonate.a"))) {
  console.log("libcurl-impersonate already downloaded.");
  process.exit(0);
}

console.log(`Downloading libcurl-impersonate v${VERSION} for ${arch}-${sysname}...`);
console.log(`URL: ${url}`);

execSync(`curl -L -o "${tarball}" "${url}"`, { stdio: "inherit" });
execSync(`tar xzf "${tarball}" -C "${DEPS_DIR}"`, { stdio: "inherit" });
execSync(`rm "${tarball}"`, { stdio: "inherit" });

console.log("Done. Files:");
execSync(`ls -la "${DEPS_DIR}"`, { stdio: "inherit" });
