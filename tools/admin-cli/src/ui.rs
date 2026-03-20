use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{
        Block, BorderType, Borders, Cell, Clear, Paragraph, Row, Table,
    },
    Frame,
};

use crate::app::{
    App, ClickTarget, Focus, Modal, Screen, StatusKind, ADD_ROLES, ROLES, SIDEBAR_ITEMS,
};

// ─── Catppuccin Mocha palette ─────────────────────────────

mod c {
    use ratatui::style::Color;
    pub const BASE: Color = Color::Rgb(30, 30, 46);
    pub const MANTLE: Color = Color::Rgb(24, 24, 37);
    pub const SURFACE0: Color = Color::Rgb(49, 50, 68);
    pub const SURFACE1: Color = Color::Rgb(69, 71, 90);
    pub const OVERLAY0: Color = Color::Rgb(108, 112, 134);
    pub const TEXT: Color = Color::Rgb(205, 214, 244);
    pub const SUBTEXT0: Color = Color::Rgb(166, 173, 200);
    pub const BLUE: Color = Color::Rgb(137, 180, 250);
    pub const GREEN: Color = Color::Rgb(166, 227, 161);
    pub const RED: Color = Color::Rgb(243, 139, 168);
    pub const YELLOW: Color = Color::Rgb(249, 226, 175);
    pub const TEAL: Color = Color::Rgb(148, 226, 213);
    pub const LAVENDER: Color = Color::Rgb(180, 190, 254);
}

fn s(fg: Color) -> Style {
    Style::default().fg(fg)
}

fn sb(fg: Color) -> Style {
    Style::default().fg(fg).add_modifier(Modifier::BOLD)
}

// ─── Main render ──────────────────────────────────────────

pub fn render(f: &mut Frame, app: &mut App) {
    app.click_targets.clear();
    let area = f.area();

    // Minimum size guard
    if area.width < 60 || area.height < 12 {
        let msg = Paragraph::new("Terminal too small. Resize to at least 60x12.")
            .alignment(Alignment::Center)
            .style(s(c::RED));
        let r = centered(40, 1, area);
        f.render_widget(msg, r);
        return;
    }

    // Main vertical layout: header | body | status bar
    let vert = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(2), // header (1 text + 1 border)
            Constraint::Min(8),   // body
            Constraint::Length(1), // status bar
        ])
        .split(area);

    render_header(f, app, vert[0]);

    // Body: sidebar | content
    let body = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Length(22), // sidebar
            Constraint::Min(36),   // content
        ])
        .split(vert[1]);

    render_sidebar(f, app, body[0]);
    render_content(f, app, body[1]);
    render_status_bar(f, app, vert[2]);

    // Modal overlay (on top of everything)
    if app.modal.is_some() {
        render_modal(f, app, area);
    }
}

// ─── Header ───────────────────────────────────────────────

fn render_header(f: &mut Frame, app: &App, area: Rect) {
    let block = Block::default()
        .borders(Borders::BOTTOM)
        .border_style(s(c::SURFACE1))
        .style(Style::default().bg(c::MANTLE));
    let inner = block.inner(area);
    f.render_widget(block, area);

    let cols = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Min(20), Constraint::Min(20)])
        .split(inner);

    let left = Paragraph::new(Line::from(vec![
        Span::styled("  \u{25c6} ", sb(c::BLUE)),
        Span::styled("Doable Admin", sb(c::TEXT)),
    ]))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(left, cols[0]);

    let right = Paragraph::new(Span::styled(
        format!("DB: {} ", app.db_label),
        s(c::OVERLAY0),
    ))
    .alignment(Alignment::Right)
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(right, cols[1]);
}

// ─── Sidebar ──────────────────────────────────────────────

fn render_sidebar(f: &mut Frame, app: &mut App, area: Rect) {
    let block = Block::default()
        .borders(Borders::RIGHT)
        .border_style(s(c::SURFACE1))
        .style(Style::default().bg(c::MANTLE));
    let inner = block.inner(area);
    f.render_widget(block, area);

    // Brand
    let brand = Paragraph::new(Line::from(vec![
        Span::styled("  \u{25c6} ", sb(c::BLUE)),
        Span::styled("doable", sb(c::LAVENDER)),
    ]))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(brand, row_rect(inner, 0));

    // PLATFORM section
    let plat = Paragraph::new(Span::styled("  PLATFORM", sb(c::OVERLAY0)))
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(plat, row_rect(inner, 2));

    sidebar_item(f, app, inner, 3, 0);
    sidebar_item(f, app, inner, 4, 1);

    // WORKSPACE section
    let ws = Paragraph::new(Span::styled("  WORKSPACE", sb(c::OVERLAY0)))
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(ws, row_rect(inner, 6));

    sidebar_item(f, app, inner, 7, 2);
    sidebar_item(f, app, inner, 8, 3);
}

