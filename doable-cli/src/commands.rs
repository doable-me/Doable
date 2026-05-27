//! Non-interactive admin subcommands for `doable`.
//!
//! These are the scriptable counterparts to the `doable admin` TUI: they print
//! to stdout/stderr and exit with a status code, so operators (and CI) can use
//! them without a terminal. They deliberately reuse the same building blocks the
//! TUI uses — `admin::server_config::run_remote_or_local` (local `bash -c` OR
//! `ssh user@host`), the `.env` parser, and the DB layer — so every command
//! works identically whether the operator is ON the server or driving it over
//! SSH with `--remote`.
//!
//! Runtime detection: a Doable server is either *baremetal* (systemd unit
//! `doable.service` + a `doable` tmux session, `.env` under the install dir) or
//! *docker* (compose project, `.env` at `deployment/docker/.env`). Commands that
//! touch services/migrations detect which and dispatch accordingly so the same
//! `doable doctor` / `doable restart` works OOB on both.

use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use clap::Args;

use crate::admin::server_config::{generate_hex_password, is_secret_key, run_remote_or_local};
use crate::admin::RemoteCtx;

// ─────────────────────────────────────────────────────────────────────────────
// Shared args
// ─────────────────────────────────────────────────────────────────────────────

/// Options common to every non-interactive command: how to reach the target
/// (local vs `--remote` over SSH) and where its `.env` lives.
#[derive(Args, Debug, Clone)]
pub struct CommonArgs {
    /// Manage a remote server over SSH (e.g. `root@host`, `ubuntu@1.2.3.4:2222`).
    /// When omitted, operates on THIS machine.
    #[arg(long, value_name = "USER@HOST[:PORT]")]
    pub remote: Option<String>,

    /// SSH private key for `--remote`. Ignored when local.
    #[arg(long)]
    pub ssh_key: Option<PathBuf>,

    /// Explicit path to the Doable `.env`. Overrides auto-detection.
    #[arg(long, value_name = "PATH")]
    pub env_file: Option<String>,
}

