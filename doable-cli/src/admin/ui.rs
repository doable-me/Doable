use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{
        Block, BorderType, Borders, Cell, Clear, Paragraph, Row, Table,
    },
    Frame,
};

use crate::admin::app::{
    App, ClickTarget, Focus, Modal, Screen, StatusKind, ADD_ROLES, ROLES, SIDEBAR_ITEMS,
    SANDBOX_RULE_TYPES, SANDBOX_ACTIONS, SANDBOX_BACKENDS,
    SYSTEM_RULE_SCOPES, SYSTEM_RULE_TYPES,
};
use crate::admin::server_config as sc;

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
    if SIDEBAR_ITEMS.len() > 4 {
        sidebar_item(f, app, inner, 9, 4);
    }
    if SIDEBAR_ITEMS.len() > 5 {
        sidebar_item(f, app, inner, 10, 5);
    }
    if SIDEBAR_ITEMS.len() > 6 {
        sidebar_item(f, app, inner, 11, 6);
    }

    // SYSTEM section
    let sys = Paragraph::new(Span::styled("  SYSTEM", sb(c::OVERLAY0)))
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(sys, row_rect(inner, 13));

    if SIDEBAR_ITEMS.len() > 7 {
        sidebar_item(f, app, inner, 14, 7);
    }
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
        Screen::CreditsAndPlan => render_credits(f, app, table_area),
        Screen::ApiKeys => render_api_keys(f, app, table_area),
        Screen::ModeTools => render_mode_tools(f, app, table_area),
        Screen::Sandbox => render_sandbox(f, app, table_area),
        Screen::SystemRules => render_system_rules(f, app, table_area),
        Screen::ServerConfig => render_server_config(f, app, table_area),
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
        Screen::CreditsAndPlan => ("Credits & Plan", app.credit_balances.len()),
        Screen::ApiKeys => ("API Keys", app.api_keys.len()),
        Screen::ModeTools => ("Mode Tools", app.mode_tools.len()),
        Screen::Sandbox => ("Sandbox", app.sandbox_rules.len()),
        Screen::SystemRules => ("System Rules", app.system_rules.len()),
        Screen::ServerConfig => ("Server Config", 0),
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
        Screen::Users => "Enter: Toggle admin    r: Set platform role    \u{2191}\u{2193}: Navigate    Esc: Sidebar",
        Screen::Flags => "Enter/Space: Toggle    \u{2191}\u{2193}: Navigate    Esc: Sidebar",
        Screen::Members => "\u{2191}\u{2193}: Navigate    Enter: Change role    Esc: Sidebar",
        Screen::AiSettings => {
            if app.ai_ws_idx.is_some() {
                "Enter: Toggle    w: Workspace    \u{2191}\u{2193}: Navigate    Esc: Sidebar"
            } else {
                "Enter/w: Select workspace    Esc: Sidebar"
            }
        }
        Screen::CreditsAndPlan => {
            "d: Daily    m: Monthly    r: Rollover    p: Plan    \u{2191}\u{2193}: Navigate    Esc: Sidebar"
        }
        Screen::ApiKeys => {
            "Enter/o: Edit origins    t: Edit tools    \u{2191}\u{2193}: Navigate    Esc: Sidebar"
        }
        Screen::ModeTools => {
            "Enter: Edit allowed tools    \u{2191}\u{2193}: Navigate    Esc: Sidebar"
        }
        Screen::Sandbox => {
            "a: Add rule    e/Enter: Edit    d: Delete    t: Toggle    s: Settings    \u{2191}\u{2193}: Navigate    Esc: Sidebar"
        }
        Screen::SystemRules => {
            "a: Add    e/Enter: Edit    d: Delete    t: Toggle    \u{2191}\u{2193}: Navigate    Esc: Sidebar"
        }
        Screen::ServerConfig => {
            if app.sc_subview == sc::SubView::DbCredentials {
                "s: show/hide password    r: rotate    c: copy URL    \u{2191}\u{2193}: Navigate    Esc: Sidebar"
            } else {
                "1-7: Tab    Enter: Edit    a: Add    d: Delete    A: Apply    R: Reload    Esc: Sidebar"
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
        Cell::from("Admin"),
        Cell::from("Platform Role"),
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
            let admin = if u.is_admin {
                Cell::from("\u{2605} ADMIN").style(sb(c::YELLOW))
            } else {
                Cell::from("  \u{2014}").style(s(c::OVERLAY0))
            };
            let role_cell = match u.platform_role.as_str() {
                "owner" => Cell::from("\u{25c6} owner").style(sb(c::GREEN)),
                "admin" => Cell::from("\u{25c6} admin").style(sb(c::TEAL)),
                "viewer" => Cell::from("  viewer").style(s(c::OVERLAY0)),
                _ => Cell::from("  member").style(s(c::SUBTEXT0)),
            };
            Row::new([
                Cell::from(format!(" {name}")).style(s(c::TEXT)),
                Cell::from(u.email.clone()).style(s(c::SUBTEXT0)),
                admin,
                role_cell,
                Cell::from(u.created_at.clone()).style(s(c::OVERLAY0)),
            ])
        })
        .collect();

    let widths = [
        Constraint::Percentage(22),
        Constraint::Percentage(28),
        Constraint::Percentage(14),
        Constraint::Percentage(18),
        Constraint::Percentage(18),
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

    // ── Default provider row (NEW) ──
    let provider_label_val = match settings.default_provider_id.as_deref() {
        Some(pid) => settings
            .providers
            .iter()
            .find(|p| p.id == pid)
            .map(|p| {
                if settings.default_source == "custom" {
                    format!("\u{25cf} {} ({})", p.label, p.provider_type)
                } else {
                    format!("\u{25cb} {} ({}) — copilot active", p.label, p.provider_type)
                }
            })
            .unwrap_or_else(|| "\u{25cb} (provider missing)".into()),
        None => "\u{25cb} GitHub Copilot (default)".into(),
    };
    let provider_style = if settings.default_source == "custom"
        && settings.default_provider_id.is_some()
    {
        sb(c::GREEN)
    } else {
        s(c::OVERLAY0)
    };

    // ── Default provider model row (NEW) ──
    let provider_model_val = settings
        .default_provider_model
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or("(provider default)");

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
            Cell::from(" Default model (legacy)").style(s(c::TEXT)),
            Cell::from(format!("  {default_model}")).style(s(c::SUBTEXT0)),
        ]),
        Row::new([
            Cell::from(" Default provider").style(s(c::TEXT)),
            Cell::from(provider_label_val).style(provider_style),
        ]),
        Row::new([
            Cell::from(" Default model").style(s(c::TEXT)),
            Cell::from(format!("  {provider_model_val}")).style(s(c::SUBTEXT0)),
        ]),
    ];

    let widths = [Constraint::Percentage(45), Constraint::Percentage(55)];

    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, block, area, 5);
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
        Modal::EditAllowlistEntry { idx, text, cursor, error } => {
            let i = *idx;
            let t = text.clone();
            let cu = *cursor;
            let e = error.clone();
            render_modal_edit_allowlist(f, app, screen, i, &t, cu, e.as_deref());
        }
        Modal::ConfirmAllowlistRemove { idx, btn } => {
            let i = *idx;
            let b = *btn;
            render_modal_confirm_allowlist_remove(f, app, screen, i, b);
        }
        Modal::EditIngressEntry { idx, host, service, field, cursor, error } => {
            let i = *idx;
            let h = host.clone();
            let s_ = service.clone();
            let fi = *field;
            let cu = *cursor;
            let e = error.clone();
            render_modal_edit_ingress(f, app, screen, i, &h, &s_, fi, cu, e.as_deref());
        }
        Modal::ConfirmIngressRemove { idx, btn } => {
            let i = *idx;
            let b = *btn;
            render_modal_confirm_ingress_remove(f, app, screen, i, b);
        }
        Modal::EditEnvValue { idx: _, key, text, cursor, error } => {
            let k = key.clone();
            let t = text.clone();
            let cu = *cursor;
            let e = error.clone();
            render_modal_edit_env(f, app, screen, &k, &t, cu, e.as_deref());
        }
        Modal::ConfirmEnvApply { btn } => {
            let b = *btn;
            render_modal_confirm_simple(f, app, screen, " Apply .env Changes ",
                "Restart doable.service now?", "Cancel", "Restart API", b);
        }
        Modal::ConfirmSquidApply { btn } => {
            let b = *btn;
            render_modal_confirm_simple(f, app, screen, " Apply Squid Allowlist ",
                "Write squid.conf and reconfigure?", "Cancel", "Apply", b);
        }
        Modal::ConfirmCloudflaredApply { btn } => {
            let b = *btn;
            render_modal_confirm_simple(f, app, screen, " Apply cloudflared Ingress ",
                "Validate and reload cloudflared?", "Cancel", "Apply", b);
        }
        Modal::PickProvider { idx } => {
            let i = *idx;
            render_modal_pick_provider(f, app, screen, i);
        }
        Modal::EditDefaultModel { text, cursor, error } => {
            let t = text.clone();
            let cu = *cursor;
            let e = error.clone();
            render_modal_edit_default_model(f, app, screen, &t, cu, e.as_deref());
        }
        Modal::EditCredits { balance_idx, field, text, cursor, error } => {
            let bi = *balance_idx;
            let fi = *field;
            let t = text.clone();
            let cu = *cursor;
            let e = error.clone();
            render_modal_edit_credits(f, app, screen, bi, fi, &t, cu, e.as_deref());
        }
        Modal::PickPlanType { balance_idx, idx } => {
            let bi = *balance_idx;
            let i = *idx;
            render_modal_pick_plan_type(f, app, screen, bi, i);
        }
        Modal::ConfirmCreditsApply { balance_idx, btn } => {
            let bi = *balance_idx;
            let b = *btn;
            render_modal_confirm_credits_apply(f, app, screen, bi, b);
        }
        Modal::EditApiKeyOrigins { key_idx, text, cursor, error } => {
            let ki = *key_idx;
            let t = text.clone();
            let cu = *cursor;
            let e = error.clone();
            render_modal_edit_api_key_origins(f, app, screen, ki, &t, cu, e.as_deref());
        }
        Modal::EditApiKeyTools { key_idx, text, cursor, error } => {
            let ki = *key_idx;
            let t = text.clone();
            let cu = *cursor;
            let e = error.clone();
            render_modal_edit_api_key_tools(f, app, screen, ki, &t, cu, e.as_deref());
        }
        Modal::EditModeTools { mode_idx, text, cursor, error } => {
            let mi = *mode_idx;
            let t = text.clone();
            let cu = *cursor;
            let e = error.clone();
            render_modal_edit_mode_tools(f, app, screen, mi, &t, cu, e.as_deref());
        }
        Modal::PickPlatformRole { user_idx, idx } => {
            let ui = *user_idx;
            let i = *idx;
            render_modal_pick_platform_role(f, app, screen, ui, i);
        }
        Modal::ConfirmRotateDbPassword { btn } => {
            let b = *btn;
            // Tailored body — make the consequences explicit (admin's existing
            // session survives but next reconnect needs the new pass).
            render_modal_confirm_simple(
                f,
                app,
                screen,
                " Rotate Postgres Password ",
                "Generate a new password and roll it through .db_pass / .env / API restart?",
                "Cancel",
                "Rotate",
                b,
            );
        }
        Modal::RotateInProgress { progress_msg } => {
            let m = progress_msg.clone();
            render_modal_rotate_in_progress(f, screen, &m);
        }
        Modal::RotateResult { success, message } => {
            let succ = *success;
            let msg = message.clone();
            render_modal_rotate_result(f, screen, succ, &msg);
        }
        Modal::EditSandboxRule {
            idx, rule_type_idx, pattern, action_idx, priority, reason,
            field, cursor, error,
        } => {
            let i = *idx;
            let rti = *rule_type_idx;
            let p = pattern.clone();
            let ai = *action_idx;
            let pr = priority.clone();
            let re = reason.clone();
            let fi = *field;
            let cu = *cursor;
            let e = error.clone();
            render_modal_edit_sandbox_rule(f, app, screen, i, rti, &p, ai, &pr, &re, fi, cu, e.as_deref());
        }
        Modal::ConfirmSandboxRuleRemove { idx, btn } => {
            let i = *idx;
            let b = *btn;
            let desc = app
                .sandbox_rules
                .get(i)
                .map(|r| format!("{} {} {}", r.rule_type, r.action, r.pattern))
                .unwrap_or_else(|| "(unknown)".into());
            render_modal_confirm_simple(
                f, app, screen,
                " Delete Sandbox Rule ",
                &format!("Delete rule: {desc}?"),
                "Cancel", "Delete", b,
            );
        }
        Modal::EditSandboxSettings {
            backend_idx, tool_action_idx, net_action_idx, field,
        } => {
            let bi = *backend_idx;
            let ti = *tool_action_idx;
            let ni = *net_action_idx;
            let fi = *field;
            render_modal_edit_sandbox_settings(f, app, screen, bi, ti, ni, fi);
        }
        Modal::EditSystemRule {
            idx, scope_idx, rule_type_idx, pattern, action_idx,
            priority, is_floor, description, field, cursor, error,
        } => {
            let (i, si, rti, p, ai, pr, fl, d, fi, cu) = (
                *idx, *scope_idx, *rule_type_idx, pattern.clone(),
                *action_idx, priority.clone(), *is_floor, description.clone(),
                *field, *cursor,
            );
            let e = error.as_deref().map(|s| s.to_owned());
            render_modal_edit_system_rule(
                f, app, screen, i, si, rti, &p,
                ai, &pr, fl, &d, fi, cu,
                e.as_deref(),
            );
        }
        Modal::ConfirmSystemRuleRemove { idx, btn } => {
            let i = *idx;
            let b = *btn;
            let desc = if i < app.system_rules.len() {
                format!("{} {} ({})",
                    app.system_rules[i].scope,
                    app.system_rules[i].pattern,
                    app.system_rules[i].rule_type,
                )
            } else {
                "?".to_string()
            };
            render_modal_confirm_simple(
                f, app, screen,
                " Delete System Rule ",
                &format!("Delete system rule: {desc}?"),
                "Cancel", "Delete", b,
            );
        }
    }
}