fn sidebar_item(f: &mut Frame, app: &mut App, parent: Rect, y_off: u16, idx: usize) {
    let label = SIDEBAR_ITEMS[idx].1;
    let selected = app.sidebar_idx == idx;
    let focused = app.focus == Focus::Sidebar;
    let area = row_rect(parent, y_off);

    let (prefix, style) = if selected && focused {
        (
            " \u{25b8} ",
            Style::default()
                .fg(c::BLUE)
                .bg(c::SURFACE0)
                .add_modifier(Modifier::BOLD),
        )
    } else if selected {
        (
            " \u{25b8} ",
            Style::default()
                .fg(c::BLUE)
                .bg(c::MANTLE)
                .add_modifier(Modifier::BOLD),
        )
    } else {
        ("   ", Style::default().fg(c::SUBTEXT0).bg(c::MANTLE))
    };

    let p = Paragraph::new(format!("{prefix}{label}")).style(style);
    f.render_widget(p, area);
    app.click_targets
        .push((area, ClickTarget::SidebarItem(idx)));
}

// ─── Content ──────────────────────────────────────────────

fn render_content(f: &mut Frame, app: &mut App, area: Rect) {
    // Background
    f.render_widget(
        Block::default().style(Style::default().bg(c::BASE)),
        area,
    );

    // Inset by 1 on each side
    let inner = Rect {
        x: area.x + 1,
        y: area.y,
        width: area.width.saturating_sub(2),
        height: area.height,
    };
    if inner.width < 10 || inner.height < 6 {
        return;
    }

    // Title row
    let title_area = Rect {
        height: 1,
        ..inner
    };
    render_content_title(f, app, title_area);

    // Action bar (Members screen only)
    let has_actions = app.screen == Screen::Members;
    let bottom_h: u16 = if has_actions { 3 } else { 2 };

    // Table area
    let table_area = Rect {
        y: inner.y + 2,
        height: inner.height.saturating_sub(2 + bottom_h),
        ..inner
    };

    match app.screen {
        Screen::Users => render_users(f, app, table_area),
        Screen::Flags => render_flags(f, app, table_area),
        Screen::Members => render_members(f, app, table_area),
        Screen::AiSettings => render_ai(f, app, table_area),
    }

    // Help / action bar
    let help_area = Rect {
        y: inner.y + inner.height - bottom_h,
        height: bottom_h,
        ..inner
    };
    render_content_footer(f, app, help_area, has_actions);
}

fn render_content_title(f: &mut Frame, app: &App, area: Rect) {
    let (title, count) = match app.screen {
        Screen::Users => ("Platform Users", app.users.len()),
        Screen::Flags => ("Feature Flags", app.flags.len()),
        Screen::Members => ("Workspace Members", app.members.len()),
        Screen::AiSettings => ("AI Settings", 0),
    };

    let mut spans = vec![Span::styled(
        format!(" {title} "),
        sb(c::TEXT),
    )];
    if count > 0 {
        spans.push(Span::styled(
            format!("({count})"),
            s(c::OVERLAY0),
        ));
    }
    // For AI settings, show workspace tabs
    if app.screen == Screen::AiSettings && !app.workspaces.is_empty() {
        spans.push(Span::raw("   "));
        for (i, ws) in app.workspaces.iter().enumerate() {
            let is_sel = app.ai_ws_idx == Some(i);
            let st = if is_sel {
                Style::default()
                    .fg(c::MANTLE)
                    .bg(c::BLUE)
                    .add_modifier(Modifier::BOLD)
            } else {
                Style::default().fg(c::SUBTEXT0).bg(c::SURFACE0)
            };
            spans.push(Span::styled(format!(" {} ", ws.name), st));
            spans.push(Span::raw(" "));
        }
    }

    let p = Paragraph::new(Line::from(spans)).style(Style::default().bg(c::BASE));
    f.render_widget(p, area);

    // Register workspace tab click targets
    if app.screen == Screen::AiSettings && !app.workspaces.is_empty() {
        // Compute x positions for ws tabs
        // Title + count + gap = variable; let's compute from the spans
        let title_text = format!(" {title} ");
        let count_text = if count > 0 {
            format!("({count})")
        } else {
            String::new()
        };
        let mut x = area.x + title_text.len() as u16 + count_text.len() as u16 + 3;
        for (i, ws) in app.workspaces.iter().enumerate() {
            let tab_w = ws.name.len() as u16 + 2; // " name "
            if x + tab_w <= area.x + area.width {
                // Can't mutate app directly here since we only have &App in title
                // We'll handle this in the parent function
                let _ = (i, x, tab_w); // suppress unused warnings
            }
            x += tab_w + 1;
        }
    }
}