impl CommonArgs {
    /// Build the optional SSH context for `run_remote_or_local`.
    fn remote_ctx(&self) -> Result<Option<RemoteCtx>> {
        match (&self.remote, &self.ssh_key) {
            (Some(spec), Some(key)) => {
                if !key.exists() {
                    return Err(anyhow!("SSH key not found: {}", key.display()));
                }
                Ok(Some(RemoteCtx { spec: spec.clone(), ssh_key: key.clone() }))
            }
            (Some(_), None) => Err(anyhow!("--remote requires --ssh-key")),
            _ => Ok(None),
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Command-specific args (referenced from main.rs's TopCmd)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Args, Debug, Clone)]
pub struct SecretsArgs {
    #[command(flatten)]
    pub common: CommonArgs,
    /// Show secret values in cleartext instead of masking them.
    #[arg(long)]
    pub reveal: bool,
}

#[derive(Args, Debug, Clone)]
pub struct LogsArgs {
    #[command(flatten)]
    pub common: CommonArgs,
    /// Number of recent log lines to show.
    #[arg(short = 'n', long, default_value_t = 200)]
    pub lines: u32,
}

#[derive(Args, Debug, Clone)]
pub struct RotateSecretsArgs {
    #[command(flatten)]
    pub common: CommonArgs,
    /// Which secret(s) to rotate.
    #[arg(value_parser = ["jwt", "internal", "encryption", "all"])]
    pub which: String,
    /// Actually apply the rotation (default is a safe dry-run).
    #[arg(long)]
    pub apply: bool,
}

#[derive(Args, Debug, Clone)]
pub struct ResetPasswordArgs {
    #[command(flatten)]
    pub common: CommonArgs,
    /// Email of the user whose password to reset.
    #[arg(long)]
    pub email: String,
    /// New password. If omitted, you'll be prompted (hidden input).
    #[arg(long)]
    pub password: Option<String>,
    /// Override DATABASE_URL (skips .env resolution).
    #[arg(long, env = "DATABASE_URL")]
    pub database_url: Option<String>,
}

#[derive(Args, Debug, Clone)]
pub struct CreateOwnerArgs {
    #[command(flatten)]
    pub common: CommonArgs,
    /// Email for the new platform owner.
    #[arg(long)]
    pub email: String,
    /// Password. If omitted, you'll be prompted (hidden input).
    #[arg(long)]
    pub password: Option<String>,
    /// Display name (defaults to the email's local part).
    #[arg(long)]
    pub name: Option<String>,
    /// Override DATABASE_URL (skips .env resolution).
    #[arg(long, env = "DATABASE_URL")]
    pub database_url: Option<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Single-quote a string for safe embedding inside a `bash -c` / ssh command.
fn shq(s: &str) -> String {
    // Close quote, escaped literal quote, reopen quote.
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Read the target's `.env` contents (local or remote). When `env_file` is set
/// it's used verbatim; otherwise we probe the canonical locations across both
/// install methods so the command works OOB regardless of how Doable was set up.
async fn read_target_env(common: &CommonArgs) -> Result<String> {
    let remote = common.remote_ctx()?;
    let cmd = match &common.env_file {
        Some(f) => format!("cat {}", shq(f)),
        None => r#"for f in "${DOABLE_ENV:-}" /opt/doable/.env "$HOME/doable/.env" /root/doable/.env ./.env ./deployment/docker/.env; do
  [ -n "$f" ] && [ -f "$f" ] && { cat "$f"; exit 0; }
done
echo "no Doable .env found (looked in /opt/doable, \$HOME/doable, /root/doable, ./, ./deployment/docker)" >&2
exit 7"#
            .to_string(),
    };
    run_remote_or_local(remote.as_ref(), &cmd)
        .await
        .map_err(|e| anyhow!("could not read .env on target: {}", e))
}

/// Pull a single `KEY=VALUE` out of raw `.env` text (last wins; quotes stripped).
fn env_get(raw: &str, key: &str) -> Option<String> {
    let mut found = None;
    for line in raw.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') {
            continue;
        }
        if let Some(eq) = l.find('=') {
            if l[..eq].trim() == key {
                let v = l[eq + 1..].trim().trim_matches('"').trim_matches('\'');
                found = Some(v.to_string());
            }
        }
    }
    found
}

/// Extract the password from a `postgres://user:pass@host/db` URL.
fn db_password(url: &str) -> Option<String> {
    let after = &url[url.find("://")? + 3..];
    let at = after.rfind('@')?;
    let userinfo = &after[..at];
    let colon = userinfo.find(':')?;
    Some(userinfo[colon + 1..].to_string())
}

/// Mask all but a short prefix of a secret.
fn mask(value: &str) -> String {
    if value.is_empty() {
        "(unset)".into()
    } else if value.len() <= 6 {
        "******".into()
    } else {
        format!("{}…(masked, {} chars)", &value[..4], value.len())
    }
}

/// Resolve the DATABASE_URL for DB-touching commands: explicit override wins,
/// else read it from the target `.env`.
async fn resolve_database_url(
    common: &CommonArgs,
    override_url: &Option<String>,
) -> Result<String> {
    if let Some(u) = override_url {
        return Ok(u.clone());
    }
    let raw = read_target_env(common).await?;
    env_get(&raw, "DATABASE_URL")
        .ok_or_else(|| anyhow!("DATABASE_URL not found in target .env (pass --database-url)"))
}

/// Run an arbitrary shell snippet on the target and return combined output.
async fn sh(common: &CommonArgs, script: &str) -> Result<String> {
    let remote = common.remote_ctx()?;
    run_remote_or_local(remote.as_ref(), script)
        .await
        .map_err(|e| anyhow!(e))
}

/// argon2id hash matching services/api/src/routes/auth/helpers.ts ARGON2_OPTS
/// (argon2id, v=19, m=65536, t=3, p=4, 32-byte output). The Node `argon2` lib
/// verifies this PHC string directly.
fn argon2id_hash(password: &str, salt_b64: &str) -> Result<String> {
    use argon2::password_hash::{PasswordHasher, SaltString};
    use argon2::{Algorithm, Argon2, Params, Version};
    let params = Params::new(65536, 3, 4, Some(32)).map_err(|e| anyhow!("argon2 params: {e}"))?;
    let hasher = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let salt = SaltString::from_b64(salt_b64).map_err(|e| anyhow!("argon2 salt: {e}"))?;
    let hash = hasher
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow!("argon2 hash: {e}"))?;
    Ok(hash.to_string())
}

/// Validate a password against the API's registerSchema rules so a CLI-set
/// password can actually be used to log in.
fn validate_password(pw: &str) -> Result<()> {
    if pw.len() < 8 || pw.len() > 128 {
        return Err(anyhow!("password must be 8–128 characters"));
    }
    let has_lower = pw.chars().any(|c| c.is_ascii_lowercase());
    let has_upper = pw.chars().any(|c| c.is_ascii_uppercase());
    let has_digit = pw.chars().any(|c| c.is_ascii_digit());
    if !(has_lower && has_upper && has_digit) {
        return Err(anyhow!(
            "password must contain a lowercase letter, an uppercase letter, and a digit"
        ));
    }
    Ok(())
}

/// Prompt for a password on the controlling TTY without echoing it.
fn prompt_password(label: &str) -> Result<String> {
    use std::io::Write;
    // Toggle echo off via `stty` (portable on the Linux servers we target).
    eprint!("{label}: ");
    std::io::stderr().flush().ok();
    let _ = std::process::Command::new("stty").arg("-echo").status();
    let mut line = String::new();
    let read = std::io::stdin().read_line(&mut line);
    let _ = std::process::Command::new("stty").arg("echo").status();
    eprintln!();
    read.context("reading password from stdin")?;
    Ok(line.trim_end_matches(['\n', '\r']).to_string())
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

/// Keys worth surfacing as secrets that don't match the generic suffix rule
/// (`_SECRET/_KEY/_PASSWORD/_TOKEN`). DOABLE_KEK is the master envelope-crypto
/// key — critical, but `_KEK` isn't `_KEY`, so it'd otherwise be missed.
fn is_displayable_secret(key: &str) -> bool {
    is_secret_key(key) || key.eq_ignore_ascii_case("DOABLE_KEK")
}

/// `doable secrets [--reveal]` — list the generated/secret values in `.env`.
pub async fn run_secrets(args: &SecretsArgs) -> Result<()> {
    let raw = read_target_env(&args.common).await?;
    println!(
        "Doable secrets ({}):",
        if args.reveal { "revealed" } else { "masked — pass --reveal to show" }
    );
    // DATABASE_URL is not suffix-matched as a secret, but its embedded password
    // is the single most-asked-for credential — surface it explicitly first.
    if let Some(url) = env_get(&raw, "DATABASE_URL") {
        let pw = db_password(&url).unwrap_or_default();
        let shown = if args.reveal { pw.clone() } else { mask(&pw) };
        println!("  {:<28} {}", "DB_PASSWORD", shown);
    }
    // Walk the raw file in order so output mirrors the operator's .env.
    let mut seen = std::collections::HashSet::new();
    for line in raw.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') {
            continue;
        }
        let Some(eq) = l.find('=') else { continue };
        let key = l[..eq].trim().to_string();
        if key == "DATABASE_URL" || !is_displayable_secret(&key) || !seen.insert(key.clone()) {
            continue;
        }
        let value = l[eq + 1..].trim().trim_matches('"').trim_matches('\'');
        let shown = if args.reveal { value.to_string() } else { mask(value) };
        println!("  {:<28} {}", key, shown);
    }
    Ok(())
}

/// `doable db:password` — print just the postgres password to stdout.
pub async fn run_db_password(common: &CommonArgs) -> Result<()> {
    let raw = read_target_env(common).await?;
    let url = env_get(&raw, "DATABASE_URL")
        .ok_or_else(|| anyhow!("DATABASE_URL not found in target .env"))?;
    println!("{}", db_password(&url).unwrap_or_default());
    Ok(())
}

/// Detect runtime + service state + ports + DB health on the target in a single
/// probe so `status`/`doctor` stay one round-trip even over SSH.
struct Probe {
    raw: String, // KEY=VALUE lines from the probe script
}

impl Probe {
    fn get(&self, key: &str) -> String {
        for line in self.raw.lines() {
            if let Some(rest) = line.strip_prefix(&format!("{key}=")) {
                return rest.trim().to_string();
            }
        }
        String::new()
    }
}

/// Shell probe emitting KEY=VALUE diagnostics. Sources the resolved `.env` so DB
/// checks use the real DATABASE_URL.
const PROBE_SCRIPT: &str = r#"
if [ -z "${ENVFILE:-}" ]; then
  for f in "${DOABLE_ENV:-}" /opt/doable/.env "$HOME/doable/.env" /root/doable/.env ./.env ./deployment/docker/.env; do
    [ -n "$f" ] && [ -f "$f" ] && { ENVFILE="$f"; break; }
  done
fi
echo "ENVFILE=$ENVFILE"
[ -n "$ENVFILE" ] && echo "ENVMODE=$(stat -c '%a' "$ENVFILE" 2>/dev/null || echo '?')"
if systemctl cat doable.service >/dev/null 2>&1; then
  echo "RUNTIME=systemd"
  echo "SERVICE_ACTIVE=$(systemctl is-active doable.service 2>/dev/null)"
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^doable-api$'; then
  echo "RUNTIME=docker"
  echo "SERVICE_ACTIVE=$(docker inspect -f '{{.State.Status}}' doable-api 2>/dev/null)"
else
  echo "RUNTIME=unknown"
fi
PORTS=$(( ss -ltnH 2>/dev/null || netstat -ltn 2>/dev/null ) | grep -oE ':(3000|4000|4001)\b' | tr -d ':' | sort -u | tr '\n' ',')
echo "PORTS=$PORTS"
if [ -n "$ENVFILE" ]; then
  set -a; . "$ENVFILE" 2>/dev/null; set +a
  if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
    echo "DB_SELECT1=$(psql "$DATABASE_URL" -tAc 'SELECT 1' 2>/dev/null | tr -d '[:space:]')"
    echo "USERS_TABLE=$(psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.users') IS NOT NULL" 2>/dev/null | tr -d '[:space:]')"
  elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^doable-postgres$'; then
    echo "DB_SELECT1=$(docker exec -i doable-postgres psql -U "${POSTGRES_USER:-doable}" -d "${POSTGRES_DB:-doable}" -tAc 'SELECT 1' 2>/dev/null | tr -d '[:space:]')"
    echo "USERS_TABLE=$(docker exec -i doable-postgres psql -U "${POSTGRES_USER:-doable}" -d "${POSTGRES_DB:-doable}" -tAc "SELECT to_regclass('public.users') IS NOT NULL" 2>/dev/null | tr -d '[:space:]')"
  fi
fi
"#;

async fn probe(common: &CommonArgs) -> Result<Probe> {
    // Seed ENVFILE from --env-file so the probe's perms/DB checks target the
    // same file the value checks use; otherwise it falls back to the canonical
    // search inside PROBE_SCRIPT.
    let pre = match &common.env_file {
        Some(f) => format!("ENVFILE={}\n", shq(f)),
        None => "ENVFILE=\n".to_string(),
    };
    let raw = sh(common, &format!("{pre}{PROBE_SCRIPT}")).await?;
    Ok(Probe { raw })
}

/// `doable status` — concise service/port summary.
pub async fn run_status(common: &CommonArgs) -> Result<()> {
    let p = probe(common).await?;
    let runtime = p.get("RUNTIME");
    println!("Runtime:  {}", if runtime.is_empty() { "unknown" } else { &runtime });
    println!("Service:  {}", blank_as(&p.get("SERVICE_ACTIVE"), "n/a"));
    let ports = p.get("PORTS");
    println!("Ports up: {}", if ports.is_empty() { "(none of 3000/4000/4001)".into() } else { ports });
    println!("DB:       {}", if p.get("DB_SELECT1") == "1" { "reachable" } else { "unreachable" });
    Ok(())
}

fn blank_as(s: &str, alt: &str) -> String {
    if s.is_empty() { alt.to_string() } else { s.to_string() }
}

/// `doable doctor` — OOB-readiness + security checks. Exits non-zero on any FAIL.
pub async fn run_doctor(common: &CommonArgs) -> Result<()> {
    let raw = read_target_env(common).await.unwrap_or_default();
    let p = probe(common).await?;
    let mut fails = 0u32;
    let mut check = |ok: Option<bool>, label: &str, detail: &str| {
        let tag = match ok {
            Some(true) => "[ ok ]",
            Some(false) => {
                fails += 1;
                "[FAIL]"
            }
            None => "[warn]",
        };
        if detail.is_empty() {
            println!("{tag} {label}");
        } else {
            println!("{tag} {label} — {detail}");
        }
    };

    // .env presence + perms
    let envfile = p.get("ENVFILE");
    check(Some(!envfile.is_empty()), ".env present", &envfile);
    let mode = p.get("ENVMODE");
    if !mode.is_empty() && mode != "?" {
        check(Some(mode == "600"), ".env permissions 0600", &format!("mode {mode}"));
    }

    // Required secrets present + non-empty
    for key in ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_KEY", "INTERNAL_SECRET", "DOABLE_KEK"] {
        let present = env_get(&raw, key).map(|v| !v.is_empty()).unwrap_or(false);
        check(Some(present), &format!("{key} set"), "");
    }

