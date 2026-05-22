//! Interactive welcome form — single-screen scrolling layout with labelled
//! inputs, radios, checkboxes, secure (masked) password entry, and a
//! `[ Run Setup ]` button at the bottom that gates on validation.
//!
//! The form is the default landing screen; `--demo` and the legacy CLI-args
//! path bypass it. See `crate::config::InstallConfig` for the produced shape.

use std::path::PathBuf;

use crossterm::event::{KeyCode, KeyModifiers};
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, BorderType, Borders, Paragraph, Wrap};
use ratatui::Frame;

use crate::installer::config::{InstallConfig, SshAuth, TargetMode, TunnelMode};

/// Per-field semantic kind. Drives both rendering and input handling.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldKind {
    /// Single-line text input.
    Text,
    /// Single-line text input with masked rendering.
    Secret,
    /// Multi-line text input (paste-friendly), with a `Secret`-ish mask
    /// (only the first line is rendered, rest as bullets).
    MultilineSecret,
    /// Radio group with named options.
    Radio,
    /// Checkbox.
    Checkbox,
    /// Number (u16), arrow-up/down to step.
    Number,
    /// File path (existence check).
    FilePath,
    /// Submission button.
    Button,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldId {
    TargetMode,
    Host,
    SshUser,
    SshPort,
    SshAuth,
    SshKeyPath,
    SshPassword,
    EnvName,
    DoableDomain,
    CreateAdmin,
    AdminEmail,
    AdminDisplayName,
    AdminPassword,
    TunnelMode,
    TunnelUuid,
    TunnelCertPem,
    TunnelCredentials,
    GithubClientId,
    GithubClientSecret,
    GoogleClientId,
    GoogleClientSecret,
    SupabaseClientId,
    SupabaseClientSecret,
    WithTmux,
    CreateDouser,
    Submit,
}

#[derive(Debug, Clone)]
pub struct Field {
    pub id: FieldId,
    pub label: &'static str,
    pub kind: FieldKind,
    pub required: bool,
    /// Plain-text contents (for Text/Secret/Number/FilePath/MultilineSecret).
    pub value: String,
    /// For Radio: list of human-readable option labels.
    pub radio_options: Vec<&'static str>,
    /// For Radio: currently selected index.
    pub radio_index: usize,
    /// For Checkbox: state.
    pub checked: bool,
    /// Optional help/hint shown next to the label.
    pub hint: &'static str,
}

impl Field {
    fn text(id: FieldId, label: &'static str, required: bool, default: &str) -> Self {
        Self {
            id,
            label,
            kind: FieldKind::Text,
            required,
            value: default.to_string(),
            radio_options: vec![],
            radio_index: 0,
            checked: false,
            hint: "",
        }
    }
    fn secret(id: FieldId, label: &'static str, required: bool) -> Self {
        Self {
            id,
            label,
            kind: FieldKind::Secret,
            required,
            value: String::new(),
            radio_options: vec![],
            radio_index: 0,
            checked: false,
            hint: "",
        }
    }
    fn multiline_secret(id: FieldId, label: &'static str) -> Self {
        Self {
            id,
            label,
            kind: FieldKind::MultilineSecret,
            required: true,
            value: String::new(),
            radio_options: vec![],
            radio_index: 0,
            checked: false,
            hint: "",
        }
    }
    fn radio(id: FieldId, label: &'static str, options: Vec<&'static str>) -> Self {
        Self {
            id,
            label,
            kind: FieldKind::Radio,
            required: true,
            value: String::new(),
            radio_options: options,
            radio_index: 0,
            checked: false,
            hint: "",
        }
    }
    fn checkbox(id: FieldId, label: &'static str, default: bool) -> Self {
        Self {
            id,
            label,
            kind: FieldKind::Checkbox,
            required: false,
            value: String::new(),
            radio_options: vec![],
            radio_index: 0,
            checked: default,
            hint: "",
        }
    }
    fn number(id: FieldId, label: &'static str, default: u16) -> Self {
        Self {
            id,
            label,
            kind: FieldKind::Number,
            required: true,
            value: default.to_string(),
            radio_options: vec![],
            radio_index: 0,
            checked: false,
            hint: "",
        }
    }
    fn filepath(id: FieldId, label: &'static str, required: bool) -> Self {
        Self {
            id,
            label,
            kind: FieldKind::FilePath,
            required,
            value: String::new(),
            radio_options: vec![],
            radio_index: 0,
            checked: false,
            hint: "",
        }
    }
    fn button(id: FieldId, label: &'static str) -> Self {
        Self {
            id,
            label,
            kind: FieldKind::Button,
            required: false,
            value: String::new(),
            radio_options: vec![],
            radio_index: 0,
            checked: false,
            hint: "",
        }
    }
    fn with_hint(mut self, h: &'static str) -> Self {
        self.hint = h;
        self
    }
}