fn render_modal_rotate_in_progress(f: &mut Frame, screen: Rect, progress_msg: &str) {
    let w = 60u16;
    let h = 8u16;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(" Rotating Postgres Password... ");
    let inner = block.inner(area);
    f.render_widget(block, area);
    let p = Paragraph::new(vec![
        Line::from(""),
        Line::from(Span::styled(progress_msg.to_string(), sb(c::TEAL))),
        Line::from(""),
        Line::from(Span::styled(
            "Please wait — do not close this window.",
            s(c::OVERLAY0),
        )),
    ])
    .alignment(Alignment::Center)
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(p, inner);
}

fn render_modal_rotate_result(f: &mut Frame, screen: Rect, success: bool, message: &str) {
    // Wider modal so a long stage-error stderr is readable.
    let w = 76u16;
    let h = 10u16;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let title = if success {
        " Rotation Complete "
    } else {
        " Rotation Failed "
    };
    let block = modal_block(title);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let banner_style = if success { sb(c::GREEN) } else { sb(c::RED) };
    let banner_text = if success { "SUCCESS" } else { "FAILURE" };

    let mut lines: Vec<Line> = Vec::new();
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(banner_text, banner_style)));
    lines.push(Line::from(""));
    // Wrap message at ~70 chars so it fits inside w=76.
    for chunk in wrap_string(message, 70) {
        lines.push(Line::from(Span::styled(chunk, s(c::TEXT))));
    }
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "Press Enter or Esc to close.",
        s(c::OVERLAY0),
    )));

    let p = Paragraph::new(lines)
        .alignment(Alignment::Center)
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(p, inner);
}