    // No placeholder / known-insecure secrets
    let insecure_markers = ["change-me", "doable-dev-key", "change-me-run-openssl"];
    let mut insecure_hits = Vec::new();
    for line in raw.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') {
            continue;
        }
        if let Some(eq) = l.find('=') {
            let k = l[..eq].trim();
            let v = l[eq + 1..].trim().trim_matches('"');
            if insecure_markers.iter().any(|m| v.contains(m)) {
                insecure_hits.push(k.to_string());
            }
        }
    }
    // Literal 'doable' DB password is the pre-bf221cc weak default.
    if let Some(url) = env_get(&raw, "DATABASE_URL") {
        if db_password(&url).as_deref() == Some("doable") {
            insecure_hits.push("DATABASE_URL(password=doable)".to_string());
        }
    }
    check(
        Some(insecure_hits.is_empty()),
        "no placeholder/insecure secrets",
        &insecure_hits.join(", "),
    );

    // DB reachable + migrations applied
    let db_ok = p.get("DB_SELECT1") == "1";
    check(Some(db_ok), "database reachable", "");
    let users = p.get("USERS_TABLE");
    if db_ok {
        check(Some(users == "t"), "schema migrated (users table)", "");
    }

    // Service + ports
    let svc = p.get("SERVICE_ACTIVE");
    if !svc.is_empty() {
        check(Some(svc == "active" || svc == "running"), "app service running", &svc);
    }
    let ports = p.get("PORTS");
    check(
        if ports.is_empty() { Some(false) } else { None },
        "app ports listening (3000/4000/4001)",
        &ports,
    );

    println!();
    if fails == 0 {
        println!("=> Doable looks healthy and secure.");
        Ok(())
    } else {
        Err(anyhow!("{fails} check(s) FAILED — see above"))
    }
}

