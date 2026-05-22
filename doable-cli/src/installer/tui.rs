use std::collections::VecDeque;
use std::time::Instant;

use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, List, ListItem, Paragraph, Row, Table, Wrap};
use ratatui::Frame;

use crate::installer::phases::{Phase, PhaseStatus};

const LOG_CAP: usize = 5000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Screen {
    Running,
    Finished { success: bool },
}

pub struct App {
    pub host: String,
    pub env_name: String,
    pub user: String,
    pub phases: Vec<Phase>,
    pub current_phase_idx: Option<usize>,
    pub log_lines: VecDeque<String>,
    pub elapsed_start: Instant,
    pub status_bar: String,
    pub paused: bool,
    pub filter_errors: bool,
    pub screen: Screen,
}

impl App {
    pub fn new(host: String, user: String, env_name: String, phases: Vec<Phase>) -> Self {
        Self {
            host,
            user,
            env_name,
            phases,
            current_phase_idx: None,
            log_lines: VecDeque::with_capacity(LOG_CAP),
            elapsed_start: Instant::now(),
            status_bar: "q=quit  l=toggle log filter  r=retry phase  p=pause".into(),
            paused: false,
            filter_errors: false,
            screen: Screen::Running,
        }
    }

    pub fn push_log(&mut self, line: String) {
        if self.log_lines.len() == LOG_CAP {
            self.log_lines.pop_front();
        }
        self.log_lines.push_back(line);
    }

    pub fn start_phase(&mut self, idx: usize) {
        if let Some(p) = self.phases.get_mut(idx) {
            p.status = PhaseStatus::Running;
        }
        self.current_phase_idx = Some(idx);
    }

    pub fn finish_phase(&mut self, idx: usize) {
        if let Some(p) = self.phases.get_mut(idx) {
            p.status = PhaseStatus::Done;
        }
    }

    pub fn fail_phase(&mut self, idx: usize, err: String) {
        if let Some(p) = self.phases.get_mut(idx) {
            p.status = PhaseStatus::Failed(err);
        }
    }

    pub fn finish(&mut self, success: bool) {
        self.screen = Screen::Finished { success };
    }

    pub fn tick(&mut self) {
        // Reserved for future periodic state refresh (e.g., spinner frame).
    }

    fn elapsed_str(&self) -> String {
        let s = self.elapsed_start.elapsed().as_secs();
        format!("{:02}:{:02}", s / 60, s % 60)
    }

