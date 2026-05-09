//! Minimal file browser modal — used by the mode picker for SSH key
//! selection. Starts at `~/.ssh/`, lets the operator navigate directories
//! with arrow keys and Enter, and select a file with Enter on a non-dir.
//!
//! Filters out files that *look* like they're not SSH private keys
//! (`*.pub`, `known_hosts`, `config`, `authorized_keys`) by default; the
//! operator can press `.` to toggle showing all files.

use std::path::{Path, PathBuf};

use anyhow::Result;
use crossterm::event::{KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, BorderType, Borders, Clear, Paragraph, Wrap};
use ratatui::Frame;

pub struct State {
    cwd: PathBuf,
    entries: Vec<Entry>,
    cursor: usize,
    show_all: bool,
    error: Option<String>,
}

#[derive(Clone)]
struct Entry {
    name: String,
    path: PathBuf,
    is_dir: bool,
}

pub enum Outcome {
    /// User picked this file (Enter on a non-directory).
    Selected(PathBuf),
    /// User cancelled (Esc).
    Cancelled,
    /// User hasn't decided yet — keep rendering.
    Continue,
}

impl State {
    pub fn new() -> Self {
        let start = default_start_dir();
        let mut s = Self {
            cwd: start,
            entries: vec![],
            cursor: 0,
            show_all: false,
            error: None,
        };
        s.refresh();
        s
    }

    fn refresh(&mut self) {
        self.entries.clear();
        // Always offer ".." unless we're at the filesystem root.
        if self.cwd.parent().is_some() {
            self.entries.push(Entry {
                name: "..".into(),
                path: self
                    .cwd
                    .parent()
                    .map(|p| p.to_path_buf())
                    .unwrap_or_else(|| self.cwd.clone()),
                is_dir: true,
            });
        }
        match std::fs::read_dir(&self.cwd) {
            Ok(rd) => {
                let mut found: Vec<Entry> = rd
                    .filter_map(|e| e.ok())
                    .filter_map(|e| {
                        let path = e.path();
                        let name = e.file_name().to_string_lossy().to_string();
                        let is_dir = path.is_dir();
                        if !self.show_all && !is_dir && !looks_like_key(&name) {
                            return None;
                        }
                        Some(Entry { name, path, is_dir })
                    })
                    .collect();
                found.sort_by(|a, b| match (a.is_dir, b.is_dir) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                });
                self.entries.extend(found);
                self.error = None;
            }
            Err(e) => {
                self.error = Some(format!("Cannot read {}: {}", self.cwd.display(), e));
            }
        }
        if self.cursor >= self.entries.len() {
            self.cursor = self.entries.len().saturating_sub(1);
        }
    }

    pub fn handle_key(&mut self, key: KeyEvent) -> Outcome {
        if key.kind != KeyEventKind::Press {
            return Outcome::Continue;
        }
        if key.modifiers.contains(KeyModifiers::CONTROL) && matches!(key.code, KeyCode::Char('c')) {
            return Outcome::Cancelled;
        }
        match key.code {
            KeyCode::Esc => Outcome::Cancelled,
            KeyCode::Up | KeyCode::Char('k') => {
                if self.cursor > 0 {
                    self.cursor -= 1;
                }
                Outcome::Continue
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if self.cursor + 1 < self.entries.len() {
                    self.cursor += 1;
                }
                Outcome::Continue
            }
            KeyCode::PageUp => {
                self.cursor = self.cursor.saturating_sub(10);
                Outcome::Continue
            }
            KeyCode::PageDown => {
                self.cursor = (self.cursor + 10).min(self.entries.len().saturating_sub(1));
                Outcome::Continue
            }
            KeyCode::Home => {
                self.cursor = 0;
                Outcome::Continue
            }
            KeyCode::End => {
                self.cursor = self.entries.len().saturating_sub(1);
                Outcome::Continue
            }
            KeyCode::Char('.') => {
                self.show_all = !self.show_all;
                self.refresh();
                Outcome::Continue
            }
            KeyCode::Enter => {
                if let Some(entry) = self.entries.get(self.cursor) {
                    if entry.is_dir {
                        self.cwd = entry.path.clone();
                        self.cursor = 0;
                        self.refresh();
                        Outcome::Continue
                    } else {
                        Outcome::Selected(entry.path.clone())
                    }
                } else {
                    Outcome::Continue
                }
            }
            _ => Outcome::Continue,
        }
    }
}