/// `doable restart` — restart the app (systemd or docker).
pub async fn run_restart(common: &CommonArgs) -> Result<()> {
    let script = r#"
if systemctl cat doable.service >/dev/null 2>&1; then
  echo "restarting doable.service (systemd)…"
  sudo -n systemctl restart doable.service && echo "restarted." || { echo "systemctl restart failed" >&2; exit 1; }
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^doable-api$'; then
  D="/opt/doable/deployment/docker"; [ -d "$D" ] || D="$HOME/doable/deployment/docker"
  echo "restarting docker compose stack…"
  ( cd "$D" && docker compose --env-file .env restart ) && echo "restarted." || { echo "docker compose restart failed" >&2; exit 1; }
else
  echo "no doable.service or doable-api container found on this host" >&2; exit 1
fi"#;
    let out = sh(common, script).await?;
    print!("{out}");
    Ok(())
}

/// `doable logs [-n N]` — tail recent app logs (journalctl or docker compose).
pub async fn run_logs(args: &LogsArgs) -> Result<()> {
    let n = args.lines;
    let script = format!(
        r#"
if systemctl cat doable.service >/dev/null 2>&1; then
  journalctl -u doable.service -n {n} --no-pager 2>/dev/null \
    || sudo -n journalctl -u doable.service -n {n} --no-pager
elif docker ps --format '{{{{.Names}}}}' 2>/dev/null | grep -q '^doable-api$'; then
  D="/opt/doable/deployment/docker"; [ -d "$D" ] || D="$HOME/doable/deployment/docker"
  ( cd "$D" && docker compose --env-file .env logs --tail {n} )
else
  echo "no doable.service or doable-api container found on this host" >&2; exit 1
fi"#
    );
    let out = sh(&args.common, &script).await?;
    print!("{out}");
    Ok(())
}

