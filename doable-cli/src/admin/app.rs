use crossterm::event::{KeyCode, KeyEvent, KeyEventKind, KeyModifiers, MouseButton, MouseEvent, MouseEventKind};
use ratatui::layout::Rect;
use ratatui::widgets::TableState;
use tokio_postgres::Client;

use crate::admin::db;
use crate::admin::server_config as sc;

pub const ROLES: &[&str] = &["owner", "admin", "member", "viewer"];
pub const ADD_ROLES: &[&str] = &["admin", "member", "viewer"];

// ─── Screen / Focus ───────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Screen {
    Users,
    Flags,
    Members,
    AiSettings,
    CreditsAndPlan,
    ApiKeys,
    ModeTools,
    Sandbox,
    SystemRules,
    ServerConfig,
}

pub const SIDEBAR_ITEMS: &[(Screen, &str)] = &[
    (Screen::Users, "Users & Admins"),
    (Screen::Flags, "Feature Flags"),
    (Screen::Members, "Members & Roles"),
    (Screen::AiSettings, "AI Settings"),
    (Screen::CreditsAndPlan, "Credits & Plan"),
    (Screen::ApiKeys, "API Keys"),
    (Screen::ModeTools, "Mode Tools"),
    (Screen::Sandbox, "Sandbox"),
    (Screen::SystemRules, "System Rules"),
    (Screen::ServerConfig, "Server Config"),
];

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Focus {
    Sidebar,
    Content,
    Modal,
}

// ─── Modal variants ───────────────────────────────────────

pub enum Modal {
    ConfirmToggleAdmin {
        user_idx: usize,
        btn: usize, // 0 = cancel, 1 = confirm
    },
    SelectRole {
        member_idx: usize,
        role_idx: usize,
    },
    ConfirmRemove {
        member_idx: usize,
        btn: usize,
    },
    AddStep1Workspace {
        idx: usize,
    },
    AddStep2Email {
        ws_idx: usize,
        text: String,
        cursor: usize,
        error: Option<String>,
    },
    AddStep3Role {
        ws_idx: usize,
        user_id: String,
        email: String,
        role_idx: usize,
    },
    SelectWorkspace {
        idx: usize,
    },
    // ── Server Config modals ──
    /// Edit a single squid allowlist hostname. `idx = None` ⇒ add new entry.
    EditAllowlistEntry {
        idx: Option<usize>,
        text: String,
        cursor: usize,
        error: Option<String>,
    },
    /// Confirm removal of a squid allowlist hostname.
    ConfirmAllowlistRemove {
        idx: usize,
        btn: usize,
    },
    /// Edit/add a cloudflared ingress entry. `idx = None` ⇒ new entry. `field = 0` host, `1` service.
    EditIngressEntry {
        idx: Option<usize>,
        host: String,
        service: String,
        field: usize, // 0 = host, 1 = service
        cursor: usize,
        error: Option<String>,
    },
    /// Confirm removal of a cloudflared ingress entry.
    ConfirmIngressRemove {
        idx: usize,
        btn: usize,
    },
    /// Edit a single env value.
    EditEnvValue {
        idx: usize,
        key: String,
        text: String,
        cursor: usize,
        error: Option<String>,
    },
    /// Confirm restart of doable.service after .env edit.
    ConfirmEnvApply {
        btn: usize,
    },
    /// Confirm apply of squid allowlist (write + reconfigure).
    ConfirmSquidApply {
        btn: usize,
    },
    /// Confirm apply of cloudflared (validate + reload).
    ConfirmCloudflaredApply {
        btn: usize,
    },
    // ── AI Settings modals ──
    /// Pick the workspace's default AI provider from configured ai_providers.
    PickProvider {
        idx: usize,
    },
    /// Edit the default model for the selected provider (free text).
    EditDefaultModel {
        text: String,
        cursor: usize,
        error: Option<String>,
    },
    // ── Credits & Plan modals ──
    /// Edit a single integer credit field (daily/monthly/rollover).
    /// `field`: 0 = daily, 1 = monthly, 2 = rollover.
    EditCredits {
        balance_idx: usize,
        field: u8,
        text: String,
        cursor: usize,
        error: Option<String>,
    },
    /// Pick the plan_type (free / pro / enterprise).
    PickPlanType {
        balance_idx: usize,
        idx: usize,
    },
    /// Confirm applying the staged credit edits.
    ConfirmCreditsApply {
        balance_idx: usize,
        btn: usize,
    },
    // ── Sandbox modals ──
    /// Add or edit a sandbox rule. `idx = None` ⇒ add new rule.
    /// `field`: 0 = rule_type, 1 = pattern, 2 = action, 3 = priority, 4 = reason
    EditSandboxRule {
        idx: Option<usize>,
        rule_type_idx: usize, // index into SANDBOX_RULE_TYPES
        pattern: String,
        action_idx: usize,    // 0 = allow, 1 = deny
        priority: String,
        reason: String,
        field: usize,         // current focused field (0..4)
        cursor: usize,        // cursor within current text field
        error: Option<String>,
    },
    /// Confirm removal of a sandbox rule.
    ConfirmSandboxRuleRemove {
        idx: usize,
        btn: usize,
    },
    /// Edit workspace sandbox settings (backend, tool/network default action).
    EditSandboxSettings {
        backend_idx: usize,  // index into SANDBOX_BACKENDS
        tool_action_idx: usize, // 0 = allow, 1 = deny
        net_action_idx: usize,  // 0 = allow, 1 = deny
        field: usize,           // 0 = backend, 1 = tool_default, 2 = net_default
    },
    // ── System Rules modals ──
    /// Add or edit a system-level sandbox rule. `idx = None` ⇒ add new.
    /// field: 0=scope, 1=rule_type, 2=pattern, 3=action, 4=priority, 5=is_floor, 6=description
    EditSystemRule {
        idx: Option<usize>,
        scope_idx: usize,
        rule_type_idx: usize,
        pattern: String,
        action_idx: usize,
        priority: String,
        is_floor: bool,
        description: String,
        field: usize,
        cursor: usize,
        error: Option<String>,
    },
    /// Confirm removal of a system-level sandbox rule.
    ConfirmSystemRuleRemove {
        idx: usize,
        btn: usize,
    },
    // ── API Keys / Mode Tools modals ──
    /// Edit the comma-separated allowed_origins list for a project API key.
    EditApiKeyOrigins {
        key_idx: usize,
        text: String,
        cursor: usize,
        error: Option<String>,
    },
    /// Edit the comma-separated allowed_tools list for a project API key.
    EditApiKeyTools {
        key_idx: usize,
        text: String,
        cursor: usize,
        error: Option<String>,
    },
    /// Edit the comma-separated allowed_tools list for a chat mode (agent/plan/visual-edit).
    EditModeTools {
        mode_idx: usize,
        text: String,
        cursor: usize,
        error: Option<String>,
    },
    /// Pick the platform_role (workspace_role enum: owner | admin | member | viewer)
    /// for a user. Distinct from is_platform_admin — this is the column that
    /// decides "platform owner" UI affordances.
    PickPlatformRole {
        user_idx: usize,
        idx: usize,
    },
    // ── DB Credentials modals ──
    /// Step 1: confirm the operator wants to rotate the postgres password.
    /// `btn`: 0 = Cancel, 1 = Rotate.
    ConfirmRotateDbPassword {
        btn: usize,
    },
    /// Step 2: in-flight progress while the 5-stage rotation runs.
    /// `progress_msg` is the current stage's human label.
    RotateInProgress {
        progress_msg: String,
    },
    /// Step 3: terminal state — either a success summary or a stage failure.
    RotateResult {
        success: bool,
        message: String,
    },
}

pub const PLATFORM_ROLES: &[&str] = &["owner", "admin", "member", "viewer"];

pub const SANDBOX_RULE_TYPES: &[&str] = &["tool", "network", "bash", "read"];
pub const SANDBOX_ACTIONS: &[&str] = &["allow", "deny"];
pub const SANDBOX_BACKENDS: &[&str] = &["auto", "bubblewrap", "systemd", "psroot", "sandbox-exec", "none"];

// System rule scopes and types
pub const SYSTEM_RULE_SCOPES: &[&str] = &[
    "global",
    "profile:ai-bash",
    "profile:vite-preview",
    "profile:install",
    "profile:build",
];
pub const SYSTEM_RULE_TYPES: &[&str] = &["network", "syscall", "package"];

// ─── Click targets (populated during render) ─────────────

#[derive(Clone)]
pub enum ClickTarget {
    SidebarItem(usize),
    ContentRow(usize),
    ModalButton(usize),
    ModalListItem(usize),
    ActionButton(usize),
    WsTab(usize),
}

// ─── Status ───────────────────────────────────────────────

#[derive(Clone, Copy)]
pub enum StatusKind {
    Success,
    Error,
    Info,
}

// ─── App ──────────────────────────────────────────────────

pub struct App {
    pub running: bool,
    pub screen: Screen,
    pub focus: Focus,
    pub sidebar_idx: usize,
    pub table_state: TableState,

    // data
    pub users: Vec<db::UserData>,
    pub flags: Vec<db::FlagData>,
    pub members: Vec<db::MemberData>,
    pub workspaces: Vec<db::WorkspaceData>,
    pub ai_settings: Option<db::AiData>,
    pub ai_ws_idx: Option<usize>,

    // credits & plan
    pub credit_balances: Vec<db::CreditBalanceRow>,

    // api keys & mode tools
    pub api_keys: Vec<db::ApiKeyRow>,
    pub mode_tools: Vec<db::ModeToolsRow>,

    // sandbox (read-only first pass)
    pub sandbox_settings: Option<db::SandboxSettingsRow>,
    pub sandbox_rules: Vec<db::SandboxRulesRow>,
    pub sandbox_audit: Vec<db::SandboxAuditRow>,
    /// (backend_id, available, reason). Static list for now — populated in `new`.
    /// A follow-up pass will probe the host (psroot/bwrap/sandbox-exec) for live availability.
    pub sandbox_backends: Vec<(String, bool, String)>,

    // system-level sandbox rules (Migration 080)
    pub system_rules: Vec<db::SystemRuleRow>,

    // server config
    pub sc_subview: sc::SubView,
    pub sc_squid: Option<sc::ConfigState<sc::SquidState>>,
    pub sc_cloudflared: Option<sc::ConfigState<sc::CloudflaredState>>,
    pub sc_env: Option<sc::ConfigState<sc::EnvState>>,
    pub sc_systemd: Option<sc::ConfigState<sc::SystemdState>>,
    pub sc_nft: Option<sc::ConfigState<sc::NftState>>,
    pub sc_caddy: Option<sc::ConfigState<sc::CaddyState>>,
    /// Read-only display state for the DB Credentials sub-view.  Built from
    /// `db_url` + `remote_ctx`; refreshed by `load_server_config_subview`.
    pub db_credentials: Option<sc::DbCredentialsState>,
    /// True ⇒ password is shown in cleartext on the DB Credentials sub-view.
    /// Toggled with `s`.  Always reset to false on screen change.
    pub db_creds_revealed: bool,
    /// Pending in-memory edits — applied to disk when user hits Apply.
    pub sc_squid_dirty: Option<Vec<String>>,
    pub sc_cloudflared_dirty: Option<Vec<sc::IngressEntry>>,
    pub sc_env_dirty: Option<Vec<(String, String)>>, // (key, new_value) staged edits

    // modal
    pub modal: Option<Modal>,

    // status toast
    pub status: Option<(String, StatusKind)>,
    pub status_ticks: u16,

    // click map (rebuilt each frame by ui::render)
    pub click_targets: Vec<(Rect, ClickTarget)>,

    // db
    pub client: Client,
    pub db_label: String,
    /// Full DATABASE_URL (with password) — populated after construction by
    /// `admin::run`. Used by the DB Credentials sub-view.
    pub db_url: String,
    /// Remote SSH context — populated after construction by `admin::run`.
    /// `None` ⇒ admin is running ON the server itself.
    pub remote_ctx: Option<crate::admin::RemoteCtx>,
}

impl App {
    pub fn new(client: Client, db_url: &str) -> Self {
        let db_label = db_url.split('@').last().unwrap_or(db_url).to_string();
        let mut ts = TableState::default();
        ts.select(Some(0));
        Self {
            running: true,
            screen: Screen::Users,
            focus: Focus::Sidebar,
            sidebar_idx: 0,
            table_state: ts,
            users: vec![],
            flags: vec![],
            members: vec![],
            workspaces: vec![],
            ai_settings: None,
            ai_ws_idx: None,
            credit_balances: vec![],
            api_keys: vec![],
            mode_tools: vec![],
            sandbox_settings: None,
            sandbox_rules: vec![],
            sandbox_audit: vec![],
            sandbox_backends: vec![],
            system_rules: vec![],
            sc_subview: sc::SubView::Squid,
            sc_squid: None,
            sc_cloudflared: None,
            sc_env: None,
            sc_systemd: None,
            sc_nft: None,
            sc_caddy: None,
            db_credentials: None,
            db_creds_revealed: false,
            sc_squid_dirty: None,
            sc_cloudflared_dirty: None,
            sc_env_dirty: None,
            modal: None,
            status: None,
            status_ticks: 0,
            click_targets: vec![],
            client,
            db_label,
            db_url: String::new(),
            remote_ctx: None,
        }
    }

    // ── Data loading ────────────────────────────────────

    pub async fn load_all_data(&mut self) {
        match db::fetch_users(&self.client).await {
            Ok(v) => self.users = v,
            Err(e) => { self.toast(format!("Failed to load users: {e}"), StatusKind::Error); }
        }
        match db::fetch_flags(&self.client).await {
            Ok(v) => self.flags = v,
            Err(e) => { self.toast(format!("Failed to load flags: {e}"), StatusKind::Error); }
        }
        match db::fetch_members(&self.client).await {
            Ok(v) => self.members = v,
            Err(e) => { self.toast(format!("Failed to load members: {e}"), StatusKind::Error); }
        }
        match db::fetch_workspaces(&self.client).await {
            Ok(v) => self.workspaces = v,
            Err(e) => { self.toast(format!("Failed to load workspaces: {e}"), StatusKind::Error); }
        }
        match db::fetch_credit_balances(&self.client).await {
            Ok(v) => self.credit_balances = v,
            Err(e) => { self.toast(format!("Failed to load credit balances: {e}"), StatusKind::Error); }
        }
        match db::fetch_api_keys(&self.client).await {
            Ok(v) => self.api_keys = v,
            Err(e) => { self.toast(format!("Failed to load API keys: {e}"), StatusKind::Error); }
        }
        match db::fetch_mode_tools(&self.client).await {
            Ok(v) => self.mode_tools = v,
            Err(e) => { self.toast(format!("Failed to load mode tools: {e}"), StatusKind::Error); }
        }
        // Sandbox: workspace-scoped tables. There is no dedicated
        // `current_workspace_id` on App yet, so we use the first workspace as
        // the read-only context. Follow-up will add a workspace picker, mirroring
        // `ai_ws_idx`. Loaders swallow "missing table" so it's safe pre-migration.
        let current_workspace_id = self
            .workspaces
            .first()
            .map(|w| w.id.clone())
            .unwrap_or_default();
        self.sandbox_settings = db::load_sandbox_settings(&self.client, &current_workspace_id)
            .await
            .ok()
            .flatten();
        self.sandbox_rules = db::load_sandbox_rules(&self.client, &current_workspace_id)
            .await
            .unwrap_or_default();
        self.sandbox_audit = db::load_sandbox_audit(&self.client, &current_workspace_id)
            .await
            .unwrap_or_default();
        self.system_rules = db::load_system_rules(&self.client)
            .await
            .unwrap_or_default();
    }

