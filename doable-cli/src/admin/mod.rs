//! Admin subsystem — runtime management TUI for an existing Doable server.
//! Public entry point: `admin::run(opts)` after the dispatcher resolves
//! local-vs-remote and any SSH tunnel.

pub mod app;
pub mod db;
pub mod server_config;
pub mod ui;

use std::io;
use std::time::Duration;

use anyhow::Result;
use crossterm::event::{self, DisableMouseCapture, EnableMouseCapture, Event};
use crossterm::execute;
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;

use std::path::PathBuf;

use crate::admin::app::App;

/// Remote SSH context — only set when admin was launched with --remote.
/// Used for sub-flows that need to shell out to the server (rotation,
/// service restart, file edits).
#[derive(Clone)]
pub struct RemoteCtx {
    /// `user@host[:port]` as entered by the operator.
    pub spec: String,
    pub ssh_key: PathBuf,
}

pub struct AdminOpts {
    /// Postgres connection URL.  When `remote` is Some, this points at the
    /// local end of an SSH tunnel; when None, it's a direct local connection.
    pub db_url: String,
    /// Friendly label shown in the header (e.g. "myorg.doable.me via SSH"
    /// or "this server (local)").
    pub label: String,
    /// SSH context for sub-flows that need to reach the remote shell.
    /// `None` ⇒ admin is running ON the server itself; sub-flows use local sudo.
    pub remote: Option<RemoteCtx>,
}

/// Public entry point. Caller owns the terminal lifecycle (the dispatcher
/// already enabled raw mode + alt screen). We just enable mouse capture for
/// click-to-navigate and disable on exit.
pub async fn run(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    opts: AdminOpts,
) -> Result<()> {
    // Mouse capture is admin-specific (installer doesn't need it).
    execute!(terminal.backend_mut(), EnableMouseCapture).ok();

    let res: Result<()> = (async {
        // Surface the FULL error chain — tokio_postgres::Error's Display
        // prints "db error" without detail; the source has the SSL/auth/etc
        // diagnostic, and walking it makes "wrong password" actually visible.
        let client = db::connect(&opts.db_url).await.map_err(|e| {
            let mut chain = format!("{}", e);
            let mut src: Option<&dyn std::error::Error> = e.source();
            while let Some(s) = src {
                chain.push_str(" — ");
                chain.push_str(&s.to_string());
                src = s.source();
            }
            // Redact password from the URL before printing.
            let safe_url = redact_password(&opts.db_url);
            anyhow::anyhow!("connect db at {}: {}", safe_url, chain)
        })?;
        let mut app = App::new(client, &opts.label);
        // Thread the remote ctx + raw db_url through to App for the
        // DB Credentials sub-view + rotation flow.
        app.remote_ctx = opts.remote.clone();
        app.db_url = opts.db_url.clone();
        app.load_all_data().await;

        loop {
            terminal.draw(|f| ui::render(f, &mut app))?;
            if event::poll(Duration::from_millis(100))? {
                match event::read()? {
                    Event::Key(key) => app.handle_key(key).await,
                    Event::Mouse(mouse) => app.handle_mouse(mouse).await,
                    _ => {}
                }
            }
            app.tick();
            if !app.running {
                return Ok(());
            }
        }
    })
    .await;

    execute!(terminal.backend_mut(), DisableMouseCapture).ok();
    res
}

/// Replace the `:password@` portion of a Postgres URL with `:***@` so the
/// real password never lands in error logs / ttys.
fn redact_password(url: &str) -> String {
    if let Some(scheme_end) = url.find("://") {
        let after = &url[scheme_end + 3..];
        if let Some(at) = after.find('@') {
            let userinfo = &after[..at];
            if let Some(colon) = userinfo.find(':') {
                let user = &userinfo[..colon];
                let rest = &after[at..];
                return format!("{}://{}:***{}", &url[..scheme_end], user, rest);
            }
        }
    }
    url.to_string()
}