/// Trivial word-wrap on whitespace; used by the rotation-result modal so a
/// long stderr message line-wraps cleanly inside the modal.
fn wrap_string(s: &str, max: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    for word in s.split_whitespace() {
        if cur.is_empty() {
            cur.push_str(word);
        } else if cur.len() + 1 + word.len() <= max {
            cur.push(' ');
            cur.push_str(word);
        } else {
            out.push(cur);
            cur = word.to_string();
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    if out.is_empty() {
        out.push(String::new());
    }
    out
}

fn render_modal_pick_platform_role(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    user_idx: usize,
    selected: usize,
) {
    use crate::admin::app::PLATFORM_ROLES;
    let user = match app.users.get(user_idx) {
        Some(u) => u,
        None => return,
    };
    let w = 56u16;
    let h = (PLATFORM_ROLES.len() as u16) + 8;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);

    let block = modal_block(" Set Platform Role ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    // Context: user email + current role
    let ctx = Paragraph::new(vec![
        Line::from(""),
        Line::from(vec![
            Span::styled(&user.email, sb(c::BLUE)),
            Span::styled("  current: ", s(c::OVERLAY0)),
            Span::styled(&user.platform_role, sb(c::TEAL)),
        ]),
        Line::from(""),
    ])
    .alignment(Alignment::Center)
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(ctx, Rect { height: 3, ..inner });

    // Role list
    for (i, role) in PLATFORM_ROLES.iter().enumerate() {
        let y = inner.y + 3 + i as u16;
        let row = Rect { x: inner.x, y, width: inner.width, height: 1 };
        let is_sel = i == selected;
        let is_current = *role == user.platform_role;
        let hot = match *role {
            "owner" => "[o]",
            "admin" => "[a]",
            "member" => "[m]",
            "viewer" => "[v]",
            _ => "   ",
        };
        let style = if is_sel {
            sb(c::YELLOW)
        } else if is_current {
            sb(c::TEAL)
        } else {
            s(c::SUBTEXT0)
        };
        let prefix = if is_sel { ">" } else { " " };
        let line = Paragraph::new(Line::from(vec![
            Span::styled(format!("  {prefix} "), style),
            Span::styled(format!("{hot} "), s(c::OVERLAY0)),
            Span::styled(role.to_string(), style),
            Span::styled(
                if is_current { "  (current)" } else { "" },
                s(c::OVERLAY0),
            ),
        ]));
        f.render_widget(line, row);
        app.click_targets.push((row, crate::admin::app::ClickTarget::ModalListItem(i)));
    }

    // Help row at bottom of modal
    let help_row = Rect { x: inner.x, y: inner.bottom().saturating_sub(2), width: inner.width, height: 1 };
    let help = Paragraph::new(Line::from(Span::styled(
        " o/a/m/v: pick directly   \u{2191}\u{2193}: nav   Enter: apply   Esc: cancel ",
        s(c::OVERLAY0),
    )))
    .alignment(Alignment::Center);
    f.render_widget(help, help_row);
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

// ─── Server Config screen ─────────────────────────────────

fn render_server_config(f: &mut Frame, app: &mut App, area: Rect) {
    // Background fill
    f.render_widget(Block::default().style(Style::default().bg(c::BASE)), area);

    // Tab bar at top of area, table below
    if area.height < 4 {
        return;
    }
    let tab_h: u16 = 2;
    let tab_area = Rect { height: tab_h, ..area };
    let body_area = Rect {
        y: area.y + tab_h,
        height: area.height.saturating_sub(tab_h),
        ..area
    };

    render_subview_tabs(f, app, tab_area);

    match app.sc_subview {
        sc::SubView::Squid => render_sc_squid(f, app, body_area),
        sc::SubView::Cloudflared => render_sc_cloudflared(f, app, body_area),
        sc::SubView::EnvFile => render_sc_env(f, app, body_area),
        sc::SubView::Systemd => render_sc_systemd(f, app, body_area),
        sc::SubView::Nft => render_sc_nft(f, app, body_area),
        sc::SubView::Caddy => render_sc_caddy(f, app, body_area),
        sc::SubView::DbCredentials => render_sc_db_credentials(f, app, body_area),
    }
}

fn render_sc_db_credentials(f: &mut Frame, app: &mut App, area: Rect) {
    let st = match &app.db_credentials {
        Some(s) => s,
        None => {
            render_empty(f, "DB credentials not loaded.", area);
            return;
        }
    };

    let block = table_block(" DB Credentials (read-only + Rotate) ");
    let inner = block.inner(area);
    f.render_widget(block.clone(), area);

    if inner.height < 4 {
        return;
    }

    // Mask the password to a length-stable bullet string when hidden.
    let pw_display = if app.db_creds_revealed {
        st.password.clone()
    } else {
        // Use a fixed-length mask so the operator can't guess the length.
        "\u{2022}".repeat(20)
    };

    // Rebuild the URL we show row-by-row so the password masking is honored.
    let masked_url = {
        let pw_in_url = if app.db_creds_revealed {
            st.password.clone()
        } else {
            "\u{2022}".repeat(20)
        };
        // Strip scheme://user:<pw>@host/db, then re-glue.
        if let Some((u, _, hp, d)) = sc::parse_db_url(&st.db_url) {
            format!("postgres://{}:{}@{}/{}", u, pw_in_url, hp, d)
        } else {
            st.db_url.clone()
        }
    };

    let sel = app.table_state.selected().unwrap_or(0);
    let row_style = |row_idx: usize| -> Style {
        if sel == row_idx {
            highlight_style()
        } else {
            s(c::TEXT)
        }
    };
    let label_style = s(c::OVERLAY0);

    // Layout: each logical row gets 2 visible lines (label + value), plus a
    // 1-row separator.  Final row 3 is the rotate button.
    let mut lines: Vec<Line> = Vec::new();

    // Row 0 — Server-local URL
    lines.push(Line::from(vec![
        Span::styled(" Server-local URL", label_style),
    ]));
    lines.push(Line::from(vec![
        Span::raw("   "),
        Span::styled(masked_url.clone(), row_style(0)),
    ]));
    lines.push(Line::from(""));

    // Row 1 — tunnel URL (only when remote)
    if let Some(tunnel_masked_template) = &st.tunnel_url {
        // We rebuild the tunnel URL with the LIVE masking — st.tunnel_url
        // was constructed with a fixed mask placeholder.  Re-parse from
        // app.db_url (which holds the actual tunnel host:port + password).
        let live = if let Some((u, _pw, hp, d)) = sc::parse_db_url(&app.db_url) {
            let pw_disp = if app.db_creds_revealed {
                st.password.clone()
            } else {
                "\u{2022}".repeat(20)
            };
            format!("postgres://{}:{}@{}/{}", u, pw_disp, hp, d)
        } else {
            tunnel_masked_template.clone()
        };
        lines.push(Line::from(vec![
            Span::styled(" Your tunnel URL", label_style),
        ]));
        lines.push(Line::from(vec![
            Span::raw("   "),
            Span::styled(live, row_style(1)),
        ]));
        lines.push(Line::from(""));
    } else {
        // Even when not remote, reserve row 1 with an explanatory blurb so
        // the row index → cursor mapping stays stable (content_len = 4).
        lines.push(Line::from(vec![
            Span::styled(" Your tunnel URL", label_style),
        ]));
        lines.push(Line::from(vec![
            Span::raw("   "),
            Span::styled("(none — admin is running ON the server)", row_style(1)),
        ]));
        lines.push(Line::from(""));
    }

    // Row 2 — password (separately, so the operator can copy just the pw)
    lines.push(Line::from(vec![
        Span::styled(" Password", label_style),
    ]));
    lines.push(Line::from(vec![
        Span::raw("   "),
        Span::styled(pw_display, row_style(2)),
        Span::raw("   "),
        Span::styled(
            if app.db_creds_revealed {
                "(visible — press 's' to hide)"
            } else {
                "(hidden — press 's' to reveal)"
            },
            s(c::OVERLAY0),
        ),
    ]));
    lines.push(Line::from(""));

    // Row 3 — Rotate button.
    let btn_style = if sel == 3 {
        Style::default()
            .fg(c::MANTLE)
            .bg(c::RED)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(c::TEXT).bg(c::SURFACE0)
    };
    lines.push(Line::from(vec![
        Span::raw(" "),
        Span::styled(" [ Rotate password ] ", btn_style),
        Span::raw("  "),
        Span::styled("(press 'r' or Enter)", s(c::OVERLAY0)),
    ]));
    lines.push(Line::from(""));

    // Source / context note at the bottom.
    lines.push(Line::from(vec![
        Span::styled(format!(" host: {}", st.host_label), s(c::SUBTEXT0)),
    ]));
    lines.push(Line::from(vec![
        Span::styled(format!(" source: {}", st.source_note), s(c::OVERLAY0)),
    ]));

    let p = Paragraph::new(lines).style(Style::default().bg(c::BASE));
    f.render_widget(p, inner);

    // Register click rows so click-to-select still works.  We place 4 logical
    // hit-rects, one per row, aligned with the label lines above.
    // Layout: row0 label@0/value@1/blank@2 (3 lines per group → row n at y=3n).
    let inner_y = inner.y;
    for i in 0..4u16 {
        let y = inner_y + i * 3;
        if y >= inner.y + inner.height {
            break;
        }
        let r = Rect {
            x: inner.x,
            y,
            width: inner.width,
            height: 2.min(inner.y + inner.height - y),
        };
        app.click_targets
            .push((r, ClickTarget::ContentRow(i as usize)));
    }
}

fn render_sc_nft(f: &mut Frame, app: &mut App, area: Rect) {
    let state = match &app.sc_nft {
        Some(s) => s,
        None => {
            render_empty(f, "Loading nft state…", area);
            return;
        }
    };
    let s_ = match state {
        sc::ConfigState::Loaded(s) => s,
        sc::ConfigState::NotPresent(reason) => {
            render_empty(f, &format!(" {} ", reason), area);
            return;
        }
        sc::ConfigState::Error(e) => {
            render_empty(f, &format!(" Error: {} ", e), area);
            return;
        }
    };

    let block = table_block(" nft Egress Jail (read-only) ");
    let header = Row::new([
        Cell::from(" Effect"),
        Cell::from("Rule"),
    ])
    .style(sb(c::OVERLAY0).bg(c::SURFACE0))
    .height(1);
    let rows: Vec<Row> = s_
        .rules
        .iter()
        .map(|r| {
            let summary_style = if r.summary.starts_with("DROP") {
                sb(c::RED)
            } else if r.summary.starts_with("ALLOW") {
                sb(c::GREEN)
            } else {
                s(c::SUBTEXT0)
            };
            Row::new([
                Cell::from(format!(" {}", r.summary)).style(summary_style),
                Cell::from(r.rule.clone()).style(s(c::OVERLAY0)),
            ])
        })
        .collect();
    let widths = [Constraint::Percentage(38), Constraint::Percentage(62)];
    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));
    f.render_stateful_widget(table, area, &mut app.table_state);

    // Caption strip on the title row showing skuid range + policy.
    let caption = format!(
        " skuid: {}    policy: {}    ({} rules) ",
        s_.skuid_range.as_deref().unwrap_or("?"),
        s_.policy.as_deref().unwrap_or("?"),
        s_.rules.len()
    );
    let caption_rect = Rect { x: area.x + 2, y: area.y, width: caption.len() as u16, height: 1 };
    let p = Paragraph::new(Span::styled(caption, sb(c::TEAL).bg(c::BASE)));
    f.render_widget(p, caption_rect);

    register_row_clicks(f, app, block, area, s_.rules.len());
}

fn render_sc_caddy(f: &mut Frame, app: &mut App, area: Rect) {
    let state = match &app.sc_caddy {
        Some(s) => s,
        None => {
            render_empty(f, "Loading Caddy state…", area);
            return;
        }
    };
    let s_ = match state {
        sc::ConfigState::Loaded(s) => s,
        sc::ConfigState::NotPresent(reason) => {
            render_empty(f, &format!(" {} ", reason), area);
            return;
        }
        sc::ConfigState::Error(e) => {
            render_empty(f, &format!(" Error: {} ", e), area);
            return;
        }
    };

    let block = table_block(" Caddy Routing (read-only) ");
    let header = Row::new([
        Cell::from(" Pattern"),
        Cell::from("Routes to"),
    ])
    .style(sb(c::OVERLAY0).bg(c::SURFACE0))
    .height(1);
    let rows: Vec<Row> = s_
        .matchers
        .iter()
        .map(|m| {
            Row::new([
                Cell::from(format!(" {}", m.pattern)).style(sb(c::TEXT)),
                Cell::from(m.target.clone()).style(s(c::SUBTEXT0)),
            ])
        })
        .collect();
    let widths = [Constraint::Percentage(50), Constraint::Percentage(50)];
    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));
    f.render_stateful_widget(table, area, &mut app.table_state);

    let caption = format!(" {} — {} site blocks ", s_.path, s_.matchers.len());
    let caption_rect = Rect { x: area.x + 2, y: area.y, width: caption.len() as u16, height: 1 };
    let p = Paragraph::new(Span::styled(caption, sb(c::TEAL).bg(c::BASE)));
    f.render_widget(p, caption_rect);

    register_row_clicks(f, app, block, area, s_.matchers.len());
}

fn render_subview_tabs(f: &mut Frame, app: &mut App, area: Rect) {
    let mut spans = vec![Span::raw(" ")];
    let mut x = area.x + 1;
    let y = area.y;
    for (i, (sv, label)) in sc::SUBVIEWS.iter().enumerate() {
        let is_sel = app.sc_subview == *sv;
        let tab_text = format!(" {}. {} ", i + 1, label);
        let tab_w = tab_text.len() as u16;
        let style = if is_sel {
            Style::default().fg(c::MANTLE).bg(c::BLUE).add_modifier(Modifier::BOLD)
        } else {
            Style::default().fg(c::SUBTEXT0).bg(c::SURFACE0)
        };
        spans.push(Span::styled(tab_text.clone(), style));
        spans.push(Span::raw(" "));

        let rect = Rect { x, y, width: tab_w, height: 1 };
        // We don't currently have a click target for subview tabs in app::ClickTarget,
        // so click-to-switch is handled via 1-4 hotkeys. Keep this simple.
        let _ = rect;

        x += tab_w + 1;
    }
    // Pending-changes indicator
    let pending = match app.sc_subview {
        sc::SubView::Squid => app.sc_squid_dirty.is_some(),
        sc::SubView::Cloudflared => app.sc_cloudflared_dirty.is_some(),
        sc::SubView::EnvFile => app.sc_env_dirty.is_some(),
        sc::SubView::Systemd
        | sc::SubView::Nft
        | sc::SubView::Caddy
        | sc::SubView::DbCredentials => false,
    };
    if pending {
        spans.push(Span::styled(
            " \u{25cf} pending changes ",
            sb(c::YELLOW).bg(c::BASE),
        ));
    }
    let p = Paragraph::new(Line::from(spans)).style(Style::default().bg(c::BASE));
    f.render_widget(p, area);
}

