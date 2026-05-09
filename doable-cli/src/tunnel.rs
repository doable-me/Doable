//! SSH tunnel for remote admin mode.
//!
//! Spawns `ssh -N -L <local_port>:127.0.0.1:5432 user@host` so that
//! tokio-postgres can connect to localhost as if the remote Postgres were
//! running on the operator's laptop. The child process is killed on Drop.
//!
//! Why shell out instead of using a Rust SSH crate (e.g. russh):
//!   * Uses the operator's existing ~/.ssh/config, agent, and known_hosts.
//!   * Same SSH behavior as the installer's runner.rs (consistency).
//!   * Avoids carrying a megabyte of crypto code into the binary.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{Context, Result};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};

/// Owns the running `ssh -N -L` child. Killed on drop.
pub struct Tunnel {
    pub local_port: u16,
    /// Child process handle; killed in Drop.
    child: Option<Child>,
}

impl Tunnel {
    /// Default (placeholder) connection URL pointing at the tunnel.
    /// Production callers should rewrite this with the real credentials
    /// fetched from the remote .env via `fetch_remote_database_url`.
    pub fn local_url(&self) -> String {
        format!(
            "postgres://doable:doable@127.0.0.1:{}/doable",
            self.local_port
        )
    }

    /// Rewrite a remote DATABASE_URL (e.g. `postgres://doable:hex@localhost:5432/doable`)
    /// so its host:port points at our local tunnel port. Preserves user, password,
    /// and database name. Returns the input unchanged if it isn't parseable.
    pub fn rewrite_url(&self, remote_url: &str) -> String {
        rewrite_database_url_port(remote_url, self.local_port)
    }
}

impl Drop for Tunnel {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            // Best-effort kill; tunnel termination is async but we don't await.
            let _ = child.start_kill();
        }
    }
}

/// Parse a host spec like `user@host`, `user@host:port`, or just `host`.
/// Defaults: user = current OS user, port = 22.
fn parse_host_spec(spec: &str) -> (String, String, u16) {
    let (user, host_port) = match spec.find('@') {
        Some(i) => (spec[..i].to_string(), &spec[i + 1..]),
        None => (
            std::env::var("USER")
                .or_else(|_| std::env::var("USERNAME"))
                .unwrap_or_else(|_| "root".into()),
            spec,
        ),
    };
    let (host, port) = match host_port.rsplit_once(':') {
        Some((h, p)) => (h.to_string(), p.parse().unwrap_or(22)),
        None => (host_port.to_string(), 22),
    };
    (user, host, port)
}

/// Open an SSH tunnel from a free local port to the remote's 127.0.0.1:5432.
/// Returns when the local port is accepting connections (or after a 10s
/// timeout — the caller surfaces failures via tokio-postgres connect errors).
pub async fn open_postgres_tunnel(spec: &str, ssh_key: &Path) -> Result<Tunnel> {
    let (user, host, port) = parse_host_spec(spec);
    // Pick a free local port. Using a fixed offset (5433) doesn't generalize —
    // bind to :0 and read the assigned port.
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .context("bind local port for tunnel")?;
    let local_port = listener
        .local_addr()
        .context("read local port")?
        .port();
    drop(listener);

    let key_path: PathBuf = ssh_key.to_path_buf();
    let mut cmd = Command::new("ssh");
    cmd.arg("-N") // no remote command, just forwarding
        .arg("-T") // no TTY allocation
        .arg("-L")
        .arg(format!("127.0.0.1:{}:127.0.0.1:5432", local_port))
        .arg("-i")
        .arg(&key_path)
        .arg("-p")
        .arg(port.to_string())
        .arg("-o")
        .arg("ExitOnForwardFailure=yes")
        .arg("-o")
        .arg("StrictHostKeyChecking=accept-new")
        .arg("-o")
        .arg("ServerAliveInterval=30")
        .arg("-o")
        .arg("BatchMode=yes") // never prompt; fail fast if key isn't usable
        .arg(format!("{}@{}", user, host))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().with_context(|| {
        format!(
            "spawn `ssh -N -L 127.0.0.1:{}:127.0.0.1:5432 {}@{}` — is OpenSSH installed and on PATH?",
            local_port, user, host
        )
    })?;

    // Drain stderr into a shared buffer so we can surface real diagnostics
    // when the tunnel fails (e.g. "Permission denied (publickey)",
    // "Connection refused", "Host key verification failed").
    let stderr = child.stderr.take().expect("piped stderr");
    let stderr_buf: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let stderr_buf_writer = stderr_buf.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if let Ok(mut buf) = stderr_buf_writer.lock() {
                if !buf.is_empty() {
                    buf.push('\n');
                }
                buf.push_str(&line);
            }
        }
    });

    // Wait for either: (a) tunnel reachable, OR (b) ssh exits early.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    loop {
        // ssh exited before the tunnel came up? Surface its stderr.
        if let Ok(Some(status)) = child.try_wait() {
            let stderr = stderr_buf.lock().map(|s| s.clone()).unwrap_or_default();
            let stderr_trimmed = stderr.trim();
            anyhow::bail!(
                "ssh exited with {} before tunnel was ready.\n\nssh stderr:\n{}\n\nCommon causes:\n  • Wrong key for this server (Permission denied)\n  • Host key not in known_hosts and ssh refused to add it\n  • Network unreachable / firewall\n  • Key passphrase required (run `ssh-add {}` first)",
                status,
                if stderr_trimmed.is_empty() { "(no output)" } else { stderr_trimmed },
                key_path.display()
            );
        }
        if tokio::time::Instant::now() >= deadline {
            // Kill ssh and report whatever stderr we got.
            let _ = child.start_kill();
            let stderr = stderr_buf.lock().map(|s| s.clone()).unwrap_or_default();
            let stderr_trimmed = stderr.trim();
            anyhow::bail!(
                "SSH tunnel did not become reachable on 127.0.0.1:{} within 15s.\n\nssh stderr:\n{}\n\nCheck: host reachability, that remote Postgres is bound to 127.0.0.1:5432, and that `{}@{}` allows port-forwarding.",
                local_port,
                if stderr_trimmed.is_empty() { "(no output)" } else { stderr_trimmed },
                user,
                host
            );
        }
        if TcpStream::connect(("127.0.0.1", local_port)).await.is_ok() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }

    Ok(Tunnel {
        local_port,
        child: Some(child),
    })
}