pub fn draw(f: &mut Frame, state: &State, area: Rect) {
    let inset = inset_rect(area, 4, 2);
    f.render_widget(Clear, inset);

    let block = Block::default()
        .title(Span::styled(
            " ◆ Select SSH private key ",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ))
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(Color::Cyan));
    let inner = block.inner(inset);
    f.render_widget(block, inset);

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(2), // breadcrumb
            Constraint::Min(3),    // listing
            Constraint::Length(3), // help
        ])
        .split(inner);

    // Breadcrumb
    let crumb_lines = vec![
        Line::from(vec![
            Span::styled(" Path: ", Style::default().fg(Color::DarkGray)),
            Span::styled(
                state.cwd.display().to_string(),
                Style::default()
                    .fg(Color::White)
                    .add_modifier(Modifier::BOLD),
            ),
        ]),
        Line::from(Span::styled(
            if state.show_all {
                " Showing all files (press . to filter to keys only)"
            } else {
                " Showing key-like files only (press . to show all)"
            },
            Style::default().fg(Color::DarkGray),
        )),
    ];
    f.render_widget(Paragraph::new(crumb_lines), chunks[0]);

    // Listing
    let view_h = chunks[1].height.saturating_sub(0) as usize;
    let scroll = if state.cursor >= view_h {
        state.cursor + 1 - view_h
    } else {
        0
    };
    let mut lines: Vec<Line> = Vec::new();
    if let Some(err) = &state.error {
        lines.push(Line::from(Span::styled(
            format!(" ⚠ {}", err),
            Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
        )));
    }
    for (i, e) in state.entries.iter().enumerate().skip(scroll).take(view_h) {
        let focused = i == state.cursor;
        let bar = if focused {
            Span::styled(
                "┃ ",
                Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            )
        } else {
            Span::raw("  ")
        };
        let icon = if e.is_dir { "📁 " } else { "🔑 " };
        let style = if focused {
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD)
        } else if e.is_dir {
            Style::default().fg(Color::Blue)
        } else {
            Style::default().fg(Color::White)
        };
        lines.push(Line::from(vec![
            bar,
            Span::raw(icon),
            Span::styled(e.name.clone(), style),
        ]));
    }
    let p = Paragraph::new(lines).wrap(Wrap { trim: false });
    f.render_widget(p, chunks[1]);

    // Help
    let help = Paragraph::new(Line::from(vec![
        Span::styled(
            " ↑↓ navigate  Enter open dir / pick file  .  toggle filter  Esc cancel ",
            Style::default().fg(Color::Black).bg(Color::Cyan),
        ),
    ]));
    f.render_widget(help, chunks[2]);
}

fn looks_like_key(name: &str) -> bool {
    if name.starts_with('.') {
        // Skip dotfiles like .DS_Store but allow them via the show_all toggle.
        return false;
    }
    if name.ends_with(".pub") {
        return false;
    }
    matches!(
        name,
        "known_hosts" | "config" | "authorized_keys" | "environment"
    ) == false
}

fn default_start_dir() -> PathBuf {
    let home = home_dir();
    let ssh_dir = home.join(".ssh");
    if ssh_dir.is_dir() {
        return ssh_dir;
    }
    home
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn inset_rect(area: Rect, dx: u16, dy: u16) -> Rect {
    Rect {
        x: area.x + dx.min(area.width / 2),
        y: area.y + dy.min(area.height / 2),
        width: area.width.saturating_sub(dx * 2),
        height: area.height.saturating_sub(dy * 2),
    }
}

/// Detect whether `key_path` is an encrypted (passphrase-protected) SSH key.
/// Reads up to 8 KB of the file and looks for the legacy header
/// `Proc-Type: 4,ENCRYPTED` or the modern OpenSSH cipher hint.
pub fn is_encrypted_key(key_path: &Path) -> Result<bool> {
    let bytes = std::fs::read(key_path)?;
    let head = std::str::from_utf8(&bytes[..bytes.len().min(8192)]).unwrap_or("");
    // Legacy PEM:  "-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\n..."
    if head.contains("Proc-Type: 4,ENCRYPTED") {
        return Ok(true);
    }
    // OpenSSH new format keys begin with "openssh-key-v1\0" then bytes; the
    // ASCII text after "-----BEGIN OPENSSH PRIVATE KEY-----" is base64-decoded.
    // The cipher field is the first length-prefixed string. "none" → unencrypted.
    if let Some(start) = head.find("-----BEGIN OPENSSH PRIVATE KEY-----") {
        let rest = &head[start..];
        // The decoded blob's first string is the cipher. We can't decode base64
        // without a dep, but we can scan for "none" vs an encrypted-looking
        // cipher in the ASCII representation pre-decode (heuristic but
        // serviceable — the bytes "none" vs "aes256-" etc. show up in the
        // base64 alphabet at predictable offsets). Simpler heuristic: check
        // the b64-decoded prefix shape via the well-known unencrypted marker.
        // Unencrypted OpenSSH keys, when base64-decoded, contain the literal
        // string "none\0\0\0\0none\0\0\0\0" (cipher + kdf, both "none"). The
        // base64 of that prefix begins with "AAAABG5vbmUAAAAEbm9uZQ" for the
        // unencrypted case — present near the start of the body.
        if rest.contains("AAAABG5vbmUAAAAEbm9uZQ") {
            return Ok(false);
        }
        // Otherwise assume encrypted. False positives prompt the operator
        // unnecessarily; that's preferable to silent hangs.
        return Ok(true);
    }
    // Unknown format — best-effort: treat as unencrypted, ssh will surface
    // a real error if not.
    Ok(false)
}