    async fn reload_current(&mut self) {
        match self.screen {
            Screen::Users => {
                match db::fetch_users(&self.client).await {
                    Ok(v) => self.users = v,
                    Err(e) => { self.toast(format!("Failed to load users: {e}"), StatusKind::Error); }
                }
            }
            Screen::Flags => {
                match db::fetch_flags(&self.client).await {
                    Ok(v) => self.flags = v,
                    Err(e) => { self.toast(format!("Failed to load flags: {e}"), StatusKind::Error); }
                }
            }
            Screen::Members => {
                match db::fetch_members(&self.client).await {
                    Ok(v) => self.members = v,
                    Err(e) => { self.toast(format!("Failed to load members: {e}"), StatusKind::Error); }
                }
                match db::fetch_workspaces(&self.client).await {
                    Ok(v) => self.workspaces = v,
                    Err(e) => { self.toast(format!("Failed to load workspaces: {e}"), StatusKind::Error); }
                }
            }
            Screen::AiSettings => {
                match db::fetch_workspaces(&self.client).await {
                    Ok(v) => self.workspaces = v,
                    Err(e) => { self.toast(format!("Failed to load workspaces: {e}"), StatusKind::Error); }
                }
                self.load_ai_for_ws().await;
            }
            Screen::ServerConfig => {
                self.load_server_config_subview().await;
            }
            Screen::CreditsAndPlan => {
                match db::fetch_credit_balances(&self.client).await {
                    Ok(v) => self.credit_balances = v,
                    Err(e) => { self.toast(format!("Failed to load credit balances: {e}"), StatusKind::Error); }
                }
            }
            Screen::ApiKeys => {
                match db::fetch_api_keys(&self.client).await {
                    Ok(v) => self.api_keys = v,
                    Err(e) => { self.toast(format!("Failed to load API keys: {e}"), StatusKind::Error); }
                }
            }
            Screen::ModeTools => {
                match db::fetch_mode_tools(&self.client).await {
                    Ok(v) => self.mode_tools = v,
                    Err(e) => { self.toast(format!("Failed to load mode tools: {e}"), StatusKind::Error); }
                }
            }
            Screen::Sandbox => {
                let current_workspace_id = self
                    .workspaces
                    .first()
                    .map(|w| w.id.clone())
                    .unwrap_or_default();
                self.sandbox_settings =
                    db::load_sandbox_settings(&self.client, &current_workspace_id)
                        .await
                        .ok()
                        .flatten();
                self.sandbox_rules =
                    db::load_sandbox_rules(&self.client, &current_workspace_id)
                        .await
                        .unwrap_or_default();
                self.sandbox_audit =
                    db::load_sandbox_audit(&self.client, &current_workspace_id)
                        .await
                        .unwrap_or_default();
            }
            Screen::SystemRules => {
                self.system_rules = db::load_system_rules(&self.client)
                    .await
                    .unwrap_or_default();
            }
        }
    }

    pub async fn load_server_config_subview(&mut self) {
        match self.sc_subview {
            sc::SubView::Squid => {
                self.sc_squid = Some(sc::load_squid().await);
                self.sc_squid_dirty = None;
            }
            sc::SubView::Cloudflared => {
                self.sc_cloudflared = Some(sc::load_cloudflared().await);
                self.sc_cloudflared_dirty = None;
            }
            sc::SubView::EnvFile => {
                self.sc_env = Some(sc::load_env().await);
                self.sc_env_dirty = None;
            }
            sc::SubView::Systemd => {
                self.sc_systemd = Some(sc::load_systemd().await);
            }
            sc::SubView::Nft => {
                self.sc_nft = Some(sc::load_nft().await);
            }
            sc::SubView::Caddy => {
                self.sc_caddy = Some(sc::load_caddy().await);
            }
            sc::SubView::DbCredentials => {
                // No I/O — purely parsed from app.db_url + remote_ctx.
                match sc::build_db_credentials_state(
                    &self.db_url,
                    self.remote_ctx.as_ref(),
                ) {
                    Ok(st) => self.db_credentials = Some(st),
                    Err(e) => {
                        self.db_credentials = None;
                        self.toast(format!("DB creds parse error: {e}"), StatusKind::Error);
                    }
                }
                // Always start masked when entering the sub-view.
                self.db_creds_revealed = false;
            }
        }
    }

    /// Returns the squid hostnames to render — dirty edits override loaded.
    pub fn squid_view_list(&self) -> Vec<String> {
        if let Some(d) = &self.sc_squid_dirty {
            return d.clone();
        }
        if let Some(sc::ConfigState::Loaded(s)) = &self.sc_squid {
            return s.allowed_domains.clone();
        }
        Vec::new()
    }

    /// Returns the cloudflared ingress entries to render — dirty edits override loaded.
    pub fn cloudflared_view_list(&self) -> Vec<sc::IngressEntry> {
        if let Some(d) = &self.sc_cloudflared_dirty {
            return d
                .iter()
                .map(|e| sc::IngressEntry {
                    hostname: e.hostname.clone(),
                    service: e.service.clone(),
                })
                .collect();
        }
        if let Some(sc::ConfigState::Loaded(s)) = &self.sc_cloudflared {
            return s
                .ingress
                .iter()
                .map(|e| sc::IngressEntry {
                    hostname: e.hostname.clone(),
                    service: e.service.clone(),
                })
                .collect();
        }
        Vec::new()
    }

    /// Returns env entries with dirty edits applied for display.
    pub fn env_view_list(&self) -> Vec<sc::EnvEntry> {
        let base = match &self.sc_env {
            Some(sc::ConfigState::Loaded(s)) => s.entries.iter().map(|e| sc::EnvEntry {
                key: e.key.clone(),
                value: e.value.clone(),
                masked: e.masked,
            }).collect::<Vec<_>>(),
            _ => Vec::new(),
        };
        if let Some(dirty) = &self.sc_env_dirty {
            base.into_iter()
                .map(|mut e| {
                    if let Some((_, v)) = dirty.iter().find(|(k, _)| *k == e.key) {
                        e.value = v.clone();
                    }
                    e
                })
                .collect()
        } else {
            base
        }
    }

    async fn load_ai_for_ws(&mut self) {
        if let Some(idx) = self.ai_ws_idx {
            if let Some(ws) = self.workspaces.get(idx) {
                self.ai_settings = db::fetch_ai_settings(&self.client, &ws.id)
                    .await
                    .unwrap_or(None);
            } else {
                self.ai_settings = None;
            }
        } else {
            self.ai_settings = None;
        }
    }

    // ── Helpers ─────────────────────────────────────────

    pub fn tick(&mut self) {
        if self.status_ticks > 0 {
            self.status_ticks -= 1;
            if self.status_ticks == 0 {
                self.status = None;
            }
        }
    }

    fn toast(&mut self, msg: String, kind: StatusKind) {
        self.status = Some((msg, kind));
        self.status_ticks = 40; // ~4 seconds at 100ms poll
    }

    pub fn content_len(&self) -> usize {
        match self.screen {
            Screen::Users => self.users.len(),
            Screen::Flags => self.flags.len(),
            Screen::Members => self.members.len(),
            Screen::AiSettings => {
                if self.ai_settings.is_some() {
                    5
                } else {
                    0
                }
            }
            Screen::ServerConfig => match self.sc_subview {
                sc::SubView::Squid => self.squid_view_list().len(),
                sc::SubView::Cloudflared => self.cloudflared_view_list().len(),
                sc::SubView::EnvFile => self.env_view_list().len(),
                sc::SubView::Systemd => match &self.sc_systemd {
                    Some(sc::ConfigState::Loaded(s)) => {
                        s.units.iter().map(|u| u.directives.len() + 1).sum()
                    }
                    _ => 0,
                },
                sc::SubView::Nft => match &self.sc_nft {
                    Some(sc::ConfigState::Loaded(s)) => s.rules.len(),
                    _ => 0,
                },
                sc::SubView::Caddy => match &self.sc_caddy {
                    Some(sc::ConfigState::Loaded(s)) => s.matchers.len(),
                    _ => 0,
                },
                // 4 logical rows: server URL, tunnel URL (when remote),
                // password, rotate button.  We always report 4 so the
                // selection cursor can land on any of them; the renderer
                // simply omits the tunnel row when not applicable.
                sc::SubView::DbCredentials => 4,
            },
            Screen::CreditsAndPlan => self.credit_balances.len(),
            Screen::ApiKeys => self.api_keys.len(),
            Screen::ModeTools => self.mode_tools.len(),
            Screen::Sandbox => self.sandbox_rules.len(),
            Screen::SystemRules => self.system_rules.len(),
        }
    }

    fn clamp_selection(&mut self) {
        let len = self.content_len();
        if len == 0 {
            self.table_state.select(None);
        } else {
            let sel = self.table_state.selected().unwrap_or(0).min(len - 1);
            self.table_state.select(Some(sel));
        }
    }

    fn move_sel(&mut self, delta: i32) {
        let len = self.content_len();
        if len == 0 {
            return;
        }
        let cur = self.table_state.selected().unwrap_or(0) as i32;
        let next = (cur + delta).clamp(0, len as i32 - 1) as usize;
        self.table_state.select(Some(next));
    }

    async fn go_to(&mut self, idx: usize) {
        self.sidebar_idx = idx;
        self.screen = SIDEBAR_ITEMS[idx].0;
        self.table_state.select(Some(0));
        self.modal = None;
        self.reload_current().await;
    }

    // ── Key handling ────────────────────────────────────

    pub async fn handle_key(&mut self, key: KeyEvent) {
        // Only handle actual key presses — ignore Release and Repeat events.
        // On Windows, crossterm emits Press + Release (and sometimes Repeat)
        // for every single keystroke, which causes double/triple input.
        if key.kind != KeyEventKind::Press {
            return;
        }

        // Ctrl+C always quits
        if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c') {
            self.running = false;
            return;
        }

        // Modal intercepts all keys
        if self.modal.is_some() {
            self.handle_modal_key(key).await;
            return;
        }