/// Result of validating a single field.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Validation {
    /// Field has not been required to validate (e.g. optional + empty).
    Empty,
    Ok,
    Err(String),
}

#[derive(Debug)]
pub struct FormState {
    pub fields: Vec<Field>,
    pub focus: usize,
    pub scroll: u16,
    pub editing: bool,
    pub clipboard_msg: Option<String>,
    pub submit_requested: bool,
}

impl FormState {
    pub fn new() -> Self {
        let fields = vec![
            Field::radio(
                FieldId::TargetMode,
                "Target mode",
                vec!["Local (this server)", "Remote SSH"],
            )
            .with_hint("←/→ to switch"),
            Field::text(FieldId::Host, "Host", true, "")
                .with_hint("IPv4, IPv6, or DNS name"),
            Field::text(FieldId::SshUser, "SSH user", true, "ubuntu"),
            Field::number(FieldId::SshPort, "SSH port", 22),
            Field::radio(
                FieldId::SshAuth,
                "SSH auth method",
                vec!["Private key file", "Password"],
            ),
            Field::filepath(FieldId::SshKeyPath, "SSH key path", true)
                .with_hint("absolute path to private key"),
            Field::secret(FieldId::SshPassword, "SSH password", true),
            Field::text(FieldId::EnvName, "Environment name", true, "")
                .with_hint("lowercase [a-z0-9-]+"),
            Field::text(FieldId::DoableDomain, "Doable domain", false, "doable.me"),
            Field::checkbox(FieldId::CreateAdmin, "Create platform admin user?", true),
            Field::text(FieldId::AdminEmail, "Admin user email", true, ""),
            Field::text(FieldId::AdminDisplayName, "Admin user display name", true, ""),
            Field::secret(FieldId::AdminPassword, "Admin user password", true)
                .with_hint("≥12 chars, 1 upper + 1 lower + 1 digit"),
            Field::radio(
                FieldId::TunnelMode,
                "Cloudflare tunnel mode",
                vec![
                    "Interactive (cloudflared login)",
                    "Pre-supplied tunnel",
                ],
            ),
            Field::text(FieldId::TunnelUuid, "Tunnel UUID", true, "")
                .with_hint("UUID v4 shape"),
            Field::multiline_secret(FieldId::TunnelCertPem, "Tunnel cert.pem"),
            Field::multiline_secret(FieldId::TunnelCredentials, "Tunnel credentials JSON"),
            Field::text(FieldId::GithubClientId, "GitHub OAuth — Client ID", false, "")
                .with_hint("optional, starts Ov23li"),
            Field::secret(FieldId::GithubClientSecret, "GitHub OAuth — Client Secret", false),
            Field::text(FieldId::GoogleClientId, "Google OAuth — Client ID", false, "")
                .with_hint("optional, ends .apps.googleusercontent.com"),
            Field::secret(FieldId::GoogleClientSecret, "Google OAuth — Client Secret", false),
            Field::text(FieldId::SupabaseClientId, "Supabase Mgmt OAuth — Client ID", false, ""),
            Field::secret(FieldId::SupabaseClientSecret, "Supabase Mgmt OAuth — Client Secret", false),
            Field::checkbox(FieldId::WithTmux, "Install legacy tmux unit (DOABLE_WITH_TMUX)?", false),
            Field::checkbox(FieldId::CreateDouser, "Create douser sudo account?", true),
            Field::button(FieldId::Submit, "[ Run Setup ]"),
        ];
        Self {
            fields,
            focus: 0,
            scroll: 0,
            editing: false,
            clipboard_msg: None,
            submit_requested: false,
        }
    }

    pub fn current_kind(&self) -> FieldKind {
        self.fields
            .get(self.focus)
            .map(|f| f.kind)
            .unwrap_or(FieldKind::Text)
    }

    /// Whether a field at index should be displayed (some are conditional).
    pub fn is_visible(&self, idx: usize) -> bool {
        let f = &self.fields[idx];
        let target_remote = self.fields_by_id(FieldId::TargetMode).radio_index == 1;
        let auth_key = self.fields_by_id(FieldId::SshAuth).radio_index == 0;
        let create_admin = self.fields_by_id(FieldId::CreateAdmin).checked;
        let tunnel_pre = self.fields_by_id(FieldId::TunnelMode).radio_index == 1;
        match f.id {
            FieldId::Host
            | FieldId::SshUser
            | FieldId::SshPort
            | FieldId::SshAuth => target_remote,
            FieldId::SshKeyPath => target_remote && auth_key,
            FieldId::SshPassword => target_remote && !auth_key,
            FieldId::AdminEmail | FieldId::AdminDisplayName | FieldId::AdminPassword => {
                create_admin
            }
            FieldId::TunnelUuid | FieldId::TunnelCertPem | FieldId::TunnelCredentials => {
                tunnel_pre
            }
            _ => true,
        }
    }

    fn fields_by_id(&self, id: FieldId) -> &Field {
        self.fields.iter().find(|f| f.id == id).expect("field id present")
    }