/// `doable db:migrate` — apply database migrations (baremetal pnpm / docker compose).
pub async fn run_db_migrate(common: &CommonArgs) -> Result<()> {
    let script = r#"
if systemctl cat doable.service >/dev/null 2>&1 || command -v pnpm >/dev/null 2>&1; then
  D="/opt/doable"; [ -f "$D/package.json" ] || D="$HOME/doable"; [ -f "$D/package.json" ] || D="$(pwd)"
  echo "running migrations via pnpm in $D…"
  ( cd "$D" && pnpm db:migrate )
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^doable-postgres$'; then
  D="/opt/doable/deployment/docker"; [ -d "$D" ] || D="$HOME/doable/deployment/docker"
  echo "running migrate service via docker compose…"
  ( cd "$D" && docker compose --env-file .env run --rm migrate )
else
  echo "could not find a pnpm install dir or docker stack to run migrations" >&2; exit 1
fi"#;
    let out = sh(common, script).await?;
    print!("{out}");
    Ok(())
}

/// `doable rotate-secrets <jwt|internal|encryption|all> [--apply]` — wraps the
/// repo's scripts/rotate-secrets.sh on the target.
pub async fn run_rotate_secrets(args: &RotateSecretsArgs) -> Result<()> {
    let apply = if args.apply { " --apply" } else { "" };
    let which = &args.which;
    let script = format!(
        r#"
S=""
for d in /opt/doable "$HOME/doable" /root/doable "$(pwd)"; do
  [ -f "$d/scripts/rotate-secrets.sh" ] && {{ S="$d/scripts/rotate-secrets.sh"; break; }}
done
[ -z "$S" ] && {{ echo "scripts/rotate-secrets.sh not found under the install dir" >&2; exit 1; }}
echo "using $S"
sudo -n bash "$S" {which}{apply} 2>&1 || bash "$S" {which}{apply}
"#
    );
    let out = sh(&args.common, &script).await?;
    print!("{out}");
    Ok(())
}