fn render_sc_squid(f: &mut Frame, app: &mut App, area: Rect) {
    match &app.sc_squid {
        None | Some(sc::ConfigState::NotPresent(_)) => {
            let msg = if let Some(sc::ConfigState::NotPresent(m)) = &app.sc_squid {
                m.clone()
            } else {
                "Loading…".to_string()
            };
            render_empty(f, &msg, area);
            return;
        }
        Some(sc::ConfigState::Error(e)) => {
            render_empty(f, &format!("Error: {e}"), area);
            return;
        }
        _ => {}
    }
    let list = app.squid_view_list();
    if list.is_empty() {
        render_empty(f, "No allowed domains. Press 'a' to add one.", area);
        return;
    }

    let block = table_block(" Squid Allowed Domains (egress) ");
    let header = Row::new([Cell::from(" #"), Cell::from("Hostname")])
        .style(sb(c::OVERLAY0).bg(c::SURFACE0))
        .height(1);

    let rows: Vec<Row> = list
        .iter()
        .enumerate()
        .map(|(i, h)| {
            Row::new([
                Cell::from(format!(" {}", i + 1)).style(s(c::OVERLAY0)),
                Cell::from(h.clone()).style(s(c::TEXT)),
            ])
        })
        .collect();

    let widths = [Constraint::Length(6), Constraint::Min(20)];
    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, block, area, list.len());
}

fn render_sc_cloudflared(f: &mut Frame, app: &mut App, area: Rect) {
    match &app.sc_cloudflared {
        None | Some(sc::ConfigState::NotPresent(_)) => {
            let msg = if let Some(sc::ConfigState::NotPresent(m)) = &app.sc_cloudflared {
                m.clone()
            } else {
                "Loading…".to_string()
            };
            render_empty(f, &msg, area);
            return;
        }
        Some(sc::ConfigState::Error(e)) => {
            render_empty(f, &format!("Error: {e}"), area);
            return;
        }
        _ => {}
    }
    let list = app.cloudflared_view_list();
    if list.is_empty() {
        render_empty(f, "No ingress entries. Press 'a' to add one.", area);
        return;
    }

    let block = table_block(" cloudflared Ingress ");
    let header = Row::new([Cell::from(" Hostname"), Cell::from("Service")])
        .style(sb(c::OVERLAY0).bg(c::SURFACE0))
        .height(1);

    let rows: Vec<Row> = list
        .iter()
        .map(|e| {
            let host_display = if e.hostname.is_empty() {
                "(catch-all)".to_string()
            } else {
                e.hostname.clone()
            };
            let host_style = if e.hostname.is_empty() {
                sb(c::OVERLAY0)
            } else {
                s(c::TEXT)
            };
            Row::new([
                Cell::from(format!(" {}", host_display)).style(host_style),
                Cell::from(e.service.clone()).style(s(c::SUBTEXT0)),
            ])
        })
        .collect();

    let widths = [Constraint::Percentage(45), Constraint::Percentage(55)];
    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, block, area, list.len());
}

fn render_sc_env(f: &mut Frame, app: &mut App, area: Rect) {
    match &app.sc_env {
        None | Some(sc::ConfigState::NotPresent(_)) => {
            let msg = if let Some(sc::ConfigState::NotPresent(m)) = &app.sc_env {
                m.clone()
            } else {
                "Loading…".to_string()
            };
            render_empty(f, &msg, area);
            return;
        }
        Some(sc::ConfigState::Error(e)) => {
            render_empty(f, &format!("Error: {e}"), area);
            return;
        }
        _ => {}
    }
    let list = app.env_view_list();
    if list.is_empty() {
        render_empty(f, "No env values to display.", area);
        return;
    }
    let dirty_keys: std::collections::HashSet<String> = app
        .sc_env_dirty
        .as_ref()
        .map(|d| d.iter().map(|(k, _)| k.clone()).collect())
        .unwrap_or_default();

    let block = table_block(" API .env Knobs ");
    let header = Row::new([Cell::from(" Key"), Cell::from("Value"), Cell::from(" ")])
        .style(sb(c::OVERLAY0).bg(c::SURFACE0))
        .height(1);

    let rows: Vec<Row> = list
        .iter()
        .map(|e| {
            let val = sc::display_env_value(e);
            let val_style = if e.value.is_empty() {
                s(c::OVERLAY0)
            } else if e.masked {
                s(c::YELLOW)
            } else {
                s(c::TEXT)
            };
            let pending = if dirty_keys.contains(&e.key) {
                Cell::from("\u{25cf}").style(sb(c::YELLOW))
            } else {
                Cell::from(" ").style(s(c::OVERLAY0))
            };
            Row::new([
                Cell::from(format!(" {}", e.key)).style(s(c::TEXT)),
                Cell::from(val).style(val_style),
                pending,
            ])
        })
        .collect();

    let widths = [
        Constraint::Percentage(35),
        Constraint::Percentage(60),
        Constraint::Length(3),
    ];
    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, block, area, list.len());
}

fn render_sc_systemd(f: &mut Frame, app: &mut App, area: Rect) {
    let units: Vec<(String, Vec<(String, String)>)> = match &app.sc_systemd {
        None => {
            render_empty(f, "Loading…", area);
            return;
        }
        Some(sc::ConfigState::NotPresent(m)) => {
            render_empty(f, m, area);
            return;
        }
        Some(sc::ConfigState::Error(e)) => {
            render_empty(f, &format!("Error: {e}"), area);
            return;
        }
        Some(sc::ConfigState::Loaded(s)) => s
            .units
            .iter()
            .map(|u| (u.name.clone(), u.directives.clone()))
            .collect(),
    };

    let block = table_block(" systemd Hardening (read-only) ");
    let header = Row::new([Cell::from(" Unit / Directive"), Cell::from("Value")])
        .style(sb(c::OVERLAY0).bg(c::SURFACE0))
        .height(1);

    let mut rows: Vec<Row> = Vec::new();
    for (name, directives) in &units {
        rows.push(Row::new([
            Cell::from(format!(" \u{25c6} {}", name)).style(sb(c::LAVENDER)),
            Cell::from("").style(s(c::OVERLAY0)),
        ]));
        if directives.is_empty() {
            rows.push(Row::new([
                Cell::from("    (no hardening directives set)").style(s(c::RED)),
                Cell::from("").style(s(c::OVERLAY0)),
            ]));
        } else {
            for (k, v) in directives {
                let v_style = match (k.as_str(), v.as_str()) {
                    ("NoNewPrivileges", "true" | "yes") => sb(c::GREEN),
                    ("NoNewPrivileges", _) => s(c::RED),
                    ("PrivateTmp", "true" | "yes") => sb(c::GREEN),
                    ("ProtectSystem", "strict" | "full") => sb(c::GREEN),
                    ("ProtectHome", "true" | "yes") => sb(c::GREEN),
                    _ => s(c::SUBTEXT0),
                };
                rows.push(Row::new([
                    Cell::from(format!("    {}", k)).style(s(c::TEXT)),
                    Cell::from(v.clone()).style(v_style),
                ]));
            }
        }
    }

    let widths = [Constraint::Percentage(45), Constraint::Percentage(55)];
    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    let total: usize = units.iter().map(|(_, d)| d.len() + 1).sum();
    register_row_clicks(f, app, block, area, total);
}

// ── Server config edit modals ───────────────────────────