    fn next_visible(&self, from: usize, dir: i32) -> usize {
        let n = self.fields.len();
        let mut i = from as i32;
        loop {
            i += dir;
            if i < 0 {
                i = (n - 1) as i32;
            } else if i >= n as i32 {
                i = 0;
            }
            if self.is_visible(i as usize) {
                return i as usize;
            }
            if i as usize == from {
                return from;
            }
        }
    }

    /// Validate a single field's current value. Conditional/hidden fields
    /// always validate as Empty so they don't gate submission.
    pub fn validate_field(&self, idx: usize) -> Validation {
        if !self.is_visible(idx) {
            return Validation::Empty;
        }
        let f = &self.fields[idx];
        match f.id {
            FieldId::Host => validate_host(&f.value, f.required),
            FieldId::SshUser => required_nonempty(&f.value, f.required),
            FieldId::SshPort => validate_port(&f.value),
            FieldId::SshKeyPath => validate_filepath(&f.value, f.required),
            FieldId::SshPassword => required_nonempty(&f.value, f.required),
            FieldId::EnvName => validate_env_name(&f.value),
            FieldId::DoableDomain => required_nonempty(&f.value, false),
            FieldId::AdminEmail => validate_email(&f.value, f.required),
            FieldId::AdminDisplayName => required_nonempty(&f.value, f.required),
            FieldId::AdminPassword => validate_password(&f.value),
            FieldId::TunnelUuid => validate_uuid(&f.value, f.required),
            FieldId::TunnelCertPem | FieldId::TunnelCredentials => {
                required_nonempty(&f.value, f.required)
            }
            FieldId::GithubClientId => optional_prefix(&f.value, "Ov23li"),
            FieldId::GoogleClientId => optional_suffix(&f.value, ".apps.googleusercontent.com"),
            // Radios, checkboxes, button, optional secrets have nothing to validate.
            _ => Validation::Empty,
        }
    }

    /// Number of *visible required* fields that fail validation.
    pub fn failed_required(&self) -> usize {
        let mut n = 0;
        for i in 0..self.fields.len() {
            if !self.is_visible(i) {
                continue;
            }
            if !self.fields[i].required {
                continue;
            }
            if !matches!(self.validate_field(i), Validation::Ok) {
                n += 1;
            }
        }
        n
    }

    pub fn can_submit(&self) -> bool {
        self.failed_required() == 0
    }

    /// Snapshot the form into an `InstallConfig`.
    pub fn to_config(&self) -> InstallConfig {
        let g = |id: FieldId| -> &Field { self.fields_by_id(id) };
        InstallConfig {
            target_mode: if g(FieldId::TargetMode).radio_index == 0 {
                TargetMode::Local
            } else {
                TargetMode::Remote
            },
            host: g(FieldId::Host).value.clone(),
            ssh_user: g(FieldId::SshUser).value.clone(),
            ssh_port: g(FieldId::SshPort).value.parse().unwrap_or(22),
            ssh_auth: if g(FieldId::SshAuth).radio_index == 0 {
                SshAuth::Key
            } else {
                SshAuth::Password
            },
            ssh_key_path: PathBuf::from(g(FieldId::SshKeyPath).value.clone()),
            ssh_password: g(FieldId::SshPassword).value.clone(),
            env_name: g(FieldId::EnvName).value.clone(),
            doable_domain: g(FieldId::DoableDomain).value.clone(),
            create_admin: g(FieldId::CreateAdmin).checked,
            admin_email: g(FieldId::AdminEmail).value.clone(),
            admin_display_name: g(FieldId::AdminDisplayName).value.clone(),
            admin_password: g(FieldId::AdminPassword).value.clone(),
            tunnel_mode: if g(FieldId::TunnelMode).radio_index == 0 {
                TunnelMode::Interactive
            } else {
                TunnelMode::PreSupplied
            },
            tunnel_uuid: g(FieldId::TunnelUuid).value.clone(),
            tunnel_cert_pem: g(FieldId::TunnelCertPem).value.clone(),
            tunnel_credentials_json: g(FieldId::TunnelCredentials).value.clone(),
            github_client_id: g(FieldId::GithubClientId).value.clone(),
            github_client_secret: g(FieldId::GithubClientSecret).value.clone(),
            google_client_id: g(FieldId::GoogleClientId).value.clone(),
            google_client_secret: g(FieldId::GoogleClientSecret).value.clone(),
            supabase_client_id: g(FieldId::SupabaseClientId).value.clone(),
            supabase_client_secret: g(FieldId::SupabaseClientSecret).value.clone(),
            with_tmux: g(FieldId::WithTmux).checked,
            create_douser: g(FieldId::CreateDouser).checked,
        }
    }
}

// ─── Validation helpers ──────────────────────────────────────────────────

