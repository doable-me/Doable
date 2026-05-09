//! Top-level mode picker — three flows:
//!   1. Install on a new server   (→ installer)
//!   2. Manage this server        (→ admin, local DB)
//!   3. Manage a remote server    (→ admin, SSH tunnel)
//!
//! For (3), shows a single form with BOTH host and key fields visible at
//! once. Tab cycles between fields, the key field has an inline file browser
//! reachable from any focus by pressing F2 or `b`.

use std::path::PathBuf;
use std::time::Duration;

use anyhow::{Context, Result};
use crossterm::event::{Event, EventStream, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use futures::StreamExt;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, BorderType, Borders, Paragraph, Wrap};

use crate::file_picker;
use crate::term::Tui;

pub struct RemoteSpec {
    pub host_spec: String, // e.g. "root@myorg.doable.me"
    pub ssh_key: Option<PathBuf>,
}

pub enum TopLevelChoice {
    Install,
    AdminLocal,
    AdminRemote(RemoteSpec),
    Quit,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Field {
    Host,
    Key,
    Connect,
}

enum Step {
    PickMode,
    ConnectForm,
    Browse(file_picker::State),
}

struct State {
    step: Step,
    selected_mode: usize, // 0..3 on PickMode

    // ConnectForm fields:
    focus: Field,
    host_input: String,
    host_cursor: usize,
    key_input: String,
    key_cursor: usize,
    error: Option<String>,
}

impl State {
    fn new() -> Self {
        let key = default_ssh_key_string();
        let key_cursor = key.len();
        Self {
            step: Step::PickMode,
            selected_mode: 0,
            focus: Field::Host,
            host_input: String::new(),
            host_cursor: 0,
            key_input: key,
            key_cursor,
            error: None,
        }
    }
}

fn default_ssh_key_string() -> String {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let candidates = [
        format!("{}/.ssh/id_ed25519", home),
        format!("{}/.ssh/id_rsa", home),
    ];
    for c in &candidates {
        if std::path::Path::new(c).exists() {
            return c.clone();
        }
    }
    candidates[0].clone()
}

const OPTIONS: &[(&str, &str)] = &[
    ("Install on a new server", "Provision a fresh Doable instance — interactive form."),
    ("Manage this server (local)", "Open the admin TUI against the Postgres on this host."),
    ("Manage a remote server (SSH)", "Open an SSH tunnel to a remote Doable server, then admin."),
];

pub async fn run(terminal: &mut Tui) -> Result<TopLevelChoice> {
    let mut state = State::new();
    let mut stream = EventStream::new();
    let mut tick = tokio::time::interval(Duration::from_millis(250));
    loop {
        terminal.draw(|f| draw(f, &mut state)).context("draw mode picker")?;

        tokio::select! {
            _ = tick.tick() => {}
            maybe_evt = stream.next() => {
                match maybe_evt {
                    Some(Ok(Event::Key(KeyEvent { code, modifiers, kind, .. })))
                        if kind == KeyEventKind::Press =>
                    {
                        if modifiers.contains(KeyModifiers::CONTROL) && matches!(code, KeyCode::Char('c')) {
                            return Ok(TopLevelChoice::Quit);
                        }
                        if let Some(choice) = handle_key(&mut state, code, modifiers) {
                            return Ok(choice);
                        }
                    }
                    Some(Ok(_)) => {}
                    Some(Err(_)) | None => return Ok(TopLevelChoice::Quit),
                }
            }
        }
    }
}

fn handle_key(state: &mut State, code: KeyCode, mods: KeyModifiers) -> Option<TopLevelChoice> {
    // File-browser overlay intercepts everything when active.
    if let Step::Browse(picker) = &mut state.step {
        let evt = KeyEvent {
            code,
            modifiers: mods,
            kind: KeyEventKind::Press,
            state: crossterm::event::KeyEventState::empty(),
        };
        match picker.handle_key(evt) {
            file_picker::Outcome::Selected(p) => {
                let path_str = p.display().to_string();
                state.key_cursor = path_str.len();
                state.key_input = path_str;
                state.error = None;
                state.step = Step::ConnectForm;
                state.focus = Field::Connect; // they picked a key — push them to Connect
            }
            file_picker::Outcome::Cancelled => {
                state.step = Step::ConnectForm;
            }
            file_picker::Outcome::Continue => {}
        }
        return None;
    }

    match &state.step {
        Step::PickMode => handle_pick_mode_key(state, code),
        Step::ConnectForm => handle_form_key(state, code, mods),
        Step::Browse(_) => None, // handled above
    }
}

fn handle_pick_mode_key(state: &mut State, code: KeyCode) -> Option<TopLevelChoice> {
    match code {
        KeyCode::Esc | KeyCode::Char('q') => Some(TopLevelChoice::Quit),
        KeyCode::Up | KeyCode::Char('k') => {
            if state.selected_mode > 0 {
                state.selected_mode -= 1;
            }
            None
        }
        KeyCode::Down | KeyCode::Char('j') => {
            if state.selected_mode < OPTIONS.len() - 1 {
                state.selected_mode += 1;
            }
            None
        }
        KeyCode::Char('1') => Some(TopLevelChoice::Install),
        KeyCode::Char('2') => Some(TopLevelChoice::AdminLocal),
        KeyCode::Char('3') => {
            state.step = Step::ConnectForm;
            state.focus = if state.host_input.is_empty() { Field::Host } else { Field::Connect };
            None
        }
        KeyCode::Enter => match state.selected_mode {
            0 => Some(TopLevelChoice::Install),
            1 => Some(TopLevelChoice::AdminLocal),
            2 => {
                state.step = Step::ConnectForm;
                state.focus = if state.host_input.is_empty() { Field::Host } else { Field::Connect };
                None
            }
            _ => None,
        },
        _ => None,
    }
}

fn handle_form_key(state: &mut State, code: KeyCode, mods: KeyModifiers) -> Option<TopLevelChoice> {
    // Global-ish controls.
    match code {
        KeyCode::Esc => {
            state.step = Step::PickMode;
            state.error = None;
            return None;
        }
        KeyCode::Tab => {
            state.focus = match state.focus {
                Field::Host => Field::Key,
                Field::Key => Field::Connect,
                Field::Connect => Field::Host,
            };
            return None;
        }
        KeyCode::BackTab => {
            state.focus = match state.focus {
                Field::Host => Field::Connect,
                Field::Key => Field::Host,
                Field::Connect => Field::Key,
            };
            return None;
        }
        // Open file browser from anywhere on the form. F2 is the universal
        // shortcut; on the key field a plain `b` also works (won't be typed
        // as part of a path because the user can hit Backspace if needed).
        KeyCode::F(2) => {
            state.step = Step::Browse(file_picker::State::new());
            return None;
        }
        KeyCode::Char('b') if state.focus == Field::Connect => {
            state.step = Step::Browse(file_picker::State::new());
            return None;
        }
        // Submit: Enter on Connect button OR Ctrl+Enter from anywhere.
        KeyCode::Enter
            if state.focus == Field::Connect
                || mods.contains(KeyModifiers::CONTROL) =>
        {
            return submit(state);
        }
        _ => {}
    }

    // Field-specific text editing.
    match state.focus {
        Field::Host => edit_text(&mut state.host_input, &mut state.host_cursor, code),
        Field::Key => edit_text(&mut state.key_input, &mut state.key_cursor, code),
        Field::Connect => {} // buttons consume nothing else
    }
    None
}

fn edit_text(buf: &mut String, cursor: &mut usize, code: KeyCode) {
    match code {
        KeyCode::Char(c) => {
            buf.insert(*cursor, c);
            *cursor += 1;
        }
        KeyCode::Backspace => {
            if *cursor > 0 {
                *cursor -= 1;
                buf.remove(*cursor);
            }
        }
        KeyCode::Delete => {
            if *cursor < buf.len() {
                buf.remove(*cursor);
            }
        }
        KeyCode::Left => {
            *cursor = cursor.saturating_sub(1);
        }
        KeyCode::Right => {
            if *cursor < buf.len() {
                *cursor += 1;
            }
        }
        KeyCode::Home => {
            *cursor = 0;
        }
        KeyCode::End => {
            *cursor = buf.len();
        }
        _ => {}
    }
}

fn submit(state: &mut State) -> Option<TopLevelChoice> {
    let host = state.host_input.trim().to_string();
    let key = state.key_input.trim().to_string();
    if host.is_empty() {
        state.error = Some("Host is required (e.g. root@myorg.doable.me).".into());
        state.focus = Field::Host;
        return None;
    }
    if !looks_like_host_spec(&host) {
        state.error = Some("Host must be in the form user@host or user@host:port.".into());
        state.focus = Field::Host;
        return None;
    }
    if key.is_empty() {
        state.error = Some("Private key path is required. Press F2 to browse.".into());
        state.focus = Field::Key;
        return None;
    }
    if !std::path::Path::new(&key).exists() {
        state.error = Some(format!("Key file not found: {}", key));
        state.focus = Field::Key;
        return None;
    }
    Some(TopLevelChoice::AdminRemote(RemoteSpec {
        host_spec: host,
        ssh_key: Some(PathBuf::from(key)),
    }))
}

fn looks_like_host_spec(s: &str) -> bool {
    !s.is_empty() && !s.contains(' ') && (s.contains('@') || !s.contains(':'))
}

// ─── Rendering ────────────────────────────────────────────

fn draw(f: &mut ratatui::Frame, state: &mut State) {
    let area = f.area();
    let outer = Block::default()
        .title(Span::styled(
            " ◆ Doable ",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ))
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(Style::default().fg(Color::Cyan));
    let inner = outer.inner(area);
    f.render_widget(outer, area);

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(8),
            Constraint::Length(3),
        ])
        .split(inner);

    draw_intro(f, chunks[0], state);
    match &state.step {
        Step::PickMode => draw_pick_mode(f, state, chunks[1]),
        Step::ConnectForm | Step::Browse(_) => draw_connect_form(f, state, chunks[1]),
    }
    draw_footer(f, state, chunks[2]);

    if let Step::Browse(picker) = &state.step {
        let area = f.area();
        file_picker::draw(f, picker, area);
    }
}

