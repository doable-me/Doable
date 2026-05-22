// server_config.rs — read/edit on-disk server config files (squid, cloudflared, .env, systemd)
//
// All file writes go through `sudo tee`/`sudo mv` so the TUI process itself never needs
// to be root. See sudoers/90-doable-admin for the required NOPASSWD fragment.
//
// On non-Linux hosts (or Linux hosts without these files), the loader returns
// `ConfigState::NotPresent` and the UI shows a friendly placeholder.

use std::path::Path;
use tokio::process::Command;

// ─── Paths ────────────────────────────────────────────────

pub const SQUID_CONF: &str = "/etc/squid/squid.conf";
pub const CLOUDFLARED_CONF: &str = "/etc/cloudflared/config.yml";
pub const DOABLE_ENV: &str = "/opt/doable/.env";
pub const SYSTEMD_DIR: &str = "/etc/systemd/system";

/// Knobs surfaced in the .env editor, in display order.
pub const ENV_KEYS: &[&str] = &[
    "DOABLE_HARDENING",
    "DOABLE_DEV_UID_DISABLED",
    "BUILD_HTTP_PROXY",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NODE_ENV",
    "PUBLISH_SUBDOMAIN_PREFIX",
    "CLOUDFLARED_TUNNEL_ID",
    "CORS_ORIGINS", // comma-separated list of origins the API accepts cross-origin
];

// ─── Sub-screen tabs ──────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SubView {
    Squid,
    Cloudflared,
    EnvFile,
    Systemd,
    Nft,
    Caddy,
    DbCredentials,
}

pub const SUBVIEWS: &[(SubView, &str)] = &[
    (SubView::Squid, "Squid Allowlist"),
    (SubView::Cloudflared, "Cloudflared Ingress"),
    (SubView::EnvFile, "API .env"),
    (SubView::Systemd, "systemd Hardening"),
    (SubView::Nft, "nft Egress Jail"),
    (SubView::Caddy, "Caddy Routing"),
    (SubView::DbCredentials, "DB Credentials"),
];

// ─── Data models ──────────────────────────────────────────

pub struct SquidState {
    pub allowed_domains: Vec<String>,
    pub raw: String, // full file contents — preserved on write
}

#[derive(Clone)]
pub struct IngressEntry {
    pub hostname: String, // empty → catch-all
    pub service: String,
}

pub struct CloudflaredState {
    pub ingress: Vec<IngressEntry>,
    pub raw: String,
}

pub struct EnvEntry {
    pub key: String,
    pub value: String,
    pub masked: bool,
}

pub struct EnvState {
    pub entries: Vec<EnvEntry>, // ordered: ENV_KEYS first, then any other masked secrets
    pub raw: String,
}

pub struct SystemdUnit {
    pub name: String,
    pub directives: Vec<(String, String)>, // (key, value) for hardening-relevant lines
}

pub struct SystemdState {
    pub units: Vec<SystemdUnit>,
}

pub struct NftRule {
    /// Raw rule line (e.g., "meta skuid 10001-65000 ip daddr 127.0.0.1 tcp dport 3128 accept")
    pub rule: String,
    /// What this rule does — humanized for the operator (e.g., "ALLOW Squid").
    pub summary: String,
}

pub struct NftState {
    /// True if the doable_egress table is loaded into the kernel.
    pub installed: bool,
    /// Skuid range covered by the policy (e.g., "10001-65000"). Best-effort parse.
    pub skuid_range: Option<String>,
    /// Default policy of the output chain ("accept" or "drop").
    pub policy: Option<String>,
    /// Parsed rules, in order.
    pub rules: Vec<NftRule>,
    /// Raw `nft list table inet doable_egress` output.
    pub raw: String,
}

pub struct CaddyMatcher {
    /// Hostname or regex matcher pattern (e.g., "*.doable.me", "@subdomain ...")
    pub pattern: String,
    /// Brief explanation of what the matcher routes to.
    pub target: String,
}

pub struct CaddyState {
    /// Path to the Caddyfile that was read (typically /etc/caddy/Caddyfile).
    pub path: String,
    /// Top-level matchers / hostnames the Caddyfile binds.
    pub matchers: Vec<CaddyMatcher>,
    /// Raw Caddyfile contents (for power-user inspection).
    pub raw: String,
}

pub enum ConfigState<T> {
    Loaded(T),
    NotPresent(String), // human-readable reason
    Error(String),
}

// ─── Loaders ──────────────────────────────────────────────