    pub fn draw(&self, frame: &mut Frame) {
        let area = frame.area();
        let vert = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3),
                Constraint::Min(5),
                Constraint::Length(1),
            ])
            .split(area);

        self.draw_title(frame, vert[0]);

        match self.screen {
            Screen::Running => self.draw_main(frame, vert[1]),
            Screen::Finished { success } => self.draw_finished(frame, vert[1], success),
        }

        self.draw_status_bar(frame, vert[2]);
    }

    fn draw_title(&self, frame: &mut Frame, area: Rect) {
        let title = Line::from(vec![
            Span::styled(
                " Doable Installer ",
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw("│ host: "),
            Span::styled(&self.host, Style::default().fg(Color::White)),
            Span::raw("  user: "),
            Span::styled(&self.user, Style::default().fg(Color::White)),
            Span::raw("  env: "),
            Span::styled(&self.env_name, Style::default().fg(Color::Yellow)),
            Span::raw("  elapsed: "),
            Span::styled(self.elapsed_str(), Style::default().fg(Color::Green)),
        ]);

        let p = Paragraph::new(title)
            .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(Color::Cyan)));
        frame.render_widget(p, area);
    }

    fn draw_main(&self, frame: &mut Frame, area: Rect) {
        let cols = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(30), Constraint::Percentage(70)])
            .split(area);

        self.draw_phases(frame, cols[0]);
        self.draw_log(frame, cols[1]);
    }

    fn draw_phases(&self, frame: &mut Frame, area: Rect) {
        let items: Vec<ListItem> = self
            .phases
            .iter()
            .enumerate()
            .map(|(i, p)| {
                let (style, label) = match &p.status {
                    PhaseStatus::Pending => (Style::default().fg(Color::DarkGray), "pending"),
                    PhaseStatus::Running => (
                        Style::default()
                            .fg(Color::Yellow)
                            .add_modifier(Modifier::BOLD),
                        "running",
                    ),
                    PhaseStatus::Done => (Style::default().fg(Color::Green), "done"),
                    PhaseStatus::Failed(_) => (
                        Style::default()
                            .fg(Color::Red)
                            .add_modifier(Modifier::BOLD),
                        "failed",
                    ),
                };
                let n = format!("{:>2}", i + 1);
                let line = Line::from(vec![
                    Span::raw(format!(" {} ", p.status.icon())),
                    Span::styled(n, style),
                    Span::raw(" "),
                    Span::styled(p.name.clone(), style),
                    Span::raw("  "),
                    Span::styled(format!("[{}]", label), Style::default().fg(Color::DarkGray)),
                ]);
                ListItem::new(line)
            })
            .collect();

        let title = if let Some(i) = self.current_phase_idx {
            format!(" Phases ({}/{}) ", i + 1, self.phases.len())
        } else {
            format!(" Phases (0/{}) ", self.phases.len())
        };

        let list = List::new(items).block(
            Block::default()
                .borders(Borders::ALL)
                .title(Span::styled(title, Style::default().fg(Color::Cyan)))
                .border_style(Style::default().fg(Color::DarkGray)),
        );
        frame.render_widget(list, area);
    }

    fn draw_log(&self, frame: &mut Frame, area: Rect) {
        let max_lines = area.height.saturating_sub(2) as usize;
        let lines: Vec<Line> = self
            .log_lines
            .iter()
            .filter(|l| !self.filter_errors || is_error_line(l))
            .rev()
            .take(max_lines)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .map(|l| colorize_log_line(l))
            .collect();

        let title = if self.filter_errors {
            " Setup output (errors only) "
        } else {
            " Setup output "
        };

        let p = Paragraph::new(lines)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(Span::styled(
                        title,
                        Style::default().fg(Color::Cyan),
                    ))
                    .border_style(Style::default().fg(Color::DarkGray)),
            )
            .wrap(Wrap { trim: false });
        frame.render_widget(p, area);
    }

    fn draw_status_bar(&self, frame: &mut Frame, area: Rect) {
        let pause_marker = if self.paused { " [PAUSED]" } else { "" };
        let line = Line::from(vec![
            Span::styled(
                format!(" {} ", self.status_bar),
                Style::default().bg(Color::DarkGray).fg(Color::White),
            ),
            Span::styled(pause_marker, Style::default().fg(Color::Yellow)),
        ]);
        frame.render_widget(Paragraph::new(line), area);
    }

    fn draw_finished(&self, frame: &mut Frame, area: Rect, success: bool) {
        let cols = Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Percentage(60), Constraint::Percentage(40)])
            .split(area);

        let header_style = if success {
            Style::default()
                .fg(Color::Green)
                .add_modifier(Modifier::BOLD)
        } else {
            Style::default()
                .fg(Color::Red)
                .add_modifier(Modifier::BOLD)
        };
        let header_text = if success {
            " ✅ Setup completed successfully "
        } else {
            " ❌ Setup failed — see log for details "
        };

        let rows: Vec<Row> = self
            .phases
            .iter()
            .enumerate()
            .map(|(i, p)| {
                let (style, status_text) = match &p.status {
                    PhaseStatus::Pending => (Style::default().fg(Color::DarkGray), "skipped".into()),
                    PhaseStatus::Running => (Style::default().fg(Color::Yellow), "interrupted".into()),
                    PhaseStatus::Done => (Style::default().fg(Color::Green), "ok".to_string()),
                    PhaseStatus::Failed(e) => {
                        (Style::default().fg(Color::Red), format!("failed: {}", e))
                    }
                };
                Row::new(vec![
                    format!("{:>2}", i + 1),
                    p.status.icon().to_string(),
                    p.name.clone(),
                    status_text,
                ])
                .style(style)
            })
            .collect();

        let table = Table::new(
            rows,
            [
                Constraint::Length(3),
                Constraint::Length(3),
                Constraint::Percentage(55),
                Constraint::Percentage(35),
            ],
        )
        .header(
            Row::new(vec!["#", "", "Phase", "Result"])
                .style(Style::default().add_modifier(Modifier::BOLD)),
        )
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(Span::styled(header_text, header_style))
                .border_style(Style::default().fg(if success { Color::Green } else { Color::Red })),
        );
        frame.render_widget(table, cols[0]);

        // Endpoints + next steps panel
        let endpoints = vec![
            Line::from(vec![Span::styled(
                " Endpoints ",
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from(format!("  web → https://{}.doable.me", self.env_name)),
            Line::from(format!("  api → https://{}-api.doable.me", self.env_name)),
            Line::from(format!("  ws  → wss://{}-ws.doable.me", self.env_name)),
            Line::from(""),
            Line::from(vec![Span::styled(
                " Next steps ",
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            )]),
            Line::from("  1. ssh into the server and run: tmux attach -t doable"),
            Line::from("  2. confirm api/web/ws panes are healthy"),
            Line::from("  3. visit the web URL above and create your first project"),
            Line::from("  4. press q to exit this installer"),
        ];
        let p = Paragraph::new(endpoints)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .title(Span::styled(
                        " Summary ",
                        Style::default().fg(Color::Cyan),
                    ))
                    .border_style(Style::default().fg(Color::DarkGray)),
            )
            .wrap(Wrap { trim: false });
        frame.render_widget(p, cols[1]);
    }
}

fn is_error_line(line: &str) -> bool {
    let l = line.to_ascii_lowercase();
    l.contains("error") || l.contains("fail") || l.contains("fatal") || l.contains("warn")
}

fn colorize_log_line(line: &str) -> Line<'static> {
    let lower = line.to_ascii_lowercase();
    let style = if lower.contains("error") || lower.contains("fatal") || lower.contains("failed") {
        Style::default().fg(Color::Red)
    } else if lower.contains("warn") {
        Style::default().fg(Color::Yellow)
    } else if line.contains("════") || lower.contains("phase ") {
        Style::default()
            .fg(Color::Cyan)
            .add_modifier(Modifier::BOLD)
    } else if lower.contains("ok") || lower.contains("done") || lower.contains("✓") {
        Style::default().fg(Color::Green)
    } else {
        Style::default().fg(Color::Gray)
    };
    Line::from(Span::styled(line.to_string(), style))
}