/// Fetch the real DATABASE_URL from the remote server's `/opt/doable/.env`.
/// Tries unprivileged read first; falls back to `sudo -n` if needed.
/// Returns the raw URL value (e.g. `postgres://doable:abc...@localhost:5432/doable`).
pub async fn fetch_remote_database_url(spec: &str, ssh_key: &Path) -> Result<String> {
    let (user, host, port) = parse_host_spec(spec);
    let target = format!("{}@{}", user, host);

    // Single shell pipeline that:
    //   1. Tries plain cat /opt/doable/.env (works if ssh user owns or can read)
    //   2. Falls back to sudo -n cat (works if user has passwordless sudo)
    //   3. Greps the DATABASE_URL line and emits ONLY the value after =
    let remote_cmd = "set -e; \
        if [ -r /opt/doable/.env ]; then \
            grep '^DATABASE_URL=' /opt/doable/.env; \
        else \
            sudo -n cat /opt/doable/.env 2>/dev/null | grep '^DATABASE_URL=' || \
            { echo 'NEED_SUDO_PASSWORD' >&2; exit 1; }; \
        fi";

    let out = Command::new("ssh")
        .arg("-i")
        .arg(ssh_key)
        .arg("-p")
        .arg(port.to_string())
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("StrictHostKeyChecking=accept-new")
        .arg("-T")
        .arg(&target)
        .arg(remote_cmd)
        .output()
        .await
        .with_context(|| format!("spawn ssh to {}", target))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        anyhow::bail!(
            "Could not read /opt/doable/.env on {}.\n\nssh stderr:\n{}\n\nThe SSH user '{}' needs read access to /opt/doable/.env (or passwordless sudo).",
            target,
            stderr.trim(),
            user
        );
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("DATABASE_URL=") {
            // Strip surrounding quotes if any.
            let v = rest.trim().trim_matches('"').trim_matches('\'').to_string();
            if !v.is_empty() {
                return Ok(v);
            }
        }
    }
    anyhow::bail!(
        "DATABASE_URL not found in /opt/doable/.env on {} (got {} bytes of output).",
        target,
        stdout.len()
    );
}

/// Replace the host:port in a Postgres URL with `127.0.0.1:<new_port>`.
/// Conservative parser — only rewrites the host/port; preserves user, password,
/// path, query string. Falls back to returning the input unchanged if the URL
/// shape is unexpected.
fn rewrite_database_url_port(url: &str, new_port: u16) -> String {
    // Expected shape: postgres[ql]://[user[:pass]@]host[:port][/db][?...]
    let scheme_end = match url.find("://") {
        Some(i) => i + 3,
        None => return url.to_string(),
    };
    let after_scheme = &url[scheme_end..];

    // Split on the first '/' or '?' which ends the authority part.
    let auth_end = after_scheme
        .find(|c| c == '/' || c == '?')
        .unwrap_or(after_scheme.len());
    let authority = &after_scheme[..auth_end];
    let tail = &after_scheme[auth_end..];

    // Split authority on the last '@' to isolate user_info from host_part.
    let (userinfo, host_part) = match authority.rfind('@') {
        Some(i) => (&authority[..=i], &authority[i + 1..]),
        None => ("", authority),
    };
    // host_part may be `host`, `host:port`, `[ipv6]`, or `[ipv6]:port`. We
    // ignore IPv6 because the install always binds 127.0.0.1.
    let _ = host_part;

    format!(
        "{scheme}{userinfo}127.0.0.1:{port}{tail}",
        scheme = &url[..scheme_end],
        userinfo = userinfo,
        port = new_port,
        tail = tail
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrite_url_keeps_password() {
        let out = rewrite_database_url_port(
            "postgres://doable:abc123@localhost:5432/doable",
            5433,
        );
        assert_eq!(out, "postgres://doable:abc123@127.0.0.1:5433/doable");
    }

    #[test]
    fn rewrite_url_no_port() {
        let out = rewrite_database_url_port(
            "postgres://doable:p@db.internal/doable",
            5433,
        );
        assert_eq!(out, "postgres://doable:p@127.0.0.1:5433/doable");
    }
}