fn render_content_footer(f: &mut Frame, app: &mut App, area: Rect, has_actions: bool) {
    let help_text = match app.screen {
        Screen::Users => "Enter: Toggle admin    \u{2191}\u{2193}: Navigate    Esc: Sidebar",
        Screen::Flags => "Enter/Space: Toggle    \u{2191}\u{2193}: Navigate    Esc: Sidebar",
        Screen::Members => "\u{2191}\u{2193}: Navigate    Enter: Change role    Esc: Sidebar",
        Screen::AiSettings => {
            if app.ai_ws_idx.is_some() {
                "Enter: Toggle    w: Workspace    \u{2191}\u{2193}: Navigate    Esc: Sidebar"
            } else {
                "Enter/w: Select workspace    Esc: Sidebar"
            }
        }
    };

    let help = Paragraph::new(Span::styled(format!(" {help_text}"), s(c::OVERLAY0)))
        .style(Style::default().bg(c::BASE));
    let help_row = Rect {
        height: 1,
        y: area.y + area.height - 1,
        ..area
    };
    f.render_widget(help, help_row);

    if has_actions {
        let btns = vec![
            (" r ", "Change Role"),
            (" a ", "Add Member"),
            (" d ", "Remove"),
        ];
        let mut spans = vec![Span::raw(" ")];
        let mut btn_x = area.x + 1;
        let btn_y = area.y;

        for (i, (key, label)) in btns.iter().enumerate() {
            let key_style = Style::default().fg(c::MANTLE).bg(c::BLUE).add_modifier(Modifier::BOLD);
            let label_style = Style::default().fg(c::TEXT).bg(c::SURFACE0);

            let key_w = key.len() as u16;
            let label_w = label.len() as u16 + 2; // " label "

            app.click_targets.push((
                Rect {
                    x: btn_x,
                    y: btn_y,
                    width: key_w + label_w,
                    height: 1,
                },
                ClickTarget::ActionButton(i),
            ));

            spans.push(Span::styled(*key, key_style));
            spans.push(Span::styled(format!(" {label} "), label_style));
            spans.push(Span::raw("  "));

            btn_x += key_w + label_w + 2;
        }

        let action_bar =
            Paragraph::new(Line::from(spans)).style(Style::default().bg(c::BASE));
        f.render_widget(action_bar, Rect { height: 1, ..area });
    }
}

// ─── Users table ──────────────────────────────────────────

fn render_users(f: &mut Frame, app: &mut App, area: Rect) {
    if app.users.is_empty() {
        render_empty(f, "No users found.", area);
        return;
    }

    let block = table_block(" Users ");

    let header = Row::new([
        Cell::from(" Name"),
        Cell::from("Email"),
        Cell::from("Status"),
        Cell::from("Created"),
    ])
    .style(sb(c::OVERLAY0).bg(c::SURFACE0))
    .height(1);

    let rows: Vec<Row> = app
        .users
        .iter()
        .map(|u| {
            let name = if u.display_name.is_empty() {
                u.email.split('@').next().unwrap_or("").to_string()
            } else {
                u.display_name.clone()
            };
            let status = if u.is_admin {
                Cell::from("\u{2605} ADMIN").style(sb(c::YELLOW))
            } else {
                Cell::from("  \u{2014}").style(s(c::OVERLAY0))
            };
            Row::new([
                Cell::from(format!(" {name}")).style(s(c::TEXT)),
                Cell::from(u.email.clone()).style(s(c::SUBTEXT0)),
                status,
                Cell::from(u.created_at.clone()).style(s(c::OVERLAY0)),
            ])
        })
        .collect();

    let widths = [
        Constraint::Percentage(28),
        Constraint::Percentage(32),
        Constraint::Percentage(18),
        Constraint::Percentage(22),
    ];

    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, block, area, app.users.len());
}

// ─── Flags table ──────────────────────────────────────────