/// `doable admin:reset-password --email <e> [--password <p>]` — set a user's password.
pub async fn run_reset_password(args: &ResetPasswordArgs) -> Result<()> {
    let password = match &args.password {
        Some(p) => p.clone(),
        None => prompt_password(&format!("New password for {}", args.email))?,
    };
    validate_password(&password)?;
    let salt_b64 = make_salt().await?;
    let hash = argon2id_hash(&password, &salt_b64)?;
    let db_url = resolve_database_url(&args.common, &args.database_url).await?;

    let client = crate::admin::db::connect(&db_url)
        .await
        .map_err(|e| anyhow!("connect db: {}", e))?;
    let rows_affected = client
        .execute(
            "UPDATE users SET password_hash = $1, updated_at = now() WHERE email = $2",
            &[&hash, &args.email],
        )
        .await
        .map_err(|e| anyhow!("reset-password query failed: {}", e))?;

    if rows_affected == 0 {
        return Err(anyhow!("no user with email {} (nothing changed)", args.email));
    }
    println!("password reset for {}", args.email);
    Ok(())
}

/// `doable admin:create-owner --email <e> [--password <p>] [--name <n>]`.
/// Creates a verified platform owner. The user's workspace is auto-created on
/// first `/auth/me` (ensureWorkspace), matching the normal signup path.
pub async fn run_create_owner(args: &CreateOwnerArgs) -> Result<()> {
    let password = match &args.password {
        Some(p) => p.clone(),
        None => prompt_password(&format!("Password for new owner {}", args.email))?,
    };
    validate_password(&password)?;
    let name = args
        .name
        .clone()
        .unwrap_or_else(|| args.email.split('@').next().unwrap_or("owner").to_string());
    let salt_b64 = make_salt().await?;
    let hash = argon2id_hash(&password, &salt_b64)?;
    let db_url = resolve_database_url(&args.common, &args.database_url).await?;

    let client = crate::admin::db::connect(&db_url)
        .await
        .map_err(|e| anyhow!("connect db: {}", e))?;

    // Insert (or adopt existing) then promote to platform owner. ON CONFLICT
    // keeps the command idempotent: re-running updates the password + re-promotes.
    client
        .execute(
            "INSERT INTO users \
               (email, password_hash, display_name, is_platform_admin, platform_role, is_verified_publisher) \
             VALUES ($1, $2, $3, true, 'owner'::workspace_role, true) \
             ON CONFLICT (email) DO UPDATE SET \
               password_hash = EXCLUDED.password_hash, \
               is_platform_admin = true, \
               platform_role = 'owner'::workspace_role, \
               is_verified_publisher = true, \
               updated_at = now()",
            &[&args.email, &hash, &name],
        )
        .await
        .map_err(|e| anyhow!("create-owner query failed: {}", e))?;

    println!("platform owner ready: {} (log in, workspace is created on first sign-in)", args.email);
    Ok(())
}

/// Produce a 16-byte salt, base64 (no padding) — the encoding `SaltString`
/// expects. Reuses the same entropy source as the TUI's password rotation.
async fn make_salt() -> Result<String> {
    let hex = generate_hex_password().await; // 64 hex chars = 32 bytes
    let bytes: Vec<u8> = (0..16)
        .map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap_or(0))
        .collect();
    Ok(b64_nopad(&bytes))
}

/// Standard base64 without padding (argon2 PHC salt encoding).
fn b64_nopad(input: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in input.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | (b[2] as u32);
        let chars = [
            T[((n >> 18) & 63) as usize],
            T[((n >> 12) & 63) as usize],
            T[((n >> 6) & 63) as usize],
            T[(n & 63) as usize],
        ];
        let keep = chunk.len() + 1;
        for &c in chars.iter().take(keep) {
            out.push(c as char);
        }
    }
    out
}