pub async fn load_squid() -> ConfigState<SquidState> {
    if !Path::new(SQUID_CONF).exists() {
        return ConfigState::NotPresent(format!(
            "{} not found — this host is not a doable server.",
            SQUID_CONF
        ));
    }
    match tokio::fs::read_to_string(SQUID_CONF).await {
        Ok(raw) => {
            let allowed_domains = parse_squid_allowlist(&raw);
            ConfigState::Loaded(SquidState {
                allowed_domains,
                raw,
            })
        }
        Err(e) => ConfigState::Error(format!("Failed to read {}: {}", SQUID_CONF, e)),
    }
}

pub async fn load_cloudflared() -> ConfigState<CloudflaredState> {
    if !Path::new(CLOUDFLARED_CONF).exists() {
        return ConfigState::NotPresent(format!(
            "{} not found — this host is not a doable server.",
            CLOUDFLARED_CONF
        ));
    }
    match tokio::fs::read_to_string(CLOUDFLARED_CONF).await {
        Ok(raw) => {
            let ingress = parse_cloudflared_ingress(&raw);
            ConfigState::Loaded(CloudflaredState { ingress, raw })
        }
        Err(e) => ConfigState::Error(format!("Failed to read {}: {}", CLOUDFLARED_CONF, e)),
    }
}

pub async fn load_env() -> ConfigState<EnvState> {
    if !Path::new(DOABLE_ENV).exists() {
        return ConfigState::NotPresent(format!(
            "{} not found — this host is not a doable server.",
            DOABLE_ENV
        ));
    }
    match tokio::fs::read_to_string(DOABLE_ENV).await {
        Ok(raw) => {
            let entries = parse_env_entries(&raw);
            ConfigState::Loaded(EnvState { entries, raw })
        }
        Err(e) => ConfigState::Error(format!("Failed to read {}: {}", DOABLE_ENV, e)),
    }
}

pub async fn load_systemd() -> ConfigState<SystemdState> {
    if !Path::new(SYSTEMD_DIR).exists() {
        return ConfigState::NotPresent(format!(
            "{} not found — this host is not a doable server.",
            SYSTEMD_DIR
        ));
    }
    let mut units: Vec<SystemdUnit> = Vec::new();
    let mut rd = match tokio::fs::read_dir(SYSTEMD_DIR).await {
        Ok(r) => r,
        Err(e) => return ConfigState::Error(format!("Failed to scan {}: {}", SYSTEMD_DIR, e)),
    };
    while let Ok(Some(entry)) = rd.next_entry().await {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("doable") || !name.ends_with(".service") {
            continue;
        }
        let path = entry.path();
        if let Ok(raw) = tokio::fs::read_to_string(&path).await {
            let directives = parse_systemd_directives(&raw);
            units.push(SystemdUnit { name, directives });
        }
    }
    units.sort_by(|a, b| a.name.cmp(&b.name));
    if units.is_empty() {
        return ConfigState::NotPresent(format!(
            "No doable*.service units found in {}.",
            SYSTEMD_DIR
        ));
    }
    ConfigState::Loaded(SystemdState { units })
}

/// Read-only nft view. Shells out to `sudo -n nft list table inet doable_egress`.
/// Read-only because nft rule edits are too high-risk for a TUI confirm flow —
/// a typo locks the operator out at the kernel level. Operators who need
/// to change egress rules should re-run setup-server.sh's nft section, which
/// is the canonical source of truth.
pub async fn load_nft() -> ConfigState<NftState> {
    // Use `nft -a` to include rule handles (useful if we ever add a delete
    // affordance). We intentionally invoke `sudo -n` (non-interactive); on
    // dev hosts without sudoers entry this returns Err and we render
    // NotPresent rather than blocking.
    let out = tokio::process::Command::new("sudo")
        .arg("-n")
        .arg("nft")
        .arg("list")
        .arg("table")
        .arg("inet")
        .arg("doable_egress")
        .output()
        .await;
    let raw = match out {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr).to_string();
            if stderr.contains("No such file") || stderr.contains("does not exist") {
                return ConfigState::NotPresent(
                    "nft table inet doable_egress not loaded — egress jail not active on this host.".into(),
                );
            }
            return ConfigState::NotPresent(format!(
                "Could not read nft table (sudo -n nft requires either root or NOPASSWD for nft list): {}",
                stderr.trim()
            ));
        }
        Err(e) => {
            return ConfigState::NotPresent(format!(
                "nft binary not callable: {} — this host likely isn't a doable server.",
                e
            ))
        }
    };
    let (skuid_range, policy, rules) = parse_nft_doable_egress(&raw);
    ConfigState::Loaded(NftState {
        installed: true,
        skuid_range,
        policy,
        rules,
        raw,
    })
}