fn required_nonempty(v: &str, required: bool) -> Validation {
    if v.is_empty() {
        if required {
            Validation::Err("required".into())
        } else {
            Validation::Empty
        }
    } else {
        Validation::Ok
    }
}

fn validate_host(v: &str, required: bool) -> Validation {
    if v.is_empty() {
        return if required {
            Validation::Err("required".into())
        } else {
            Validation::Empty
        };
    }
    // IPv4
    if v.split('.').count() == 4 && v.split('.').all(|p| p.parse::<u8>().is_ok()) {
        return Validation::Ok;
    }
    // IPv6 — coarse: contains a colon and only hex/colon/dot chars
    if v.contains(':')
        && v.chars()
            .all(|c| c.is_ascii_hexdigit() || c == ':' || c == '.')
    {
        return Validation::Ok;
    }
    // DNS name — labels of [a-z0-9-]+ separated by dots
    let ok = !v.starts_with('-')
        && !v.ends_with('-')
        && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
        && v.contains(|c: char| c.is_ascii_alphabetic());
    if ok {
        Validation::Ok
    } else {
        Validation::Err("not a valid IP/DNS".into())
    }
}

fn validate_port(v: &str) -> Validation {
    match v.parse::<u32>() {
        Ok(n) if (1..=65535).contains(&n) => Validation::Ok,
        _ => Validation::Err("port must be 1–65535".into()),
    }
}

fn validate_filepath(v: &str, required: bool) -> Validation {
    if v.is_empty() {
        return if required {
            Validation::Err("required".into())
        } else {
            Validation::Empty
        };
    }
    if std::path::Path::new(v).exists() {
        Validation::Ok
    } else {
        Validation::Err("file not found".into())
    }
}

fn validate_env_name(v: &str) -> Validation {
    if v.is_empty() {
        return Validation::Err("required".into());
    }
    let ok = v
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !v.starts_with('-')
        && !v.ends_with('-');
    if ok {
        Validation::Ok
    } else {
        Validation::Err("lowercase a-z, 0-9, '-' only".into())
    }
}

fn validate_email(v: &str, required: bool) -> Validation {
    if v.is_empty() {
        return if required {
            Validation::Err("required".into())
        } else {
            Validation::Empty
        };
    }
    let parts: Vec<&str> = v.split('@').collect();
    if parts.len() == 2 && !parts[0].is_empty() && parts[1].contains('.') {
        Validation::Ok
    } else {
        Validation::Err("invalid email".into())
    }
}

fn validate_password(v: &str) -> Validation {
    if v.is_empty() {
        return Validation::Err("required".into());
    }
    let len_ok = v.chars().count() >= 12;
    let upper = v.chars().any(|c| c.is_ascii_uppercase());
    let lower = v.chars().any(|c| c.is_ascii_lowercase());
    let digit = v.chars().any(|c| c.is_ascii_digit());
    if len_ok && upper && lower && digit {
        Validation::Ok
    } else {
        Validation::Err("≥12 chars + upper + lower + digit".into())
    }
}

fn validate_uuid(v: &str, required: bool) -> Validation {
    if v.is_empty() {
        return if required {
            Validation::Err("required".into())
        } else {
            Validation::Empty
        };
    }
    // 8-4-4-4-12 hex.
    let parts: Vec<&str> = v.split('-').collect();
    let lens = [8, 4, 4, 4, 12];
    if parts.len() != 5 {
        return Validation::Err("UUID v4 shape: 8-4-4-4-12".into());
    }
    for (p, l) in parts.iter().zip(lens.iter()) {
        if p.len() != *l || !p.chars().all(|c| c.is_ascii_hexdigit()) {
            return Validation::Err("UUID v4 shape: 8-4-4-4-12".into());
        }
    }
    Validation::Ok
}

fn optional_prefix(v: &str, prefix: &str) -> Validation {
    if v.is_empty() {
        Validation::Empty
    } else if v.starts_with(prefix) {
        Validation::Ok
    } else {
        Validation::Err(format!("must start with `{}`", prefix))
    }
}

fn optional_suffix(v: &str, suffix: &str) -> Validation {
    if v.is_empty() {
        Validation::Empty
    } else if v.ends_with(suffix) {
        Validation::Ok
    } else {
        Validation::Err(format!("must end with `{}`", suffix))
    }
}

// ─── Input handling ──────────────────────────────────────────────────────

pub enum FormCommand {
    None,
    Quit,
    Submit,
}