fn render_flags(f: &mut Frame, app: &mut App, area: Rect) {
    if app.flags.is_empty() {
        render_empty(f, "No feature flags. Run migration 012.", area);
        return;
    }

    let block = table_block(" Feature Flags ");

    let header = Row::new([
        Cell::from(" Status"),
        Cell::from("Label"),
        Cell::from("Key"),
        Cell::from("Restrictions"),
    ])
    .style(sb(c::OVERLAY0).bg(c::SURFACE0))
    .height(1);

    let rows: Vec<Row> = app
        .flags
        .iter()
        .map(|fl| {
            let status = if fl.enabled {
                Cell::from(" \u{25cf} ON").style(sb(c::GREEN))
            } else {
                Cell::from(" \u{25cb} OFF").style(sb(c::RED))
            };
            let restrictions = match (fl.min_plan.as_deref(), fl.min_role.as_deref()) {
                (Some(p), Some(r)) => format!("{p}+ / {r}+"),
                (Some(p), None) => format!("{p}+"),
                (None, Some(r)) => format!("{r}+"),
                (None, None) => String::new(),
            };
            Row::new([
                status,
                Cell::from(fl.label.clone()).style(s(c::TEXT)),
                Cell::from(fl.key.clone()).style(s(c::OVERLAY0)),
                Cell::from(restrictions).style(s(c::TEAL)),
            ])
        })
        .collect();

    let widths = [
        Constraint::Length(10),
        Constraint::Percentage(35),
        Constraint::Percentage(30),
        Constraint::Percentage(25),
    ];

    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, block, area, app.flags.len());
}

// ─── Members table ────────────────────────────────────────

fn render_members(f: &mut Frame, app: &mut App, area: Rect) {
    if app.members.is_empty() {
        render_empty(f, "No workspace members found.", area);
        return;
    }

    let block = table_block(" Members ");

    let header = Row::new([
        Cell::from(" Email"),
        Cell::from("Role"),
        Cell::from("Workspace"),
        Cell::from("Joined"),
    ])
    .style(sb(c::OVERLAY0).bg(c::SURFACE0))
    .height(1);

    let rows: Vec<Row> = app
        .members
        .iter()
        .map(|m| {
            let role_style = role_color(&m.role);
            Row::new([
                Cell::from(format!(" {}", m.email)).style(s(c::TEXT)),
                Cell::from(m.role.clone()).style(role_style),
                Cell::from(m.workspace.clone()).style(s(c::SUBTEXT0)),
                Cell::from(m.joined.clone()).style(s(c::OVERLAY0)),
            ])
        })
        .collect();

    let widths = [
        Constraint::Percentage(30),
        Constraint::Percentage(15),
        Constraint::Percentage(30),
        Constraint::Percentage(25),
    ];

    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, block, area, app.members.len());
}

// ─── AI settings ──────────────────────────────────────────

fn render_ai(f: &mut Frame, app: &mut App, area: Rect) {
    // Register workspace tab click targets
    if !app.workspaces.is_empty() {
        let title = "AI Settings";
        let mut x = area.x.saturating_sub(1) + title.len() as u16 + 7;
        let y = area.y.saturating_sub(2); // title row is 2 above table
        for (i, ws) in app.workspaces.iter().enumerate() {
            let tab_w = ws.name.len() as u16 + 2;
            if x + tab_w < area.x + area.width + 2 {
                app.click_targets.push((
                    Rect {
                        x,
                        y,
                        width: tab_w,
                        height: 1,
                    },
                    ClickTarget::WsTab(i),
                ));
            }
            x += tab_w + 1;
        }
    }

    if app.ai_ws_idx.is_none() {
        render_empty(
            f,
            "Press Enter or w to select a workspace.",
            area,
        );
        return;
    }

    let settings = match &app.ai_settings {
        Some(s) => s,
        None => {
            render_empty(f, "No AI settings for this workspace.", area);
            return;
        }
    };

    let block = table_block(" Settings ");

    let header = Row::new([Cell::from(" Setting"), Cell::from("Value")])
        .style(sb(c::OVERLAY0).bg(c::SURFACE0))
        .height(1);

    let enforce_val = if settings.enforce_ai {
        let model = settings
            .enforced_model
            .as_deref()
            .unwrap_or("not set");
        format!("\u{25cf} ON ({model})")
    } else {
        "\u{25cb} OFF \u{2014} users choose their own".into()
    };
    let enforce_style = if settings.enforce_ai {
        sb(c::GREEN)
    } else {
        s(c::OVERLAY0)
    };

    let selector_val = if settings.show_model_selector {
        "\u{25cf} Visible"
    } else {
        "\u{25cb} Hidden"
    };
    let selector_style = if settings.show_model_selector {
        sb(c::GREEN)
    } else {
        s(c::OVERLAY0)
    };

    let default_model = settings
        .default_model
        .as_deref()
        .unwrap_or("not set");

    let rows = vec![
        Row::new([
            Cell::from(" Enforce AI model").style(s(c::TEXT)),
            Cell::from(enforce_val).style(enforce_style),
        ]),
        Row::new([
            Cell::from(" Show model selector").style(s(c::TEXT)),
            Cell::from(selector_val).style(selector_style),
        ]),
        Row::new([
            Cell::from(" Default model").style(s(c::TEXT)),
            Cell::from(format!("  {default_model}")).style(s(c::SUBTEXT0)),
        ]),
    ];

    let widths = [Constraint::Percentage(45), Constraint::Percentage(55)];

    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, block, area, 3);
}