/// Read-only Caddy view. Tries /etc/caddy/Caddyfile first, then any *.caddy
/// alongside it. Parses host-level matchers (regex blocks like
/// `@subdomain ...` and bare hostnames at column 0).
pub async fn load_caddy() -> ConfigState<CaddyState> {
    const CADDYFILE_CANDIDATES: &[&str] = &["/etc/caddy/Caddyfile", "/opt/doable/Caddyfile"];
    let mut found: Option<(String, String)> = None;
    for p in CADDYFILE_CANDIDATES {
        if Path::new(p).exists() {
            match tokio::fs::read_to_string(p).await {
                Ok(raw) => {
                    found = Some((p.to_string(), raw));
                    break;
                }
                Err(e) => {
                    return ConfigState::Error(format!("Failed to read {}: {}", p, e));
                }
            }
        }
    }
    let (path, raw) = match found {
        Some(v) => v,
        None => {
            return ConfigState::NotPresent(
                "No Caddyfile found at /etc/caddy/Caddyfile or /opt/doable/Caddyfile.".into(),
            )
        }
    };
    let matchers = parse_caddy_matchers(&raw);
    ConfigState::Loaded(CaddyState { path, matchers, raw })
}

// ─── Parsers ──────────────────────────────────────────────

/// Parse `acl allowed_dst dstdomain <hostname>` lines from squid.conf.
/// Whitespace tolerant; ignores comments.
pub fn parse_squid_allowlist(raw: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || trimmed.is_empty() {
            continue;
        }
        // Tokenize on whitespace
        let toks: Vec<&str> = trimmed.split_whitespace().collect();
        // Match: acl <name> dstdomain <host> [<host>...]
        if toks.len() >= 4 && toks[0] == "acl" && toks[1] == "allowed_dst" && toks[2] == "dstdomain"
        {
            for h in &toks[3..] {
                let h = h.trim();
                if !h.is_empty() && !out.iter().any(|x: &String| x == h) {
                    out.push(h.to_string());
                }
            }
        }
    }
    out
}