        match key.code {
            KeyCode::Char('q') => {
                self.running = false;
            }
            KeyCode::Tab | KeyCode::BackTab => {
                self.focus = if self.focus == Focus::Sidebar {
                    Focus::Content
                } else {
                    Focus::Sidebar
                };
                self.clamp_selection();
            }
            KeyCode::Esc => {
                if self.focus == Focus::Content {
                    self.focus = Focus::Sidebar;
                }
            }
            _ => match self.focus {
                Focus::Sidebar => self.handle_sidebar_key(key).await,
                Focus::Content => self.handle_content_key(key).await,
                Focus::Modal => {}
            },
        }
    }

    async fn handle_sidebar_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => {
                if self.sidebar_idx > 0 {
                    self.go_to(self.sidebar_idx - 1).await;
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if self.sidebar_idx < SIDEBAR_ITEMS.len() - 1 {
                    self.go_to(self.sidebar_idx + 1).await;
                }
            }
            KeyCode::Enter | KeyCode::Right => {
                self.focus = Focus::Content;
                self.clamp_selection();
            }
            _ => {}
        }
    }

    async fn handle_content_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => self.move_sel(-1),
            KeyCode::Down | KeyCode::Char('j') => self.move_sel(1),
            KeyCode::Home => {
                self.table_state.select(Some(0));
            }
            KeyCode::End => {
                let l = self.content_len();
                if l > 0 {
                    self.table_state.select(Some(l - 1));
                }
            }
            KeyCode::PageUp => self.move_sel(-10),
            KeyCode::PageDown => self.move_sel(10),
            KeyCode::Enter | KeyCode::Char(' ') => self.activate_item().await,
            KeyCode::Left => {
                self.focus = Focus::Sidebar;
            }
            // Users shortcut: r → set platform_role (workspace_role enum: owner|admin|member|viewer)
            // Distinct from is_platform_admin toggle on Enter — this sets the column that
            // governs platform-owner UI affordances.
            KeyCode::Char('r') if self.screen == Screen::Users => self.open_pick_platform_role(),
            // Members shortcuts
            KeyCode::Char('r') if self.screen == Screen::Members => self.open_change_role(),
            KeyCode::Char('a') if self.screen == Screen::Members => self.open_add_member(),
            KeyCode::Char('d') if self.screen == Screen::Members => self.open_remove_member(),
            KeyCode::F(2) if self.screen == Screen::Members => self.open_change_role(),
            KeyCode::F(3) if self.screen == Screen::Members => self.open_add_member(),
            KeyCode::F(4) if self.screen == Screen::Members => self.open_remove_member(),
            // AI Settings shortcut
            KeyCode::Char('w') if self.screen == Screen::AiSettings => self.open_ws_selector(),
            // Server Config: 1/2/3/4 to swap subview, a=add, d=delete, A=apply, R=reload from disk
            KeyCode::Char('1') if self.screen == Screen::ServerConfig => self.go_subview(sc::SubView::Squid).await,
            KeyCode::Char('2') if self.screen == Screen::ServerConfig => self.go_subview(sc::SubView::Cloudflared).await,
            KeyCode::Char('3') if self.screen == Screen::ServerConfig => self.go_subview(sc::SubView::EnvFile).await,
            KeyCode::Char('4') if self.screen == Screen::ServerConfig => self.go_subview(sc::SubView::Systemd).await,
            KeyCode::Char('5') if self.screen == Screen::ServerConfig => self.go_subview(sc::SubView::Nft).await,
            KeyCode::Char('6') if self.screen == Screen::ServerConfig => self.go_subview(sc::SubView::Caddy).await,
            KeyCode::Char('7') if self.screen == Screen::ServerConfig => self.go_subview(sc::SubView::DbCredentials).await,
            // DB Credentials shortcuts — match BEFORE the generic 'a'/'d' arms
            // so we don't accidentally trigger sc_open_add on this read-only view.
            KeyCode::Char('s')
                if self.screen == Screen::ServerConfig
                    && self.sc_subview == sc::SubView::DbCredentials =>
            {
                self.db_creds_revealed = !self.db_creds_revealed;
            }
            KeyCode::Char('r')
                if self.screen == Screen::ServerConfig
                    && self.sc_subview == sc::SubView::DbCredentials =>
            {
                self.open_confirm_rotate_db_password();
            }
            KeyCode::Char('c')
                if self.screen == Screen::ServerConfig
                    && self.sc_subview == sc::SubView::DbCredentials =>
            {
                self.copy_db_url_to_clipboard();
            }
            KeyCode::Char('a') if self.screen == Screen::ServerConfig => self.sc_open_add(),
            KeyCode::Char('d') if self.screen == Screen::ServerConfig => self.sc_open_delete(),
            KeyCode::Char('A') if self.screen == Screen::ServerConfig => self.sc_open_apply(),
            KeyCode::Char('R') if self.screen == Screen::ServerConfig => {
                self.load_server_config_subview().await;
                self.toast("Reloaded from disk".into(), StatusKind::Info);
            }
            // Credits & Plan shortcuts
            KeyCode::Char('d') if self.screen == Screen::CreditsAndPlan => self.open_edit_credits(0),
            KeyCode::Char('m') if self.screen == Screen::CreditsAndPlan => self.open_edit_credits(1),
            KeyCode::Char('r') if self.screen == Screen::CreditsAndPlan => self.open_edit_credits(2),
            KeyCode::Char('p') if self.screen == Screen::CreditsAndPlan => self.open_pick_plan_type(),
            // API Keys shortcuts
            KeyCode::Char('o') if self.screen == Screen::ApiKeys => {
                if let Some(i) = self.table_state.selected() {
                    if i < self.api_keys.len() { self.open_edit_api_key_origins(i); }
                }
            }
            KeyCode::Char('t') if self.screen == Screen::ApiKeys => {
                if let Some(i) = self.table_state.selected() {
                    if i < self.api_keys.len() { self.open_edit_api_key_tools(i); }
                }
            }
            // Sandbox shortcuts: a=add, d=delete, e/Enter=edit, t=toggle, s=settings
            KeyCode::Char('a') if self.screen == Screen::Sandbox => self.sandbox_open_add(),
            KeyCode::Char('d') if self.screen == Screen::Sandbox => self.sandbox_open_delete(),
            KeyCode::Char('e') if self.screen == Screen::Sandbox => self.sandbox_open_edit(),
            KeyCode::Char('t') if self.screen == Screen::Sandbox => self.sandbox_toggle_rule().await,
            KeyCode::Char('s') if self.screen == Screen::Sandbox => self.sandbox_open_settings(),
            // System Rules shortcuts: a=add, d=delete, e/Enter=edit, t=toggle
            KeyCode::Char('a') if self.screen == Screen::SystemRules => self.sysrule_open_add(),
            KeyCode::Char('d') if self.screen == Screen::SystemRules => self.sysrule_open_delete(),
            KeyCode::Char('e') if self.screen == Screen::SystemRules => self.sysrule_open_edit(),
            KeyCode::Char('t') if self.screen == Screen::SystemRules => self.sysrule_toggle().await,
            _ => {}
        }
    }

    pub async fn go_subview(&mut self, sv: sc::SubView) {
        self.sc_subview = sv;
        self.table_state.select(Some(0));
        self.load_server_config_subview().await;
    }

    fn sc_open_add(&mut self) {
        match self.sc_subview {
            sc::SubView::Squid => {
                if !self.sc_squid_loaded() {
                    self.toast("Server files not present".into(), StatusKind::Error);
                    return;
                }
                self.modal = Some(Modal::EditAllowlistEntry {
                    idx: None,
                    text: String::new(),
                    cursor: 0,
                    error: None,
                });
                self.focus = Focus::Modal;
            }
            sc::SubView::Cloudflared => {
                if !self.sc_cloudflared_loaded() {
                    self.toast("Server files not present".into(), StatusKind::Error);
                    return;
                }
                self.modal = Some(Modal::EditIngressEntry {
                    idx: None,
                    host: String::new(),
                    service: String::new(),
                    field: 0,
                    cursor: 0,
                    error: None,
                });
                self.focus = Focus::Modal;
            }
            sc::SubView::EnvFile | sc::SubView::Systemd => {
                self.toast("Add not supported on this view".into(), StatusKind::Info);
            }
            sc::SubView::Nft | sc::SubView::Caddy => {
                self.toast("Read-only view — edit via setup-server.sh".into(), StatusKind::Info);
            }
            sc::SubView::DbCredentials => {
                self.toast(
                    "Use 'r' to rotate the password (no add/edit on this view).".into(),
                    StatusKind::Info,
                );
            }
        }
    }

    fn sc_open_delete(&mut self) {
        let idx = match self.table_state.selected() {
            Some(i) => i,
            None => return,
        };
        match self.sc_subview {
            sc::SubView::Squid => {
                if idx >= self.squid_view_list().len() {
                    return;
                }
                self.modal = Some(Modal::ConfirmAllowlistRemove { idx, btn: 0 });
                self.focus = Focus::Modal;
            }
            sc::SubView::Cloudflared => {
                if idx >= self.cloudflared_view_list().len() {
                    return;
                }
                self.modal = Some(Modal::ConfirmIngressRemove { idx, btn: 0 });
                self.focus = Focus::Modal;
            }
            _ => {
                self.toast("Delete not supported on this view".into(), StatusKind::Info);
            }
        }
    }

    fn sc_open_apply(&mut self) {
        match self.sc_subview {
            sc::SubView::Squid => {
                if self.sc_squid_dirty.is_none() {
                    self.toast("No pending changes".into(), StatusKind::Info);
                    return;
                }
                self.modal = Some(Modal::ConfirmSquidApply { btn: 0 });
                self.focus = Focus::Modal;
            }
            sc::SubView::Cloudflared => {
                if self.sc_cloudflared_dirty.is_none() {
                    self.toast("No pending changes".into(), StatusKind::Info);
                    return;
                }
                self.modal = Some(Modal::ConfirmCloudflaredApply { btn: 0 });
                self.focus = Focus::Modal;
            }
            sc::SubView::EnvFile => {
                if self.sc_env_dirty.is_none() {
                    self.toast("No pending changes".into(), StatusKind::Info);
                    return;
                }
                self.modal = Some(Modal::ConfirmEnvApply { btn: 0 });
                self.focus = Focus::Modal;
            }
            sc::SubView::Systemd | sc::SubView::Nft | sc::SubView::Caddy => {
                self.toast("Read-only view — no apply action".into(), StatusKind::Info);
            }
            sc::SubView::DbCredentials => {
                self.toast(
                    "Use 'r' to rotate the password (Apply doesn't apply here).".into(),
                    StatusKind::Info,
                );
            }
        }
    }

    fn sc_squid_loaded(&self) -> bool {
        matches!(&self.sc_squid, Some(sc::ConfigState::Loaded(_)))
    }
    fn sc_cloudflared_loaded(&self) -> bool {
        matches!(&self.sc_cloudflared, Some(sc::ConfigState::Loaded(_)))
    }

    // ── Content actions ─────────────────────────────────

    async fn activate_item(&mut self) {
        let idx = match self.table_state.selected() {
            Some(i) => i,
            None => return,
        };
        match self.screen {
            Screen::Users => {
                if idx < self.users.len() {
                    self.modal = Some(Modal::ConfirmToggleAdmin {
                        user_idx: idx,
                        btn: 1,
                    });
                    self.focus = Focus::Modal;
                }
            }
            Screen::Flags => {
                if idx < self.flags.len() {
                    self.do_toggle_flag(idx).await;
                }
            }
            Screen::Members => {
                self.open_change_role();
            }
            Screen::AiSettings => {
                if self.ai_ws_idx.is_none() {
                    self.open_ws_selector();
                } else if self.ai_settings.is_some() {
                    self.do_toggle_ai(idx).await;
                }
            }
            Screen::ServerConfig => self.sc_activate_item(idx),
            Screen::CreditsAndPlan => {
                if idx < self.credit_balances.len() {
                    self.open_edit_credits(0);
                }
            }
            Screen::ApiKeys => {
                if idx < self.api_keys.len() {
                    // Default action on Enter: edit origins. Use 't' shortcut for tools.
                    self.open_edit_api_key_origins(idx);
                }
            }
            Screen::ModeTools => {
                if idx < self.mode_tools.len() {
                    self.open_edit_mode_tools(idx);
                }
            }
            Screen::Sandbox => {
                // Enter = edit the selected rule
                if idx < self.sandbox_rules.len() {
                    self.sandbox_open_edit();
                }
            }
            Screen::SystemRules => {
                // Enter = edit the selected system rule
                if idx < self.system_rules.len() {
                    self.sysrule_open_edit();
                }
            }
        }
    }

    fn sc_activate_item(&mut self, idx: usize) {
        match self.sc_subview {
            sc::SubView::Squid => {
                let list = self.squid_view_list();
                if let Some(host) = list.get(idx) {
                    let cur = host.clone();
                    let cursor = cur.len();
                    self.modal = Some(Modal::EditAllowlistEntry {
                        idx: Some(idx),
                        text: cur,
                        cursor,
                        error: None,
                    });
                    self.focus = Focus::Modal;
                }
            }
            sc::SubView::Cloudflared => {
                let list = self.cloudflared_view_list();
                if let Some(e) = list.get(idx) {
                    let host = e.hostname.clone();
                    let svc = e.service.clone();
                    let cursor = host.len();
                    self.modal = Some(Modal::EditIngressEntry {
                        idx: Some(idx),
                        host,
                        service: svc,
                        field: 0,
                        cursor,
                        error: None,
                    });
                    self.focus = Focus::Modal;
                }
            }
            sc::SubView::EnvFile => {
                let list = self.env_view_list();
                if let Some(e) = list.get(idx) {
                    let key = e.key.clone();
                    let text = e.value.clone();
                    let cursor = text.len();
                    self.modal = Some(Modal::EditEnvValue {
                        idx,
                        key,
                        text,
                        cursor,
                        error: None,
                    });
                    self.focus = Focus::Modal;
                }
            }
            sc::SubView::Systemd | sc::SubView::Nft | sc::SubView::Caddy => {
                self.toast("Read-only view".into(), StatusKind::Info);
            }
            sc::SubView::DbCredentials => {
                // Row 3 (the rotate button) is the only actionable row.
                // Rows 0-2 are display-only; Enter on the button opens
                // the confirm modal — same as pressing 'r'.
                if idx == 3 {
                    self.open_confirm_rotate_db_password();
                }
            }
        }
    }

    async fn do_toggle_flag(&mut self, idx: usize) {
        let flag = &self.flags[idx];
        let new_val = !flag.enabled;
        let key = flag.key.clone();
        let label = flag.label.clone();
        match db::toggle_flag(&self.client, &key, new_val).await {
            Ok(()) => {
                self.flags[idx].enabled = new_val;
                let st = if new_val { "ON" } else { "OFF" };
                self.toast(format!("{label} is now {st}"), StatusKind::Success);
            }
            Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
        }
    }

    async fn do_toggle_ai(&mut self, idx: usize) {
        let ws_id = match self.ai_ws_idx.and_then(|i| self.workspaces.get(i)) {
            Some(ws) => ws.id.clone(),
            None => return,
        };
        let settings = match &self.ai_settings {
            Some(s) => s,
            None => return,
        };
        match idx {
            0 => {
                let v = !settings.enforce_ai;
                match db::set_ai_enforcement(&self.client, &ws_id, v).await {
                    Ok(()) => {
                        if let Some(ref mut s) = self.ai_settings {
                            s.enforce_ai = v;
                        }
                        let st = if v { "ON" } else { "OFF" };
                        self.toast(format!("Enforcement: {st}"), StatusKind::Success);
                    }
                    Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                }
            }
            1 => {
                let v = !settings.show_model_selector;
                match db::set_model_selector(&self.client, &ws_id, v).await {
                    Ok(()) => {
                        if let Some(ref mut s) = self.ai_settings {
                            s.show_model_selector = v;
                        }
                        let st = if v { "Visible" } else { "Hidden" };
                        self.toast(format!("Model selector: {st}"), StatusKind::Success);
                    }
                    Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                }
            }
            3 => self.open_pick_provider(),
            4 => self.open_edit_default_model(),
            _ => {}
        }
    }

    fn open_pick_provider(&mut self) {
        let providers = match self.ai_settings.as_ref() {
            Some(s) => &s.providers,
            None => return,
        };
        if providers.is_empty() {
            self.toast(
                "No custom AI providers configured for this workspace".into(),
                StatusKind::Info,
            );
            return;
        }
        // Default selection: highlight the currently-set provider, if any.
        let current_id = self
            .ai_settings
            .as_ref()
            .and_then(|s| s.default_provider_id.clone());
        let idx = current_id
            .and_then(|cid| providers.iter().position(|p| p.id == cid))
            .unwrap_or(0);
        self.modal = Some(Modal::PickProvider { idx });
        self.focus = Focus::Modal;
    }

    fn open_edit_default_model(&mut self) {
        let cur = self
            .ai_settings
            .as_ref()
            .and_then(|s| s.default_provider_model.clone())
            .unwrap_or_default();
        let cursor = cur.len();
        self.modal = Some(Modal::EditDefaultModel {
            text: cur,
            cursor,
            error: None,
        });
        self.focus = Focus::Modal;
    }

    async fn modal_pick_provider(&mut self, key: KeyEvent) {
        let idx = match &self.modal {
            Some(Modal::PickProvider { idx }) => *idx,
            _ => return,
        };
        let n = self
            .ai_settings
            .as_ref()
            .map(|s| s.providers.len())
            .unwrap_or(0);
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => {
                if idx > 0 {
                    self.modal = Some(Modal::PickProvider { idx: idx - 1 });
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if idx + 1 < n {
                    self.modal = Some(Modal::PickProvider { idx: idx + 1 });
                }
            }
            KeyCode::Enter => {
                let ws_id = match self.ai_ws_idx.and_then(|i| self.workspaces.get(i)) {
                    Some(ws) => ws.id.clone(),
                    None => {
                        self.modal = None;
                        self.focus = Focus::Content;
                        return;
                    }
                };
                let (provider_id, label) = match self
                    .ai_settings
                    .as_ref()
                    .and_then(|s| s.providers.get(idx))
                {
                    Some(p) => (p.id.clone(), p.label.clone()),
                    None => {
                        self.modal = None;
                        self.focus = Focus::Content;
                        return;
                    }
                };
                let model = self
                    .ai_settings
                    .as_ref()
                    .and_then(|s| s.default_provider_model.clone());
                match db::set_default_provider(
                    &self.client,
                    &ws_id,
                    Some(&provider_id),
                    model.as_deref(),
                )
                .await
                {
                    Ok(()) => {
                        if let Some(ref mut s) = self.ai_settings {
                            s.default_source = "custom".into();
                            s.default_provider_id = Some(provider_id);
                        }
                        self.toast(
                            format!("Default provider: {label}"),
                            StatusKind::Success,
                        );
                    }
                    Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                }
                self.modal = None;
                self.focus = Focus::Content;
            }
            _ => {}
        }
    }

    async fn modal_edit_default_model(&mut self, key: KeyEvent) {
        let (mut text, mut cursor, _err) = match self.modal.take() {
            Some(Modal::EditDefaultModel { text, cursor, error }) => (text, cursor, error),
            other => {
                self.modal = other;
                return;
            }
        };
        match key.code {
            KeyCode::Char(c) => {
                text.insert(cursor, c);
                cursor += 1;
            }
            KeyCode::Backspace => {
                if cursor > 0 {
                    cursor -= 1;
                    text.remove(cursor);
                }
            }
            KeyCode::Delete => {
                if cursor < text.len() {
                    text.remove(cursor);
                }
            }
            KeyCode::Left => cursor = cursor.saturating_sub(1),
            KeyCode::Right => {
                if cursor < text.len() {
                    cursor += 1;
                }
            }
            KeyCode::Home => cursor = 0,
            KeyCode::End => cursor = text.len(),
            KeyCode::Enter => {
                let trimmed = text.trim().to_string();
                if trimmed.is_empty() {
                    self.modal = Some(Modal::EditDefaultModel {
                        text,
                        cursor,
                        error: Some("Model name is required".into()),
                    });
                    return;
                }
                let ws_id = match self.ai_ws_idx.and_then(|i| self.workspaces.get(i)) {
                    Some(ws) => ws.id.clone(),
                    None => {
                        self.modal = None;
                        self.focus = Focus::Content;
                        return;
                    }
                };
                let provider_id = self
                    .ai_settings
                    .as_ref()
                    .and_then(|s| s.default_provider_id.clone());
                match db::set_default_provider(
                    &self.client,
                    &ws_id,
                    provider_id.as_deref(),
                    Some(&trimmed),
                )
                .await
                {
                    Ok(()) => {
                        if let Some(ref mut s) = self.ai_settings {
                            s.default_source = "custom".into();
                            s.default_provider_model = Some(trimmed.clone());
                        }
                        self.toast(format!("Default model: {trimmed}"), StatusKind::Success);
                    }
                    Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                }
                self.modal = None;
                self.focus = Focus::Content;
                return;
            }
            _ => {}
        }
        self.modal = Some(Modal::EditDefaultModel {
            text,
            cursor,
            error: None,
        });
    }

    fn open_change_role(&mut self) {
        let idx = match self.table_state.selected() {
            Some(i) if i < self.members.len() => i,
            _ => return,
        };
        let cur = &self.members[idx].role;
        let ri = ROLES.iter().position(|r| r == cur).unwrap_or(2);
        self.modal = Some(Modal::SelectRole {
            member_idx: idx,
            role_idx: ri,
        });
        self.focus = Focus::Modal;
    }

    fn open_add_member(&mut self) {
        if self.workspaces.is_empty() {
            self.toast("No workspaces available".into(), StatusKind::Error);
            return;
        }
        self.modal = Some(Modal::AddStep1Workspace { idx: 0 });
        self.focus = Focus::Modal;
    }

    fn open_remove_member(&mut self) {
        let idx = match self.table_state.selected() {
            Some(i) if i < self.members.len() => i,
            _ => return,
        };
        if self.members[idx].role == "owner" {
            self.toast("Cannot remove workspace owner".into(), StatusKind::Error);
            return;
        }
        self.modal = Some(Modal::ConfirmRemove {
            member_idx: idx,
            btn: 0,
        });
        self.focus = Focus::Modal;
    }

    fn open_ws_selector(&mut self) {
        if self.workspaces.is_empty() {
            self.toast("No workspaces available".into(), StatusKind::Error);
            return;
        }
        self.modal = Some(Modal::SelectWorkspace {
            idx: self.ai_ws_idx.unwrap_or(0),
        });
        self.focus = Focus::Modal;
    }

    // ── Credits & Plan helpers ──────────────────────────

    fn open_edit_credits(&mut self, field: u8) {
        let idx = match self.table_state.selected() {
            Some(i) if i < self.credit_balances.len() => i,
            _ => return,
        };
        let b = &self.credit_balances[idx];
        let cur = match field {
            0 => b.daily_credits,
            1 => b.monthly_credits,
            2 => b.rollover_credits,
            _ => 0,
        };
        let text = cur.to_string();
        let cursor = text.len();
        self.modal = Some(Modal::EditCredits {
            balance_idx: idx,
            field,
            text,
            cursor,
            error: None,
        });
        self.focus = Focus::Modal;
    }

    fn open_pick_plan_type(&mut self) {
        let idx = match self.table_state.selected() {
            Some(i) if i < self.credit_balances.len() => i,
            _ => return,
        };
        let cur = &self.credit_balances[idx].plan_type;
        let pi = db::PLAN_TYPES
            .iter()
            .position(|p| *p == cur.as_str())
            .unwrap_or(0);
        self.modal = Some(Modal::PickPlanType {
            balance_idx: idx,
            idx: pi,
        });
        self.focus = Focus::Modal;
    }

    // ── Modal key handling ──────────────────────────────

    async fn handle_modal_key(&mut self, key: KeyEvent) {
        if key.code == KeyCode::Esc {
            self.modal = None;
            self.focus = Focus::Content;
            return;
        }

        // Dispatch based on modal type
        let modal_ref_type = self.modal.as_ref().map(|m| match m {
            Modal::ConfirmToggleAdmin { .. } => 0,
            Modal::SelectRole { .. } => 1,
            Modal::ConfirmRemove { .. } => 2,
            Modal::AddStep1Workspace { .. } => 3,
            Modal::AddStep2Email { .. } => 4,
            Modal::AddStep3Role { .. } => 5,
            Modal::SelectWorkspace { .. } => 6,
            Modal::EditAllowlistEntry { .. } => 7,
            Modal::ConfirmAllowlistRemove { .. } => 8,
            Modal::EditIngressEntry { .. } => 9,
            Modal::ConfirmIngressRemove { .. } => 10,
            Modal::EditEnvValue { .. } => 11,
            Modal::ConfirmEnvApply { .. } => 12,
            Modal::ConfirmSquidApply { .. } => 13,
            Modal::ConfirmCloudflaredApply { .. } => 14,
            Modal::PickProvider { .. } => 15,
            Modal::EditDefaultModel { .. } => 16,
            Modal::EditCredits { .. } => 17,
            Modal::PickPlanType { .. } => 18,
            Modal::ConfirmCreditsApply { .. } => 19,
            Modal::EditApiKeyOrigins { .. } => 20,
            Modal::EditApiKeyTools { .. } => 21,
            Modal::EditModeTools { .. } => 22,
            Modal::PickPlatformRole { .. } => 23,
            Modal::ConfirmRotateDbPassword { .. } => 24,
            Modal::RotateInProgress { .. } => 25,
            Modal::RotateResult { .. } => 26,
            Modal::EditSandboxRule { .. } => 27,
            Modal::ConfirmSandboxRuleRemove { .. } => 28,
            Modal::EditSandboxSettings { .. } => 29,
            Modal::EditSystemRule { .. } => 30,
            Modal::ConfirmSystemRuleRemove { .. } => 31,
        });

        match modal_ref_type {
            Some(0) => self.modal_confirm_admin(key).await,
            Some(1) => self.modal_select_role(key).await,
            Some(2) => self.modal_confirm_remove(key).await,
            Some(3) => self.modal_add_ws(key).await,
            Some(4) => self.modal_add_email(key).await,
            Some(5) => self.modal_add_role(key).await,
            Some(6) => self.modal_sel_ws(key).await,
            Some(7) => self.modal_edit_allowlist(key).await,
            Some(8) => self.modal_confirm_allowlist_remove(key).await,
            Some(9) => self.modal_edit_ingress(key).await,
            Some(10) => self.modal_confirm_ingress_remove(key).await,
            Some(11) => self.modal_edit_env(key).await,
            Some(12) => self.modal_confirm_env_apply(key).await,
            Some(13) => self.modal_confirm_squid_apply(key).await,
            Some(14) => self.modal_confirm_cloudflared_apply(key).await,
            Some(15) => self.modal_pick_provider(key).await,
            Some(16) => self.modal_edit_default_model(key).await,
            Some(17) => self.modal_edit_credits(key).await,
            Some(18) => self.modal_pick_plan_type(key).await,
            Some(19) => self.modal_confirm_credits_apply(key).await,
            Some(20) => self.modal_edit_api_key_origins(key).await,
            Some(21) => self.modal_edit_api_key_tools(key).await,
            Some(22) => self.modal_edit_mode_tools(key).await,
            Some(23) => self.modal_pick_platform_role(key).await,
            Some(24) => self.modal_confirm_rotate_db_password(key).await,
            Some(25) => { /* RotateInProgress: ignore keys; runs to completion */ }
            Some(26) => self.modal_rotate_result(key).await,
            Some(27) => self.modal_edit_sandbox_rule(key).await,
            Some(28) => self.modal_confirm_sandbox_rule_remove(key).await,
            Some(29) => self.modal_edit_sandbox_settings(key).await,
            Some(30) => self.modal_edit_system_rule(key).await,
            Some(31) => self.modal_confirm_system_rule_remove(key).await,
            _ => {}
        }
    }

    // ── Platform role picker (Users screen, `r` shortcut) ──

    fn open_pick_platform_role(&mut self) {
        let idx = match self.table_state.selected() {
            Some(i) if i < self.users.len() => i,
            _ => return,
        };
        let cur = &self.users[idx].platform_role;
        let ri = PLATFORM_ROLES.iter().position(|r| r == cur).unwrap_or(2);
        self.modal = Some(Modal::PickPlatformRole { user_idx: idx, idx: ri });
        self.focus = Focus::Modal;
    }

    async fn modal_pick_platform_role(&mut self, key: KeyEvent) {
        let (user_idx, role_idx) = match &self.modal {
            Some(Modal::PickPlatformRole { user_idx, idx }) => (*user_idx, *idx),
            _ => return,
        };
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => {
                if role_idx > 0 {
                    self.modal = Some(Modal::PickPlatformRole { user_idx, idx: role_idx - 1 });
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if role_idx < PLATFORM_ROLES.len() - 1 {
                    self.modal = Some(Modal::PickPlatformRole { user_idx, idx: role_idx + 1 });
                }
            }
            // Single-key direct selection — 1-click promote.
            // Press 'o'/'a'/'m'/'v' from the picker to apply immediately.
            KeyCode::Char('o') => self.apply_platform_role(user_idx, "owner").await,
            KeyCode::Char('a') => self.apply_platform_role(user_idx, "admin").await,
            KeyCode::Char('m') => self.apply_platform_role(user_idx, "member").await,
            KeyCode::Char('v') => self.apply_platform_role(user_idx, "viewer").await,
            KeyCode::Enter => {
                let role = PLATFORM_ROLES[role_idx];
                self.apply_platform_role(user_idx, role).await;
            }
            _ => {}
        }
    }

    async fn apply_platform_role(&mut self, user_idx: usize, role: &str) {
        if user_idx >= self.users.len() {
            self.modal = None;
            self.focus = Focus::Content;
            return;
        }
        let cur = self.users[user_idx].platform_role.clone();
        if cur == role {
            self.toast(format!("Role unchanged ({role})"), StatusKind::Info);
            self.modal = None;
            self.focus = Focus::Content;
            return;
        }
        let id = self.users[user_idx].id.clone();
        let email = self.users[user_idx].email.clone();
        match db::set_platform_role(&self.client, &id, role).await {
            Ok(()) => {
                self.users[user_idx].platform_role = role.to_string();
                self.toast(format!("{email} → platform_role = {role}"), StatusKind::Success);
            }
            Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
        }
        self.modal = None;
        self.focus = Focus::Content;
    }

    // ── Server Config modal handlers ───────────────────

    async fn modal_edit_allowlist(&mut self, key: KeyEvent) {
        let (idx, mut text, mut cursor, _err) = match self.modal.take() {
            Some(Modal::EditAllowlistEntry { idx, text, cursor, error }) => (idx, text, cursor, error),
            other => {
                self.modal = other;
                return;
            }
        };
        match key.code {
            KeyCode::Char(c) => {
                text.insert(cursor, c);
                cursor += 1;
            }
            KeyCode::Backspace => {
                if cursor > 0 {
                    cursor -= 1;
                    text.remove(cursor);
                }
            }
            KeyCode::Delete => {
                if cursor < text.len() {
                    text.remove(cursor);
                }
            }
            KeyCode::Left => cursor = cursor.saturating_sub(1),
            KeyCode::Right => {
                if cursor < text.len() {
                    cursor += 1;
                }
            }
            KeyCode::Home => cursor = 0,
            KeyCode::End => cursor = text.len(),
            KeyCode::Enter => {
                let trimmed = text.trim().to_string();
                if trimmed.is_empty() {
                    self.modal = Some(Modal::EditAllowlistEntry {
                        idx,
                        text,
                        cursor,
                        error: Some("Hostname is required".into()),
                    });
                    return;
                }
                // Validate basic hostname charset
                if !trimmed.chars().all(|ch| {
                    ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '_'
                }) {
                    self.modal = Some(Modal::EditAllowlistEntry {
                        idx,
                        text,
                        cursor,
                        error: Some("Invalid hostname (a-z 0-9 . - _)".into()),
                    });
                    return;
                }
                let mut list = self.squid_view_list();
                match idx {
                    Some(i) if i < list.len() => list[i] = trimmed.clone(),
                    _ => list.push(trimmed.clone()),
                }
                // dedupe preserving order
                let mut seen = std::collections::HashSet::new();
                list.retain(|x| seen.insert(x.clone()));
                self.sc_squid_dirty = Some(list);
                self.modal = None;
                self.focus = Focus::Content;
                self.toast("Pending — press A to apply".into(), StatusKind::Info);
                return;
            }
            _ => {}
        }
        self.modal = Some(Modal::EditAllowlistEntry {
            idx,
            text,
            cursor,
            error: None,
        });
    }

    async fn modal_confirm_allowlist_remove(&mut self, key: KeyEvent) {
        let (idx, btn) = match &self.modal {
            Some(Modal::ConfirmAllowlistRemove { idx, btn }) => (*idx, *btn),
            _ => return,
        };
        match key.code {
            KeyCode::Left | KeyCode::Right | KeyCode::Tab => {
                self.modal = Some(Modal::ConfirmAllowlistRemove { idx, btn: 1 - btn });
            }
            KeyCode::Enter => {
                if btn == 1 {
                    let mut list = self.squid_view_list();
                    if idx < list.len() {
                        let removed = list.remove(idx);
                        self.sc_squid_dirty = Some(list);
                        self.toast(format!("Removed {removed} (pending)"), StatusKind::Info);
                        self.clamp_selection();
                    }
                }
                self.modal = None;
                self.focus = Focus::Content;
            }
            _ => {}
        }
    }

    async fn modal_edit_ingress(&mut self, key: KeyEvent) {
        let (idx, mut host, mut service, mut field, mut cursor, _err) = match self.modal.take() {
            Some(Modal::EditIngressEntry { idx, host, service, field, cursor, error }) => {
                (idx, host, service, field, cursor, error)
            }
            other => {
                self.modal = other;
                return;
            }
        };

        // helpers to read/write current field
        let get = |field: usize, host: &String, service: &String| -> String {
            if field == 0 { host.clone() } else { service.clone() }
        };
        let set = |field: usize, host: &mut String, service: &mut String, v: String| {
            if field == 0 { *host = v; } else { *service = v; }
        };

        match key.code {
            KeyCode::Tab | KeyCode::Down => {
                field = (field + 1) % 2;
                cursor = get(field, &host, &service).len();
            }
            KeyCode::BackTab | KeyCode::Up => {
                field = if field == 0 { 1 } else { 0 };
                cursor = get(field, &host, &service).len();
            }
            KeyCode::Char(c) => {
                let mut t = get(field, &host, &service);
                t.insert(cursor, c);
                cursor += 1;
                set(field, &mut host, &mut service, t);
            }
            KeyCode::Backspace => {
                if cursor > 0 {
                    cursor -= 1;
                    let mut t = get(field, &host, &service);
                    t.remove(cursor);
                    set(field, &mut host, &mut service, t);
                }
            }
            KeyCode::Delete => {
                let mut t = get(field, &host, &service);
                if cursor < t.len() {
                    t.remove(cursor);
                    set(field, &mut host, &mut service, t);
                }
            }
            KeyCode::Left => cursor = cursor.saturating_sub(1),
            KeyCode::Right => {
                let l = get(field, &host, &service).len();
                if cursor < l {
                    cursor += 1;
                }
            }
            KeyCode::Home => cursor = 0,
            KeyCode::End => cursor = get(field, &host, &service).len(),
            KeyCode::Enter => {
                let svc_trim = service.trim();
                if svc_trim.is_empty() {
                    self.modal = Some(Modal::EditIngressEntry {
                        idx,
                        host,
                        service,
                        field,
                        cursor,
                        error: Some("Service is required (e.g. http://localhost:3000)".into()),
                    });
                    return;
                }
                let mut list = self.cloudflared_view_list();
                let new_entry = sc::IngressEntry {
                    hostname: host.trim().to_string(),
                    service: svc_trim.to_string(),
                };
                match idx {
                    Some(i) if i < list.len() => list[i] = new_entry,
                    _ => {
                        // Insert before any catch-all (empty hostname) entry to stay valid
                        if let Some(pos) = list.iter().position(|e| e.hostname.is_empty()) {
                            list.insert(pos, new_entry);
                        } else {
                            list.push(new_entry);
                        }
                    }
                }
                self.sc_cloudflared_dirty = Some(list);
                self.modal = None;
                self.focus = Focus::Content;
                self.toast("Pending — press A to apply".into(), StatusKind::Info);
                return;
            }
            _ => {}
        }
        self.modal = Some(Modal::EditIngressEntry {
            idx,
            host,
            service,
            field,
            cursor,
            error: None,
        });
    }

    async fn modal_confirm_ingress_remove(&mut self, key: KeyEvent) {
        let (idx, btn) = match &self.modal {
            Some(Modal::ConfirmIngressRemove { idx, btn }) => (*idx, *btn),
            _ => return,
        };
        match key.code {
            KeyCode::Left | KeyCode::Right | KeyCode::Tab => {
                self.modal = Some(Modal::ConfirmIngressRemove { idx, btn: 1 - btn });
            }
            KeyCode::Enter => {
                if btn == 1 {
                    let mut list = self.cloudflared_view_list();
                    if idx < list.len() {
                        list.remove(idx);
                        self.sc_cloudflared_dirty = Some(list);
                        self.toast("Removed (pending)".into(), StatusKind::Info);
                        self.clamp_selection();
                    }
                }
                self.modal = None;
                self.focus = Focus::Content;
            }
            _ => {}
        }
    }

    async fn modal_edit_env(&mut self, key: KeyEvent) {
        let (idx, k, mut text, mut cursor, _err) = match self.modal.take() {
            Some(Modal::EditEnvValue { idx, key, text, cursor, error }) => (idx, key, text, cursor, error),
            other => {
                self.modal = other;
                return;
            }
        };
        match key.code {
            KeyCode::Char(c) => {
                text.insert(cursor, c);
                cursor += 1;
            }
            KeyCode::Backspace => {
                if cursor > 0 {
                    cursor -= 1;
                    text.remove(cursor);
                }
            }
            KeyCode::Delete => {
                if cursor < text.len() {
                    text.remove(cursor);
                }
            }
            KeyCode::Left => cursor = cursor.saturating_sub(1),
            KeyCode::Right => {
                if cursor < text.len() {
                    cursor += 1;
                }
            }
            KeyCode::Home => cursor = 0,
            KeyCode::End => cursor = text.len(),
            KeyCode::Enter => {
                let mut dirty = self.sc_env_dirty.take().unwrap_or_default();
                if let Some(slot) = dirty.iter_mut().find(|(kk, _)| *kk == k) {
                    slot.1 = text.clone();
                } else {
                    dirty.push((k.clone(), text.clone()));
                }
                self.sc_env_dirty = Some(dirty);
                self.modal = None;
                self.focus = Focus::Content;
                self.toast("Pending — press A to apply (restarts API)".into(), StatusKind::Info);
                return;
            }
            _ => {}
        }
        self.modal = Some(Modal::EditEnvValue {
            idx,
            key: k,
            text,
            cursor,
            error: None,
        });
    }

    async fn modal_confirm_env_apply(&mut self, key: KeyEvent) {
        let btn = match &self.modal {
            Some(Modal::ConfirmEnvApply { btn }) => *btn,
            _ => return,
        };
        match key.code {
            KeyCode::Left | KeyCode::Right | KeyCode::Tab => {
                self.modal = Some(Modal::ConfirmEnvApply { btn: 1 - btn });
            }
            KeyCode::Enter => {
                self.modal = None;
                self.focus = Focus::Content;
                if btn == 1 {
                    self.do_apply_env().await;
                }
            }
            _ => {}
        }
    }

    async fn modal_confirm_squid_apply(&mut self, key: KeyEvent) {
        let btn = match &self.modal {
            Some(Modal::ConfirmSquidApply { btn }) => *btn,
            _ => return,
        };
        match key.code {
            KeyCode::Left | KeyCode::Right | KeyCode::Tab => {
                self.modal = Some(Modal::ConfirmSquidApply { btn: 1 - btn });
            }
            KeyCode::Enter => {
                self.modal = None;
                self.focus = Focus::Content;
                if btn == 1 {
                    self.do_apply_squid().await;
                }
            }
            _ => {}
        }
    }

    async fn modal_confirm_cloudflared_apply(&mut self, key: KeyEvent) {
        let btn = match &self.modal {
            Some(Modal::ConfirmCloudflaredApply { btn }) => *btn,
            _ => return,
        };
        match key.code {
            KeyCode::Left | KeyCode::Right | KeyCode::Tab => {
                self.modal = Some(Modal::ConfirmCloudflaredApply { btn: 1 - btn });
            }
            KeyCode::Enter => {
                self.modal = None;
                self.focus = Focus::Content;
                if btn == 1 {
                    self.do_apply_cloudflared().await;
                }
            }
            _ => {}
        }
    }

    async fn do_apply_squid(&mut self) {
        let raw = match &self.sc_squid {
            Some(sc::ConfigState::Loaded(s)) => s.raw.clone(),
            _ => {
                self.toast("Squid not loaded".into(), StatusKind::Error);
                return;
            }
        };
        let hosts = match self.sc_squid_dirty.clone() {
            Some(d) => d,
            None => return,
        };
        let new_raw = sc::rewrite_squid_allowlist(&raw, &hosts);
        match sc::apply_squid(&new_raw).await {
            Ok(()) => {
                self.toast("Squid allowlist applied".into(), StatusKind::Success);
                self.load_server_config_subview().await;
            }
            Err(e) => self.toast(format!("Apply failed: {e}"), StatusKind::Error),
        }
    }

    async fn do_apply_cloudflared(&mut self) {
        let raw = match &self.sc_cloudflared {
            Some(sc::ConfigState::Loaded(s)) => s.raw.clone(),
            _ => {
                self.toast("cloudflared not loaded".into(), StatusKind::Error);
                return;
            }
        };
        let entries = match self.sc_cloudflared_dirty.clone() {
            Some(d) => d,
            None => return,
        };
        let new_raw = sc::rewrite_cloudflared_ingress(&raw, &entries);
        match sc::apply_cloudflared(&new_raw).await {
            Ok(()) => {
                self.toast("cloudflared ingress applied".into(), StatusKind::Success);
                self.load_server_config_subview().await;
            }
            Err(e) => self.toast(format!("Apply failed: {e}"), StatusKind::Error),
        }
    }

    async fn do_apply_env(&mut self) {
        let raw = match &self.sc_env {
            Some(sc::ConfigState::Loaded(s)) => s.raw.clone(),
            _ => {
                self.toast(".env not loaded".into(), StatusKind::Error);
                return;
            }
        };
        let dirty = match self.sc_env_dirty.clone() {
            Some(d) => d,
            None => return,
        };
        let mut new_raw = raw;
        for (k, v) in &dirty {
            new_raw = sc::upsert_env_value(&new_raw, k, v);
        }
        match sc::apply_env(&new_raw).await {
            Ok(()) => {
                self.toast(".env applied — doable.service restarted".into(), StatusKind::Success);
                self.load_server_config_subview().await;
            }
            Err(e) => self.toast(format!("Apply failed: {e}"), StatusKind::Error),
        }
    }

    async fn modal_confirm_admin(&mut self, key: KeyEvent) {
        let (user_idx, btn) = match &self.modal {
            Some(Modal::ConfirmToggleAdmin { user_idx, btn }) => (*user_idx, *btn),
            _ => return,
        };
        match key.code {
            KeyCode::Left | KeyCode::Right | KeyCode::Tab => {
                self.modal = Some(Modal::ConfirmToggleAdmin {
                    user_idx,
                    btn: 1 - btn,
                });
            }
            KeyCode::Enter => {
                if btn == 1 {
                    let user = &self.users[user_idx];
                    let new_val = !user.is_admin;
                    let email = user.email.clone();
                    let id = user.id.clone();
                    match db::toggle_admin(&self.client, &id, new_val).await {
                        Ok(()) => {
                            self.users[user_idx].is_admin = new_val;
                            if new_val {
                                self.toast(
                                    format!("{email} is now platform admin"),
                                    StatusKind::Success,
                                );
                            } else {
                                self.toast(
                                    format!("{email} admin access revoked"),
                                    StatusKind::Success,
                                );
                            }
                        }
                        Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                    }
                }
                self.modal = None;
                self.focus = Focus::Content;
            }
            _ => {}
        }
    }

    async fn modal_select_role(&mut self, key: KeyEvent) {
        let (member_idx, role_idx) = match &self.modal {
            Some(Modal::SelectRole {
                member_idx,
                role_idx,
            }) => (*member_idx, *role_idx),
            _ => return,
        };
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => {
                if role_idx > 0 {
                    self.modal = Some(Modal::SelectRole {
                        member_idx,
                        role_idx: role_idx - 1,
                    });
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if role_idx < ROLES.len() - 1 {
                    self.modal = Some(Modal::SelectRole {
                        member_idx,
                        role_idx: role_idx + 1,
                    });
                }
            }
            KeyCode::Enter => {
                let m = &self.members[member_idx];
                let new_role = ROLES[role_idx];
                if new_role == m.role {
                    self.toast("Role unchanged".into(), StatusKind::Info);
                } else {
                    let ws_id = m.workspace_id.clone();
                    let u_id = m.user_id.clone();
                    let email = m.email.clone();
                    match db::change_role(&self.client, &ws_id, &u_id, new_role).await {
                        Ok(()) => {
                            self.members[member_idx].role = new_role.to_string();
                            self.toast(
                                format!("{email} is now {new_role}"),
                                StatusKind::Success,
                            );
                        }
                        Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                    }
                }
                self.modal = None;
                self.focus = Focus::Content;
            }
            _ => {}
        }
    }

    async fn modal_confirm_remove(&mut self, key: KeyEvent) {
        let (member_idx, btn) = match &self.modal {
            Some(Modal::ConfirmRemove { member_idx, btn }) => (*member_idx, *btn),
            _ => return,
        };
        match key.code {
            KeyCode::Left | KeyCode::Right | KeyCode::Tab => {
                self.modal = Some(Modal::ConfirmRemove {
                    member_idx,
                    btn: 1 - btn,
                });
            }
            KeyCode::Enter => {
                if btn == 1 {
                    let m = &self.members[member_idx];
                    let ws_id = m.workspace_id.clone();
                    let u_id = m.user_id.clone();
                    let email = m.email.clone();
                    match db::remove_member(&self.client, &ws_id, &u_id).await {
                        Ok(()) => {
                            self.members.remove(member_idx);
                            self.clamp_selection();
                            self.toast(format!("Removed {email}"), StatusKind::Success);
                        }
                        Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                    }
                }
                self.modal = None;
                self.focus = Focus::Content;
            }
            _ => {}
        }
    }

    async fn modal_add_ws(&mut self, key: KeyEvent) {
        let idx = match &self.modal {
            Some(Modal::AddStep1Workspace { idx }) => *idx,
            _ => return,
        };
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => {
                if idx > 0 {
                    self.modal = Some(Modal::AddStep1Workspace { idx: idx - 1 });
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if idx < self.workspaces.len().saturating_sub(1) {
                    self.modal = Some(Modal::AddStep1Workspace { idx: idx + 1 });
                }
            }
            KeyCode::Enter => {
                self.modal = Some(Modal::AddStep2Email {
                    ws_idx: idx,
                    text: String::new(),
                    cursor: 0,
                    error: None,
                });
            }
            _ => {}
        }
    }

    async fn modal_add_email(&mut self, key: KeyEvent) {
        let (ws_idx, mut text, mut cursor, _error) = match self.modal.take() {
            Some(Modal::AddStep2Email {
                ws_idx,
                text,
                cursor,
                error,
            }) => (ws_idx, text, cursor, error),
            other => {
                self.modal = other;
                return;
            }
        };

        match key.code {
            KeyCode::Char(c) => {
                text.insert(cursor, c);
                cursor += 1;
            }
            KeyCode::Backspace => {
                if cursor > 0 {
                    cursor -= 1;
                    text.remove(cursor);
                }
            }
            KeyCode::Delete => {
                if cursor < text.len() {
                    text.remove(cursor);
                }
            }
            KeyCode::Left => {
                cursor = cursor.saturating_sub(1);
            }
            KeyCode::Right => {
                if cursor < text.len() {
                    cursor += 1;
                }
            }
            KeyCode::Home => {
                cursor = 0;
            }
            KeyCode::End => {
                cursor = text.len();
            }
            KeyCode::Enter => {
                let trimmed = text.trim().to_string();
                if trimmed.is_empty() {
                    self.modal = Some(Modal::AddStep2Email {
                        ws_idx,
                        text,
                        cursor,
                        error: Some("Email is required".into()),
                    });
                    return;
                }
                match db::find_user_by_email(&self.client, &trimmed).await {
                    Ok(Some(user_id)) => {
                        let ws_id = &self.workspaces[ws_idx].id;
                        match db::is_already_member(&self.client, ws_id, &user_id).await {
                            Ok(true) => {
                                self.modal = Some(Modal::AddStep2Email {
                                    ws_idx,
                                    text,
                                    cursor,
                                    error: Some("Already a member of this workspace".into()),
                                });
                                return;
                            }
                            Ok(false) => {
                                self.modal = Some(Modal::AddStep3Role {
                                    ws_idx,
                                    user_id,
                                    email: trimmed,
                                    role_idx: 1, // default to "member"
                                });
                                return;
                            }
                            Err(e) => {
                                self.modal = Some(Modal::AddStep2Email {
                                    ws_idx,
                                    text,
                                    cursor,
                                    error: Some(format!("DB error: {e}")),
                                });
                                return;
                            }
                        }
                    }
                    Ok(None) => {
                        self.modal = Some(Modal::AddStep2Email {
                            ws_idx,
                            text,
                            cursor,
                            error: Some("User not found — they must sign up first".into()),
                        });
                        return;
                    }
                    Err(e) => {
                        self.modal = Some(Modal::AddStep2Email {
                            ws_idx,
                            text,
                            cursor,
                            error: Some(format!("DB error: {e}")),
                        });
                        return;
                    }
                }
            }
            KeyCode::Esc => {
                // already handled above, but just in case
                self.modal = None;
                self.focus = Focus::Content;
                return;
            }
            _ => {}
        }

        // If modal wasn't set by Enter handling, put back the email modal
        if self.modal.is_none() {
            self.modal = Some(Modal::AddStep2Email {
                ws_idx,
                text,
                cursor,
                error: None,
            });
        }
    }

    async fn modal_add_role(&mut self, key: KeyEvent) {
        let (ws_idx, user_id, email, role_idx) = match &self.modal {
            Some(Modal::AddStep3Role {
                ws_idx,
                user_id,
                email,
                role_idx,
            }) => (*ws_idx, user_id.clone(), email.clone(), *role_idx),
            _ => return,
        };
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => {
                if role_idx > 0 {
                    self.modal = Some(Modal::AddStep3Role {
                        ws_idx,
                        user_id,
                        email,
                        role_idx: role_idx - 1,
                    });
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if role_idx < ADD_ROLES.len() - 1 {
                    self.modal = Some(Modal::AddStep3Role {
                        ws_idx,
                        user_id,
                        email,
                        role_idx: role_idx + 1,
                    });
                }
            }
            KeyCode::Enter => {
                let role = ADD_ROLES[role_idx];
                let ws_id = self.workspaces[ws_idx].id.clone();
                let em = email.clone();
                match db::add_member(&self.client, &ws_id, &user_id, role).await {
                    Ok(()) => {
                        self.toast(format!("Added {em} as {role}"), StatusKind::Success);
                        self.members =
                            db::fetch_members(&self.client).await.unwrap_or_default();
                        self.clamp_selection();
                    }
                    Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                }
                self.modal = None;
                self.focus = Focus::Content;
            }
            _ => {}
        }
    }

    async fn modal_sel_ws(&mut self, key: KeyEvent) {
        let idx = match &self.modal {
            Some(Modal::SelectWorkspace { idx }) => *idx,
            _ => return,
        };
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => {
                if idx > 0 {
                    self.modal = Some(Modal::SelectWorkspace { idx: idx - 1 });
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if idx < self.workspaces.len().saturating_sub(1) {
                    self.modal = Some(Modal::SelectWorkspace { idx: idx + 1 });
                }
            }
            KeyCode::Enter => {
                self.ai_ws_idx = Some(idx);
                self.load_ai_for_ws().await;
                self.table_state.select(Some(0));
                self.modal = None;
                self.focus = Focus::Content;
            }
            _ => {}
        }
    }

    // ── Mouse handling ──────────────────────────────────

    pub async fn handle_mouse(&mut self, mouse: MouseEvent) {
        match mouse.kind {
            MouseEventKind::Down(MouseButton::Left) => {
                self.handle_click(mouse.column, mouse.row).await;
            }
            MouseEventKind::ScrollUp => {
                if self.modal.is_none() && self.focus == Focus::Content {
                    self.move_sel(-3);
                }
            }
            MouseEventKind::ScrollDown => {
                if self.modal.is_none() && self.focus == Focus::Content {
                    self.move_sel(3);
                }
            }
            _ => {}
        }
    }

    async fn handle_click(&mut self, col: u16, row: u16) {
        // Check targets in reverse (overlays first)
        let targets = self.click_targets.clone();
        for (rect, target) in targets.iter().rev() {
            if col >= rect.x
                && col < rect.x + rect.width
                && row >= rect.y
                && row < rect.y + rect.height
            {
                match target {
                    ClickTarget::SidebarItem(i) => {
                        self.focus = Focus::Sidebar;
                        self.go_to(*i).await;
                        return;
                    }
                    ClickTarget::ContentRow(i) => {
                        self.focus = Focus::Content;
                        self.table_state.select(Some(*i));
                        return;
                    }
                    ClickTarget::ModalButton(i) => {
                        self.set_modal_btn(*i);
                        let enter = KeyEvent::from(KeyCode::Enter);
                        self.handle_modal_key(enter).await;
                        return;
                    }
                    ClickTarget::ModalListItem(i) => {
                        self.set_modal_list(*i);
                        let enter = KeyEvent::from(KeyCode::Enter);
                        self.handle_modal_key(enter).await;
                        return;
                    }
                    ClickTarget::ActionButton(i) => {
                        self.focus = Focus::Content;
                        match i {
                            0 => self.open_change_role(),
                            1 => self.open_add_member(),
                            2 => self.open_remove_member(),
                            _ => {}
                        }
                        return;
                    }
                    ClickTarget::WsTab(i) => {
                        self.ai_ws_idx = Some(*i);
                        self.load_ai_for_ws().await;
                        self.table_state.select(Some(0));
                        self.focus = Focus::Content;
                        return;
                    }
                }
            }
        }

        // Click outside modal dismisses it
        if self.modal.is_some() {
            self.modal = None;
            self.focus = Focus::Content;
        }
    }

    fn set_modal_btn(&mut self, b: usize) {
        match &self.modal {
            Some(Modal::ConfirmToggleAdmin { user_idx, .. }) => {
                let ui = *user_idx;
                self.modal = Some(Modal::ConfirmToggleAdmin { user_idx: ui, btn: b });
            }
            Some(Modal::ConfirmRemove { member_idx, .. }) => {
                let mi = *member_idx;
                self.modal = Some(Modal::ConfirmRemove {
                    member_idx: mi,
                    btn: b,
                });
            }
            Some(Modal::ConfirmAllowlistRemove { idx, .. }) => {
                let i = *idx;
                self.modal = Some(Modal::ConfirmAllowlistRemove { idx: i, btn: b });
            }
            Some(Modal::ConfirmIngressRemove { idx, .. }) => {
                let i = *idx;
                self.modal = Some(Modal::ConfirmIngressRemove { idx: i, btn: b });
            }
            Some(Modal::ConfirmEnvApply { .. }) => {
                self.modal = Some(Modal::ConfirmEnvApply { btn: b });
            }
            Some(Modal::ConfirmSquidApply { .. }) => {
                self.modal = Some(Modal::ConfirmSquidApply { btn: b });
            }
            Some(Modal::ConfirmCloudflaredApply { .. }) => {
                self.modal = Some(Modal::ConfirmCloudflaredApply { btn: b });
            }
            Some(Modal::ConfirmCreditsApply { balance_idx, .. }) => {
                let bi = *balance_idx;
                self.modal = Some(Modal::ConfirmCreditsApply { balance_idx: bi, btn: b });
            }
            Some(Modal::ConfirmRotateDbPassword { .. }) => {
                self.modal = Some(Modal::ConfirmRotateDbPassword { btn: b });
            }
            _ => {}
        }
    }

    fn set_modal_list(&mut self, i: usize) {
        match &self.modal {
            Some(Modal::SelectRole { member_idx, .. }) => {
                let mi = *member_idx;
                self.modal = Some(Modal::SelectRole {
                    member_idx: mi,
                    role_idx: i,
                });
            }
            Some(Modal::AddStep1Workspace { .. }) => {
                self.modal = Some(Modal::AddStep1Workspace { idx: i });
            }
            Some(Modal::AddStep3Role {
                ws_idx,
                user_id,
                email,
                ..
            }) => {
                let (w, u, e) = (*ws_idx, user_id.clone(), email.clone());
                self.modal = Some(Modal::AddStep3Role {
                    ws_idx: w,
                    user_id: u,
                    email: e,
                    role_idx: i,
                });
            }
            Some(Modal::SelectWorkspace { .. }) => {
                self.modal = Some(Modal::SelectWorkspace { idx: i });
            }
            Some(Modal::PickProvider { .. }) => {
                self.modal = Some(Modal::PickProvider { idx: i });
            }
            Some(Modal::PickPlanType { balance_idx, .. }) => {
                let bi = *balance_idx;
                self.modal = Some(Modal::PickPlanType { balance_idx: bi, idx: i });
            }
            Some(Modal::PickPlatformRole { user_idx, .. }) => {
                let ui = *user_idx;
                self.modal = Some(Modal::PickPlatformRole { user_idx: ui, idx: i });
            }
            _ => {}
        }
    }

    // ── Credits & Plan modal handlers ──────────────────

    async fn modal_edit_credits(&mut self, key: KeyEvent) {
        let (balance_idx, field, mut text, mut cursor, _err) = match self.modal.take() {
            Some(Modal::EditCredits { balance_idx, field, text, cursor, error }) => {
                (balance_idx, field, text, cursor, error)
            }
            other => {
                self.modal = other;
                return;
            }
        };
        match key.code {
            KeyCode::Char(c) if c.is_ascii_digit() => {
                text.insert(cursor, c);
                cursor += 1;
            }
            KeyCode::Backspace => {
                if cursor > 0 {
                    cursor -= 1;
                    text.remove(cursor);
                }
            }
            KeyCode::Delete => {
                if cursor < text.len() {
                    text.remove(cursor);
                }
            }
            KeyCode::Left => cursor = cursor.saturating_sub(1),
            KeyCode::Right => {
                if cursor < text.len() {
                    cursor += 1;
                }
            }
            KeyCode::Home => cursor = 0,
            KeyCode::End => cursor = text.len(),
            KeyCode::Enter => {
                let trimmed = text.trim().to_string();
                let parsed: Result<i32, _> = trimmed.parse();
                let val = match parsed {
                    Ok(v) if v >= 0 => v,
                    _ => {
                        self.modal = Some(Modal::EditCredits {
                            balance_idx,
                            field,
                            text,
                            cursor,
                            error: Some("Enter a non-negative integer".into()),
                        });
                        return;
                    }
                };
                // Apply immediately (fields are independent, no staging needed)
                let bal = match self.credit_balances.get(balance_idx) {
                    Some(b) => b,
                    None => {
                        self.modal = None;
                        self.focus = Focus::Content;
                        return;
                    }
                };
                let id = bal.id.clone();
                let email = bal.user_email.clone();
                let ws = bal.workspace_name.clone();
                let daily = if field == 0 { val } else { bal.daily_credits };
                let monthly = if field == 1 { val } else { bal.monthly_credits };
                let rollover = if field == 2 { val } else { bal.rollover_credits };
                let plan = bal.plan_type.clone();
                match db::set_credit_balance(
                    &self.client,
                    &id,
                    daily,
                    monthly,
                    rollover,
                    &plan,
                )
                .await
                {
                    Ok(()) => {
                        if let Some(b) = self.credit_balances.get_mut(balance_idx) {
                            b.daily_credits = daily;
                            b.monthly_credits = monthly;
                            b.rollover_credits = rollover;
                        }
                        let label = match field {
                            0 => "daily",
                            1 => "monthly",
                            _ => "rollover",
                        };
                        self.toast(
                            format!("{email} @ {ws}: {label} = {val}"),
                            StatusKind::Success,
                        );
                    }
                    Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                }
                self.modal = None;
                self.focus = Focus::Content;
                return;
            }
            _ => {}
        }
        self.modal = Some(Modal::EditCredits {
            balance_idx,
            field,
            text,
            cursor,
            error: None,
        });
    }

    async fn modal_pick_plan_type(&mut self, key: KeyEvent) {
        let (balance_idx, idx) = match &self.modal {
            Some(Modal::PickPlanType { balance_idx, idx }) => (*balance_idx, *idx),
            _ => return,
        };
        match key.code {
            KeyCode::Up | KeyCode::Char('k') => {
                if idx > 0 {
                    self.modal = Some(Modal::PickPlanType { balance_idx, idx: idx - 1 });
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if idx + 1 < db::PLAN_TYPES.len() {
                    self.modal = Some(Modal::PickPlanType { balance_idx, idx: idx + 1 });
                }
            }
            KeyCode::Enter => {
                let bal = match self.credit_balances.get(balance_idx) {
                    Some(b) => b,
                    None => {
                        self.modal = None;
                        self.focus = Focus::Content;
                        return;
                    }
                };
                let new_plan = db::PLAN_TYPES[idx];
                if new_plan == bal.plan_type {
                    self.toast("Plan unchanged".into(), StatusKind::Info);
                    self.modal = None;
                    self.focus = Focus::Content;
                    return;
                }
                let id = bal.id.clone();
                let email = bal.user_email.clone();
                let daily = bal.daily_credits;
                let monthly = bal.monthly_credits;
                let rollover = bal.rollover_credits;
                match db::set_credit_balance(
                    &self.client,
                    &id,
                    daily,
                    monthly,
                    rollover,
                    new_plan,
                )
                .await
                {
                    Ok(()) => {
                        if let Some(b) = self.credit_balances.get_mut(balance_idx) {
                            b.plan_type = new_plan.to_string();
                        }
                        self.toast(
                            format!("{email}: plan = {new_plan}"),
                            StatusKind::Success,
                        );
                    }
                    Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                }
                self.modal = None;
                self.focus = Focus::Content;
            }
            _ => {}
        }
    }

    async fn modal_confirm_credits_apply(&mut self, key: KeyEvent) {
        // Reserved for future batch-apply flow. Currently edits apply immediately,
        // so this just acts as a confirm-and-close.
        let (balance_idx, btn) = match &self.modal {
            Some(Modal::ConfirmCreditsApply { balance_idx, btn }) => (*balance_idx, *btn),
            _ => return,
        };
        match key.code {
            KeyCode::Left | KeyCode::Right | KeyCode::Tab => {
                self.modal = Some(Modal::ConfirmCreditsApply {
                    balance_idx,
                    btn: 1 - btn,
                });
            }
            KeyCode::Enter => {
                self.modal = None;
                self.focus = Focus::Content;
            }
            _ => {}
        }
    }

    // ── API Keys / Mode Tools openers ──────────────────

    fn open_edit_api_key_origins(&mut self, idx: usize) {
        let key = match self.api_keys.get(idx) {
            Some(k) => k,
            None => return,
        };
        let cur = key.allowed_origins.join(", ");
        let cursor = cur.len();
        self.modal = Some(Modal::EditApiKeyOrigins {
            key_idx: idx,
            text: cur,
            cursor,
            error: None,
        });
        self.focus = Focus::Modal;
    }

    fn open_edit_api_key_tools(&mut self, idx: usize) {
        let key = match self.api_keys.get(idx) {
            Some(k) => k,
            None => return,
        };
        let cur = key.allowed_tools.join(", ");
        let cursor = cur.len();
        self.modal = Some(Modal::EditApiKeyTools {
            key_idx: idx,
            text: cur,
            cursor,
            error: None,
        });
        self.focus = Focus::Modal;
    }

    fn open_edit_mode_tools(&mut self, idx: usize) {
        let row = match self.mode_tools.get(idx) {
            Some(r) => r,
            None => return,
        };
        let cur = row.allowed_tools.join(", ");
        let cursor = cur.len();
        self.modal = Some(Modal::EditModeTools {
            mode_idx: idx,
            text: cur,
            cursor,
            error: None,
        });
        self.focus = Focus::Modal;
    }

    // ── API Keys / Mode Tools modal handlers ───────────

    async fn modal_edit_api_key_origins(&mut self, key: KeyEvent) {
        let (key_idx, mut text, mut cursor, _err) = match self.modal.take() {
            Some(Modal::EditApiKeyOrigins { key_idx, text, cursor, error }) => (key_idx, text, cursor, error),
            other => { self.modal = other; return; }
        };
        match key.code {
            KeyCode::Char(c) => { text.insert(cursor, c); cursor += 1; }
            KeyCode::Backspace => { if cursor > 0 { cursor -= 1; text.remove(cursor); } }
            KeyCode::Delete => { if cursor < text.len() { text.remove(cursor); } }
            KeyCode::Left => cursor = cursor.saturating_sub(1),
            KeyCode::Right => { if cursor < text.len() { cursor += 1; } }
            KeyCode::Home => cursor = 0,
            KeyCode::End => cursor = text.len(),
            KeyCode::Enter => {
                let parsed: Vec<String> = text
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                let (id, label) = match self.api_keys.get(key_idx) {
                    Some(k) => (k.id.clone(), k.label.clone().unwrap_or_else(|| k.prefix.clone())),
                    None => { self.modal = None; self.focus = Focus::Content; return; }
                };
                match db::set_api_key_origins(&self.client, &id, &parsed).await {
                    Ok(()) => {
                        if let Some(k) = self.api_keys.get_mut(key_idx) {
                            k.allowed_origins = parsed.clone();
                        }
                        self.toast(
                            format!("{}: origins = {} entries", label, parsed.len()),
                            StatusKind::Success,
                        );
                    }
                    Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                }
                self.modal = None;
                self.focus = Focus::Content;
                return;
            }
            _ => {}
        }
        self.modal = Some(Modal::EditApiKeyOrigins { key_idx, text, cursor, error: None });
    }

    async fn modal_edit_api_key_tools(&mut self, key: KeyEvent) {
        let (key_idx, mut text, mut cursor, _err) = match self.modal.take() {
            Some(Modal::EditApiKeyTools { key_idx, text, cursor, error }) => (key_idx, text, cursor, error),
            other => { self.modal = other; return; }
        };
        match key.code {
            KeyCode::Char(c) => { text.insert(cursor, c); cursor += 1; }
            KeyCode::Backspace => { if cursor > 0 { cursor -= 1; text.remove(cursor); } }
            KeyCode::Delete => { if cursor < text.len() { text.remove(cursor); } }
            KeyCode::Left => cursor = cursor.saturating_sub(1),
            KeyCode::Right => { if cursor < text.len() { cursor += 1; } }
            KeyCode::Home => cursor = 0,
            KeyCode::End => cursor = text.len(),
            KeyCode::Enter => {
                let parsed: Vec<String> = text
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                let (id, label) = match self.api_keys.get(key_idx) {
                    Some(k) => (k.id.clone(), k.label.clone().unwrap_or_else(|| k.prefix.clone())),
                    None => { self.modal = None; self.focus = Focus::Content; return; }
                };
                match db::set_api_key_tools(&self.client, &id, &parsed).await {
                    Ok(()) => {
                        if let Some(k) = self.api_keys.get_mut(key_idx) {
                            k.allowed_tools = parsed.clone();
                        }
                        self.toast(
                            format!("{}: tools = {} entries", label, parsed.len()),
                            StatusKind::Success,
                        );
                    }
                    Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                }
                self.modal = None;
                self.focus = Focus::Content;
                return;
            }
            _ => {}
        }
        self.modal = Some(Modal::EditApiKeyTools { key_idx, text, cursor, error: None });
    }

    async fn modal_edit_mode_tools(&mut self, key: KeyEvent) {
        let (mode_idx, mut text, mut cursor, _err) = match self.modal.take() {
            Some(Modal::EditModeTools { mode_idx, text, cursor, error }) => (mode_idx, text, cursor, error),
            other => { self.modal = other; return; }
        };
        match key.code {
            KeyCode::Char(c) => { text.insert(cursor, c); cursor += 1; }
            KeyCode::Backspace => { if cursor > 0 { cursor -= 1; text.remove(cursor); } }
            KeyCode::Delete => { if cursor < text.len() { text.remove(cursor); } }
            KeyCode::Left => cursor = cursor.saturating_sub(1),
            KeyCode::Right => { if cursor < text.len() { cursor += 1; } }
            KeyCode::Home => cursor = 0,
            KeyCode::End => cursor = text.len(),
            KeyCode::Enter => {
                let parsed: Vec<String> = text
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                let mode = match self.mode_tools.get(mode_idx) {
                    Some(r) => r.mode.clone(),
                    None => { self.modal = None; self.focus = Focus::Content; return; }
                };
                match db::set_mode_tools(&self.client, &mode, &parsed, None).await {
                    Ok(()) => {
                        if let Some(r) = self.mode_tools.get_mut(mode_idx) {
                            r.allowed_tools = parsed.clone();
                        }
                        self.toast(
                            format!("{}: tools = {} entries", mode, parsed.len()),
                            StatusKind::Success,
                        );
                    }
                    Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                }
                self.modal = None;
                self.focus = Focus::Content;
                return;
            }
            _ => {}
        }
        self.modal = Some(Modal::EditModeTools { mode_idx, text, cursor, error: None });
    }

    // ── DB Credentials handlers ────────────────────────

    fn open_confirm_rotate_db_password(&mut self) {
        if self.db_credentials.is_none() {
            self.toast("DB credentials not loaded".into(), StatusKind::Error);
            return;
        }
        self.modal = Some(Modal::ConfirmRotateDbPassword { btn: 0 });
        self.focus = Focus::Modal;
    }

    fn copy_db_url_to_clipboard(&mut self) {
        let url = match &self.db_credentials {
            Some(s) => s.db_url.clone(),
            None => {
                self.toast("DB credentials not loaded".into(), StatusKind::Error);
                return;
            }
        };
        match arboard::Clipboard::new().and_then(|mut c| c.set_text(url)) {
            Ok(()) => self.toast("Server-local URL copied to clipboard".into(), StatusKind::Success),
            Err(e) => self.toast(format!("Clipboard error: {e}"), StatusKind::Error),
        }
    }

    async fn modal_confirm_rotate_db_password(&mut self, key: KeyEvent) {
        let btn = match &self.modal {
            Some(Modal::ConfirmRotateDbPassword { btn }) => *btn,
            _ => return,
        };
        match key.code {
            KeyCode::Left | KeyCode::Right | KeyCode::Tab => {
                self.modal = Some(Modal::ConfirmRotateDbPassword { btn: 1 - btn });
            }
            KeyCode::Esc => {
                self.modal = None;
                self.focus = Focus::Content;
            }
            KeyCode::Enter => {
                if btn == 1 {
                    self.do_rotate_db_password().await;
                } else {
                    self.modal = None;
                    self.focus = Focus::Content;
                }
            }
            _ => {}
        }
    }

    async fn modal_rotate_result(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Enter | KeyCode::Esc | KeyCode::Char(' ') => {
                self.modal = None;
                self.focus = Focus::Content;
                // Refresh display state — the password we hold now matches
                // the new one, so re-parse from db_url.
                self.load_server_config_subview().await;
            }
            _ => {}
        }
    }

    /// 5-stage rotation pipeline.  We deliberately render between stages so
    /// the operator sees progress; if we awaited everything in one shot the
    /// modal would freeze on "Confirming..." for several seconds during the
    /// systemctl restart at the end.
    ///
    /// On success we update `self.db_url` in-place so re-rendering the
    /// sub-view shows the new password.  Note: the existing PG client
    /// connection survives the ALTER USER (Postgres only re-checks creds on
    /// the next auth) so admin doesn't get kicked out.
    async fn do_rotate_db_password(&mut self) {
        // Snapshot creds we need across stages.
        let (user, db) = match &self.db_credentials {
            Some(s) => (s.user.clone(), s.db.clone()),
            None => {
                self.modal = Some(Modal::RotateResult {
                    success: false,
                    message: "DB credentials not loaded — cannot rotate.".into(),
                });
                return;
            }
        };
        let remote = self.remote_ctx.clone();

        // Stage 1: generate password.
        self.modal = Some(Modal::RotateInProgress {
            progress_msg: "Generating new password...".into(),
        });
        let new_pass = sc::generate_hex_password().await;
        if new_pass.len() != 64 || !new_pass.chars().all(|c| c.is_ascii_hexdigit()) {
            self.modal = Some(Modal::RotateResult {
                success: false,
                message: "Stage 1 (generate): produced invalid hex password".into(),
            });
            return;
        }

        // Stage 2: ALTER USER via the existing pg client.  We use a literal
        // since password is hex-only (no escape concerns), and quote with
        // single quotes per Postgres SQL string literal rules.
        self.modal = Some(Modal::RotateInProgress {
            progress_msg: "Updating Postgres role...".into(),
        });
        let alter_sql = format!("ALTER USER \"{}\" WITH PASSWORD '{}'", user.replace('"', "\"\""), new_pass);
        if let Err(e) = self.client.batch_execute(&alter_sql).await {
            self.modal = Some(Modal::RotateResult {
                success: false,
                message: format!("Stage 2 (ALTER USER) failed: {e}"),
            });
            return;
        }

        // Stage 3: write /etc/doable/.db_pass.  Use printf via stdin to keep
        // the password out of the process command line / shell history.
        // We pass the new password as a single-quoted literal to bash; since
        // it's pure hex, no escaping is needed.
        self.modal = Some(Modal::RotateInProgress {
            progress_msg: "Writing /etc/doable/.db_pass...".into(),
        });
        let write_cmd = format!(
            "printf '%s' '{}' | sudo -n tee /etc/doable/.db_pass > /dev/null && sudo -n chmod 600 /etc/doable/.db_pass",
            new_pass
        );
        if let Err(e) = sc::run_remote_or_local(remote.as_ref(), &write_cmd).await {
            self.modal = Some(Modal::RotateResult {
                success: false,
                message: format!("Stage 3 (.db_pass write) failed: {e}"),
            });
            return;
        }

        // Stage 4: update DATABASE_URL in /opt/doable/.env via sed.  We use a
        // sed delimiter of `|` since the URL contains `:` and `/`.  The new
        // URL is fully quoted-bracket-safe (hex password).
        self.modal = Some(Modal::RotateInProgress {
            progress_msg: "Updating /opt/doable/.env...".into(),
        });
        let new_url = format!("postgres://{}:{}@localhost:5432/{}", user, new_pass, db);
        let sed_cmd = format!(
            "sudo -n sed -i 's|^DATABASE_URL=.*|DATABASE_URL={}|' /opt/doable/.env",
            new_url
        );
        if let Err(e) = sc::run_remote_or_local(remote.as_ref(), &sed_cmd).await {
            self.modal = Some(Modal::RotateResult {
                success: false,
                message: format!("Stage 4 (.env sed) failed: {e}"),
            });
            return;
        }

        // Stage 5: restart doable.service so the API picks up the new URL.
        self.modal = Some(Modal::RotateInProgress {
            progress_msg: "Restarting doable.service...".into(),
        });
        let restart_cmd = "sudo -n systemctl restart doable.service".to_string();
        if let Err(e) = sc::run_remote_or_local(remote.as_ref(), &restart_cmd).await {
            self.modal = Some(Modal::RotateResult {
                success: false,
                message: format!("Stage 5 (systemctl restart) failed: {e}"),
            });
            return;
        }

        // All stages succeeded — patch our in-memory db_url so the sub-view
        // renders the new password.  When admin reconnects later (e.g. after
        // an idle disconnect) it'll use this URL automatically.
        // For tunnel mode the user/pass are the same; we keep the host:port
        // portion as-is so the tunnel still works.
        let updated_url = if let Some((u, _, hp, d)) = sc::parse_db_url(&self.db_url) {
            format!("postgres://{}:{}@{}/{}", u, new_pass, hp, d)
        } else {
            new_url
        };
        self.db_url = updated_url;

        self.modal = Some(Modal::RotateResult {
            success: true,
            message:
                "Password rotated. Your existing admin connection is still valid; if it drops, restart `doable admin --remote ...` to use the new credentials."
                    .into(),
        });
    }

    // ── Sandbox rule management ─────────────────────────

    fn sandbox_workspace_id(&self) -> String {
        self.workspaces
            .first()
            .map(|w| w.id.clone())
            .unwrap_or_default()
    }

    fn sandbox_open_add(&mut self) {
        self.modal = Some(Modal::EditSandboxRule {
            idx: None,
            rule_type_idx: 0, // "tool"
            pattern: String::new(),
            action_idx: 1,    // "deny" (safer default)
            priority: "100".into(),
            reason: String::new(),
            field: 1,         // start on pattern field
            cursor: 0,
            error: None,
        });
        self.focus = Focus::Modal;
    }

    fn sandbox_open_edit(&mut self) {
        let idx = match self.table_state.selected() {
            Some(i) if i < self.sandbox_rules.len() => i,
            _ => return,
        };
        let r = &self.sandbox_rules[idx];
        let rt_idx = SANDBOX_RULE_TYPES.iter().position(|t| *t == r.rule_type).unwrap_or(0);
        let act_idx = if r.action == "deny" { 1 } else { 0 };
        self.modal = Some(Modal::EditSandboxRule {
            idx: Some(idx),
            rule_type_idx: rt_idx,
            pattern: r.pattern.clone(),
            action_idx: act_idx,
            priority: r.priority.to_string(),
            reason: r.reason.clone().unwrap_or_default(),
            field: 1, // start on pattern
            cursor: r.pattern.len(),
            error: None,
        });
        self.focus = Focus::Modal;
    }

    fn sandbox_open_delete(&mut self) {
        let idx = match self.table_state.selected() {
            Some(i) if i < self.sandbox_rules.len() => i,
            _ => return,
        };
        self.modal = Some(Modal::ConfirmSandboxRuleRemove { idx, btn: 0 });
        self.focus = Focus::Modal;
    }

    async fn sandbox_toggle_rule(&mut self) {
        let idx = match self.table_state.selected() {
            Some(i) if i < self.sandbox_rules.len() => i,
            _ => return,
        };
        let rule_id = self.sandbox_rules[idx].id.clone();
        match db::toggle_sandbox_rule(&self.client, &rule_id).await {
            Ok(new_enabled) => {
                self.sandbox_rules[idx].enabled = new_enabled;
                let state = if new_enabled { "enabled" } else { "disabled" };
                self.toast(format!("Rule {} {state}", &rule_id[..8]), StatusKind::Success);
            }
            Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
        }
    }

    fn sandbox_open_settings(&mut self) {
        let settings = self.sandbox_settings.as_ref();
        let backend_str = settings
            .and_then(|s| s.sandbox_backend.as_deref())
            .unwrap_or("auto");
        let backend_idx = SANDBOX_BACKENDS
            .iter()
            .position(|b| *b == backend_str)
            .unwrap_or(0);
        let tool_act = settings
            .and_then(|s| s.tool_default_action.as_deref())
            .unwrap_or("allow");
        let tool_idx = if tool_act == "deny" { 1 } else { 0 };
        let net_act = settings
            .and_then(|s| s.network_default_action.as_deref())
            .unwrap_or("deny");
        let net_idx = if net_act == "deny" { 1 } else { 0 };
        self.modal = Some(Modal::EditSandboxSettings {
            backend_idx,
            tool_action_idx: tool_idx,
            net_action_idx: net_idx,
            field: 0,
        });
        self.focus = Focus::Modal;
    }

    async fn modal_edit_sandbox_rule(&mut self, key: KeyEvent) {
        let (idx, mut rt_idx, mut pattern, mut act_idx, mut priority, mut reason, mut field, mut cursor, _err) =
            match self.modal.take() {
                Some(Modal::EditSandboxRule {
                    idx, rule_type_idx, pattern, action_idx, priority, reason, field, cursor, error,
                }) => (idx, rule_type_idx, pattern, action_idx, priority, reason, field, cursor, error),
                other => {
                    self.modal = other;
                    return;
                }
            };

        match key.code {
            KeyCode::Tab => {
                field = (field + 1) % 5;
                // Reset cursor for text fields
                cursor = match field {
                    1 => pattern.len(),
                    3 => priority.len(),
                    4 => reason.len(),
                    _ => 0,
                };
            }
            KeyCode::BackTab => {
                field = if field == 0 { 4 } else { field - 1 };
                cursor = match field {
                    1 => pattern.len(),
                    3 => priority.len(),
                    4 => reason.len(),
                    _ => 0,
                };
            }
            // Selector fields (rule_type, action)
            KeyCode::Left | KeyCode::Right if field == 0 => {
                let delta: isize = if key.code == KeyCode::Left { -1 } else { 1 };
                rt_idx = ((rt_idx as isize + delta).rem_euclid(SANDBOX_RULE_TYPES.len() as isize)) as usize;
            }
            KeyCode::Left | KeyCode::Right if field == 2 => {
                act_idx = 1 - act_idx;
            }
            // Text editing for pattern (1), priority (3), reason (4)
            KeyCode::Char(c) if field == 1 || field == 3 || field == 4 => {
                let text = match field {
                    1 => &mut pattern,
                    3 => &mut priority,
                    _ => &mut reason,
                };
                text.insert(cursor, c);
                cursor += 1;
            }
            KeyCode::Backspace if field == 1 || field == 3 || field == 4 => {
                let text = match field {
                    1 => &mut pattern,
                    3 => &mut priority,
                    _ => &mut reason,
                };
                if cursor > 0 {
                    cursor -= 1;
                    text.remove(cursor);
                }
            }
            KeyCode::Delete if field == 1 || field == 3 || field == 4 => {
                let text = match field {
                    1 => &mut pattern,
                    3 => &mut priority,
                    _ => &mut reason,
                };
                if cursor < text.len() {
                    text.remove(cursor);
                }
            }
            KeyCode::Left if field == 1 || field == 3 || field == 4 => {
                cursor = cursor.saturating_sub(1);
            }
            KeyCode::Right if field == 1 || field == 3 || field == 4 => {
                let text = match field {
                    1 => &pattern,
                    3 => &priority,
                    _ => &reason,
                };
                if cursor < text.len() {
                    cursor += 1;
                }
            }
            KeyCode::Home if field == 1 || field == 3 || field == 4 => cursor = 0,
            KeyCode::End if field == 1 || field == 3 || field == 4 => {
                let text = match field {
                    1 => &pattern,
                    3 => &priority,
                    _ => &reason,
                };
                cursor = text.len();
            }
            KeyCode::Enter => {
                // Validate
                let trimmed = pattern.trim().to_string();
                if trimmed.is_empty() {
                    self.modal = Some(Modal::EditSandboxRule {
                        idx, rule_type_idx: rt_idx, pattern, action_idx: act_idx,
                        priority, reason, field, cursor,
                        error: Some("Pattern is required".into()),
                    });
                    return;
                }
                let prio: i32 = match priority.trim().parse() {
                    Ok(p) => p,
                    Err(_) => {
                        self.modal = Some(Modal::EditSandboxRule {
                            idx, rule_type_idx: rt_idx, pattern, action_idx: act_idx,
                            priority, reason, field, cursor,
                            error: Some("Priority must be a number".into()),
                        });
                        return;
                    }
                };
                let rule_type = SANDBOX_RULE_TYPES[rt_idx];
                let action = SANDBOX_ACTIONS[act_idx];
                let reason_opt = if reason.trim().is_empty() { None } else { Some(reason.trim()) };

                let ws_id = self.sandbox_workspace_id();
                if let Some(i) = idx {
                    // Update existing
                    let rule_id = self.sandbox_rules[i].id.clone();
                    match db::update_sandbox_rule(
                        &self.client, &rule_id, rule_type, &trimmed, action, prio, reason_opt,
                    ).await {
                        Ok(()) => {
                            self.toast(format!("Rule updated: {rule_type} {action} {trimmed}"), StatusKind::Success);
                        }
                        Err(e) => {
                            self.toast(format!("Error: {e}"), StatusKind::Error);
                        }
                    }
                } else {
                    // Insert new
                    match db::insert_sandbox_rule(
                        &self.client, &ws_id, rule_type, &trimmed, action, prio, reason_opt,
                    ).await {
                        Ok(_id) => {
                            self.toast(format!("Rule added: {rule_type} {action} {trimmed}"), StatusKind::Success);
                        }
                        Err(e) => {
                            self.toast(format!("Error: {e}"), StatusKind::Error);
                        }
                    }
                }
                // Reload rules
                self.sandbox_rules = db::load_sandbox_rules(&self.client, &ws_id)
                    .await
                    .unwrap_or_default();
                self.clamp_selection();
                self.modal = None;
                self.focus = Focus::Content;
                return;
            }
            _ => {}
        }

        self.modal = Some(Modal::EditSandboxRule {
            idx, rule_type_idx: rt_idx, pattern, action_idx: act_idx,
            priority, reason, field, cursor, error: None,
        });
    }

    async fn modal_confirm_sandbox_rule_remove(&mut self, key: KeyEvent) {
        let (idx, btn) = match &self.modal {
            Some(Modal::ConfirmSandboxRuleRemove { idx, btn }) => (*idx, *btn),
            _ => return,
        };
        match key.code {
            KeyCode::Left | KeyCode::Right | KeyCode::Tab => {
                self.modal = Some(Modal::ConfirmSandboxRuleRemove { idx, btn: 1 - btn });
            }
            KeyCode::Enter => {
                if btn == 1 {
                    // Confirm delete
                    let rule_id = self.sandbox_rules[idx].id.clone();
                    let pattern = self.sandbox_rules[idx].pattern.clone();
                    match db::delete_sandbox_rule(&self.client, &rule_id).await {
                        Ok(()) => {
                            self.toast(format!("Rule deleted: {pattern}"), StatusKind::Success);
                            let ws_id = self.sandbox_workspace_id();
                            self.sandbox_rules = db::load_sandbox_rules(&self.client, &ws_id)
                                .await
                                .unwrap_or_default();
                            self.clamp_selection();
                        }
                        Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                    }
                }
                self.modal = None;
                self.focus = Focus::Content;
            }
            _ => {}
        }
    }

    async fn modal_edit_sandbox_settings(&mut self, key: KeyEvent) {
        let (mut b_idx, mut t_idx, mut n_idx, mut field) = match &self.modal {
            Some(Modal::EditSandboxSettings {
                backend_idx, tool_action_idx, net_action_idx, field,
            }) => (*backend_idx, *tool_action_idx, *net_action_idx, *field),
            _ => return,
        };
        match key.code {
            KeyCode::Tab | KeyCode::Down | KeyCode::Char('j') => {
                field = (field + 1) % 3;
            }
            KeyCode::BackTab | KeyCode::Up | KeyCode::Char('k') => {
                field = if field == 0 { 2 } else { field - 1 };
            }
            KeyCode::Left | KeyCode::Right => {
                match field {
                    0 => {
                        let delta: isize = if key.code == KeyCode::Left { -1 } else { 1 };
                        b_idx = ((b_idx as isize + delta).rem_euclid(SANDBOX_BACKENDS.len() as isize)) as usize;
                    }
                    1 => t_idx = 1 - t_idx,
                    2 => n_idx = 1 - n_idx,
                    _ => {}
                }
            }
            KeyCode::Enter => {
                let ws_id = self.sandbox_workspace_id();
                let backend = if SANDBOX_BACKENDS[b_idx] == "auto" { None } else { Some(SANDBOX_BACKENDS[b_idx]) };
                let tool_act = Some(SANDBOX_ACTIONS[t_idx]);
                let net_act = Some(SANDBOX_ACTIONS[n_idx]);
                match db::upsert_sandbox_settings(
                    &self.client, &ws_id, backend, tool_act, net_act,
                ).await {
                    Ok(()) => {
                        self.toast("Sandbox settings saved".into(), StatusKind::Success);
                        self.sandbox_settings =
                            db::load_sandbox_settings(&self.client, &ws_id)
                                .await
                                .ok()
                                .flatten();
                    }
                    Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                }
                self.modal = None;
                self.focus = Focus::Content;
                return;
            }
            _ => {}
        }
        self.modal = Some(Modal::EditSandboxSettings {
            backend_idx: b_idx,
            tool_action_idx: t_idx,
            net_action_idx: n_idx,
            field,
        });
    }

    // ── System Rules CRUD helpers ──────────────────────────

    fn sysrule_open_add(&mut self) {
        self.modal = Some(Modal::EditSystemRule {
            idx: None,
            scope_idx: 0,
            rule_type_idx: 0,
            pattern: String::new(),
            action_idx: 1, // deny by default
            priority: "100".into(),
            is_floor: false,
            description: String::new(),
            field: 0,
            cursor: 0,
            error: None,
        });
        self.focus = Focus::Modal;
    }

    fn sysrule_open_edit(&mut self) {
        let idx = match self.table_state.selected() {
            Some(i) if i < self.system_rules.len() => i,
            _ => return,
        };
        let r = &self.system_rules[idx];
        let scope_idx = SYSTEM_RULE_SCOPES.iter().position(|s| *s == r.scope).unwrap_or(0);
        let rule_type_idx = SYSTEM_RULE_TYPES.iter().position(|t| *t == r.rule_type).unwrap_or(0);
        let action_idx = SANDBOX_ACTIONS.iter().position(|a| *a == r.action).unwrap_or(0);
        self.modal = Some(Modal::EditSystemRule {
            idx: Some(idx),
            scope_idx,
            rule_type_idx,
            pattern: r.pattern.clone(),
            action_idx,
            priority: r.priority.to_string(),
            is_floor: r.is_floor,
            description: r.description.clone().unwrap_or_default(),
            field: 0,
            cursor: 0,
            error: None,
        });
        self.focus = Focus::Modal;
    }

    fn sysrule_open_delete(&mut self) {
        let idx = match self.table_state.selected() {
            Some(i) if i < self.system_rules.len() => i,
            _ => return,
        };
        self.modal = Some(Modal::ConfirmSystemRuleRemove { idx, btn: 0 });
        self.focus = Focus::Modal;
    }

    async fn sysrule_toggle(&mut self) {
        let idx = match self.table_state.selected() {
            Some(i) if i < self.system_rules.len() => i,
            _ => return,
        };
        let rule_id = self.system_rules[idx].id.clone();
        match db::toggle_system_rule(&self.client, &rule_id).await {
            Ok(new_state) => {
                let label = if new_state { "enabled" } else { "disabled" };
                self.toast(format!("System rule {label}"), StatusKind::Success);
                self.system_rules = db::load_system_rules(&self.client)
                    .await
                    .unwrap_or_default();
            }
            Err(e) => self.toast(format!("Toggle error: {e}"), StatusKind::Error),
        }
    }

    async fn modal_edit_system_rule(&mut self, key: KeyEvent) {
        let (
            mut idx, mut scope_idx, mut rtype_idx, mut pattern,
            mut action_idx, mut priority, mut is_floor, mut desc,
            mut field, mut cursor, mut error,
        ) = match &self.modal {
            Some(Modal::EditSystemRule {
                idx, scope_idx, rule_type_idx, pattern, action_idx,
                priority, is_floor, description, field, cursor, error,
            }) => (
                *idx, *scope_idx, *rule_type_idx, pattern.clone(),
                *action_idx, priority.clone(), *is_floor, description.clone(),
                *field, *cursor, error.clone(),
            ),
            _ => return,
        };

        // 7 fields: 0=scope(sel), 1=rule_type(sel), 2=pattern(text),
        //           3=action(sel), 4=priority(text), 5=is_floor(toggle), 6=description(text)
        match key.code {
            KeyCode::Tab | KeyCode::Down | KeyCode::Char('j')
                if !matches!(field, 2 | 4 | 6) || key.code == KeyCode::Tab =>
            {
                field = (field + 1) % 7;
                cursor = match field {
                    2 => pattern.len(),
                    4 => priority.len(),
                    6 => desc.len(),
                    _ => 0,
                };
            }
            KeyCode::BackTab | KeyCode::Up | KeyCode::Char('k')
                if !matches!(field, 2 | 4 | 6) || key.code == KeyCode::BackTab =>
            {
                field = if field == 0 { 6 } else { field - 1 };
                cursor = match field {
                    2 => pattern.len(),
                    4 => priority.len(),
                    6 => desc.len(),
                    _ => 0,
                };
            }
            KeyCode::Left => match field {
                0 => scope_idx = if scope_idx == 0 { SYSTEM_RULE_SCOPES.len() - 1 } else { scope_idx - 1 },
                1 => rtype_idx = if rtype_idx == 0 { SYSTEM_RULE_TYPES.len() - 1 } else { rtype_idx - 1 },
                3 => action_idx = 1 - action_idx,
                5 => is_floor = !is_floor,
                2 => { if cursor > 0 { cursor -= 1; } }
                4 => { if cursor > 0 { cursor -= 1; } }
                6 => { if cursor > 0 { cursor -= 1; } }
                _ => {}
            }
            KeyCode::Right => match field {
                0 => scope_idx = (scope_idx + 1) % SYSTEM_RULE_SCOPES.len(),
                1 => rtype_idx = (rtype_idx + 1) % SYSTEM_RULE_TYPES.len(),
                3 => action_idx = 1 - action_idx,
                5 => is_floor = !is_floor,
                2 => { if cursor < pattern.len() { cursor += 1; } }
                4 => { if cursor < priority.len() { cursor += 1; } }
                6 => { if cursor < desc.len() { cursor += 1; } }
                _ => {}
            }
            KeyCode::Char(c) if matches!(field, 2 | 4 | 6) => {
                let text = match field {
                    2 => &mut pattern,
                    4 => &mut priority,
                    _ => &mut desc,
                };
                text.insert(cursor, c);
                cursor += 1;
                error = None;
            }
            KeyCode::Backspace if matches!(field, 2 | 4 | 6) && cursor > 0 => {
                let text = match field {
                    2 => &mut pattern,
                    4 => &mut priority,
                    _ => &mut desc,
                };
                cursor -= 1;
                text.remove(cursor);
                error = None;
            }
            KeyCode::Enter => {
                // Validate
                if pattern.trim().is_empty() {
                    error = Some("Pattern cannot be empty".into());
                } else if priority.trim().parse::<i32>().is_err() {
                    error = Some("Priority must be a number".into());
                } else {
                    let scope = SYSTEM_RULE_SCOPES[scope_idx];
                    let rtype = SYSTEM_RULE_TYPES[rtype_idx];
                    let action = SANDBOX_ACTIONS[action_idx];
                    let prio = priority.trim().parse::<i32>().unwrap();
                    let desc_opt = if desc.trim().is_empty() { None } else { Some(desc.trim()) };

                    let result = if let Some(i) = idx {
                        let rid = self.system_rules[i].id.clone();
                        db::update_system_rule(
                            &self.client, &rid, scope, rtype, pattern.trim(),
                            action, prio, is_floor, desc_opt,
                        ).await
                    } else {
                        db::insert_system_rule(
                            &self.client, scope, rtype, pattern.trim(),
                            action, prio, is_floor, desc_opt,
                        ).await.map(|_| ())
                    };

                    match result {
                        Ok(()) => {
                            let verb = if idx.is_some() { "updated" } else { "added" };
                            self.toast(format!("System rule {verb}"), StatusKind::Success);
                            self.system_rules = db::load_system_rules(&self.client)
                                .await
                                .unwrap_or_default();
                        }
                        Err(e) => self.toast(format!("Error: {e}"), StatusKind::Error),
                    }
                    self.modal = None;
                    self.focus = Focus::Content;
                    return;
                }
            }
            _ => {}
        }
        self.modal = Some(Modal::EditSystemRule {
            idx,
            scope_idx,
            rule_type_idx: rtype_idx,
            pattern,
            action_idx,
            priority,
            is_floor,
            description: desc,
            field,
            cursor,
            error,
        });
    }

    async fn modal_confirm_system_rule_remove(&mut self, key: KeyEvent) {
        let (idx, mut btn) = match &self.modal {
            Some(Modal::ConfirmSystemRuleRemove { idx, btn }) => (*idx, *btn),
            _ => return,
        };
        match key.code {
            KeyCode::Left | KeyCode::Right | KeyCode::Tab => btn = 1 - btn,
            KeyCode::Enter => {
                if btn == 1 && idx < self.system_rules.len() {
                    let rule_id = self.system_rules[idx].id.clone();
                    match db::delete_system_rule(&self.client, &rule_id).await {
                        Ok(()) => {
                            self.toast("System rule deleted".into(), StatusKind::Success);
                            self.system_rules = db::load_system_rules(&self.client)
                                .await
                                .unwrap_or_default();
                            self.clamp_selection();
                        }
                        Err(e) => self.toast(format!("Delete error: {e}"), StatusKind::Error),
                    }
                }
                self.modal = None;
                self.focus = Focus::Content;
                return;
            }
            _ => {}
        }
        self.modal = Some(Modal::ConfirmSystemRuleRemove { idx, btn });
    }
}