impl FormState {
    pub fn handle_key(&mut self, code: KeyCode, mods: KeyModifiers) -> FormCommand {
        // Editing-mode handling: most keys go to the field's value buffer.
        if self.editing {
            return self.handle_key_editing(code, mods);
        }

        match code {
            KeyCode::Esc => return FormCommand::Quit,
            KeyCode::Down | KeyCode::Tab => {
                self.focus = self.next_visible(self.focus, 1);
            }
            KeyCode::Up | KeyCode::BackTab => {
                self.focus = self.next_visible(self.focus, -1);
            }
            KeyCode::Left => {
                if let Some(f) = self.fields.get_mut(self.focus) {
                    if matches!(f.kind, FieldKind::Radio) && !f.radio_options.is_empty() {
                        if f.radio_index == 0 {
                            f.radio_index = f.radio_options.len() - 1;
                        } else {
                            f.radio_index -= 1;
                        }
                    } else if matches!(f.kind, FieldKind::Number) {
                        let n: i32 = f.value.parse().unwrap_or(0);
                        f.value = (n - 1).max(1).to_string();
                    }
                }
            }
            KeyCode::Right => {
                if let Some(f) = self.fields.get_mut(self.focus) {
                    if matches!(f.kind, FieldKind::Radio) && !f.radio_options.is_empty() {
                        f.radio_index = (f.radio_index + 1) % f.radio_options.len();
                    } else if matches!(f.kind, FieldKind::Number) {
                        let n: i32 = f.value.parse().unwrap_or(0);
                        f.value = (n + 1).min(65535).to_string();
                    }
                }
            }
            KeyCode::Char(' ') => {
                if let Some(f) = self.fields.get_mut(self.focus) {
                    if matches!(f.kind, FieldKind::Checkbox) {
                        f.checked = !f.checked;
                    }
                }
            }
            KeyCode::Enter => {
                let kind = self.current_kind();
                match kind {
                    FieldKind::Button => {
                        if self.can_submit() {
                            self.submit_requested = true;
                            return FormCommand::Submit;
                        }
                    }
                    FieldKind::Text
                    | FieldKind::Secret
                    | FieldKind::Number
                    | FieldKind::FilePath
                    | FieldKind::MultilineSecret => {
                        self.editing = true;
                    }
                    FieldKind::Checkbox => {
                        if let Some(f) = self.fields.get_mut(self.focus) {
                            f.checked = !f.checked;
                        }
                    }
                    FieldKind::Radio => {
                        if let Some(f) = self.fields.get_mut(self.focus) {
                            if !f.radio_options.is_empty() {
                                f.radio_index = (f.radio_index + 1) % f.radio_options.len();
                            }
                        }
                    }
                }
            }
            _ => {}
        }
        FormCommand::None
    }

    fn handle_key_editing(&mut self, code: KeyCode, mods: KeyModifiers) -> FormCommand {
        // Ctrl-V → paste from clipboard.
        if mods.contains(KeyModifiers::CONTROL) && matches!(code, KeyCode::Char('v')) {
            self.paste_clipboard();
            return FormCommand::None;
        }
        match code {
            KeyCode::Esc | KeyCode::Enter => {
                self.editing = false;
            }
            KeyCode::Backspace => {
                if let Some(f) = self.fields.get_mut(self.focus) {
                    f.value.pop();
                }
            }
            KeyCode::Char(c) => {
                if let Some(f) = self.fields.get_mut(self.focus) {
                    // Number fields: only allow digits
                    if matches!(f.kind, FieldKind::Number) && !c.is_ascii_digit() {
                        return FormCommand::None;
                    }
                    f.value.push(c);
                }
            }
            _ => {}
        }
        FormCommand::None
    }

    fn paste_clipboard(&mut self) {
        match arboard::Clipboard::new().and_then(|mut c| c.get_text()) {
            Ok(text) => {
                if let Some(f) = self.fields.get_mut(self.focus) {
                    // For numbers, paste only the digit prefix.
                    if matches!(f.kind, FieldKind::Number) {
                        let digits: String = text.chars().filter(|c| c.is_ascii_digit()).collect();
                        f.value.push_str(&digits);
                    } else {
                        f.value.push_str(&text);
                    }
                }
                self.clipboard_msg = Some("pasted from clipboard".into());
            }
            Err(e) => {
                self.clipboard_msg = Some(format!("clipboard error: {}", e));
            }
        }
    }
}

// ─── Rendering ───────────────────────────────────────────────────────────

/// Estimate the rendered height (in rows) of a field.
fn field_height(f: &Field) -> u16 {
    match f.kind {
        FieldKind::MultilineSecret => 4, // label + 3 line viewport
        FieldKind::Button => 3,
        _ => 2, // label line + value line
    }
}

pub fn draw_form(frame: &mut Frame, state: &FormState, area: Rect) {
    let total_visible = (0..state.fields.len())
        .filter(|i| state.is_visible(*i))
        .count();
    let valid_count = (0..state.fields.len())
        .filter(|i| state.is_visible(*i))
        .filter(|i| matches!(state.validate_field(*i), Validation::Ok))
        .count();
    let title = format!(
        " ◆ Doable Installer  ·  {valid_count}/{total_visible} fields valid "
    );

    let outer = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .title(Span::styled(
            title,
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ))
        .border_style(Style::default().fg(Color::Cyan));
    let inner = outer.inner(area);
    frame.render_widget(outer, area);

    // [intro 3] [form] [status 3]
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(5),
            Constraint::Length(3),
        ])
        .split(inner);

    draw_intro(frame, state, chunks[0], total_visible, valid_count);
    draw_fields(frame, state, chunks[1], total_visible);
    draw_validation_summary(frame, state, chunks[2]);
}