fn draw_intro(f: &mut ratatui::Frame, area: Rect, state: &State) {
    let (title, sub) = match state.step {
        Step::PickMode => (
            " Welcome.  What do you want to do?",
            " Pick a mode — install a fresh server or manage an existing one.",
        ),
        Step::ConnectForm | Step::Browse(_) => (
            " Connect to a remote Doable server",
            " Fill in BOTH fields, then press Enter on Connect (or Ctrl+Enter from any field).",
        ),
    };
    let lines = vec![
        Line::from(Span::styled(
            title,
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        )),
        Line::from(Span::styled(
            sub,
            Style::default().fg(Color::DarkGray),
        )),
    ];
    f.render_widget(Paragraph::new(lines).wrap(Wrap { trim: false }), area);
}

fn draw_pick_mode(f: &mut ratatui::Frame, state: &State, area: Rect) {
    let mut lines: Vec<Line> = Vec::new();
    lines.push(Line::raw(""));
    for (i, (label, desc)) in OPTIONS.iter().enumerate() {
        let focused = i == state.selected_mode;
        let bar = if focused {
            Span::styled(
                "┃ ",
                Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
            )
        } else {
            Span::raw("  ")
        };
        let num = Span::styled(
            format!("[{}] ", i + 1),
            Style::default().fg(if focused { Color::Cyan } else { Color::DarkGray }),
        );
        let label_style = if focused {
            Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(Color::White)
        };
        lines.push(Line::from(vec![
            bar,
            num,
            Span::styled((*label).to_string(), label_style),
        ]));
        lines.push(Line::from(vec![
            Span::raw("        "),
            Span::styled((*desc).to_string(), Style::default().fg(Color::DarkGray)),
        ]));
        lines.push(Line::raw(""));
    }
    f.render_widget(Paragraph::new(lines).wrap(Wrap { trim: false }), area);
}

