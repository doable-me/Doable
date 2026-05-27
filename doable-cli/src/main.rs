//! `doable` — all-in-one TUI for Doable.
//!
//! Three modes, dispatched on the CLI:
//!   * `doable install [...]`            — fresh server provisioning
//!   * `doable admin`                    — manage THIS server
//!   * `doable admin --remote user@host` — manage a remote server over SSH
//!   * `doable`                          — interactive mode picker (no subcmd)
//!
//! See `installer/`, `admin/`, `tunnel`, `mode_picker` for the heavy lifting.

mod admin;
mod commands;
mod file_picker;
mod installer;
mod mode_picker;
mod term;
mod tunnel;

use std::io;

use anyhow::{Context, Result};
use clap::Parser;

use crate::admin::{AdminOpts, RemoteCtx};
use crate::installer::cli::Args as InstallerArgs;
use crate::mode_picker::TopLevelChoice;

/// Top-level CLI for `doable`.
#[derive(Parser, Debug)]
#[command(name = "doable", version, about, long_about = None)]
struct TopCli {
    #[command(subcommand)]
    cmd: Option<TopCmd>,
}

#[derive(Parser, Debug)]
enum TopCmd {
    /// Provision a fresh Doable server (interactive form by default).
    Install(InstallerArgs),
    /// Manage an existing Doable server (local or remote over SSH).
    Admin(AdminCli),

    // ── Non-interactive ops (no TUI; print + exit). ──
    /// Run OOB-readiness + security diagnostics on a Doable server.
    Doctor(commands::CommonArgs),
    /// Show service / port / database status.
    Status(commands::CommonArgs),
    /// Restart the Doable app (systemd or docker).
    Restart(commands::CommonArgs),
    /// Tail recent app logs.
    Logs(commands::LogsArgs),
    /// List generated secrets from .env (masked unless --reveal).
    Secrets(commands::SecretsArgs),
    /// Print just the postgres password to stdout.
    #[command(name = "db:password")]
    DbPassword(commands::CommonArgs),
    /// Apply database migrations.
    #[command(name = "db:migrate")]
    DbMigrate(commands::CommonArgs),
    /// Rotate app secrets: jwt | internal | encryption | all.
    #[command(name = "rotate-secrets")]
    RotateSecrets(commands::RotateSecretsArgs),
    /// Reset an existing user's password.
    #[command(name = "admin:reset-password")]
    ResetPassword(commands::ResetPasswordArgs),
    /// Create (or re-promote) a platform owner account.
    #[command(name = "admin:create-owner")]
    CreateOwner(commands::CreateOwnerArgs),
}

#[derive(Parser, Debug)]
struct AdminCli {
    /// SSH spec for remote management (e.g. `root@myorg.doable.me`,
    /// `ubuntu@1.2.3.4:2222`). When omitted, manages the local server
    /// (reads /opt/doable/.env's DATABASE_URL or DATABASE_URL env var).
    #[arg(long, value_name = "USER@HOST[:PORT]")]
    remote: Option<String>,

    /// Path to the SSH private key for `--remote`. Ignored when local.
    #[arg(long)]
    ssh_key: Option<std::path::PathBuf>,

    /// Override DATABASE_URL (skips .env and tunnel resolution). Power users only.
    #[arg(long, env = "DATABASE_URL")]
    database_url: Option<String>,

    /// Print the full DATABASE_URL (with password) to stdout and exit. No TUI.
    /// Useful for piping into psql / DBeaver / etc.
    #[arg(long, conflicts_with = "print_db_pass")]
    print_db_url: bool,

    /// Print just the postgres password to stdout and exit. No TUI.
    #[arg(long)]
    print_db_pass: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_writer(io::stderr)
        .with_max_level(tracing::Level::WARN)
        .try_init()
        .ok();

    let cli = TopCli::parse();

    // Headless installer path — bypasses TUI entirely so stdout can be
    // safely piped (e.g. `doable install --headless ... | tee log`).
    // Auto-enabled when stdout isn't a TTY (CI / `script` / cycle-C runs).
    if let Some(TopCmd::Install(args)) = &cli.cmd {
        use std::io::IsTerminal;
        let stdout_is_tty = std::io::stdout().is_terminal();
        if args.headless || !stdout_is_tty {
            return installer::run_headless(args.clone()).await;
        }
    }

    // Non-interactive ops — these never touch the TUI, so handle them before
    // any alt-screen/raw-mode setup and return their exit status directly.
    match &cli.cmd {
        Some(TopCmd::Doctor(a)) => return commands::run_doctor(a).await,
        Some(TopCmd::Status(a)) => return commands::run_status(a).await,
        Some(TopCmd::Restart(a)) => return commands::run_restart(a).await,
        Some(TopCmd::Logs(a)) => return commands::run_logs(a).await,
        Some(TopCmd::Secrets(a)) => return commands::run_secrets(a).await,
        Some(TopCmd::DbPassword(a)) => return commands::run_db_password(a).await,
        Some(TopCmd::DbMigrate(a)) => return commands::run_db_migrate(a).await,
        Some(TopCmd::RotateSecrets(a)) => return commands::run_rotate_secrets(a).await,
        Some(TopCmd::ResetPassword(a)) => return commands::run_reset_password(a).await,
        Some(TopCmd::CreateOwner(a)) => return commands::run_create_owner(a).await,
        _ => {}
    }