fn draw_intro(
    frame: &mut Frame,
    _state: &FormState,
    area: Rect,
    total_visible: usize,
    valid_count: usize,
) {
    // Progress bar built from box-drawing blocks.
    let bar_w: usize = 28;
    let filled = if total_visible == 0 {
        0
    } else {
        (valid_count * bar_w) / total_visible
    };
    let bar: String = "█".repeat(filled) + &"░".repeat(bar_w - filled);
    let pct = if total_visible == 0 {
        0
    } else {
        (valid_count * 100) / total_visible
    };

    let lines = vec![
        Line::from(vec![
            Span::styled(
                " Configure your Doable server  ",
                Style::default()
                    .fg(Color::White)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(bar, Style::default().fg(Color::Green)),
            Span::styled(
                format!("  {pct}%"),
                Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
            ),
        ]),
        Line::from(Span::styled(
            " Tab/↓ next  ·  ↑ prev  ·  ←/→ radio  ·  Space toggle  ·  Enter edit/submit  ·  Ctrl-V paste  ·  Esc quit",
            Style::default().fg(Color::DarkGray),
        )),
    ];
    let p = Paragraph::new(lines).wrap(Wrap { trim: false }).block(
        Block::default()
            .borders(Borders::BOTTOM)
            .border_style(Style::default().fg(Color::DarkGray)),
    );
    frame.render_widget(p, area);
}

/// Logical groupings rendered as section headers.
fn section_for(id: FieldId) -> &'static str {
    match id {
        FieldId::TargetMode => "TARGET SERVER",
        FieldId::Host
        | FieldId::SshUser
        | FieldId::SshPort
        | FieldId::SshAuth
        | FieldId::SshKeyPath
        | FieldId::SshPassword => "SSH CONNECTION",
        FieldId::EnvName | FieldId::DoableDomain => "ENVIRONMENT",
        FieldId::CreateAdmin
        | FieldId::AdminEmail
        | FieldId::AdminDisplayName
        | FieldId::AdminPassword => "PLATFORM ADMIN USER",
        FieldId::TunnelMode
        | FieldId::TunnelUuid
        | FieldId::TunnelCertPem
        | FieldId::TunnelCredentials => "CLOUDFLARE TUNNEL",
        FieldId::GithubClientId
        | FieldId::GithubClientSecret
        | FieldId::GoogleClientId
        | FieldId::GoogleClientSecret
        | FieldId::SupabaseClientId
        | FieldId::SupabaseClientSecret => "OAUTH PROVIDERS",
        FieldId::WithTmux | FieldId::CreateDouser => "SERVER OPTIONS",
        FieldId::Submit => "",
    }
}

fn section_header_lines(name: &str) -> Vec<Line<'static>> {
    let style = Style::default()
        .fg(Color::Cyan)
        .add_modifier(Modifier::BOLD);
    let dim = Style::default().fg(Color::DarkGray);
    let spans = vec![
        Span::styled(" ◆ ", style),
        Span::styled(name.to_string(), style),
        Span::styled(
            "  ────────────────────────────────────────".to_string(),
            dim,
        ),
    ];
    vec![Line::raw(""), Line::from(spans)]
}

