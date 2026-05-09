use clap::Parser;
use std::path::PathBuf;

/// TUI installer for Doable — provisions a secure-by-default server over SSH.
///
/// Run with no args to enter the interactive welcome screen. Pass `--demo` to
/// preview the UX with a canned phase stream. Provide `--host`, `--env-name`,
/// `--ssh-key` (or matching env vars) for unattended provisioning.
#[derive(Parser, Debug, Clone)]
#[command(name = "doable-installer", version, about, long_about = None)]
pub struct Args {
    /// Target host (IPv4, IPv6, or DNS name) to provision. If omitted, the TUI
    /// opens an interactive welcome screen prompting for all required values.
    #[arg(long, env = "DOABLE_HOST")]
    pub host: Option<String>,

    /// SSH user on the target host (must have sudo or be root).
    #[arg(long, env = "DOABLE_USER", default_value = "ubuntu")]
    pub user: String,

    /// Environment name (e.g. `myorg`, `staging`, `prod`). Used for hostname
    /// prefixes and the on-server app directory name.
    #[arg(long, env = "DOABLE_ENV_NAME")]
    pub env_name: Option<String>,

    /// Path to the SSH private key to use for the connection.
    #[arg(long, env = "DOABLE_SSH_KEY")]
    pub ssh_key: Option<PathBuf>,

    /// Custom SSH port (default 22).
    #[arg(long, env = "DOABLE_SSH_PORT", default_value_t = 22)]
    pub ssh_port: u16,

    /// Run without prompts. Suitable for CI / unattended provisioning.
    #[arg(long, env = "DOABLE_NON_INTERACTIVE", default_value_t = false)]
    pub non_interactive: bool,

    /// Also start the on-server tmux session after the setup script finishes.
    #[arg(long, env = "DOABLE_WITH_TMUX", default_value_t = true)]
    pub with_tmux: bool,

    /// Skip creating the platform-admin user account at the end of setup.
    #[arg(long, env = "DOABLE_SKIP_ADMIN_USER", default_value_t = false)]
    pub skip_admin_user: bool,

    /// Run in demo mode: do not actually SSH; replay a canned phase stream.
    /// Useful for previewing the TUI without a real target.
    #[arg(long, default_value_t = false)]
    pub demo: bool,

    /// Path to the setup script to upload+execute remotely.
    /// Defaults to the repo's `setup-server-v3.sh`.
    #[arg(long, env = "DOABLE_SETUP_SCRIPT", default_value = "setup-server-v3.sh")]
    pub setup_script: PathBuf,
}