/// Rewrite squid.conf with a new allowlist. Preserves all non-allowlist lines.
/// All existing `acl allowed_dst dstdomain ...` lines are replaced with a single
/// canonical block (one host per line) inserted at the position of the first
/// existing allowlist line, or appended if none existed.
pub fn rewrite_squid_allowlist(raw: &str, hosts: &[String]) -> String {
    let mut out = String::with_capacity(raw.len() + 64);
    let mut wrote_block = false;
    let mut found_any = false;
    for line in raw.lines() {
        let trimmed = line.trim_start();
        let toks: Vec<&str> = trimmed.split_whitespace().collect();
        let is_allowlist = toks.len() >= 4
            && toks[0] == "acl"
            && toks[1] == "allowed_dst"
            && toks[2] == "dstdomain";
        if is_allowlist {
            found_any = true;
            if !wrote_block {
                for h in hosts {
                    out.push_str(&format!("acl allowed_dst dstdomain {}\n", h));
                }
                wrote_block = true;
            }
            // else skip this line — it's a duplicate to coalesce
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }
    if !found_any {
        // Append a new block at end
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str("# doable-admin: managed allowlist\n");
        for h in hosts {
            out.push_str(&format!("acl allowed_dst dstdomain {}\n", h));
        }
    }
    out
}

/// Best-effort parse of cloudflared `config.yml` ingress block.
/// We only need entries' hostname → service mapping; no anchors/refs expected.
pub fn parse_cloudflared_ingress(raw: &str) -> Vec<IngressEntry> {
    let mut out = Vec::new();
    let mut in_ingress = false;
    let mut cur_host: Option<String> = None;
    let mut cur_svc: Option<String> = None;
    for line in raw.lines() {
        let untrimmed = line;
        let trimmed = line.trim();
        // Skip comments and blanks
        if trimmed.starts_with('#') {
            continue;
        }
        // Detect end of ingress block: a top-level key (no leading spaces) other than `ingress:`
        if in_ingress
            && !untrimmed.starts_with(' ')
            && !untrimmed.starts_with('\t')
            && !trimmed.is_empty()
            && !trimmed.starts_with("- ")
            && trimmed != "ingress:"
            && trimmed.contains(':')
        {
            // Flush pending entry before exiting
            if let (Some(h), Some(s)) = (cur_host.take(), cur_svc.take()) {
                out.push(IngressEntry {
                    hostname: h,
                    service: s,
                });
            } else if let Some(s) = cur_svc.take() {
                // catch-all (no hostname)
                out.push(IngressEntry {
                    hostname: String::new(),
                    service: s,
                });
            }
            in_ingress = false;
        }
        if trimmed == "ingress:" {
            in_ingress = true;
            continue;
        }
        if !in_ingress {
            continue;
        }
        // New list item starts with "- "
        if trimmed.starts_with("- ") {
            // Flush previous
            if let (Some(h), Some(s)) = (cur_host.take(), cur_svc.take()) {
                out.push(IngressEntry {
                    hostname: h,
                    service: s,
                });
            } else if let Some(s) = cur_svc.take() {
                out.push(IngressEntry {
                    hostname: String::new(),
                    service: s,
                });
            }
            cur_host = None;
            cur_svc = None;
            // The "- " line itself may carry a key (e.g. "- hostname: foo")
            let after = trimmed.trim_start_matches("- ").trim();
            if let Some((k, v)) = split_kv(after) {
                if k == "hostname" {
                    cur_host = Some(v);
                } else if k == "service" {
                    cur_svc = Some(v);
                }
            }
            continue;
        }
        // Continuation key on existing item
        if let Some((k, v)) = split_kv(trimmed) {
            if k == "hostname" {
                cur_host = Some(v);
            } else if k == "service" {
                cur_svc = Some(v);
            }
        }
    }
    // Flush trailing
    if let (Some(h), Some(s)) = (cur_host.take(), cur_svc.take()) {
        out.push(IngressEntry {
            hostname: h,
            service: s,
        });
    } else if let Some(s) = cur_svc.take() {
        out.push(IngressEntry {
            hostname: String::new(),
            service: s,
        });
    }
    out
}

/// Replace the `ingress:` block in the raw YAML with the given entries.
/// Catch-all (empty hostname) entries are emitted as just `service:`.
pub fn rewrite_cloudflared_ingress(raw: &str, entries: &[IngressEntry]) -> String {
    let mut out = String::with_capacity(raw.len() + 128);
    let mut in_ingress = false;
    let mut wrote_block = false;
    for line in raw.lines() {
        let untrimmed = line;
        let trimmed = line.trim();
        if !in_ingress {
            out.push_str(line);
            out.push('\n');
            if trimmed == "ingress:" {
                in_ingress = true;
                // Emit the new block immediately
                for e in entries {
                    if e.hostname.is_empty() {
                        out.push_str(&format!("  - service: {}\n", e.service));
                    } else {
                        out.push_str(&format!("  - hostname: {}\n", e.hostname));
                        out.push_str(&format!("    service: {}\n", e.service));
                    }
                }
                wrote_block = true;
            }
            continue;
        }
        // We are inside the old ingress block — skip its body until we hit a top-level key.
        let is_top_level_other_key = !untrimmed.starts_with(' ')
            && !untrimmed.starts_with('\t')
            && !trimmed.is_empty()
            && !trimmed.starts_with("- ")
            && trimmed != "ingress:"
            && trimmed.contains(':');
        if is_top_level_other_key {
            in_ingress = false;
            out.push_str(line);
            out.push('\n');
            continue;
        }
        // skip body lines of old ingress
    }
    if !wrote_block {
        // No ingress block existed — append one
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str("ingress:\n");
        for e in entries {
            if e.hostname.is_empty() {
                out.push_str(&format!("  - service: {}\n", e.service));
            } else {
                out.push_str(&format!("  - hostname: {}\n", e.hostname));
                out.push_str(&format!("    service: {}\n", e.service));
            }
        }
    }
    out
}

fn split_kv(s: &str) -> Option<(String, String)> {
    let s = s.trim();
    let idx = s.find(':')?;
    let key = s[..idx].trim().to_string();
    let val = s[idx + 1..].trim().trim_matches('"').trim_matches('\'').to_string();
    Some((key, val))
}

/// Parse the .env file into the configured display order, then add any
/// remaining masked-only entries (matched by suffix patterns).
pub fn parse_env_entries(raw: &str) -> Vec<EnvEntry> {
    use std::collections::HashMap;
    let mut map: HashMap<String, String> = HashMap::new();
    for line in raw.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') {
            continue;
        }
        if let Some(eq) = l.find('=') {
            let k = l[..eq].trim().to_string();
            let v = l[eq + 1..].trim();
            // Strip surrounding quotes
            let v = v.trim_matches('"').trim_matches('\'').to_string();
            map.insert(k, v);
        }
    }
    let mut out: Vec<EnvEntry> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for k in ENV_KEYS {
        let value = map.get(*k).cloned().unwrap_or_default();
        out.push(EnvEntry {
            key: (*k).to_string(),
            value,
            masked: is_secret_key(k),
        });
        seen.insert(k.to_string());
    }
    // Also surface any other secrets so the admin can confirm they're set, masked.
    let mut extras: Vec<(&String, &String)> = map
        .iter()
        .filter(|(k, _)| !seen.contains(*k) && is_secret_key(k))
        .collect();
    extras.sort_by(|a, b| a.0.cmp(b.0));
    for (k, v) in extras {
        out.push(EnvEntry {
            key: k.clone(),
            value: v.clone(),
            masked: true,
        });
    }
    out
}

