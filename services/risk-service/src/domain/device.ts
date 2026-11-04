import { createHash } from "crypto";

/**
 * Device Fingerprinting
 *
 * A device fingerprint is a deterministic hash of hardware
 * and software attributes that identify a specific device.
 *
 * Attributes combined:
 *   OS, Browser, CPU cores, Language, Screen resolution,
 *   Timezone, Canvas fingerprint (if provided)
 *
 * Result: SHA-256 hex string (64 chars)
 *
 * Usage:
 *   const hash = fingerprintDevice({ os: "Windows", browser: "Chrome", ... });
 *   Pass hash in the transaction request as deviceHash.
 *
 * Note: A device fingerprint is NOT a reliable long-term identifier.
 *   Browser updates and privacy modes change it.
 *   It is a risk signal, not a permanent identifier.
 *   Use it to detect NEW devices (higher risk) not to track users.
 *
 * In production:
 *   The fingerprint is computed on the client (terminal/browser/app)
 *   and sent in the request header: X-Device-Fingerprint
 *   The risk service hashes it server-side before storage.
 */

export interface DeviceAttributes {
  os?:          string;   // "Windows 10", "Android 13", "iOS 17"
  browser?:     string;   // "Chrome 120", "Safari 17"
  cpuCores?:    number;
  language?:    string;   // "en-US"
  screenRes?:   string;   // "1920x1080"
  timezone?:    string;   // "America/New_York"
  canvasHash?:  string;   // hash of canvas fingerprint
  webglHash?:   string;   // hash of WebGL fingerprint
}

/**
 * Compute a deterministic device fingerprint hash.
 * Returns a 64-character SHA-256 hex string.
 */
export function fingerprintDevice(attrs: DeviceAttributes): string {
  // Build a canonical string from all available attributes
  // Order is fixed — changing order changes the hash
  const parts = [
    attrs.os         ?? "",
    attrs.browser    ?? "",
    attrs.cpuCores?.toString() ?? "",
    attrs.language   ?? "",
    attrs.screenRes  ?? "",
    attrs.timezone   ?? "",
    attrs.canvasHash ?? "",
    attrs.webglHash  ?? "",
  ];

  const canonical = parts.join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Parse a device fingerprint from an HTTP header value.
 * The header value is expected to be a hex-encoded SHA-256 hash,
 * or a pipe-separated string of attributes to hash server-side.
 */
export function parseDeviceHeader(headerValue: string): string | null {
  if (!headerValue) return null;

  // If it looks like a pre-computed hash (64 hex chars), use directly
  if (/^[0-9a-f]{64}$/.test(headerValue.toLowerCase())) {
    return headerValue.toLowerCase();
  }

  // Otherwise, treat as raw attribute string and hash it
  return createHash("sha256").update(headerValue).digest("hex");
}
