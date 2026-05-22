/**
 * Manages Caddy server configuration for custom domains.
 *
 * When a custom domain is verified:
 * 1. Regenerate Caddyfile with the custom domain block
 * 2. Reload Caddy via systemctl (on Linux) or admin API
 *
 * The Caddyfile has two sections:
 * - Wildcard subdomain matching for *.doable.me (existing)
 * - Explicit host matchers for each custom domain mapped to the project's site directory
 */
import { execSync } from "node:child_process";

const SITES_DIR = process.env.SITES_DIR ?? "/data/sites";
const CADDYFILE_PATH = process.env.CADDYFILE_PATH ?? "/etc/caddy/Caddyfile";
const DOABLE_DOMAIN = process.env.DOABLE_DOMAIN ?? "doable.me";

/** Custom domain to project subdomain mapping */
interface DomainMapping {
  domain: string;
  subdomain: string; // the project's doable.me subdomain, used as the directory name
}

/**
 * Generate a complete Caddyfile with both wildcard subdomain handling
 * and explicit custom domain blocks.
 */
export function generateCaddyfile(customDomains: DomainMapping[]): string {
  const escapedDomain = DOABLE_DOMAIN.replace(/\./g, "\\\\.");

  // Build custom domain handle blocks
  const customDomainBlocks = customDomains
    .map((d) => {
      const safeName = d.domain.replace(/[^a-z0-9]/gi, "_");
      return `
    # Custom domain: ${d.domain} → ${d.subdomain}
    @cd_${safeName} host ${d.domain}
    handle @cd_${safeName} {
        root * ${SITES_DIR}/${d.subdomain}/live
        try_files {path} /index.html
        file_server
        header {
            X-Frame-Options SAMEORIGIN
            X-Content-Type-Options nosniff
            Referrer-Policy strict-origin-when-cross-origin
            Permissions-Policy "camera=(), microphone=(), geolocation=()"
            Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob: https:; connect-src 'self' https:; media-src 'self' blob: data:; frame-src 'self' https:; object-src 'none'; base-uri 'self'"
            Strict-Transport-Security "max-age=31536000; includeSubDomains"
        }
        encode gzip
    }`;
    })
    .join("\n");

  return `{
    auto_https off
    admin 127.0.0.1:2019
}

:8080 {
    bind 127.0.0.1

    # ── Wildcard subdomain handling (*.doable.me) ──
    @has_subdomain {
        header_regexp subdomain Host ^([a-z0-9][-a-z0-9]*)\\.${escapedDomain}$
    }

    # PRD 10 — connector-bridge proxy. Static-kind generated apps reach
    # connected integrations via fetch('/__doable/connector-proxy/...')
    # same-origin. Caddy strips the /__doable prefix and proxies to the
    # API which validates the project-scoped JWT and runs the action.
    handle_path /__doable/connector-proxy/* {
        reverse_proxy 127.0.0.1:${process.env.API_PORT ?? "4000"} {
            header_up X-Forwarded-Proto https
            header_up X-Forwarded-Host {http.request.host}
        }
        rewrite * /__doable/connector-proxy{path}
    }

    handle @has_subdomain {
        root * ${SITES_DIR}/{re.subdomain.1}/live
        try_files {path} /index.html
        file_server
        header {
            X-Frame-Options SAMEORIGIN
            X-Content-Type-Options nosniff
            Referrer-Policy strict-origin-when-cross-origin
            Permissions-Policy "camera=(), microphone=(), geolocation=()"
            Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob: https:; connect-src 'self' https:; media-src 'self' blob: data:; frame-src 'self' https:; object-src 'none'; base-uri 'self'"
            Strict-Transport-Security "max-age=31536000; includeSubDomains"
        }
        encode gzip
    }
${customDomainBlocks}

    # ── Fallback ──
    handle {
        respond "Not Found" 404
    }
}
`;
}

/**
 * Write the Caddyfile and reload Caddy.
 * Only works on Linux (production server).
 * On Windows/dev, just logs the config.
 */
export async function applyCaddyConfig(customDomains: DomainMapping[]): Promise<void> {
  const config = generateCaddyfile(customDomains);

  if (process.platform !== "linux") {
    console.log("[caddy-domains] Non-Linux platform, skipping Caddy reload. Generated config:");
    console.log(config);
    return;
  }

  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(CADDYFILE_PATH, config, "utf-8");
    execSync("systemctl reload caddy", { timeout: 10_000 });
    console.log(`[caddy-domains] Caddyfile updated with ${customDomains.length} custom domain(s) and Caddy reloaded`);
  } catch (err) {
    console.error("[caddy-domains] Failed to apply Caddy config:", err instanceof Error ? err.message : err);
    throw new Error("Failed to reload Caddy configuration");
  }
}
