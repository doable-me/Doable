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

/// The 13 phases mirror `deployment/server-setup.sh` — order matches the
/// `Step N/13` markers the script emits.
pub fn default_phases() -> Vec<Phase> {
    [
        "Installing system packages",
        "Configuring firewall (UFW)",
        "Hardening services (PostgreSQL & fail2ban)",
        "Configuring swap",
        "Setting up PostgreSQL",
        "GitHub authentication",
        "Cloning repository",
        "Writing environment files",
        "Installing dependencies",
        "Setting up Cloudflare Tunnel",
        "Setting up publish infrastructure",
        "Creating systemd services",
        "Starting services",
    ]
    .iter()
    .map(|n| Phase::new(n))
    .collect()
}