    term::install_panic_hook();
    let mut terminal = term::setup().context("setup terminal")?;

    let result = match cli.cmd {
        Some(TopCmd::Install(args)) => installer::run(&mut terminal, args).await,
        Some(TopCmd::Admin(args)) => {
            // --print-db-url / --print-db-pass: non-interactive credential
            // dump. Tear down the alt-screen first so stdout lands cleanly.
            if args.print_db_url || args.print_db_pass {
                term::restore(&mut terminal).ok();
                return print_db_credentials(args).await;
            }
            run_admin_mode(&mut terminal, args).await
        }
        None => run_interactive_top(&mut terminal).await,
        // All other (non-interactive) subcommands were dispatched and returned
        // above, before the terminal was set up.
        _ => unreachable!("non-interactive subcommand reached TUI dispatch"),
    };

    term::restore(&mut terminal).ok();

    if let Err(e) = &result {
        eprintln!("doable: {e:?}");
    }
    result
}

/// Top-level interactive flow — show the mode picker, then dispatch.
async fn run_interactive_top(terminal: &mut term::Tui) -> Result<()> {
    match mode_picker::run(terminal).await? {
        TopLevelChoice::Quit => Ok(()),
        TopLevelChoice::Install => {
            // Bare-launch installer mode with default args (the form takes
            // over from there).
            let args = InstallerArgs::parse_from(["doable"]);
            installer::run(terminal, args).await
        }
        TopLevelChoice::AdminLocal => {
            let args = AdminCli {
                remote: None,
                ssh_key: None,
                database_url: None,
                print_db_url: false,
                print_db_pass: false,
            };
            run_admin_mode(terminal, args).await
        }
        TopLevelChoice::AdminRemote(spec) => {
            run_admin_remote(terminal, spec).await
        }
    }
}

/// Resolve admin opts (local or remote-via-tunnel) and hand off to admin::run.
async fn run_admin_mode(terminal: &mut term::Tui, args: AdminCli) -> Result<()> {
    let (opts, _tunnel_guard) = match &args.remote {
        Some(spec) => {
            let key = args.ssh_key.clone().ok_or_else(|| {
                anyhow::anyhow!("--remote requires --ssh-key (path to your SSH private key)")
            })?;
            preflight_ssh_key(&key)?;

            // Resolve DATABASE_URL: explicit override wins; otherwise fetch
            // from the remote /opt/doable/.env via SSH so we get the real
            // generated password instead of a placeholder.
            let remote_url = match args.database_url.clone() {
                Some(u) => u,
                None => tunnel::fetch_remote_database_url(spec, &key).await?,
            };

            // Now open the actual port-forward tunnel.
            let tunnel = tunnel::open_postgres_tunnel(spec, &key).await?;
            // Rewrite the remote URL's host:port to point at our local tunnel,
            // preserving the real user/password/db.
            let url = tunnel.rewrite_url(&remote_url);
            let label = format!("{} via SSH", spec);
            (
                AdminOpts {
                    db_url: url,
                    label,
                    remote: Some(RemoteCtx { spec: spec.clone(), ssh_key: key }),
                },
                Some(tunnel),
            )
        }
        None => {
            let url = match args.database_url.clone() {
                Some(u) => u,
                None => resolve_local_database_url()?,
            };
            (
                AdminOpts {
                    db_url: url,
                    label: "this server (local)".to_string(),
                    remote: None,
                },
                None,
            )
        }
    };
    admin::run(terminal, opts).await
}

/// Non-interactive credential dump (`--print-db-url` / `--print-db-pass`).
/// Tear-down of the alt-screen happens BEFORE this is called, so stdout/err
/// land cleanly.
async fn print_db_credentials(args: AdminCli) -> Result<()> {
    let url = match args.remote {
        Some(spec) => {
            let key = args
                .ssh_key
                .ok_or_else(|| anyhow::anyhow!("--remote requires --ssh-key"))?;
            preflight_ssh_key(&key)?;
            tunnel::fetch_remote_database_url(&spec, &key).await?
        }
        None => match args.database_url {
            Some(u) => u,
            None => resolve_local_database_url()?,
        },
    };
    if args.print_db_pass {
        println!("{}", extract_password(&url).unwrap_or_default());
    } else {
        println!("{}", url);
    }
    Ok(())
}

/// Pull just the password out of `postgres://user:pass@host[:port]/db`.
fn extract_password(url: &str) -> Option<String> {
    let scheme_end = url.find("://")? + 3;
    let after = &url[scheme_end..];
    let at = after.find('@')?;
    let userinfo = &after[..at];
    let colon = userinfo.find(':')?;
    Some(userinfo[colon + 1..].to_string())
}