fn render_modal_edit_allowlist(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    idx: Option<usize>,
    text: &str,
    cursor: usize,
    error: Option<&str>,
) {
    let w = 56u16;
    let h = if error.is_some() { 9u16 } else { 8u16 };
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let title = if idx.is_some() {
        " Edit Allowed Hostname "
    } else {
        " Add Allowed Hostname "
    };
    let block = modal_block(title);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let label = Paragraph::new(Span::styled(" Hostname:", s(c::OVERLAY0)))
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(label, Rect { y: inner.y + 1, height: 1, ..inner });

    let input_x = inner.x + 12;
    let input_w = inner.width.saturating_sub(13);
    let before = &text[..cursor.min(text.len())];
    let after = &text[cursor.min(text.len())..];
    let input_line = Line::from(vec![
        Span::styled(before, s(c::TEXT)),
        Span::styled("\u{2502}", sb(c::BLUE)),
        Span::styled(after, s(c::TEXT)),
    ]);
    let input = Paragraph::new(input_line).style(Style::default().bg(c::SURFACE0));
    f.render_widget(
        input,
        Rect { x: input_x, y: inner.y + 1, width: input_w, height: 1 },
    );

    if let Some(err) = error {
        let e = Paragraph::new(Span::styled(format!(" {err}"), s(c::RED)))
            .style(Style::default().bg(c::MANTLE));
        f.render_widget(e, Rect { y: inner.y + 3, height: 1, ..inner });
    }

    let hint = Paragraph::new(Span::styled(
        " Enter: stage    Esc: cancel    (apply with A in screen)",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(
        hint,
        Rect { y: inner.y + inner.height - 1, height: 1, ..inner },
    );
    let _ = app; // currently no clicks
}

fn render_modal_confirm_allowlist_remove(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    idx: usize,
    btn: usize,
) {
    let host = app.squid_view_list().get(idx).cloned().unwrap_or_default();
    let w = 50u16;
    let h = 8u16;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(" Remove Hostname ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let msg = Paragraph::new(vec![
        Line::from(""),
        Line::from(Span::styled("Remove from allowlist:", s(c::TEXT))),
        Line::from(Span::styled(host, sb(c::RED))),
        Line::from(""),
    ])
    .alignment(Alignment::Center)
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(msg, Rect { height: inner.height - 1, ..inner });
    let btn_y = inner.y + inner.height - 1;
    render_confirm_buttons(f, app, inner, btn_y, btn, "Cancel", "Remove");
}

fn render_modal_edit_ingress(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    idx: Option<usize>,
    host: &str,
    service: &str,
    field: usize,
    cursor: usize,
    error: Option<&str>,
) {
    let w = 64u16;
    let h = if error.is_some() { 11u16 } else { 10u16 };
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let title = if idx.is_some() {
        " Edit Ingress Entry "
    } else {
        " Add Ingress Entry "
    };
    let block = modal_block(title);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let hint_top = Paragraph::new(Span::styled(
        " Tab: switch field    Empty hostname = catch-all",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(hint_top, Rect { y: inner.y, height: 1, ..inner });

    // Host row
    let host_label_style = if field == 0 { sb(c::BLUE) } else { s(c::OVERLAY0) };
    let host_label = Paragraph::new(Span::styled(" Hostname:", host_label_style))
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(host_label, Rect { y: inner.y + 2, height: 1, ..inner });

    let host_x = inner.x + 12;
    let host_w = inner.width.saturating_sub(13);
    let host_line = if field == 0 {
        let before = &host[..cursor.min(host.len())];
        let after = &host[cursor.min(host.len())..];
        Line::from(vec![
            Span::styled(before, s(c::TEXT)),
            Span::styled("\u{2502}", sb(c::BLUE)),
            Span::styled(after, s(c::TEXT)),
        ])
    } else {
        Line::from(Span::styled(host, s(c::TEXT)))
    };
    let host_input = Paragraph::new(host_line).style(Style::default().bg(c::SURFACE0));
    f.render_widget(
        host_input,
        Rect { x: host_x, y: inner.y + 2, width: host_w, height: 1 },
    );

    // Service row
    let svc_label_style = if field == 1 { sb(c::BLUE) } else { s(c::OVERLAY0) };
    let svc_label = Paragraph::new(Span::styled(" Service: ", svc_label_style))
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(svc_label, Rect { y: inner.y + 4, height: 1, ..inner });

    let svc_line = if field == 1 {
        let before = &service[..cursor.min(service.len())];
        let after = &service[cursor.min(service.len())..];
        Line::from(vec![
            Span::styled(before, s(c::TEXT)),
            Span::styled("\u{2502}", sb(c::BLUE)),
            Span::styled(after, s(c::TEXT)),
        ])
    } else {
        Line::from(Span::styled(service, s(c::TEXT)))
    };
    let svc_input = Paragraph::new(svc_line).style(Style::default().bg(c::SURFACE0));
    f.render_widget(
        svc_input,
        Rect { x: host_x, y: inner.y + 4, width: host_w, height: 1 },
    );

    if let Some(err) = error {
        let e = Paragraph::new(Span::styled(format!(" {err}"), s(c::RED)))
            .style(Style::default().bg(c::MANTLE));
        f.render_widget(e, Rect { y: inner.y + 6, height: 1, ..inner });
    }

    let hint = Paragraph::new(Span::styled(
        " Enter: stage    Esc: cancel    (apply with A in screen)",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(
        hint,
        Rect { y: inner.y + inner.height - 1, height: 1, ..inner },
    );
    let _ = app;
}

fn render_modal_confirm_ingress_remove(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    idx: usize,
    btn: usize,
) {
    let host = app
        .cloudflared_view_list()
        .get(idx)
        .map(|e| if e.hostname.is_empty() { "(catch-all)".to_string() } else { e.hostname.clone() })
        .unwrap_or_default();
    let w = 56u16;
    let h = 8u16;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(" Remove Ingress Entry ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let msg = Paragraph::new(vec![
        Line::from(""),
        Line::from(Span::styled("Remove ingress entry:", s(c::TEXT))),
        Line::from(Span::styled(host, sb(c::RED))),
        Line::from(""),
    ])
    .alignment(Alignment::Center)
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(msg, Rect { height: inner.height - 1, ..inner });
    let btn_y = inner.y + inner.height - 1;
    render_confirm_buttons(f, app, inner, btn_y, btn, "Cancel", "Remove");
}

fn render_modal_edit_env(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    key: &str,
    text: &str,
    cursor: usize,
    error: Option<&str>,
) {
    let w = 70u16;
    let h = if error.is_some() { 10u16 } else { 9u16 };
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(" Edit .env Value ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let key_line = Paragraph::new(Line::from(vec![
        Span::styled(" Key: ", s(c::OVERLAY0)),
        Span::styled(key, sb(c::TEAL)),
    ]))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(key_line, Rect { y: inner.y + 1, height: 1, ..inner });

    let label = Paragraph::new(Span::styled(" Value:", s(c::OVERLAY0)))
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(label, Rect { y: inner.y + 3, height: 1, ..inner });

    let input_x = inner.x + 9;
    let input_w = inner.width.saturating_sub(10);
    let before = &text[..cursor.min(text.len())];
    let after = &text[cursor.min(text.len())..];
    let input_line = Line::from(vec![
        Span::styled(before, s(c::TEXT)),
        Span::styled("\u{2502}", sb(c::BLUE)),
        Span::styled(after, s(c::TEXT)),
    ]);
    let input = Paragraph::new(input_line).style(Style::default().bg(c::SURFACE0));
    f.render_widget(
        input,
        Rect { x: input_x, y: inner.y + 3, width: input_w, height: 1 },
    );

    if let Some(err) = error {
        let e = Paragraph::new(Span::styled(format!(" {err}"), s(c::RED)))
            .style(Style::default().bg(c::MANTLE));
        f.render_widget(e, Rect { y: inner.y + 5, height: 1, ..inner });
    }

    let hint = Paragraph::new(Span::styled(
        " Enter: stage change    Esc: cancel    (apply with A — restarts API)",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(
        hint,
        Rect { y: inner.y + inner.height - 1, height: 1, ..inner },
    );
    let _ = app;
}

// ── Pick default AI provider ────────────────────────────

fn render_modal_pick_provider(f: &mut Frame, app: &mut App, screen: Rect, sel_idx: usize) {
    let providers = match app.ai_settings.as_ref() {
        Some(s) => s.providers.clone(),
        None => Vec::new(),
    };
    let item_count = providers.len().min(10) as u16;
    let w = 56u16;
    let h = item_count.max(1) + 4;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);

    let block = modal_block(" Default AI Provider ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let hint = Paragraph::new(Span::styled(
        " Choose default provider (sets source=custom):",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(hint, Rect { height: 1, ..inner });

    if providers.is_empty() {
        let empty = Paragraph::new(Span::styled(
            " No custom providers configured.",
            s(c::RED),
        ))
        .style(Style::default().bg(c::MANTLE));
        f.render_widget(empty, Rect { y: inner.y + 1, height: 1, ..inner });
        return;
    }

    for (i, p) in providers.iter().enumerate().take(10) {
        let y = inner.y + 1 + i as u16;
        let is_sel = i == sel_idx;
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
        let preset = p.preset_id.as_deref().unwrap_or("custom");
        let label = format!(
            "{prefix}{} \u{2014} {} ({})",
            p.label, p.provider_type, preset
        );
        f.render_widget(Paragraph::new(label).style(style), r);
        app.click_targets.push((r, ClickTarget::ModalListItem(i)));
    }
}

// ── Edit default model ──────────────────────────────────

fn render_modal_edit_default_model(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    text: &str,
    cursor: usize,
    error: Option<&str>,
) {
    let w = 60u16;
    let h = if error.is_some() { 9u16 } else { 8u16 };
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(" Default Model ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let label = Paragraph::new(Span::styled(
        " Model identifier (e.g. gpt-4o-mini, claude-3-5-sonnet):",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(label, Rect { y: inner.y + 1, height: 1, ..inner });

    let input_x = inner.x + 2;
    let input_w = inner.width.saturating_sub(3);
    let before = &text[..cursor.min(text.len())];
    let after = &text[cursor.min(text.len())..];
    let input_line = Line::from(vec![
        Span::styled(before, s(c::TEXT)),
        Span::styled("\u{2502}", sb(c::BLUE)),
        Span::styled(after, s(c::TEXT)),
    ]);
    let input = Paragraph::new(input_line).style(Style::default().bg(c::SURFACE0));
    f.render_widget(
        input,
        Rect { x: input_x, y: inner.y + 3, width: input_w, height: 1 },
    );

    if let Some(err) = error {
        let e = Paragraph::new(Span::styled(format!(" {err}"), s(c::RED)))
            .style(Style::default().bg(c::MANTLE));
        f.render_widget(e, Rect { y: inner.y + 5, height: 1, ..inner });
    }

    let hint = Paragraph::new(Span::styled(
        " Enter: save    Esc: cancel",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(
        hint,
        Rect { y: inner.y + inner.height - 1, height: 1, ..inner },
    );
    let _ = app;
}

// ─── Credits & Plan screen ────────────────────────────────

fn render_credits(f: &mut Frame, app: &mut App, area: Rect) {
    if app.credit_balances.is_empty() {
        render_empty(f, "No credit balances. Users get a row on first AI use.", area);
        return;
    }

    let block = table_block(" Credit Balances ");

    let header = Row::new([
        Cell::from(" Email"),
        Cell::from("Workspace"),
        Cell::from("Plan"),
        Cell::from("Daily"),
        Cell::from("Monthly"),
        Cell::from("Rollover"),
    ])
    .style(sb(c::OVERLAY0).bg(c::SURFACE0))
    .height(1);

    let rows: Vec<Row> = app
        .credit_balances
        .iter()
        .map(|b| {
            let plan_style = plan_color(&b.plan_type);
            let daily = format!("{} / {}", b.daily_credits_used, b.daily_credits);
            let monthly = format!("{} / {}", b.monthly_credits_used, b.monthly_credits);
            let rollover = format!("{}", b.rollover_credits);
            Row::new([
                Cell::from(format!(" {}", b.user_email)).style(s(c::TEXT)),
                Cell::from(b.workspace_name.clone()).style(s(c::SUBTEXT0)),
                Cell::from(b.plan_type.clone()).style(plan_style),
                Cell::from(daily).style(s(c::TEXT)),
                Cell::from(monthly).style(s(c::TEXT)),
                Cell::from(rollover).style(s(c::TEAL)),
            ])
        })
        .collect();

    let widths = [
        Constraint::Percentage(28),
        Constraint::Percentage(22),
        Constraint::Length(12),
        Constraint::Length(14),
        Constraint::Length(14),
        Constraint::Length(10),
    ];

    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, block, area, app.credit_balances.len());
}

fn plan_color(plan: &str) -> Style {
    match plan {
        "free" => s(c::OVERLAY0),
        "pro" => sb(c::TEAL),
        "enterprise" => sb(c::GREEN),
        _ => s(c::TEXT),
    }
}

fn render_modal_edit_credits(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    balance_idx: usize,
    field: u8,
    text: &str,
    cursor: usize,
    error: Option<&str>,
) {
    let bal = match app.credit_balances.get(balance_idx) {
        Some(b) => b,
        None => return,
    };
    let field_label = match field {
        0 => "Daily credits",
        1 => "Monthly credits",
        _ => "Rollover credits",
    };
    let email = bal.user_email.clone();
    let ws = bal.workspace_name.clone();

    let w = 60u16;
    let h = if error.is_some() { 11u16 } else { 10u16 };
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(" Edit Credits ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let ctx = Paragraph::new(Line::from(vec![
        Span::styled(" ", s(c::OVERLAY0)),
        Span::styled(email, sb(c::BLUE)),
        Span::styled(" @ ", s(c::OVERLAY0)),
        Span::styled(ws, sb(c::TEAL)),
    ]))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(ctx, Rect { y: inner.y + 1, height: 1, ..inner });

    let label = Paragraph::new(Span::styled(format!(" {field_label}:"), s(c::OVERLAY0)))
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(label, Rect { y: inner.y + 3, height: 1, ..inner });

    let input_x = inner.x + 2;
    let input_w = inner.width.saturating_sub(3);
    let before = &text[..cursor.min(text.len())];
    let after = &text[cursor.min(text.len())..];
    let input_line = Line::from(vec![
        Span::styled(before, s(c::TEXT)),
        Span::styled("\u{2502}", sb(c::BLUE)),
        Span::styled(after, s(c::TEXT)),
    ]);
    let input = Paragraph::new(input_line).style(Style::default().bg(c::SURFACE0));
    f.render_widget(
        input,
        Rect { x: input_x, y: inner.y + 5, width: input_w, height: 1 },
    );

    if let Some(err) = error {
        let e = Paragraph::new(Span::styled(format!(" {err}"), s(c::RED)))
            .style(Style::default().bg(c::MANTLE));
        f.render_widget(e, Rect { y: inner.y + 7, height: 1, ..inner });
    }

    let hint = Paragraph::new(Span::styled(
        " Enter: save    Esc: cancel    (digits only)",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(
        hint,
        Rect { y: inner.y + inner.height - 1, height: 1, ..inner },
    );
}

fn render_modal_pick_plan_type(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    balance_idx: usize,
    sel_idx: usize,
) {
    let (email, ws, current_plan) = match app.credit_balances.get(balance_idx) {
        Some(b) => (
            b.user_email.clone(),
            b.workspace_name.clone(),
            b.plan_type.clone(),
        ),
        None => return,
    };

    let w = 56u16;
    let h = (crate::admin::db::PLAN_TYPES.len() as u16) + 6;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(" Plan Type ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let ctx = Paragraph::new(vec![
        Line::from(""),
        Line::from(vec![
            Span::styled(email, sb(c::BLUE)),
            Span::styled(" @ ", s(c::OVERLAY0)),
            Span::styled(ws, sb(c::TEAL)),
        ]),
        Line::from(""),
    ])
    .alignment(Alignment::Center)
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(ctx, Rect { height: 3, ..inner });

    for (i, plan) in crate::admin::db::PLAN_TYPES.iter().enumerate() {
        let y = inner.y + 3 + i as u16;
        let is_sel = i == sel_idx;
        let is_current = *plan == current_plan;
        let prefix = if is_sel { " \u{25b8} " } else { "   " };
        let suffix = if is_current { " (current)" } else { "" };
        let style = if is_sel {
            plan_color(plan).bg(c::SURFACE0).add_modifier(Modifier::BOLD)
        } else {
            plan_color(plan).bg(c::MANTLE)
        };
        let r = Rect {
            x: inner.x + 4,
            y,
            width: inner.width.saturating_sub(4),
            height: 1,
        };
        let p = Paragraph::new(format!("{prefix}{plan}{suffix}")).style(style);
        f.render_widget(p, r);
        app.click_targets.push((r, ClickTarget::ModalListItem(i)));
    }
}

fn render_modal_confirm_credits_apply(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    balance_idx: usize,
    btn: usize,
) {
    let email = app
        .credit_balances
        .get(balance_idx)
        .map(|b| b.user_email.clone())
        .unwrap_or_default();
    let w = 56u16;
    let h = 8u16;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(" Apply Credit Changes ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let msg = Paragraph::new(vec![
        Line::from(""),
        Line::from(Span::styled("Save credit changes for", s(c::TEXT))),
        Line::from(Span::styled(email, sb(c::BLUE))),
        Line::from(""),
    ])
    .alignment(Alignment::Center)
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(msg, Rect { height: inner.height - 1, ..inner });
    let btn_y = inner.y + inner.height - 1;
    render_confirm_buttons(f, app, inner, btn_y, btn, "Cancel", "Apply");
}

fn render_modal_confirm_simple(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    title: &str,
    body: &str,
    cancel_label: &str,
    confirm_label: &str,
    btn: usize,
) {
    let w = 56u16;
    let h = 8u16;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(title);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let msg = Paragraph::new(vec![
        Line::from(""),
        Line::from(Span::styled(body, s(c::TEXT))),
        Line::from(""),
    ])
    .alignment(Alignment::Center)
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(msg, Rect { height: inner.height - 1, ..inner });
    let btn_y = inner.y + inner.height - 1;
    render_confirm_buttons(f, app, inner, btn_y, btn, cancel_label, confirm_label);
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

// ─── API Keys screen ──────────────────────────────────────

fn render_api_keys(f: &mut Frame, app: &mut App, area: Rect) {
    if app.api_keys.is_empty() {
        render_empty(f, "No API keys. Create one from the project Settings page.", area);
        return;
    }

    let block = table_block(" Project API Keys ");

    let header = Row::new([
        Cell::from(" Project"),
        Cell::from("Label"),
        Cell::from("Prefix"),
        Cell::from("Tier"),
        Cell::from("Origins"),
        Cell::from("Tools"),
    ])
    .style(sb(c::OVERLAY0).bg(c::SURFACE0))
    .height(1);

    let rows: Vec<Row> = app
        .api_keys
        .iter()
        .map(|k| {
            let origins = if k.allowed_origins.is_empty() {
                "any".to_string()
            } else {
                format!("{}", k.allowed_origins.len())
            };
            let tools = if k.allowed_tools.is_empty() {
                "all".to_string()
            } else {
                format!("{}", k.allowed_tools.len())
            };
            let label = k.label.clone().unwrap_or_else(|| "-".to_string());
            let tier_style = match k.tier.as_str() {
                "owner" => sb(c::GREEN),
                "client" => s(c::TEAL),
                _ => s(c::SUBTEXT0),
            };
            Row::new([
                Cell::from(format!(" {}", k.project_name)).style(s(c::TEXT)),
                Cell::from(label).style(s(c::SUBTEXT0)),
                Cell::from(k.prefix.clone()).style(s(c::LAVENDER)),
                Cell::from(k.tier.clone()).style(tier_style),
                Cell::from(origins).style(s(c::TEXT)),
                Cell::from(tools).style(s(c::TEXT)),
            ])
        })
        .collect();

    let widths = [
        Constraint::Percentage(28),
        Constraint::Percentage(22),
        Constraint::Length(14),
        Constraint::Length(10),
        Constraint::Length(10),
        Constraint::Length(8),
    ];

    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, block, area, app.api_keys.len());
}

// ─── Mode Tools screen ────────────────────────────────────

fn render_mode_tools(f: &mut Frame, app: &mut App, area: Rect) {
    if app.mode_tools.is_empty() {
        render_empty(f, "No mode_tools rows. Migration 067 may not be applied.", area);
        return;
    }

    let block = table_block(" Mode Tools ");

    let header = Row::new([
        Cell::from(" Mode"),
        Cell::from("Count"),
        Cell::from("First few tools"),
    ])
    .style(sb(c::OVERLAY0).bg(c::SURFACE0))
    .height(1);

    let rows: Vec<Row> = app
        .mode_tools
        .iter()
        .map(|m| {
            let preview = if m.allowed_tools.is_empty() {
                "(none — all blocked)".to_string()
            } else {
                let take: Vec<String> =
                    m.allowed_tools.iter().take(4).cloned().collect();
                let mut s_ = take.join(", ");
                if m.allowed_tools.len() > 4 {
                    s_.push_str(", \u{2026}");
                }
                s_
            };
            Row::new([
                Cell::from(format!(" {}", m.mode)).style(sb(c::BLUE)),
                Cell::from(format!("{}", m.allowed_tools.len())).style(s(c::TEAL)),
                Cell::from(preview).style(s(c::SUBTEXT0)),
            ])
        })
        .collect();

    let widths = [
        Constraint::Length(16),
        Constraint::Length(8),
        Constraint::Min(20),
    ];

    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, block, area, app.mode_tools.len());
}

fn render_sandbox(f: &mut Frame, app: &mut App, area: Rect) {
    // Compose header info from settings
    let backend = app
        .sandbox_settings
        .as_ref()
        .and_then(|s| s.sandbox_backend.clone())
        .unwrap_or_else(|| "auto".to_string());
    let profiles = app
        .sandbox_settings
        .as_ref()
        .map(|s| s.allowed_profile_keys.join(", "))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "ai-bash, vite-preview, install, build".to_string());
    let title = format!(
        " Sandbox — backend={}, profiles={}, rules={}, audit={} ",
        backend,
        profiles,
        app.sandbox_rules.len(),
        app.sandbox_audit.len()
    );

    if app.sandbox_rules.is_empty() && app.sandbox_audit.is_empty() {
        render_empty(
            f,
            "No sandbox rules yet. Press 'a' to add a rule, 's' to configure settings.",
            area,
        );
        return;
    }

    let block = table_block(&title);

    let header = Row::new([
        Cell::from(" Type"),
        Cell::from("Pattern"),
        Cell::from("Action"),
        Cell::from("Prio"),
        Cell::from("Enabled"),
        Cell::from("Reason"),
    ])
    .style(sb(c::OVERLAY0).bg(c::SURFACE0))
    .height(1);

    let rows: Vec<Row> = app
        .sandbox_rules
        .iter()
        .map(|r| {
            let action_style = if r.action == "deny" {
                s(c::RED)
            } else {
                s(c::GREEN)
            };
            let enabled = if r.enabled { "yes" } else { "no" };
            Row::new([
                Cell::from(format!(" {}", r.rule_type)).style(sb(c::BLUE)),
                Cell::from(r.pattern.clone()).style(s(c::TEXT)),
                Cell::from(r.action.clone()).style(action_style),
                Cell::from(format!("{}", r.priority)).style(s(c::SUBTEXT0)),
                Cell::from(enabled).style(s(c::SUBTEXT0)),
                Cell::from(r.reason.clone().unwrap_or_default()).style(s(c::SUBTEXT0)),
            ])
        })
        .collect();

    let widths = [
        Constraint::Length(10),
        Constraint::Min(20),
        Constraint::Length(8),
        Constraint::Length(6),
        Constraint::Length(8),
        Constraint::Min(20),
    ];

    let table = Table::new(rows, widths)
        .block(block.clone())
        .header(header)
        .row_highlight_style(highlight_style())
        .style(s(c::TEXT));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, block, area, app.sandbox_rules.len());
}

// ─── Sandbox modals ───────────────────────────────────────

#[allow(clippy::too_many_arguments)]
fn render_modal_edit_sandbox_rule(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    idx: Option<usize>,
    rule_type_idx: usize,
    pattern: &str,
    action_idx: usize,
    priority: &str,
    reason: &str,
    field: usize,
    cursor: usize,
    error: Option<&str>,
) {
    let title = if idx.is_some() { " Edit Sandbox Rule " } else { " Add Sandbox Rule " };
    let w = 72u16;
    let h = if error.is_some() { 20u16 } else { 19u16 };
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(title);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let fields = [
        ("Type", 0usize),
        ("Pattern", 1),
        ("Action", 2),
        ("Priority", 3),
        ("Reason", 4),
    ];

    let mut y = inner.y + 1;

    for &(label, fi) in &fields {
        let is_active = fi == field;
        let label_style = if is_active { sb(c::BLUE) } else { s(c::OVERLAY0) };

        // Label
        let lbl = Paragraph::new(Span::styled(format!(" {label}:"), label_style))
            .style(Style::default().bg(c::MANTLE));
        f.render_widget(lbl, Rect { x: inner.x, y, width: inner.width, height: 1 });
        y += 1;

        let input_x = inner.x + 2;
        let input_w = inner.width.saturating_sub(3);

        match fi {
            0 => {
                // Rule type selector: ◀ tool ▶
                let rt = SANDBOX_RULE_TYPES[rule_type_idx];
                let sel_text = format!("  ◀ {rt} ▶  ");
                let sel_style = if is_active {
                    Style::default().fg(c::BASE).bg(c::BLUE)
                } else {
                    Style::default().fg(c::TEXT).bg(c::SURFACE0)
                };
                let sel = Paragraph::new(Span::styled(sel_text, sel_style));
                f.render_widget(sel, Rect { x: input_x, y, width: input_w, height: 1 });
            }
            2 => {
                // Action selector: ◀ allow ▶
                let act = SANDBOX_ACTIONS[action_idx];
                let sel_text = format!("  ◀ {act} ▶  ");
                let (fg, bg) = if act == "deny" { (c::BASE, c::RED) } else { (c::BASE, c::GREEN) };
                let sel_style = if is_active {
                    Style::default().fg(fg).bg(bg)
                } else {
                    Style::default().fg(c::TEXT).bg(c::SURFACE0)
                };
                let sel = Paragraph::new(Span::styled(sel_text, sel_style));
                f.render_widget(sel, Rect { x: input_x, y, width: input_w, height: 1 });
            }
            1 | 3 | 4 => {
                // Text input
                let text = match fi {
                    1 => pattern,
                    3 => priority,
                    _ => reason,
                };
                if is_active {
                    let cur = cursor.min(text.len());
                    let before = &text[..cur];
                    let after = &text[cur..];
                    let line = Line::from(vec![
                        Span::styled(before, s(c::TEXT)),
                        Span::styled("\u{2502}", sb(c::BLUE)),
                        Span::styled(after, s(c::TEXT)),
                    ]);
                    let inp = Paragraph::new(line).style(Style::default().bg(c::SURFACE0));
                    f.render_widget(inp, Rect { x: input_x, y, width: input_w, height: 1 });
                } else {
                    let placeholder = match fi {
                        1 => "e.g. install:@evil/* or registry.npmjs.org",
                        3 => "e.g. 100",
                        _ => "(optional)",
                    };
                    let display = if text.is_empty() { placeholder } else { text };
                    let sty = if text.is_empty() { s(c::OVERLAY0) } else { s(c::TEXT) };
                    let inp = Paragraph::new(Span::styled(display, sty))
                        .style(Style::default().bg(c::SURFACE0));
                    f.render_widget(inp, Rect { x: input_x, y, width: input_w, height: 1 });
                }
            }
            _ => {}
        }
        y += 1;
    }

    // Error line
    if let Some(e) = error {
        y += 1;
        let err = Paragraph::new(Span::styled(format!(" ⚠ {e}"), s(c::RED)))
            .style(Style::default().bg(c::MANTLE));
        f.render_widget(err, Rect { x: inner.x, y, width: inner.width, height: 1 });
    }

    // Hint
    let hint_y = inner.y + inner.height.saturating_sub(2);
    let hint = Paragraph::new(Span::styled(
        " Tab: Next field   ←/→: Cycle option   Enter: Save   Esc: Cancel",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(hint, Rect { x: inner.x, y: hint_y, width: inner.width, height: 1 });
}

fn render_modal_edit_sandbox_settings(
    f: &mut Frame,
    _app: &mut App,
    screen: Rect,
    backend_idx: usize,
    tool_action_idx: usize,
    net_action_idx: usize,
    field: usize,
) {
    let w = 64u16;
    let h = 15u16;
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(" Sandbox Settings ");
    let inner = block.inner(area);
    f.render_widget(block, area);

    let fields: &[(&str, &[&str], usize)] = &[
        ("Backend", SANDBOX_BACKENDS, backend_idx),
        ("Tool Default Action", SANDBOX_ACTIONS, tool_action_idx),
        ("Network Default Action", SANDBOX_ACTIONS, net_action_idx),
    ];

    let mut y = inner.y + 1;

    for (fi, &(label, choices, idx)) in fields.iter().enumerate() {
        let is_active = fi == field;
        let label_style = if is_active { sb(c::BLUE) } else { s(c::OVERLAY0) };

        let lbl = Paragraph::new(Span::styled(format!(" {label}:"), label_style))
            .style(Style::default().bg(c::MANTLE));
        f.render_widget(lbl, Rect { x: inner.x, y, width: inner.width, height: 1 });
        y += 1;

        let val = choices[idx];
        let sel_text = format!("  ◀ {val} ▶  ");
        let sel_style = if is_active {
            Style::default().fg(c::BASE).bg(c::BLUE)
        } else {
            Style::default().fg(c::TEXT).bg(c::SURFACE0)
        };
        let sel = Paragraph::new(Span::styled(sel_text, sel_style));
        f.render_widget(sel, Rect { x: inner.x + 2, y, width: inner.width.saturating_sub(3), height: 1 });
        y += 2;
    }

    let hint_y = inner.y + inner.height.saturating_sub(2);
    let hint = Paragraph::new(Span::styled(
        " Tab/↕: Next field   ←/→: Cycle   Enter: Save   Esc: Cancel",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(hint, Rect { x: inner.x, y: hint_y, width: inner.width, height: 1 });
}

// ─── System Rules screen ──────────────────────────────────

fn render_system_rules(f: &mut Frame, app: &mut App, area: Rect) {
    if app.system_rules.is_empty() {
        render_empty(
            f,
            "No system rules found. Press 'a' to add a rule. Run migration 080 if table is missing.",
            area,
        );
        return;
    }

    let header = Row::new(vec![
        Cell::from(Span::styled("Scope", sb(c::LAVENDER))),
        Cell::from(Span::styled("Type", sb(c::LAVENDER))),
        Cell::from(Span::styled("Pattern", sb(c::LAVENDER))),
        Cell::from(Span::styled("Action", sb(c::LAVENDER))),
        Cell::from(Span::styled("Pri", sb(c::LAVENDER))),
        Cell::from(Span::styled("Floor", sb(c::LAVENDER))),
        Cell::from(Span::styled("On", sb(c::LAVENDER))),
        Cell::from(Span::styled("Description", sb(c::LAVENDER))),
    ])
    .height(1)
    .style(Style::default().bg(c::SURFACE0));

    let sel = app.table_state.selected().unwrap_or(usize::MAX);
    let rows: Vec<Row> = app
        .system_rules
        .iter()
        .enumerate()
        .map(|(i, r)| {
            let bg = if i == sel { c::SURFACE1 } else { c::BASE };
            let action_fg = if r.action == "deny" { c::RED } else { c::GREEN };
            let floor_fg = if r.is_floor { c::YELLOW } else { c::OVERLAY0 };
            let enabled_fg = if r.enabled { c::GREEN } else { c::OVERLAY0 };
            Row::new(vec![
                Cell::from(Span::styled(&r.scope, s(c::BLUE))),
                Cell::from(Span::styled(&r.rule_type, s(c::TEAL))),
                Cell::from(Span::styled(&r.pattern, s(c::TEXT))),
                Cell::from(Span::styled(&r.action, s(action_fg))),
                Cell::from(Span::styled(r.priority.to_string(), s(c::OVERLAY0))),
                Cell::from(Span::styled(if r.is_floor { "✓" } else { "" }, s(floor_fg))),
                Cell::from(Span::styled(if r.enabled { "✓" } else { "✗" }, s(enabled_fg))),
                Cell::from(Span::styled(
                    r.description.as_deref().unwrap_or(""),
                    s(c::OVERLAY0),
                )),
            ])
            .style(Style::default().bg(bg))
        })
        .collect();

    let widths = [
        Constraint::Length(20),
        Constraint::Length(9),
        Constraint::Min(18),
        Constraint::Length(6),
        Constraint::Length(4),
        Constraint::Length(6),
        Constraint::Length(3),
        Constraint::Min(20),
    ];

    let block = Block::default()
        .borders(Borders::TOP)
        .border_style(Style::default().fg(c::SURFACE0));
    let table = Table::new(rows, widths)
        .header(header)
        .block(block)
        .row_highlight_style(Style::default().bg(c::SURFACE1));

    f.render_stateful_widget(table, area, &mut app.table_state);
    register_row_clicks(f, app, Block::default(), area, app.system_rules.len());
}

#[allow(clippy::too_many_arguments)]
fn render_modal_edit_system_rule(
    f: &mut Frame,
    _app: &mut App,
    screen: Rect,
    _idx: Option<usize>,
    scope_idx: usize,
    rule_type_idx: usize,
    pattern: &str,
    action_idx: usize,
    priority: &str,
    is_floor: bool,
    description: &str,
    field: usize,
    cursor: usize,
    error: Option<&str>,
) {
    let title = if _idx.is_some() { " Edit System Rule " } else { " Add System Rule " };
    let w = 76u16;
    let h = if error.is_some() { 25u16 } else { 24u16 };
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(title);
    let inner = block.inner(area);
    f.render_widget(block, area);

    // Fields: 0=scope(sel), 1=rule_type(sel), 2=pattern(text),
    //         3=action(sel), 4=priority(text), 5=is_floor(toggle), 6=description(text)
    let fields: &[(&str, u8)] = &[
        ("Scope", 0),      // selector
        ("Type", 0),       // selector
        ("Pattern", 1),    // text
        ("Action", 0),     // selector
        ("Priority", 1),   // text
        ("Hard Floor", 2), // toggle
        ("Description", 1),// text
    ];

    let mut y = inner.y;

    for (fi, &(label, kind)) in fields.iter().enumerate() {
        let is_active = fi == field;
        let label_style = if is_active { sb(c::BLUE) } else { s(c::OVERLAY0) };

        let lbl = Paragraph::new(Span::styled(format!(" {label}:"), label_style))
            .style(Style::default().bg(c::MANTLE));
        f.render_widget(lbl, Rect { x: inner.x, y, width: inner.width, height: 1 });
        y += 1;

        let input_x = inner.x + 2;
        let input_w = inner.width.saturating_sub(3);

        match kind {
            0 => {
                // Selector
                let val = match fi {
                    0 => SYSTEM_RULE_SCOPES[scope_idx],
                    1 => SYSTEM_RULE_TYPES[rule_type_idx],
                    3 => SANDBOX_ACTIONS[action_idx],
                    _ => "?",
                };
                let sel_text = format!("  ◀ {val} ▶  ");
                let (fg, bg) = if fi == 3 && val == "deny" {
                    (c::BASE, c::RED)
                } else if fi == 3 {
                    (c::BASE, c::GREEN)
                } else if is_active {
                    (c::BASE, c::BLUE)
                } else {
                    (c::TEXT, c::SURFACE0)
                };
                let sel_style = Style::default().fg(fg).bg(bg);
                let sel = Paragraph::new(Span::styled(sel_text, sel_style));
                f.render_widget(sel, Rect { x: input_x, y, width: input_w, height: 1 });
            }
            1 => {
                // Text input
                let text = match fi {
                    2 => pattern,
                    4 => priority,
                    _ => description,
                };
                if is_active {
                    let cur = cursor.min(text.len());
                    let before = &text[..cur];
                    let after = &text[cur..];
                    let line = Line::from(vec![
                        Span::styled(before, s(c::TEXT)),
                        Span::styled("\u{2502}", sb(c::BLUE)),
                        Span::styled(after, s(c::TEXT)),
                    ]);
                    let inp = Paragraph::new(line).style(Style::default().bg(c::SURFACE0));
                    f.render_widget(inp, Rect { x: input_x, y, width: input_w, height: 1 });
                } else {
                    let placeholder = match fi {
                        2 => "e.g. registry.npmjs.org or ptrace",
                        4 => "e.g. 100",
                        _ => "(optional description)",
                    };
                    let display = if text.is_empty() { placeholder } else { text };
                    let sty = if text.is_empty() { s(c::OVERLAY0) } else { s(c::TEXT) };
                    let inp = Paragraph::new(Span::styled(display, sty))
                        .style(Style::default().bg(c::SURFACE0));
                    f.render_widget(inp, Rect { x: input_x, y, width: input_w, height: 1 });
                }
            }
            2 => {
                // Boolean toggle
                let val_text = if is_floor { "  ◀ Yes ▶  " } else { "  ◀ No ▶  " };
                let toggle_style = if is_active {
                    if is_floor {
                        Style::default().fg(c::BASE).bg(c::YELLOW)
                    } else {
                        Style::default().fg(c::BASE).bg(c::BLUE)
                    }
                } else {
                    Style::default().fg(c::TEXT).bg(c::SURFACE0)
                };
                let sel = Paragraph::new(Span::styled(val_text, toggle_style));
                f.render_widget(sel, Rect { x: input_x, y, width: input_w, height: 1 });
            }
            _ => {}
        }
        y += 1;
    }

    // Error line
    if let Some(e) = error {
        let err = Paragraph::new(Span::styled(format!(" ⚠ {e}"), s(c::RED)))
            .style(Style::default().bg(c::MANTLE));
        f.render_widget(err, Rect { x: inner.x, y, width: inner.width, height: 1 });
    }

    // Hint
    let hint_y = inner.y + inner.height.saturating_sub(2);
    let hint = Paragraph::new(Span::styled(
        " Tab: Next field   ←/→: Cycle/toggle   Enter: Save   Esc: Cancel",
        s(c::OVERLAY0),
    ))
    .style(Style::default().bg(c::MANTLE));
    f.render_widget(hint, Rect { x: inner.x, y: hint_y, width: inner.width, height: 1 });
}

fn render_modal_text_input(
    f: &mut Frame,
    screen: Rect,
    title: &str,
    context: &str,
    label: &str,
    text: &str,
    cursor: usize,
    error: Option<&str>,
    hint: &str,
) {
    let w = 76u16;
    let h = if error.is_some() { 12u16 } else { 11u16 };
    let area = centered(w, h, screen);
    f.render_widget(Clear, area);
    let block = modal_block(title);
    let inner = block.inner(area);
    f.render_widget(block, area);

    let ctx = Paragraph::new(Span::styled(format!(" {context}"), s(c::OVERLAY0)))
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(ctx, Rect { y: inner.y + 1, height: 1, ..inner });

    let lab = Paragraph::new(Span::styled(format!(" {label}:"), s(c::OVERLAY0)))
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(lab, Rect { y: inner.y + 3, height: 1, ..inner });

    let input_x = inner.x + 2;
    let input_w = inner.width.saturating_sub(3);
    let cur = cursor.min(text.len());
    let before = &text[..cur];
    let after = &text[cur..];
    let input_line = Line::from(vec![
        Span::styled(before, s(c::TEXT)),
        Span::styled("\u{2502}", sb(c::BLUE)),
        Span::styled(after, s(c::TEXT)),
    ]);
    let input = Paragraph::new(input_line).style(Style::default().bg(c::SURFACE0));
    f.render_widget(
        input,
        Rect { x: input_x, y: inner.y + 5, width: input_w, height: 1 },
    );

    if let Some(err) = error {
        let e = Paragraph::new(Span::styled(format!(" {err}"), s(c::RED)))
            .style(Style::default().bg(c::MANTLE));
        f.render_widget(e, Rect { y: inner.y + 7, height: 1, ..inner });
    }

    let hint_p = Paragraph::new(Span::styled(format!(" {hint}"), s(c::OVERLAY0)))
        .style(Style::default().bg(c::MANTLE));
    f.render_widget(
        hint_p,
        Rect { y: inner.y + inner.height - 1, height: 1, ..inner },
    );
}

fn render_modal_edit_api_key_origins(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    key_idx: usize,
    text: &str,
    cursor: usize,
    error: Option<&str>,
) {
    let key = match app.api_keys.get(key_idx) {
        Some(k) => k,
        None => return,
    };
    let label = key.label.clone().unwrap_or_else(|| key.prefix.clone());
    let ctx = format!("{} @ {}", label, key.project_name);
    render_modal_text_input(
        f,
        screen,
        " Edit Allowed Origins ",
        &ctx,
        "Origins (comma-separated, blank = unrestricted)",
        text,
        cursor,
        error,
        "Enter: save    Esc: cancel",
    );
}

fn render_modal_edit_api_key_tools(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    key_idx: usize,
    text: &str,
    cursor: usize,
    error: Option<&str>,
) {
    let key = match app.api_keys.get(key_idx) {
        Some(k) => k,
        None => return,
    };
    let label = key.label.clone().unwrap_or_else(|| key.prefix.clone());
    let ctx = format!("{} @ {}", label, key.project_name);
    render_modal_text_input(
        f,
        screen,
        " Edit Allowed Tools ",
        &ctx,
        "Tools (comma-separated, blank = unrestricted)",
        text,
        cursor,
        error,
        "Enter: save    Esc: cancel",
    );
}

fn render_modal_edit_mode_tools(
    f: &mut Frame,
    app: &mut App,
    screen: Rect,
    mode_idx: usize,
    text: &str,
    cursor: usize,
    error: Option<&str>,
) {
    let row = match app.mode_tools.get(mode_idx) {
        Some(r) => r,
        None => return,
    };
    let ctx = format!(
        "mode = {}{}",
        row.mode,
        row.description
            .as_deref()
            .map(|d| format!("    \u{2014} {d}"))
            .unwrap_or_default()
    );
    render_modal_text_input(
        f,
        screen,
        " Edit Mode Tools ",
        &ctx,
        "Allowed tools (comma-separated)",
        text,
        cursor,
        error,
        "Enter: save    Esc: cancel",
    );
}
