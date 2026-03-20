use crossterm::event::{KeyCode, KeyEvent, KeyEventKind, KeyModifiers, MouseButton, MouseEvent, MouseEventKind};
use ratatui::layout::Rect;
use ratatui::widgets::TableState;
use tokio_postgres::Client;

use crate::db;

pub const ROLES: &[&str] = &["owner", "admin", "member", "viewer"];
pub const ADD_ROLES: &[&str] = &["admin", "member", "viewer"];

// ─── Screen / Focus ───────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Screen {
    Users,
    Flags,
    Members,
    AiSettings,
}

pub const SIDEBAR_ITEMS: &[(Screen, &str)] = &[
    (Screen::Users, "Users & Admins"),
    (Screen::Flags, "Feature Flags"),
    (Screen::Members, "Members & Roles"),
    (Screen::AiSettings, "AI Settings"),
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
}

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
            modal: None,
            status: None,
            status_ticks: 0,
            click_targets: vec![],
            client,
            db_label,
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
                    3
                } else {
                    0
                }
            }
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
            // Members shortcuts
            KeyCode::Char('r') if self.screen == Screen::Members => self.open_change_role(),
            KeyCode::Char('a') if self.screen == Screen::Members => self.open_add_member(),
            KeyCode::Char('d') if self.screen == Screen::Members => self.open_remove_member(),
            KeyCode::F(2) if self.screen == Screen::Members => self.open_change_role(),
            KeyCode::F(3) if self.screen == Screen::Members => self.open_add_member(),
            KeyCode::F(4) if self.screen == Screen::Members => self.open_remove_member(),
            // AI Settings shortcut
            KeyCode::Char('w') if self.screen == Screen::AiSettings => self.open_ws_selector(),
            _ => {}
        }
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
            _ => {}
        }
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
        });

        match modal_ref_type {
            Some(0) => self.modal_confirm_admin(key).await,
            Some(1) => self.modal_select_role(key).await,
            Some(2) => self.modal_confirm_remove(key).await,
            Some(3) => self.modal_add_ws(key).await,
            Some(4) => self.modal_add_email(key).await,
            Some(5) => self.modal_add_role(key).await,
            Some(6) => self.modal_sel_ws(key).await,
            _ => {}
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
            _ => {}
        }
    }
}