/// Interactive remote-admin flow — has access to the TUI so we can prompt
/// for the passphrase if the key is encrypted (the bare-CLI path can't).
async fn run_admin_remote(
    terminal: &mut term::Tui,
    spec: mode_picker::RemoteSpec,
) -> Result<()> {
    let key = match spec.ssh_key {
        Some(p) => p,
        None => anyhow::bail!("Remote admin requires an SSH private key"),
    };

    // Encrypted-key handling. ssh-agent is the canonical fix; if the agent
    // is running and the key is loaded, ssh will use it without prompting.
    // If not, we surface a clear diagnostic — adding the key to the agent
    // (`ssh-add <path>`) is a one-liner the operator can run before retrying.
    if let Ok(true) = file_picker::is_encrypted_key(&key) {
        let agent_running = std::env::var_os("SSH_AUTH_SOCK").is_some();
        let key_loaded = if agent_running {
            ssh_agent_has_key(&key)
        } else {
            false
        };
        if !key_loaded {
            // Tear down the alt-screen so the operator can see plain stderr,
            // run ssh-add, and retry. This is more honest than letting the
            // tunnel hang for 10s and then erroring out cryptically.
            term::restore(terminal).ok();
            eprintln!();
            eprintln!("⚠  The SSH key {} is passphrase-protected.", key.display());
            eprintln!();
            if !agent_running {
                eprintln!("   ssh-agent is NOT running. Start it and load the key:");
                eprintln!();
                eprintln!("     eval $(ssh-agent -s)");
                eprintln!("     ssh-add {}", key.display());
                eprintln!();
            } else {
                eprintln!("   ssh-agent is running but the key isn't loaded. Add it:");
                eprintln!();
                eprintln!("     ssh-add {}", key.display());
                eprintln!();
            }
            eprintln!("   Then re-run `doable` and pick \"Manage a remote server\" again.");
            eprintln!();
            anyhow::bail!("encrypted SSH key not in agent — see instructions above");
        }
    }

    let args = AdminCli {
        remote: Some(spec.host_spec),
        ssh_key: Some(key),
        database_url: None,
        print_db_url: false,
        print_db_pass: false,
    };
    run_admin_mode(terminal, args).await
}

/// Pre-flight (CLI path only — TUI path uses run_admin_remote which can
/// tear down the alt-screen for clearer messages).
fn preflight_ssh_key(key: &std::path::Path) -> Result<()> {
    if !key.exists() {
        anyhow::bail!("SSH key not found: {}", key.display());
    }
    if let Ok(true) = file_picker::is_encrypted_key(key) {
        let agent_running = std::env::var_os("SSH_AUTH_SOCK").is_some();
        let key_loaded = if agent_running {
            ssh_agent_has_key(key)
        } else {
            false
        };
        if !key_loaded {
            anyhow::bail!(
                "SSH key {} is passphrase-protected and not in ssh-agent.\n\
                 Run: ssh-add {} (start ssh-agent first if needed)",
                key.display(),
                key.display()
            );
        }
    }
    Ok(())
}

/// Best-effort check whether `key_path` is loaded into ssh-agent.
/// Compares the public-key fingerprint of `<key_path>.pub` against
/// `ssh-add -L` output. Returns false on any failure.
fn ssh_agent_has_key(key_path: &std::path::Path) -> bool {
    let pub_path = key_path.with_extension("pub");
    let pub_bytes = match std::fs::read(&pub_path) {
        Ok(b) => b,
        Err(_) => return false,
    };
    let pub_str = match std::str::from_utf8(&pub_bytes) {
        Ok(s) => s.trim().to_string(),
        Err(_) => return false,
    };
    // `ssh-add -L` prints `<algo> <base64-key> <comment>` for every loaded key.
    // We compare the base64-key portion (the middle whitespace-delimited token).
    let pub_key_token = pub_str.split_whitespace().nth(1).unwrap_or("");
    if pub_key_token.is_empty() {
        return false;
    }
    let out = match std::process::Command::new("ssh-add").arg("-L").output() {
        Ok(o) => o,
        Err(_) => return false,
    };
    if !out.status.success() {
        return false;
    }
    let listed = String::from_utf8_lossy(&out.stdout);
    listed
        .lines()
        .any(|line| line.split_whitespace().nth(1) == Some(pub_key_token))
}

/// Resolve DATABASE_URL for local admin mode.
/// Priority: env var → /opt/doable/.env → fallback default.
fn resolve_local_database_url() -> Result<String> {
    if let Ok(u) = std::env::var("DATABASE_URL") {
        return Ok(u);
    }
    let env_path = std::path::Path::new("/opt/doable/.env");
    if env_path.exists() {
        if let Ok(contents) = std::fs::read_to_string(env_path) {
            for line in contents.lines() {
                if let Some(rest) = line.strip_prefix("DATABASE_URL=") {
                    return Ok(rest.trim().trim_matches('"').to_string());
                }
            }
        }
    }
    Ok("postgres://doable:doable@localhost:5432/doable".to_string())
}