fn draw_fields(frame: &mut Frame, state: &FormState, area: Rect, total_visible: usize) {
    // Walk visible fields, emitting section headers when the section changes,
    // and numbering each visible field as [NN/TT] in its header line.
    let mut entries: Vec<(usize, Vec<Line<'static>>)> = Vec::new();
    let mut current_section: &'static str = "";
    let mut visible_idx: usize = 0;
    for (i, f) in state.fields.iter().enumerate() {
        if !state.is_visible(i) {
            continue;
        }
        visible_idx += 1;
        let sec = section_for(f.id);
        if !sec.is_empty() && sec != current_section {
            current_section = sec;
            // Stash section header into entries with a sentinel field index of usize::MAX.
            entries.push((usize::MAX, section_header_lines(sec)));
        }
        entries.push((
            i,
            render_field_lines(state, i, f, visible_idx, total_visible),
        ));
    }

    // Determine the focused entry's offset within the rendered list.
    let mut cursor_row: u16 = 0;
    let mut focus_top: u16 = 0;
    for (i, lines) in entries.iter() {
        if *i == state.focus {
            focus_top = cursor_row;
            break;
        }
        cursor_row = cursor_row.saturating_add(lines.len() as u16);
    }

    let view_h = area.height;
    // Scroll so the focused field is visible (simple top/bottom clamp).
    let mut scroll = state.scroll;
    if focus_top < scroll {
        scroll = focus_top;
    }
    let focus_bottom = focus_top.saturating_add(
        entries
            .iter()
            .find(|(i, _)| *i == state.focus)
            .map(|(_, l)| l.len() as u16)
            .unwrap_or(2),
    );
    if focus_bottom > scroll + view_h {
        scroll = focus_bottom.saturating_sub(view_h);
    }

    let mut all_lines: Vec<Line<'static>> = Vec::new();
    for (_, lines) in entries.into_iter() {
        for l in lines {
            all_lines.push(l);
        }
    }

    let p = Paragraph::new(all_lines)
        .wrap(Wrap { trim: false })
        .scroll((scroll, 0));
    frame.render_widget(p, area);
}

fn render_field_lines(
    state: &FormState,
    idx: usize,
    f: &Field,
    visible_idx: usize,
    total_visible: usize,
) -> Vec<Line<'static>> {
    let focused = idx == state.focus;
    let editing = focused && state.editing;
    let validation = state.validate_field(idx);

    let label_style = if focused {
        Style::default()
            .fg(Color::Cyan)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(Color::White)
    };

    let mark = match &validation {
        Validation::Ok => Span::styled("✓", Style::default().fg(Color::Green)),
        Validation::Err(_) => {
            if f.required {
                Span::styled("✗", Style::default().fg(Color::Red))
            } else {
                Span::styled("·", Style::default().fg(Color::Yellow))
            }
        }
        Validation::Empty => {
            if f.required {
                Span::styled("✗", Style::default().fg(Color::Red))
            } else {
                Span::styled("·", Style::default().fg(Color::DarkGray))
            }
        }
    };

    let req = if f.required {
        Span::styled(" required", Style::default().fg(Color::Magenta))
    } else {
        Span::styled(" optional", Style::default().fg(Color::DarkGray))
    };

    // Bold left bar on the focused row instead of an arrow — feels less like a
    // dialog box and more like a real input form.
    let bar = if focused {
        Span::styled("┃ ", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
    } else {
        Span::raw("  ")
    };

    let number = Span::styled(
        format!("[{:02}/{:02}]", visible_idx, total_visible),
        Style::default()
            .fg(if focused { Color::Cyan } else { Color::DarkGray })
            .add_modifier(if focused { Modifier::BOLD } else { Modifier::empty() }),
    );

    let mut header_spans = vec![
        bar,
        number,
        Span::raw("  "),
        mark,
        Span::raw("  "),
        Span::styled(f.label.to_string(), label_style),
        req,
    ];
    if !f.hint.is_empty() {
        header_spans.push(Span::styled(
            format!("  · {}", f.hint),
            Style::default().fg(Color::DarkGray),
        ));
    }
    if let Validation::Err(msg) = &validation {
        header_spans.push(Span::styled(
            format!("  ⚠ {}", msg),
            Style::default().fg(Color::Red),
        ));
    }
    let header = Line::from(header_spans);

    let value_line = render_value_line(f, focused, editing);
    if matches!(f.kind, FieldKind::MultilineSecret) {
        let viewport_lines = render_multiline_viewport(f, focused, editing, 3);
        let mut out = vec![header];
        out.extend(viewport_lines);
        out.push(Line::raw(""));
        out
    } else if matches!(f.kind, FieldKind::Button) {
        let can = state.can_submit();
        let (fg, bg) = if can {
            (Color::Black, Color::Green)
        } else {
            (Color::White, Color::DarkGray)
        };
        let style = Style::default()
            .fg(fg)
            .bg(bg)
            .add_modifier(if can { Modifier::BOLD } else { Modifier::DIM });
        let label = if can {
            format!("   ▶  {}   ", f.label)
        } else {
            format!("   {}  (fix errors above)   ", f.label)
        };
        let bar_span = if focused {
            Span::styled(
                "┃ ",
                Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            )
        } else {
            Span::raw("  ")
        };
        vec![
            Line::raw(""),
            Line::from(vec![
                bar_span,
                Span::raw("    "),
                Span::styled(label, style),
            ]),
            Line::raw(""),
        ]
    } else {
        // Pad with a blank line below for breathing room between rows.
        vec![header, value_line, Line::raw("")]
    }
}

#[allow(dead_code)]
fn arrow_for_focus(focused: bool) -> Span<'static> {
    if focused {
        Span::styled("▶ ", Style::default().fg(Color::Cyan))
    } else {
        Span::raw("  ")
    }
}