pub fn is_secret_key(k: &str) -> bool {
    let u = k.to_ascii_uppercase();
    u.ends_with("_SECRET")
        || u.ends_with("_KEY")
        || u.ends_with("_PASSWORD")
        || u.ends_with("_TOKEN")
}

/// Render a value masked to `********` (length-stable) when needed.
pub fn display_env_value(e: &EnvEntry) -> String {
    if e.masked && !e.value.is_empty() {
        "********".to_string()
    } else if e.value.is_empty() {
        "(unset)".to_string()
    } else {
        e.value.clone()
    }
}

/// Replace (or insert) a single `KEY=VALUE` in the raw .env file.
/// Preserves comments and ordering of unrelated lines. If the key was unquoted
/// before, stays unquoted; if previously quoted, the new value is quoted.
pub fn upsert_env_value(raw: &str, key: &str, new_value: &str) -> String {
    let mut out = String::with_capacity(raw.len() + new_value.len() + key.len() + 4);
    let mut found = false;
    for line in raw.lines() {
        let l = line.trim_start();
        if l.starts_with('#') || l.is_empty() {
            out.push_str(line);
            out.push('\n');
            continue;
        }
        if let Some(eq) = l.find('=') {
            let k = l[..eq].trim();
            if k == key {
                let was_quoted = {
                    let v = l[eq + 1..].trim();
                    (v.starts_with('"') && v.ends_with('"') && v.len() >= 2)
                        || (v.starts_with('\'') && v.ends_with('\'') && v.len() >= 2)
                };
                if was_quoted {
                    out.push_str(&format!("{}=\"{}\"\n", key, new_value));
                } else {
                    out.push_str(&format!("{}={}\n", key, new_value));
                }
                found = true;
                continue;
            }
        }
        out.push_str(line);
        out.push('\n');
    }
    if !found {
        if !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str(&format!("{}={}\n", key, new_value));
    }
    out
}

/// systemd directive keys we surface (read-only).
pub const SYSTEMD_KEYS: &[&str] = &[
    "User",
    "Group",
    "NoNewPrivileges",
    "ProtectSystem",
    "ProtectHome",
    "PrivateTmp",
    "RestrictAddressFamilies",
    "SystemCallFilter",
    "CapabilityBoundingSet",
    "AmbientCapabilities",
    "ReadWritePaths",
    "ReadOnlyPaths",
    "InaccessiblePaths",
];

pub fn parse_systemd_directives(raw: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for line in raw.lines() {
        let l = line.trim();
        if l.starts_with('#') || l.starts_with(';') || l.is_empty() {
            continue;
        }
        if let Some(eq) = l.find('=') {
            let k = l[..eq].trim();
            let v = l[eq + 1..].trim();
            if SYSTEMD_KEYS.iter().any(|x| *x == k) {
                out.push((k.to_string(), v.to_string()));
            }
        }
    }
    out
}