// ─── Status bar ───────────────────────────────────────────

fn render_status_bar(f: &mut Frame, app: &App, area: Rect) {
    let bg = Style::default().bg(c::MANTLE).fg(c::OVERLAY0);
    f.render_widget(Block::default().style(bg), area);

    // Status message (left)
    if let Some((ref msg, ref kind)) = app.status {
        let (icon, color) = match kind {
            StatusKind::Success => ("\u{2713}", c::GREEN),
            StatusKind::Error => ("\u{2717}", c::RED),
            StatusKind::Info => ("\u{2022}", c::BLUE),
        };
        let status = Paragraph::new(Line::from(vec![
            Span::styled(format!(" {icon} "), sb(color)),
            Span::styled(msg, s(c::TEXT)),
        ]))
        .style(bg);
        f.render_widget(status, area);
    }

    // Hints (right)
    let hints = " Tab\u{21b9} Panel \u{2502} q Quit ";
    let hw = hints.len() as u16;
    if area.width > hw + 4 {
        let r = Rect {
            x: area.x + area.width - hw,
            y: area.y,
            width: hw,
            height: 1,
        };
        let h = Paragraph::new(hints).style(Style::default().fg(c::OVERLAY0).bg(c::MANTLE));
        f.render_widget(h, r);
    }
}

// ─── Modal overlay ────────────────────────────────────────

fn render_modal(f: &mut Frame, app: &mut App, screen: Rect) {
    let modal = match &app.modal {
        Some(m) => m,
        None => return,
    };

    match modal {
        Modal::ConfirmToggleAdmin { user_idx, btn } => {
            let ui = *user_idx;
            let b = *btn;
            render_modal_confirm_admin(f, app, screen, ui, b);
        }
        Modal::SelectRole {
            member_idx,
            role_idx,
        } => {
            let mi = *member_idx;
            let ri = *role_idx;
            render_modal_select_role(f, app, screen, mi, ri);
        }
        Modal::ConfirmRemove { member_idx, btn } => {
            let mi = *member_idx;
            let b = *btn;
            render_modal_confirm_remove(f, app, screen, mi, b);
        }
        Modal::AddStep1Workspace { idx } => {
            let i = *idx;
            render_modal_add_ws(f, app, screen, i);
        }
        Modal::AddStep2Email {
            ws_idx,
            text,
            cursor,
            error,
        } => {
            let wi = *ws_idx;
            let t = text.clone();
            let cu = *cursor;
            let e = error.clone();
            render_modal_add_email(f, app, screen, wi, &t, cu, e.as_deref());
        }
        Modal::AddStep3Role {
            ws_idx,
            email,
            role_idx,
            ..
        } => {
            let wi = *ws_idx;
            let em = email.clone();
            let ri = *role_idx;
            render_modal_add_role(f, app, screen, wi, &em, ri);
        }
        Modal::SelectWorkspace { idx } => {
            let i = *idx;
            render_modal_sel_ws(f, app, screen, i);
        }
    }
}

// ── Confirm toggle admin ────────────────────────────────

fn render_modal_confirm_admin(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    user_idx: usize,
    btn: usize,
) {
    let user = match app.users.get(user_idx) {
        Some(u) => u,
        None => return,
    };
    let action = if user.is_admin {
        "Revoke platform admin from"
    } else {
        "Grant platform admin to"
    };

    let w = 46u16;
    let h = 8u16;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);

    let block = modal_block(if user.is_admin {
        " Revoke Admin "
    } else {
        " Grant Admin "
    });
    let inner = block.inner(area);
    f.render_widget(block, area);

    // Message
    let msg = Paragraph::new(vec![
        Line::from(""),
        Line::from(Span::styled(action, s(c::TEXT))),
        Line::from(Span::styled(
            user.email.clone(),
            sb(c::BLUE),
        )),
        Line::from(""),
    ])
    .alignment(Alignment::Center)
    .style(Style::default().bg(c::MANTLE));
    let msg_area = Rect {
        height: inner.height.saturating_sub(1),
        ..inner
    };
    f.render_widget(msg, msg_area);

    // Buttons
    let btn_y = inner.y + inner.height - 1;
    render_confirm_buttons(f, app, inner, btn_y, btn, "Cancel", "Confirm");
}

