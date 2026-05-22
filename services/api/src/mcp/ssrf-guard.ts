/**
 * SSRF protection — blocks requests to private/internal network addresses.
 *
 * Prevents user-supplied URLs from probing localhost, LAN, link-local,
 * cloud metadata endpoints, or other internal services.
 */

import { isIP } from "node:net";

/** IPv4 private/reserved CIDR ranges */
const PRIVATE_IPV4_RANGES: Array<{ network: number; mask: number }> = [
  { network: ip4ToNum("127.0.0.0"), mask: 0xff000000 },     // 127.0.0.0/8   loopback
  { network: ip4ToNum("10.0.0.0"), mask: 0xff000000 },      // 10.0.0.0/8    RFC1918
  { network: ip4ToNum("172.16.0.0"), mask: 0xfff00000 },    // 172.16.0.0/12 RFC1918
  { network: ip4ToNum("192.168.0.0"), mask: 0xffff0000 },   // 192.168.0.0/16 RFC1918
  { network: ip4ToNum("169.254.0.0"), mask: 0xffff0000 },   // 169.254.0.0/16 link-local
  { network: ip4ToNum("0.0.0.0"), mask: 0xffffffff },       // 0.0.0.0 exactly
];

/** IPv6 prefixes that are private/internal */
const PRIVATE_IPV6_PREFIXES = ["::1", "fe80:", "fc00:", "fd00:", "::ffff:127.", "::ffff:10.", "::ffff:172.16.", "::ffff:192.168.", "::ffff:169.254."];

function ip4ToNum(ip: string): number {
  const parts = ip.split(".");
  return ((+parts[0]! << 24) | (+parts[1]! << 16) | (+parts[2]! << 8) | +parts[3]!) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const num = ip4ToNum(ip);
  return PRIVATE_IPV4_RANGES.some((r) => (num & r.mask) === r.network);
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return PRIVATE_IPV6_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Check whether a URL targets a private/internal address.
 * Checks both direct IP literals and well-known internal hostnames.
 */
export function isPrivateUrl(url: URL): boolean {
  const hostname = url.hostname;

  // Only allow http/https schemes
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return true;
  }

  // Block well-known internal hostnames
  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost.endsWith(".local") ||
    lowerHost.endsWith(".internal") ||
    lowerHost === "metadata.google.internal" ||
    lowerHost === "kubernetes.default.svc"
  ) {
    return true;
  }

  // Strip brackets from IPv6 literals
  const rawIp = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;

  // Check IPv4
  if (isIP(rawIp) === 4) {
    return isPrivateIPv4(rawIp);
  }

  // Check IPv6
  if (isIP(rawIp) === 6) {
    return isPrivateIPv6(rawIp);
  }

  // Hostname (not IP) — allow; DNS rebinding attacks are a separate concern
  // mitigated by the fetchWithTimeout not following redirects to private IPs.
  return false;
}