/// Parse `nft list table inet doable_egress` output into (skuid_range, policy, rules).
/// Output format example:
///   table inet doable_egress {
///       chain output {
///           type filter hook output priority filter; policy accept;
///           oif "lo" accept
///           meta skuid 10001-65000 ip daddr 127.0.0.53 udp dport 53 accept
///           meta skuid 10001-65000 ip daddr 127.0.0.1 tcp dport 3128 accept
///           meta skuid 10001-65000 counter packets 0 bytes 0 drop
///       }
///   }
pub fn parse_nft_doable_egress(raw: &str) -> (Option<String>, Option<String>, Vec<NftRule>) {
    let mut skuid: Option<String> = None;
    let mut policy: Option<String> = None;
    let mut rules: Vec<NftRule> = Vec::new();
    for line in raw.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') || l.starts_with('}') {
            continue;
        }
        if l.starts_with("type filter hook output priority filter") {
            // policy accept; / policy drop;
            if let Some(p) = l.split("policy ").nth(1) {
                let p = p.trim_end_matches(';').trim();
                policy = Some(p.to_string());
            }
            continue;
        }
        if l.starts_with("table inet") || l.starts_with("chain output") {
            continue;
        }
        // Body rules.
        if l.contains("skuid") && skuid.is_none() {
            // Extract the skuid range like "10001-65000".
            if let Some(after) = l.split("skuid").nth(1) {
                let token = after.trim().split_whitespace().next().unwrap_or("");
                if !token.is_empty() {
                    skuid = Some(token.to_string());
                }
            }
        }
        let summary = if l.starts_with("oif \"lo\"") || l.starts_with("oif lo") {
            "ALLOW loopback (lo)".to_string()
        } else if l.contains("udp dport 53") || l.contains("tcp dport 53") {
            "ALLOW DNS (53)".to_string()
        } else if l.contains("dport 3128") {
            "ALLOW Squid proxy (127.0.0.1:3128)".to_string()
        } else if l.contains(" drop") {
            "DROP everything else from sandboxed UIDs".to_string()
        } else if l.contains("accept") {
            "ALLOW (custom rule)".to_string()
        } else {
            "(custom)".to_string()
        };
        rules.push(NftRule {
            rule: l.to_string(),
            summary,
        });
    }
    (skuid, policy, rules)
}

/// Parse top-level Caddyfile site addresses into matchers. Looks at lines that
/// open a site block — i.e., a line at column 0 ending with `{` whose tokens
/// before `{` are hostnames or address patterns.
pub fn parse_caddy_matchers(raw: &str) -> Vec<CaddyMatcher> {
    let mut out: Vec<CaddyMatcher> = Vec::new();
    let mut depth: i32 = 0;
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let opens = trimmed.matches('{').count() as i32;
        let closes = trimmed.matches('}').count() as i32;
        // Only parse top-level (depth 0) site openers.
        let was_top_level = depth == 0;
        depth = (depth + opens - closes).max(0);
        if !was_top_level || opens == 0 {
            continue;
        }
        // Strip trailing `{` and any inline comment.
        let mut head = trimmed.trim_end_matches('{').trim().to_string();
        if let Some(hash) = head.find('#') {
            head = head[..hash].trim().to_string();
        }
        if head.is_empty() {
            continue;
        }
        // Skip caddy global options block — `{` at column 0 with no preceding text.
        // (Already excluded above by the `opens == 0` case for the closing brace.)
        let target = if head.contains("re.subdomain") || head.contains("(\\w") || head.contains("regex(") {
            "Per-publish subdomain → SITES_DIR".into()
        } else if head.contains("api.") {
            "API → 127.0.0.1:4000".into()
        } else if head.contains("ws.") {
            "WebSocket → 127.0.0.1:4001".into()
        } else if head == "*" || head.contains("doable.me") {
            "Web → 127.0.0.1:3000".into()
        } else {
            "(custom)".into()
        };
        out.push(CaddyMatcher {
            pattern: head,
            target,
        });
    }
    out
}

// ─── Apply (sudo-mediated writes) ─────────────────────────

/// Write `contents` to `target` via `sudo tee /tmp/<basename>.new && sudo mv ...`.
/// Helper to avoid the TUI process needing root itself.
async fn sudo_write_atomic(
    target: &str,
    staging: &str,
    contents: &str,
) -> Result<(), String> {
    // Step 1: write to /tmp via plain rust IO (operator's home is fine, /tmp is world-writable)
    if let Err(e) = tokio::fs::write(staging, contents).await {
        return Err(format!("Failed to stage {}: {}", staging, e));
    }
    // Step 2: sudo mv into place
    let out = Command::new("sudo")
        .args(["-n", "mv", staging, target])
        .output()
        .await
        .map_err(|e| format!("sudo mv failed to spawn: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!(
            "sudo mv {} -> {} failed: {}",
            staging,
            target,
            stderr.trim()
        ));
    }
    Ok(())
}