// ── Select role ─────────────────────────────────────────

fn render_modal_select_role(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    member_idx: usize,
    role_idx: usize,
) {
    let member = match app.members.get(member_idx) {
        Some(m) => m,
        None => return,
    };

    let w = 40u16;
    let h = (ROLES.len() as u16) + 6;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);

    let block = modal_block(" Change Role ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    // Context
    let ctx = Paragraph::new(vec![
        Line::from(""),
        Line::from(vec![
            Span::styled(&member.email, sb(c::BLUE)),
            Span::styled(" in ", s(c::OVERLAY0)),
            Span::styled(&member.workspace, sb(c::TEAL)),
        ]),
        Line::from(""),
    ])
    .alignment(Alignment::Center)
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(ctx, Rect { height: 3, ..inner });

    // Role list
    for (i, role) in ROLES.iter().enumerate() {
        let y = inner.y + 3 + i as u16;
        let is_sel = i == role_idx;
        let is_current = *role == member.role;

        let prefix = if is_sel { " \u{25b8} " } else { "   " };
        let suffix = if is_current { " (current)" } else { "" };

        let style = if is_sel {
            role_color(role).bg(c::SURFACE0).add_modifier(Modifier::BOLD)
        } else {
            role_color(role).bg(c::MANTLE)
        };

        let r = Rect {
            x: inner.x + 4,
            y,
            width: inner.width.saturating_sub(4),
            height: 1,
        };

        let p = Paragraph::new(format!("{prefix}{role}{suffix}")).style(style);
        f.render_widget(p, r);

        app.click_targets.push((r, ClickTarget::ModalListItem(i)));
    }
}

// ── Confirm remove ──────────────────────────────────────

fn render_modal_confirm_remove(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    member_idx: usize,
    btn: usize,
) {
    let member = match app.members.get(member_idx) {
        Some(m) => m,
        None => return,
    };

    let w = 46u16;
    let h = 8u16;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);

    let block = modal_block(" Remove Member ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let msg = Paragraph::new(vec![
        Line::from(""),
        Line::from(vec![
            Span::styled("Remove ", s(c::TEXT)),
            Span::styled(&member.email, sb(c::RED)),
        ]),
        Line::from(vec![
            Span::styled("from ", s(c::TEXT)),
            Span::styled(&member.workspace, sb(c::TEAL)),
            Span::styled(" ?", s(c::TEXT)),
        ]),
        Line::from(""),
    ])
    .alignment(Alignment::Center)
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(msg, Rect { height: inner.height - 1, ..inner });

    let btn_y = inner.y + inner.height - 1;
    render_confirm_buttons(f, app, inner, btn_y, btn, "Cancel", "Remove");
}

// ── Add member step 1: workspace ────────────────────────

fn render_modal_add_ws(f: &mut Frame, app: &mut App, screen: Rect, ws_idx: usize) {
    let item_count = app.workspaces.len().min(10) as u16;
    let w = 44u16;
    let h = item_count + 4;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);

    let block = modal_block(" Add Member \u{2014} Workspace ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let hint = Paragraph::new(Span::styled(
        " Select a workspace:",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(hint, Rect { height: 1, ..inner });

    for (i, ws) in app.workspaces.iter().enumerate().take(10) {
        let y = inner.y + 1 + i as u16;
        let is_sel = i == ws_idx;
        let prefix = if is_sel { " \u{25b8} " } else { "   " };
        let style = if is_sel {
            sb(c::BLUE).bg(c::SURFACE0)
        } else {
            s(c::TEXT).bg(c::MANTLE)
        };
        let r = Rect {
            x: inner.x + 2,
            y,
            width: inner.width.saturating_sub(2),
            height: 1,
        };
        let label = format!("{prefix}{} ({})", ws.name, ws.slug);
        f.render_widget(Paragraph::new(label).style(style), r);
        app.click_targets.push((r, ClickTarget::ModalListItem(i)));
    }
}

// ── Add member step 2: email ────────────────────────────

