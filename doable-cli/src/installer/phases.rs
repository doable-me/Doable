/// Phase status tracked per setup phase.
#[derive(Debug, Clone)]
pub enum PhaseStatus {
    Pending,
    Running,
    Done,
    Failed(String),
}

impl PhaseStatus {
    pub fn icon(&self) -> &'static str {
        match self {
            PhaseStatus::Pending => "⏳",
            PhaseStatus::Running => "🔄",
            PhaseStatus::Done => "✅",
            PhaseStatus::Failed(_) => "❌",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Phase {
    pub name: String,
    pub status: PhaseStatus,
}

impl Phase {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            status: PhaseStatus::Pending,
        }
    }
}

/// The 15 phases mirror `setup-server-v3.sh`. Order matters — the runner uses
/// `Phase N/15` markers from the remote script to drive the sidebar.
pub fn default_phases() -> Vec<Phase> {
    [
        "Preflight checks (OS, sudo, network)",
        "System packages (apt, locales, tzdata)",
        "Node.js 22 + pnpm",
        "PostgreSQL 16 + extensions (pgcrypto, pgvector, pg_trgm)",
        "Caddy + cloudflared",
        "Puppeteer / Chrome dependencies",
        "Repo clone + workspace install",
        "Database creation + migrations",
        "Environment files + secret generation",
        "UFW firewall (deny all, allow SSH)",
        "fail2ban + sshd hardening",
        "Swap file (2 GB)",
        "Cloudflare Tunnel configuration",
        "systemd services (doable + cloudflared)",
        "tmux session (api / web / ws) + smoke test",
    ]
    .iter()
    .map(|n| Phase::new(n))
    .collect()
}