pub async fn apply_squid(new_raw: &str) -> Result<(), String> {
    sudo_write_atomic(SQUID_CONF, "/tmp/squid.conf.new", new_raw).await?;
    // Reconfigure
    let out = Command::new("sudo")
        .args(["-n", "/usr/sbin/squid", "-k", "reconfigure"])
        .output()
        .await
        .map_err(|e| format!("squid reconfigure failed to spawn: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("squid reconfigure failed: {}", stderr.trim()));
    }
    Ok(())
}

pub async fn apply_cloudflared(new_raw: &str) -> Result<(), String> {
    // Stage the new config first so validate runs against it
    let staging = "/tmp/config.yml.new";
    if let Err(e) = tokio::fs::write(staging, new_raw).await {
        return Err(format!("Failed to stage {}: {}", staging, e));
    }
    // Validate BEFORE moving into place
    let validate = Command::new("sudo")
        .args([
            "-n",
            "/usr/bin/cloudflared",
            "--config",
            staging,
            "tunnel",
            "ingress",
            "validate",
        ])
        .output()
        .await
        .map_err(|e| format!("cloudflared validate failed to spawn: {}", e))?;
    if !validate.status.success() {
        let stderr = String::from_utf8_lossy(&validate.stderr);
        let stdout = String::from_utf8_lossy(&validate.stdout);
        // Cleanup staging
        let _ = tokio::fs::remove_file(staging).await;
        return Err(format!(
            "cloudflared validate failed: {} {}",
            stderr.trim(),
            stdout.trim()
        ));
    }
    // Move into place
    let mv = Command::new("sudo")
        .args(["-n", "mv", staging, CLOUDFLARED_CONF])
        .output()
        .await
        .map_err(|e| format!("sudo mv failed to spawn: {}", e))?;
    if !mv.status.success() {
        let stderr = String::from_utf8_lossy(&mv.stderr);
        return Err(format!("sudo mv failed: {}", stderr.trim()));
    }
    // Reload service
    let reload = Command::new("sudo")
        .args(["-n", "/usr/bin/systemctl", "reload", "cloudflared"])
        .output()
        .await
        .map_err(|e| format!("systemctl reload failed to spawn: {}", e))?;
    if !reload.status.success() {
        let stderr = String::from_utf8_lossy(&reload.stderr);
        return Err(format!("systemctl reload cloudflared failed: {}", stderr.trim()));
    }
    Ok(())
}

pub async fn apply_env(new_raw: &str) -> Result<(), String> {
    sudo_write_atomic(DOABLE_ENV, "/tmp/.env.new", new_raw).await?;
    let out = Command::new("sudo")
        .args(["-n", "/usr/bin/systemctl", "restart", "doable.service"])
        .output()
        .await
        .map_err(|e| format!("systemctl restart failed to spawn: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("systemctl restart doable.service failed: {}", stderr.trim()));
    }
    Ok(())
}

// ─── DB Credentials sub-view ──────────────────────────────

/// Snapshot of the DB connection details we display in the DB Credentials
/// sub-view. The password is held only for the lifetime of admin's process —
/// it is NEVER persisted by us; we just parse it back out of `app.db_url`
/// (which the operator handed us).
pub struct DbCredentialsState {
    /// Full server-local URL (with password).  When admin connected via SSH
    /// tunnel, we rewrite the host portion back from `127.0.0.1:<tunnel>` to
    /// `localhost:5432` so the operator sees what the SERVER sees.
    pub db_url: String,
    pub user: String,
    pub password: String,
    pub db: String,
    /// Friendly host label for the URL the operator is actually connected to
    /// (e.g. "localhost (server-side)" or "127.0.0.1:55432 (your local tunnel)").
    pub host_label: String,
    /// One-line provenance — where these creds were obtained from.
    pub source_note: String,
    /// When admin is connected through an SSH tunnel, this is the literal URL
    /// that the local `doable admin` process connects to (host = 127.0.0.1,
    /// port = forwarded tunnel port). `None` when running ON the server.
    pub tunnel_url: Option<String>,
}

/// Parse `postgres://user:pass@host:port/db` (or `postgresql://...`) into its
/// 4 user-visible parts.  Returns None for malformed URLs.
pub fn parse_db_url(url: &str) -> Option<(String, String, String, String)> {
    let scheme_end = url.find("://")?;
    let after_scheme = &url[scheme_end + 3..];
    let at = after_scheme.rfind('@')?;
    let userinfo = &after_scheme[..at];
    let hostpart = &after_scheme[at + 1..];
    let colon = userinfo.find(':')?;
    let user = userinfo[..colon].to_string();
    let pass = userinfo[colon + 1..].to_string();
    // Split host:port from /db (path may also have ?params — we ignore them
    // for display purposes; rotation rewrites the URL fresh).
    let (hostport, db) = match hostpart.find('/') {
        Some(slash) => {
            let h = hostpart[..slash].to_string();
            let rest = &hostpart[slash + 1..];
            let d = match rest.find('?') {
                Some(q) => rest[..q].to_string(),
                None => rest.to_string(),
            };
            (h, d)
        }
        None => (hostpart.to_string(), String::new()),
    };
    Some((user, pass, hostport, db))
}

/// Build the DB Credentials display state from the live db_url plus the
/// optional remote SSH context.  No I/O — purely a parse + label.
pub fn build_db_credentials_state(
    db_url: &str,
    remote: Option<&crate::admin::RemoteCtx>,
) -> Result<DbCredentialsState, String> {
    let (user, password, hostport, db) =
        parse_db_url(db_url).ok_or_else(|| format!("Could not parse db url"))?;

    if let Some(ctx) = remote {
        // Tunnel mode: rewrite host back to server-local for the canonical URL.
        let server_url = format!("postgres://{}:{}@localhost:5432/{}", user, password, db);
        let host_label = format!("{} (your local tunnel)", hostport);
        let source_note = format!(
            "fetched from /opt/doable/.env on the server (via SSH to {})",
            ctx.spec
        );
        Ok(DbCredentialsState {
            db_url: server_url,
            user,
            password,
            db,
            host_label,
            source_note,
            tunnel_url: Some(format!("postgres://{}:{}@{}/{}",
                "doable",
                "********",
                hostport,
                "doable",
            )),
        })
    } else {
        // Local mode: the URL is already server-local.
        let host_label = format!("{} (server-side)", hostport);
        let source_note = "read from /opt/doable/.env on this host".to_string();
        Ok(DbCredentialsState {
            db_url: db_url.to_string(),
            user,
            password,
            db,
            host_label,
            source_note,
            tunnel_url: None,
        })
    }
}

/// Run a shell command either locally (under `bash -c`) or on the remote
/// server via SSH.  Used by the rotation pipeline.  Returns combined
/// stdout+stderr on success, or a single-line error string on failure
/// (non-zero status, ssh failure, etc).
pub async fn run_remote_or_local(
    remote: Option<&crate::admin::RemoteCtx>,
    shell_cmd: &str,
) -> Result<String, String> {
    let out = if let Some(ctx) = remote {
        // Remote: ssh -i <key> -o BatchMode=yes -o StrictHostKeyChecking=accept-new <spec> '<cmd>'
        let key = ctx.ssh_key.to_string_lossy().to_string();
        Command::new("ssh")
            .arg("-i")
            .arg(&key)
            .arg("-o")
            .arg("BatchMode=yes")
            .arg("-o")
            .arg("StrictHostKeyChecking=accept-new")
            .arg(&ctx.spec)
            .arg(shell_cmd)
            .output()
            .await
            .map_err(|e| format!("ssh failed to spawn: {}", e))?
    } else {
        // Local: bash -c '<cmd>'
        Command::new("bash")
            .arg("-c")
            .arg(shell_cmd)
            .output()
            .await
            .map_err(|e| format!("bash failed to spawn: {}", e))?
    };
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if out.status.success() {
        // Combined output for visibility (stdout first, then stderr if any).
        let mut combined = stdout;
        if !stderr.trim().is_empty() {
            if !combined.is_empty() {
                combined.push('\n');
            }
            combined.push_str(&stderr);
        }
        Ok(combined)
    } else {
        let body = if stderr.trim().is_empty() {
            stdout
        } else {
            stderr
        };
        Err(body.trim().to_string())
    }
}

/// Generate a 64-hex-char password (32 random bytes) without pulling in the
/// `rand` crate.  Mixes nanos timing + a self-hashing FNV-1a chain to stretch
/// entropy enough to make brute-force unattractive for a one-shot rotation.
/// For higher-grade randomness we fall back to `openssl rand -hex 32` when
/// available (which we already require on every doable server for setup).
pub async fn generate_hex_password() -> String {
    // Try openssl first.
    if let Ok(out) = Command::new("openssl")
        .args(["rand", "-hex", "32"])
        .output()
        .await
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit()) {
                return s;
            }
        }
    }
    // Fallback: nanos-seeded FNV chain. Not cryptographically pristine but
    // good enough as a last-ditch (the operator can always re-rotate).
    use std::time::{SystemTime, UNIX_EPOCH};
    let mut state: u64 = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0xcbf29ce484222325);
    let pid = std::process::id() as u64;
    state ^= pid.wrapping_mul(0x100000001b3);
    let mut out = String::with_capacity(64);
    for _ in 0..32 {
        state ^= state.wrapping_shl(13);
        state ^= state.wrapping_shr(7);
        state ^= state.wrapping_shl(17);
        state = state.wrapping_mul(0x100000001b3);
        let byte = (state & 0xff) as u8;
        out.push_str(&format!("{:02x}", byte));
    }
    out
}