fn render_modal_add_email(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    ws_idx: usize,
    text: &str,
    cursor: usize,
    error: Option<&str>,
) {
    let w = 50u16;
    let h = if error.is_some() { 9u16 } else { 8u16 };
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);

    let block = modal_block(" Add Member \u{2014} Email ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let ws_name = app
        .workspaces
        .get(ws_idx)
        .map(|w| w.name.as_str())
        .unwrap_or("?");

    // Workspace context
    let ctx = Paragraph::new(Line::from(vec![
        Span::styled(" Workspace: ", s(c::OVERLAY0)),
        Span::styled(ws_name, sb(c::TEAL)),
    ]))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(ctx, Rect { y: inner.y, height: 1, ..inner });

    // Input field
    let input_y = inner.y + 2;
    let input_label = Paragraph::new(Span::styled(" Email:", s(c::OVERLAY0)))
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(
        input_label,
        Rect {
            y: input_y,
            height: 1,
            ..inner
        },
    );

    // Text input with cursor
    let input_x = inner.x + 8;
    let input_w = inner.width.saturating_sub(9);
    let before = &text[..cursor.min(text.len())];
    let after = &text[cursor.min(text.len())..];
    let input_line = Line::from(vec![
        Span::styled(before, s(c::TEXT)),
        Span::styled("\u{2502}", sb(c::BLUE)), // cursor
        Span::styled(after, s(c::TEXT)),
    ]);
    let input = Paragraph::new(input_line)
        .style(Style::default().bg(c::SURFACE0));
    let input_area = Rect {
        x: input_x,
        y: input_y,
        width: input_w,
        height: 1,
    };
    f.render_widget(input, input_area);

    // Error
    if let Some(err) = error {
        let e = Paragraph::new(Span::styled(format!(" {err}"), s(c::RED)))
            .style(Style::default().bg(c::MANTLE));
        f.render_widget(
            e,
            Rect {
                y: input_y + 2,
                height: 1,
                ..inner
            },
        );
    }

    // Hint
    let hint = Paragraph::new(Span::styled(
        " Enter: submit    Esc: cancel",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(
        hint,
        Rect {
            y: inner.y + inner.height - 1,
            height: 1,
            ..inner
        },
    );
}

// ── Add member step 3: role ─────────────────────────────

fn render_modal_add_role(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    ws_idx: usize,
    email: &str,
    role_idx: usize,
) {
    let w = 44u16;
    let h = (ADD_ROLES.len() as u16) + 6;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);

    let block = modal_block(" Add Member \u{2014} Role ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let ws_name = app
        .workspaces
        .get(ws_idx)
        .map(|w| w.name.as_str())
        .unwrap_or("?");

    let ctx = Paragraph::new(vec![
        Line::from(""),
        Line::from(vec![
            Span::styled(email, sb(c::BLUE)),
            Span::styled(" \u{2192} ", s(c::OVERLAY0)),
            Span::styled(ws_name, sb(c::TEAL)),
        ]),
        Line::from(""),
    ])
    .alignment(Alignment::Center)
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(ctx, Rect { height: 3, ..inner });

    for (i, role) in ADD_ROLES.iter().enumerate() {
        let y = inner.y + 3 + i as u16;
        let is_sel = i == role_idx;
        let prefix = if is_sel { " \u{25b8} " } else { "   " };
        let style = if is_sel {
            role_color(role).bg(c::SURFACE0).add_modifier(Modifier::BOLD)
        } else {
            role_color(role).bg(c::MANTLE)
        };
        let r = Rect {
            x: inner.x + 4,
            y,
            width: inner.width.saturating_sub(4),
            height: 1,
        };
        f.render_widget(Paragraph::new(format!("{prefix}{role}")).style(style), r);
        app.click_targets.push((r, ClickTarget::ModalListItem(i)));
    }
}

// ── Select workspace (AI settings) ─────────────────────

fn render_modal_sel_ws(f: &mut Frame, app: &mut App, screen: Rect, ws_idx: usize) {
    let item_count = app.workspaces.len().min(10) as u16;
    let w = 44u16;
    let h = item_count + 4;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);

    let block = modal_block(" Select Workspace ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let hint = Paragraph::new(Span::styled(
        " Choose workspace for AI settings:",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(hint, Rect { height: 1, ..inner });

    for (i, ws) in app.workspaces.iter().enumerate().take(10) {
        let y = inner.y + 1 + i as u16;
        let is_sel = i == ws_idx;
        let prefix = if is_sel { " \u{25b8} " } else { "   " };
        let style = if is_sel {
            sb(c::BLUE).bg(c::SURFACE0)
        } else {
            s(c::TEXT).bg(c::MANTLE)
        };
        let r = Rect {
            x: inner.x + 2,
            y,
            width: inner.width.saturating_sub(2),
            height: 1,
        };
        let label = format!("{prefix}{} ({}) \u{2014} {} \u{2014} {} members", ws.name, ws.slug, ws.plan, ws.members);
        f.render_widget(Paragraph::new(label).style(style), r);
        app.click_targets.push((r, ClickTarget::ModalListItem(i)));
    }
}

// ─── Shared helpers ───────────────────────────────────────

fn table_block(title: &str) -> Block<'_> {
    Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(s(c::SURFACE1))
        .title(title)
        .title_style(sb(c::LAVENDER))
        .style(Style::default().bg(c::BASE))
}

fn modal_block(title: &str) -> Block<'_> {
    Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .border_style(sb(c::BLUE))
        .title(title)
        .title_style(sb(c::TEXT))
        .style(Style::default().bg(c::MANTLE))
}