fn draw_connect_form(f: &mut ratatui::Frame, state: &State, area: Rect) {
    let mut lines: Vec<Line> = Vec::new();
    lines.push(Line::raw(""));

    // Host row
    let host_focused = state.focus == Field::Host;
    let host_bar = if host_focused {
        Span::styled(
            "┃ ",
            Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        )
    } else {
        Span::raw("  ")
    };
    lines.push(Line::from(vec![
        host_bar,
        Span::styled(
            "Host       ",
            Style::default()
                .fg(if host_focused { Color::Cyan } else { Color::White })
                .add_modifier(Modifier::BOLD),
        ),
    ]));
    let host_value = render_text_value(&state.host_input, state.host_cursor, host_focused, "(e.g. root@myorg.doable.me)");
    lines.push(Line::from(vec![Span::raw("    "), host_value]));
    lines.push(Line::raw(""));

    // Key row (with inline browse button)
    let key_focused = state.focus == Field::Key;
    let key_bar = if key_focused {
        Span::styled(
            "┃ ",
            Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        )
    } else {
        Span::raw("  ")
    };
    lines.push(Line::from(vec![
        key_bar,
        Span::styled(
            "Private Key",
            Style::default()
                .fg(if key_focused { Color::Cyan } else { Color::White })
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            "    Press F2 to browse",
            Style::default().fg(Color::DarkGray),
        ),
    ]));
    let key_value = render_text_value(&state.key_input, state.key_cursor, key_focused, "~/.ssh/id_ed25519");
    let browse_btn = Span::styled(
        " [📁 Browse] ",
        Style::default()
            .fg(Color::Black)
            .bg(Color::Yellow)
            .add_modifier(Modifier::BOLD),
    );
    lines.push(Line::from(vec![Span::raw("    "), key_value, Span::raw("  "), browse_btn]));
    lines.push(Line::raw(""));

    // Connect button
    let connect_focused = state.focus == Field::Connect;
    let bar = if connect_focused {
        Span::styled(
            "┃ ",
            Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
        )
    } else {
        Span::raw("  ")
    };
    let (fg, bg) = if connect_focused {
        (Color::Black, Color::Green)
    } else {
        (Color::White, Color::DarkGray)
    };
    let style = Style::default().fg(fg).bg(bg).add_modifier(Modifier::BOLD);
    lines.push(Line::from(vec![
        bar,
        Span::raw("    "),
        Span::styled("   ▶  Connect   ", style),
    ]));

    if let Some(err) = &state.error {
        lines.push(Line::raw(""));
        lines.push(Line::from(vec![
            Span::raw("    "),
            Span::styled(
                format!("⚠ {}", err),
                Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
            ),
        ]));
    }

    f.render_widget(Paragraph::new(lines).wrap(Wrap { trim: false }), area);
}