fn render_value_line(f: &Field, focused: bool, editing: bool) -> Line<'static> {
    // Indent value rows under the field number column.
    let prefix = Span::raw("            ");
    let value_style = if editing {
        Style::default()
            .fg(Color::Yellow)
            .bg(Color::Rgb(40, 40, 50))
            .add_modifier(Modifier::BOLD)
    } else if focused {
        Style::default().fg(Color::White)
    } else {
        Style::default().fg(Color::Gray)
    };
    let placeholder_style = Style::default().fg(Color::DarkGray);

    let cursor = if editing { "▏" } else { "" };

    match f.kind {
        FieldKind::Text | FieldKind::FilePath | FieldKind::Number => {
            let (body, style) = if f.value.is_empty() {
                (
                    "│  (type to enter — press Enter to edit)  │".to_string(),
                    placeholder_style,
                )
            } else {
                (format!("│  {}{}  │", f.value, cursor), value_style)
            };
            Line::from(vec![prefix, Span::styled(body, style)])
        }
        FieldKind::Secret => {
            let masked: String = "•".repeat(f.value.chars().count());
            let (body, style) = if masked.is_empty() {
                (
                    "│  (Enter to edit · masked input)  │".to_string(),
                    placeholder_style,
                )
            } else {
                (format!("│  {}{}  │", masked, cursor), value_style)
            };
            Line::from(vec![prefix, Span::styled(body, style)])
        }
        FieldKind::Radio => {
            let mut spans = vec![prefix];
            for (i, opt) in f.radio_options.iter().enumerate() {
                let selected = i == f.radio_index;
                let glyph = if selected { "●" } else { "○" };
                let s = if selected {
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD)
                } else if focused {
                    Style::default().fg(Color::White)
                } else {
                    Style::default().fg(Color::Gray)
                };
                spans.push(Span::styled(format!("{}  {}    ", glyph, opt), s));
            }
            Line::from(spans)
        }
        FieldKind::Checkbox => {
            let (mark, mark_style) = if f.checked {
                ("☑", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD))
            } else {
                ("☐", Style::default().fg(Color::DarkGray))
            };
            let hint = Span::styled(
                "    Space to toggle".to_string(),
                Style::default().fg(Color::DarkGray),
            );
            Line::from(vec![
                prefix,
                Span::styled(mark.to_string(), mark_style),
                hint,
            ])
        }
        FieldKind::MultilineSecret => Line::raw(""),
        FieldKind::Button => Line::raw(""),
    }
}

fn render_multiline_viewport(
    f: &Field,
    focused: bool,
    editing: bool,
    rows: usize,
) -> Vec<Line<'static>> {
    let style = if editing {
        Style::default().fg(Color::Yellow).bg(Color::Rgb(40, 40, 50))
    } else if focused {
        Style::default().fg(Color::White)
    } else {
        Style::default().fg(Color::Gray)
    };
    // Mask everything as bullets but preserve newline structure so the operator
    // can see how many lines they pasted.
    let masked: String = f
        .value
        .chars()
        .map(|c| if c == '\n' { '\n' } else { '•' })
        .collect();
    let prefix = "            ";
    let mut lines: Vec<Line> = masked
        .lines()
        .take(rows)
        .map(|l| Line::from(Span::styled(format!("{}│  {}", prefix, l), style)))
        .collect();
    while lines.len() < rows {
        lines.push(Line::from(Span::styled(
            format!("{}│  (Enter to edit · Ctrl-V paste · multi-line secret)", prefix),
            Style::default().fg(Color::DarkGray),
        )));
    }
    lines
}

fn draw_validation_summary(frame: &mut Frame, state: &FormState, area: Rect) {
    let failed = state.failed_required();
    let (status_color, status_glyph, status_text) = if state.editing {
        (
            Color::Yellow,
            "✎",
            "editing — type to fill, Esc to leave edit mode, Ctrl-V to paste".to_string(),
        )
    } else if failed == 0 {
        (
            Color::Green,
            "✓",
            "ready — all required fields valid; focus the [ Run Setup ] button and press Enter".to_string(),
        )
    } else {
        (
            Color::Red,
            "✗",
            format!(
                "{} required field{} still need{} attention",
                failed,
                if failed == 1 { "" } else { "s" },
                if failed == 1 { "s" } else { "" }
            ),
        )
    };

    let line1 = Line::from(vec![
        Span::raw(" "),
        Span::styled(
            format!("{}  ", status_glyph),
            Style::default().fg(status_color).add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            status_text,
            Style::default().fg(status_color).add_modifier(Modifier::BOLD),
        ),
    ]);
    let line2 = Line::from(vec![
        Span::raw(" "),
        Span::styled(
            "  Tab/↓ next  ·  ↑ prev  ·  ←/→ radio  ·  Space toggle  ·  Enter edit/submit  ·  Ctrl-V paste  ·  Esc/Ctrl-C quit  ",
            Style::default().fg(Color::Black).bg(Color::Cyan),
        ),
    ]);

    let p = Paragraph::new(vec![line1, line2]).block(
        Block::default()
            .borders(Borders::TOP)
            .border_style(Style::default().fg(Color::DarkGray)),
    );
    frame.render_widget(p, area);
}

// Suppress the `field_height` dead-code warning if unused at the moment;
// it's kept around for future per-field viewport sizing.
#[allow(dead_code)]
fn _unused_field_height(f: &Field) -> u16 {
    field_height(f)
}