fn highlight_style() -> Style {
    Style::default()
        .bg(c::SURFACE0)
        .fg(c::TEXT)
        .add_modifier(Modifier::BOLD)
}

fn role_color(role: &str) -> Style {
    match role {
        "owner" => sb(c::YELLOW),
        "admin" => sb(c::BLUE),
        "member" => s(c::GREEN),
        "viewer" => s(c::OVERLAY0),
        _ => s(c::TEXT),
    }
}

fn render_empty(f: &mut Frame, msg: &str, area: Rect) {
    let p = Paragraph::new(Span::styled(msg, s(c::OVERLAY0)))
        .alignment(Alignment::Center)
        .style(Style::default().bg(c::BASE));
    let y = area.y + area.height / 2;
    let r = Rect { y, height: 1, ..area };
    f.render_widget(p, r);
}

fn render_confirm_buttons(
    f: &mut Frame,
    app: &mut App,
    inner: Rect,
    btn_y: u16,
    selected: usize,
    cancel_label: &str,
    confirm_label: &str,
) {
    let cancel_w = cancel_label.len() as u16 + 4;
    let confirm_w = confirm_label.len() as u16 + 4;
    let total = cancel_w + 4 + confirm_w;
    let start_x = inner.x + (inner.width.saturating_sub(total)) / 2;

    // Cancel button
    let cancel_style = if selected == 0 {
        Style::default().fg(c::TEXT).bg(c::SURFACE1).add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(c::OVERLAY0).bg(c::SURFACE0)
    };
    let cancel_rect = Rect {
        x: start_x,
        y: btn_y,
        width: cancel_w,
        height: 1,
    };
    f.render_widget(
        Paragraph::new(format!("  {cancel_label}  ")).style(cancel_style),
        cancel_rect,
    );
    app.click_targets
        .push((cancel_rect, ClickTarget::ModalButton(0)));

    // Confirm button
    let confirm_style = if selected == 1 {
        Style::default()
            .fg(c::MANTLE)
            .bg(c::BLUE)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(c::OVERLAY0).bg(c::SURFACE0)
    };
    let confirm_rect = Rect {
        x: start_x + cancel_w + 4,
        y: btn_y,
        width: confirm_w,
        height: 1,
    };
    f.render_widget(
        Paragraph::new(format!("  {confirm_label}  ")).style(confirm_style),
        confirm_rect,
    );
    app.click_targets
        .push((confirm_rect, ClickTarget::ModalButton(1)));
}

fn register_row_clicks(
    _f: &mut Frame,
    app: &mut App,
    block: Block<'_>,
    area: Rect,
    data_len: usize,
) {
    let inner = block.inner(area);
    let header_h = 1u16;
    let offset = app.table_state.offset();
    let visible = inner.height.saturating_sub(header_h) as usize;
    for i in 0..visible {
        let di = offset + i;
        if di >= data_len {
            break;
        }
        let r = Rect {
            x: inner.x,
            y: inner.y + header_h + i as u16,
            width: inner.width,
            height: 1,
        };
        app.click_targets.push((r, ClickTarget::ContentRow(di)));
    }
}

fn centered(w: u16, h: u16, area: Rect) -> Rect {
    let x = area.x + area.width.saturating_sub(w) / 2;
    let y = area.y + area.height.saturating_sub(h) / 2;
    Rect {
        x,
        y,
        width: w.min(area.width),
        height: h.min(area.height),
    }
}

fn row_rect(parent: Rect, y_offset: u16) -> Rect {
    Rect {
        y: parent.y + y_offset,
        height: 1,
        ..parent
    }
}