fn render_text_value<'a>(
    buf: &'a str,
    cursor: usize,
    focused: bool,
    placeholder: &'a str,
) -> Span<'a> {
    if buf.is_empty() {
        return Span::styled(
            format!("│  {}  │", placeholder),
            Style::default().fg(Color::DarkGray),
        );
    }
    let display = if focused {
        let mut with_cursor = buf.to_string();
        let pos = cursor.min(with_cursor.len());
        with_cursor.insert(pos, '▏');
        with_cursor
    } else {
        buf.to_string()
    };
    let style = if focused {
        Style::default()
            .fg(Color::Yellow)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(Color::White)
    };
    Span::styled(format!("│  {}  │", display), style)
}

fn draw_footer(f: &mut ratatui::Frame, state: &State, area: Rect) {
    let hint = match &state.step {
        Step::PickMode => " 1/2/3 pick directly  ↑↓ navigate  Enter select  Esc/Ctrl-C quit ",
        Step::ConnectForm => " Tab next field  Shift-Tab prev  F2 browse keys  Ctrl-Enter connect  Esc back ",
        Step::Browse(_) => " ↑↓ navigate  Enter open/pick  . toggle filter  Esc cancel ",
    };
    let p = Paragraph::new(Line::from(Span::styled(
        hint,
        Style::default().fg(Color::Black).bg(Color::Cyan),
    )));
    f.render_widget(
        p,
        Rect {
            x: area.x + 1,
            y: area.bottom().saturating_sub(2),
            width: area.width.saturating_sub(2),
            height: 1,
        },
    );
}
