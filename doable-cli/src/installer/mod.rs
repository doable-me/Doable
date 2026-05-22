//! Installer subsystem — interactive form-driven server provisioning.
//! Public entry point: `installer::run(args)`.

pub mod cli;
pub mod config;
pub mod events;
pub mod form;
pub mod phases;
pub mod runner;
pub mod tui;

use std::time::Duration;

use anyhow::Result;
use crossterm::event::{Event, EventStream, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use futures::StreamExt;
use tokio::sync::mpsc;

use crate::installer::cli::Args;
use crate::installer::events::AppEvent;
use crate::installer::form::{FormCommand, FormState};
use crate::installer::phases::default_phases;
use crate::installer::tui::App;
use crate::term::Tui;

/// Top-level installer mode that gates which screen the loop draws.
enum AppMode {
    Form(FormState),
    Running(Box<App>),
}

/// Headless installer — no TUI, just streams phase + log events to stdout.
/// Used when stdout is piped (CI / tee / scripts) or when the operator
/// passes `--headless`. Requires `--host`, `--env-name`, `--ssh-key` so
/// there's nothing left to prompt for.
pub async fn run_headless(args: Args) -> Result<()> {
    let (host, env_name, ssh_key) = match (
        args.host.as_deref(),
        args.env_name.as_deref(),
        args.ssh_key.as_deref(),
    ) {
        (Some(h), Some(e), Some(k)) => (h.to_string(), e.to_string(), k.to_path_buf()),
        _ => anyhow::bail!(
            "--headless requires --host, --env-name, and --ssh-key (no interactive form available)"
        ),
    };
    let extra_env = args.remote_env_map();
    let env_keys: Vec<String> = extra_env.keys().cloned().collect();
    println!("doable-installer (headless) — host={host} env={env_name}");
    if !env_keys.is_empty() {
        println!("forwarding {} --remote-env vars: {}", env_keys.len(), env_keys.join(", "));
    }
    let phases = default_phases();
    println!("setup script: {}", args.setup_script.display());
    println!("phases ({}):", phases.len());
    for (i, p) in phases.iter().enumerate() {
        println!("  {}/{}: {}", i + 1, phases.len(), p.name);
    }
    println!();

    let (tx, mut rx) = mpsc::channel::<AppEvent>(1024);
    let setup_script = args.setup_script.clone();
    let user = args.user.clone();
    let port = args.ssh_port;
    let tx_runner = tx.clone();
    tokio::spawn(async move {
        let res = runner::run_remote_setup(
            &host, &user, &ssh_key, port, &env_name,
            &setup_script, extra_env, tx_runner.clone(),
        )
        .await;
        if let Err(e) = res {
            let _ = tx_runner
                .send(AppEvent::LogLine(format!("[runner error] {e:?}")))
                .await;
            let _ = tx_runner.send(AppEvent::Finished { success: false }).await;
        }
    });

    let total = phases.len();
    let mut success = false;
    while let Some(evt) = rx.recv().await {
        match evt {
            AppEvent::LogLine(line) => println!("{line}"),
            AppEvent::PhaseStarted(idx) => {
                let name = phases
                    .get(idx)
                    .map(|p| p.name.as_str())
                    .unwrap_or("(unknown)");
                println!("[phase {}/{total} START] {name}", idx + 1);
            }
            AppEvent::PhaseDone(idx) => {
                let name = phases
                    .get(idx)
                    .map(|p| p.name.as_str())
                    .unwrap_or("(unknown)");
                println!("[phase {}/{total} DONE]  {name}", idx + 1);
            }
            AppEvent::PhaseFailed(idx, msg) => {
                let name = phases
                    .get(idx)
                    .map(|p| p.name.as_str())
                    .unwrap_or("(unknown)");
                eprintln!("[phase {}/{total} FAIL] {name}: {msg}", idx + 1);
            }
            AppEvent::Finished { success: s } => {
                success = s;
                println!("[installer] finished — success={s}");
                break;
            }
            AppEvent::Tick | AppEvent::KeyPressMods(_, _) => {}
        }
    }

    if !success {
        anyhow::bail!("installer reported failure");
    }
    Ok(())
}

/// Public entry point for the installer subcommand. Re-uses the caller's
/// `Tui` so the top-level dispatcher owns terminal lifecycle.
pub async fn run(terminal: &mut Tui, args: Args) -> Result<()> {
    let (tx, mut rx) = mpsc::channel::<AppEvent>(1024);

    // Input task — async crossterm stream + tick interval.
    let tx_input = tx.clone();
    let input_handle = tokio::spawn(async move {
        let mut stream = EventStream::new();
        let mut tick = tokio::time::interval(Duration::from_millis(250));
        loop {
            tokio::select! {
                _ = tick.tick() => {
                    if tx_input.send(AppEvent::Tick).await.is_err() { break; }
                }
                maybe_evt = stream.next() => {
                    match maybe_evt {
                        Some(Ok(Event::Key(KeyEvent { code, modifiers, kind, .. })))
                            if kind == KeyEventKind::Press =>
                        {
                            let _ = tx_input.send(AppEvent::KeyPressMods(code, modifiers)).await;
                        }
                        Some(Ok(_)) => {}
                        Some(Err(_)) | None => break,
                    }
                }
            }
        }
    });

    let mut mode = pick_initial_mode(&args);

    if let AppMode::Running(_) = &mode {
        spawn_runner_for_args(&args, tx.clone());
    }

    terminal.draw(|f| draw(&mut mode, f))?;

    let mut quit = false;
    while !quit {
        let evt = match rx.recv().await {
            Some(e) => e,
            None => break,
        };

        match (&mut mode, evt) {
            (AppMode::Form(state), AppEvent::KeyPressMods(code, mods)) => {
                if mods.contains(KeyModifiers::CONTROL) && matches!(code, KeyCode::Char('c')) {
                    quit = true;
                    continue;
                }
                match state.handle_key(code, mods) {
                    FormCommand::Quit => quit = true,
                    FormCommand::Submit => {
                        let cfg = state.to_config();
                        let phases = default_phases();
                        let is_local = matches!(
                            cfg.target_mode,
                            crate::installer::config::TargetMode::Local
                        );
                        let host_label = if is_local {
                            "localhost".to_string()
                        } else {
                            cfg.host.clone()
                        };
                        let mut app = App::new(
                            host_label,
                            cfg.ssh_user.clone(),
                            cfg.env_name.clone(),
                            phases,
                        );
                        app.push_log(format!(
                            "[ui] form submitted — env={}, target={:?}",
                            cfg.env_name, cfg.target_mode
                        ));
                        let keys: Vec<String> =
                            cfg.to_env_vars().keys().cloned().collect();
                        if !keys.is_empty() {
                            app.push_log(format!(
                                "[ui] passing {} env vars to setup script: {}",
                                keys.len(),
                                keys.join(", ")
                            ));
                        }

                        let setup_script = args.setup_script.clone();
                        let tx_runner = tx.clone();
                        let cfg_for_runner = cfg.clone();

                        if is_local {
                            app.push_log(format!(
                                "[ui] running locally: sudo -E bash {}",
                                setup_script.display()
                            ));
                            mode = AppMode::Running(Box::new(app));
                            tokio::spawn(async move {
                                let env = cfg_for_runner.to_env_vars();
                                let res = runner::run_local_setup(
                                    &setup_script,
                                    env,
                                    tx_runner.clone(),
                                ).await;
                                if let Err(e) = res {
                                    let _ = tx_runner
                                        .send(AppEvent::LogLine(format!("[runner error] {e:?}")))
                                        .await;
                                    let _ = tx_runner
                                        .send(AppEvent::Finished { success: false })
                                        .await;
                                }
                            });
                        } else if matches!(
                            cfg_for_runner.ssh_auth,
                            crate::installer::config::SshAuth::Password
                        ) {
                            app.push_log(
                                "[error] SSH password auth is not yet supported by the runner. Re-run with an SSH private key, or run the installer ON the target server in 'Local' mode.".into(),
                            );
                            mode = AppMode::Running(Box::new(app));
                            let _ = tx_runner.send(AppEvent::Finished { success: false }).await;
                        } else {
                            let host = cfg_for_runner.host.clone();
                            let user = cfg_for_runner.ssh_user.clone();
                            let key_path = cfg_for_runner.ssh_key_path.clone();
                            let port = cfg_for_runner.ssh_port;
                            let env_name = cfg_for_runner.env_name.clone();
                            app.push_log(format!(
                                "[ui] running over ssh: {}@{}:{} (key {})",
                                user, host, port, key_path.display()
                            ));
                            mode = AppMode::Running(Box::new(app));
                            tokio::spawn(async move {
                                let env = cfg_for_runner.to_env_vars();
                                let res = runner::run_remote_setup(
                                    &host, &user, &key_path, port, &env_name,
                                    &setup_script, env, tx_runner.clone(),
                                ).await;
                                if let Err(e) = res {
                                    let _ = tx_runner
                                        .send(AppEvent::LogLine(format!("[runner error] {e:?}")))
                                        .await;
                                    let _ = tx_runner
                                        .send(AppEvent::Finished { success: false })
                                        .await;
                                }
                            });
                        }
                    }
                    FormCommand::None => {}
                }
            }
            (AppMode::Form(_), AppEvent::Tick) => {}
            (AppMode::Form(_), _) => {}

            (AppMode::Running(app), AppEvent::LogLine(line)) => app.push_log(line),
            (AppMode::Running(app), AppEvent::PhaseStarted(idx)) => app.start_phase(idx),
            (AppMode::Running(app), AppEvent::PhaseDone(idx)) => app.finish_phase(idx),
            (AppMode::Running(app), AppEvent::PhaseFailed(idx, err)) => app.fail_phase(idx, err),
            (AppMode::Running(app), AppEvent::Finished { success }) => app.finish(success),
            (AppMode::Running(app), AppEvent::Tick) => app.tick(),
            (AppMode::Running(app), AppEvent::KeyPressMods(code, mods)) => {
                if mods.contains(KeyModifiers::CONTROL) && matches!(code, KeyCode::Char('c')) {
                    quit = true;
                    continue;
                }
                match code {
                    KeyCode::Char('q') | KeyCode::Esc => quit = true,
                    KeyCode::Char('l') => app.filter_errors = !app.filter_errors,
                    KeyCode::Char('p') => app.paused = !app.paused,
                    KeyCode::Char('r') => {
                        app.push_log(
                            "[ui] retry requested — re-run installer once the underlying issue is fixed".into(),
                        );
                    }
                    _ => {}
                }
            }
        }

        terminal.draw(|f| draw(&mut mode, f))?;
    }

    input_handle.abort();
    Ok(())
}

fn pick_initial_mode(args: &Args) -> AppMode {
    let phases = default_phases();
    if args.demo {
        let app = App::new(
            args.host.clone().unwrap_or_else(|| "(demo)".into()),
            args.user.clone(),
            args.env_name.clone().unwrap_or_else(|| "demo".into()),
            phases,
        );
        return AppMode::Running(Box::new(app));
    }
    let have_real_target = args.host.is_some()
        && args.env_name.is_some()
        && args.ssh_key.is_some();
    if args.non_interactive && have_real_target {
        let app = App::new(
            args.host.clone().unwrap(),
            args.user.clone(),
            args.env_name.clone().unwrap(),
            phases,
        );
        return AppMode::Running(Box::new(app));
    }
    AppMode::Form(FormState::new())
}

fn draw(mode: &mut AppMode, frame: &mut ratatui::Frame) {
    match mode {
        AppMode::Form(state) => {
            let area = frame.area();
            crate::installer::form::draw_form(frame, state, area);
        }
        AppMode::Running(app) => {
            app.draw(frame);
        }
    }
}

fn spawn_runner_for_args(args: &Args, tx: mpsc::Sender<AppEvent>) {
    let args = args.clone();
    let demo = args.demo;
    tokio::spawn(async move {
        let res = if demo {
            runner::run_demo(default_phases().len(), tx.clone()).await
        } else if let (Some(host), Some(env_name), Some(ssh_key)) =
            (args.host.as_deref(), args.env_name.as_deref(), args.ssh_key.as_deref())
        {
            let extra_env = args.remote_env_map();
            if !extra_env.is_empty() {
                let keys: Vec<String> = extra_env.keys().cloned().collect();
                let _ = tx
                    .send(AppEvent::LogLine(format!(
                        "[ui] forwarding {} --remote-env vars: {}",
                        keys.len(),
                        keys.join(", ")
                    )))
                    .await;
            }
            runner::run_remote_setup(
                host, &args.user, ssh_key, args.ssh_port, env_name,
                &args.setup_script, extra_env, tx.clone(),
            ).await
        } else {
            Ok(())
        };
        if let Err(e) = res {
            let _ = tx.send(AppEvent::LogLine(format!("[runner error] {e:?}"))).await;
            let _ = tx.send(AppEvent::Finished { success: false }).await;
        }
    });
}
