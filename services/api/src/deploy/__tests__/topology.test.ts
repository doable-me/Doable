import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  resolvePublishTopology,
  computePublishLocation,
  adapterNameForTopology,
} from "../topology.js";

describe("resolvePublishTopology", () => {
  it("auto-selects 'path' when no tunnel and per_publish DNS", () => {
    assert.equal(
      resolvePublishTopology({ hasTunnel: false, dnsMode: "per_publish" }),
      "path",
    );
  });

  it("auto-selects 'subdomain' when a Cloudflare tunnel is configured", () => {
    assert.equal(
      resolvePublishTopology({ hasTunnel: true, dnsMode: "per_publish" }),
      "subdomain",
    );
  });

  it("auto-selects 'subdomain' when DNS_MODE=wildcard (admin-managed)", () => {
    assert.equal(
      resolvePublishTopology({ hasTunnel: false, dnsMode: "wildcard" }),
      "subdomain",
    );
  });

  it("honours explicit PUBLISH_MODE=path even when a tunnel exists", () => {
    assert.equal(
      resolvePublishTopology({ publishMode: "path", hasTunnel: true, dnsMode: "wildcard" }),
      "path",
    );
  });

  it("honours explicit PUBLISH_MODE=subdomain even with no infra", () => {
    assert.equal(
      resolvePublishTopology({ publishMode: "subdomain", hasTunnel: false, dnsMode: "per_publish" }),
      "subdomain",
    );
  });

  it("is case-insensitive and trims PUBLISH_MODE", () => {
    assert.equal(
      resolvePublishTopology({ publishMode: "  PATH ", hasTunnel: true, dnsMode: "wildcard" }),
      "path",
    );
  });

  it("ignores an unrecognised PUBLISH_MODE and falls back to auto", () => {
    assert.equal(
      resolvePublishTopology({ publishMode: "garbage", hasTunnel: false, dnsMode: "per_publish" }),
      "path",
    );
  });
});

describe("computePublishLocation — path topology", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ["PUBLISH_BASE_URL", "NEXT_PUBLIC_APP_URL", "DOABLE_DOMAIN", "PUBLISH_PATH_PREFIX"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.PUBLISH_BASE_URL = "https://app.example.com";
  });
  afterEach(() => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("serves production at <origin>/sites/<slug>/ with matching base path", () => {
    const loc = computePublishLocation("portfolio-x7k2m", "production", "path");
    assert.equal(loc.topology, "path");
    assert.equal(loc.url, "https://app.example.com/sites/portfolio-x7k2m/");
    assert.equal(loc.basePath, "/sites/portfolio-x7k2m/");
    assert.equal(loc.dirKey, "portfolio-x7k2m");
    assert.equal(loc.hostname, undefined);
  });

  it("prefixes preview deploys with p- so they never collide with prod", () => {
    const loc = computePublishLocation("portfolio-x7k2m", "preview", "path");
    assert.equal(loc.dirKey, "p-portfolio-x7k2m");
    assert.equal(loc.url, "https://app.example.com/sites/p-portfolio-x7k2m/");
    assert.equal(loc.basePath, "/sites/p-portfolio-x7k2m/");
  });

  it("honours a custom PUBLISH_PATH_PREFIX (leading slash optional)", () => {
    process.env.PUBLISH_PATH_PREFIX = "_apps";
    const loc = computePublishLocation("foo", "production", "path");
    assert.equal(loc.basePath, "/_apps/foo/");
    assert.equal(loc.url, "https://app.example.com/_apps/foo/");
  });

  it("strips a trailing slash on PUBLISH_BASE_URL", () => {
    process.env.PUBLISH_BASE_URL = "https://app.example.com/";
    const loc = computePublishLocation("foo", "production", "path");
    assert.equal(loc.url, "https://app.example.com/sites/foo/");
  });

  it("falls back to NEXT_PUBLIC_APP_URL when PUBLISH_BASE_URL is unset", () => {
    delete process.env.PUBLISH_BASE_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://my.host";
    const loc = computePublishLocation("foo", "production", "path");
    assert.equal(loc.url, "https://my.host/sites/foo/");
  });
});

describe("computePublishLocation — subdomain topology", () => {
  it("delegates to the cloud adapter: <slug>.<domain> with base path '/'", () => {
    const loc = computePublishLocation("portfolio-x7k2m", "production", "subdomain");
    assert.equal(loc.topology, "subdomain");
    assert.equal(loc.basePath, "/");
    assert.ok(loc.hostname && loc.hostname.startsWith("portfolio-x7k2m."));
    assert.ok(loc.url.startsWith("https://portfolio-x7k2m."));
    assert.equal(loc.dirKey, loc.hostname?.split(".")[0]);
  });
});

describe("adapterNameForTopology", () => {
  it("maps path → doable-path and subdomain → doable-cloud", () => {
    assert.equal(adapterNameForTopology("path"), "doable-path");
    assert.equal(adapterNameForTopology("subdomain"), "doable-cloud");
  });
});
