use std::collections::BTreeMap;
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use anyhow::{Context, Result};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

use crate::installer::events::AppEvent;

/// Render an env-var map as a single shell-quoted prefix:
/// `KEY='val' KEY2='val2' ...`. Single quotes inside values are escaped.
fn env_prefix(env: &BTreeMap<String, String>) -> String {
    let mut parts = Vec::with_capacity(env.len());
    for (k, v) in env.iter() {
        let escaped = v.replace('\'', "'\\''");
        parts.push(format!("{}='{}'", k, escaped));
    }
    parts.join(" ")
}

/// Spawns an SSH process to stream the remote setup script. Parses
/// `Phase N/M — <name>` or `Step N/M: <name>` markers to drive sidebar
/// transitions and forwards every other line into the log pane.
///
/// We deliberately use the system `ssh` binary instead of a Rust SSH crate —
/// it sidesteps key-handling subtleties and lets the operator reuse their
/// agent, known_hosts, and config exactly as if they had typed the command
/// themselves.
pub async fn run_remote_setup(
    host: &str,
    user: &str,
    ssh_key: &Path,
    ssh_port: u16,
    env_name: &str,
    setup_script: &Path,
    extra_env: BTreeMap<String, String>,
    tx: mpsc::Sender<AppEvent>,
) -> Result<()> {
    // Compose a one-liner that uploads + executes the script via stdin to the
    // remote `bash`. This avoids needing an `scp` round-trip for a tiny script.
    let script_contents = tokio::fs::read_to_string(setup_script)
        .await
        .with_context(|| format!("read setup script: {}", setup_script.display()))?;

    let target = format!("{}@{}", user, host);
    let mut env_with_name = extra_env;
    env_with_name
        .entry("DOABLE_ENV_NAME".to_string())
        .or_insert_with(|| env_name.to_string());
    let prefix = env_prefix(&env_with_name);
    let env_arg = if prefix.is_empty() {
        format!("ENV_NAME={} bash -s --", env_name)
    } else {
        format!("{} bash -s --", prefix)
    };

    let mut child = Command::new("ssh")
        .arg("-i")
        .arg(ssh_key)
        .arg("-p")
        .arg(ssh_port.to_string())
        .arg("-o")
        .arg("StrictHostKeyChecking=accept-new")
        .arg("-o")
        .arg("ServerAliveInterval=30")
        .arg(&target)
        .arg(&env_arg)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("spawn ssh")?;

    // Pipe the script contents into ssh stdin.
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin
            .write_all(script_contents.as_bytes())
            .await
            .context("write script to ssh stdin")?;
        stdin.shutdown().await.ok();
    }

    let stdout = child.stdout.take().context("capture ssh stdout")?;
    let stderr = child.stderr.take().context("capture ssh stderr")?;

    let tx_out = tx.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            forward_line(&line, &tx_out).await;
        }
    });

    let tx_err = tx.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            // stderr lines flow into the same log pane prefixed for visibility.
            let prefixed = format!("[stderr] {}", line);
            let _ = tx_err.send(AppEvent::LogLine(prefixed)).await;
        }
    });

    let status = child.wait().await.context("await ssh")?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    let success = status.success();
    let _ = tx.send(AppEvent::Finished { success }).await;
    Ok(())
}

async fn forward_line(line: &str, tx: &mpsc::Sender<AppEvent>) {
    if let Some((idx, _name)) = parse_phase_marker(line) {
        let _ = tx.send(AppEvent::PhaseStarted(idx)).await;
    } else if let Some(idx) = parse_phase_done(line) {
        let _ = tx.send(AppEvent::PhaseDone(idx)).await;
    } else if let Some((idx, msg)) = parse_phase_failed(line) {
        let _ = tx.send(AppEvent::PhaseFailed(idx, msg)).await;
    }
    let _ = tx.send(AppEvent::LogLine(line.to_string())).await;
}

/// Recognises lines like:
///   ════════ Phase 3/15 — Node.js 22 + pnpm
///   ======== Phase 3/15 - Node.js 22 + pnpm
///   Step 3/13: Hardening services...
///   Step 3/13 — Hardening services
fn parse_phase_marker(line: &str) -> Option<(usize, String)> {
    let trimmed = line.trim();
    let (idx, key_len) = if let Some(i) = trimmed.find("Phase ") {
        (i, "Phase ".len())
    } else if let Some(i) = trimmed.find("Step ") {
        (i, "Step ".len())
    } else {
        return None;
    };
    let rest = &trimmed[idx + key_len..];
    let slash = rest.find('/')?;
    let n: usize = rest[..slash].trim().parse().ok()?;
    // Find optional name after a dash.
    let after_total = rest[slash + 1..]
        .trim_start_matches(|c: char| c.is_ascii_digit())
        .trim_start();
    let name = after_total
        .trim_start_matches(|c: char| c == '—' || c == '-' || c == ':' || c == ' ')
        .to_string();
    if n == 0 {
        None
    } else {
        Some((n - 1, name))
    }
}

fn parse_phase_done(line: &str) -> Option<usize> {
    // Recognises:  "[phase 3] done"  or  "Phase 3/15 ✅"
    let lower = line.to_ascii_lowercase();
    if !(lower.contains("done") || lower.contains("✅") || lower.contains("[ok]")) {
        return None;
    }
    extract_phase_number(line)
}

fn parse_phase_failed(line: &str) -> Option<(usize, String)> {
    let lower = line.to_ascii_lowercase();
    if !(lower.contains("failed") || lower.contains("error:") || lower.contains("❌")) {
        return None;
    }
    let idx = extract_phase_number(line)?;
    Some((idx, line.to_string()))
}

fn extract_phase_number(line: &str) -> Option<usize> {
    let l = line.to_ascii_lowercase();
    let (pos, key_len) = if let Some(p) = l.find("phase ") {
        (p, "phase ".len())
    } else if let Some(p) = l.find("step ") {
        (p, "step ".len())
    } else {
        return None;
    };
    let rest = &line[pos + key_len..];
    let mut digits = String::new();
    for c in rest.chars() {
        if c.is_ascii_digit() {
            digits.push(c);
        } else {
            break;
        }
    }
    let n: usize = digits.parse().ok()?;
    if n == 0 { None } else { Some(n - 1) }
}

/// Spawn the setup script locally with `sudo -E bash`, streaming its output
/// into the TUI just like the remote path. Used when the operator picks the
/// "Local (this server)" target mode.
#[allow(dead_code)]
pub async fn run_local_setup(
    setup_script: &Path,
    extra_env: BTreeMap<String, String>,
    tx: mpsc::Sender<AppEvent>,
) -> Result<()> {
    let mut cmd = Command::new("sudo");
    cmd.arg("-E").arg("bash").arg(setup_script);
    for (k, v) in extra_env.iter() {
        cmd.env(k, v);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().context("spawn local sudo bash")?;
    let stdout = child.stdout.take().context("capture stdout")?;
    let stderr = child.stderr.take().context("capture stderr")?;

    let tx_out = tx.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            forward_line(&line, &tx_out).await;
        }
    });
    let tx_err = tx.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = tx_err
                .send(AppEvent::LogLine(format!("[stderr] {}", line)))
                .await;
        }
    });

    let status = child.wait().await.context("await sudo bash")?;
    let _ = stdout_task.await;
    let _ = stderr_task.await;
    let _ = tx
        .send(AppEvent::Finished {
            success: status.success(),
        })
        .await;
    Ok(())
}

/// Demo replay used when `--demo` is set: pumps a deterministic sequence of
/// log + phase events at a human-friendly pace so the operator can preview
/// the TUI without a real target host.
pub async fn run_demo(num_phases: usize, tx: mpsc::Sender<AppEvent>) -> Result<()> {
    for i in 0..num_phases {
        if tx.send(AppEvent::PhaseStarted(i)).await.is_err() {
            return Ok(());
        }
        let _ = tx
            .send(AppEvent::LogLine(format!(
                "════════ Phase {}/{} — starting",
                i + 1,
                num_phases
            )))
            .await;

        for step in 1..=4 {
            tokio::time::sleep(Duration::from_millis(220)).await;
            let _ = tx
                .send(AppEvent::LogLine(format!(
                    "  [phase {}] step {}/4 working...",
                    i + 1,
                    step
                )))
                .await;
        }

        // Inject a synthetic warning every 5th phase so the colorizer is
        // easy to eyeball.
        if i % 5 == 4 {
            let _ = tx
                .send(AppEvent::LogLine(format!(
                    "  [phase {}] warn: harmless retry on apt index",
                    i + 1
                )))
                .await;
        }

        tokio::time::sleep(Duration::from_millis(150)).await;
        let _ = tx
            .send(AppEvent::LogLine(format!("  [phase {}] done ✅", i + 1)))
            .await;
        let _ = tx.send(AppEvent::PhaseDone(i)).await;
    }
    let _ = tx.send(AppEvent::Finished { success: true }).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_phase_markers() {
        let (idx, name) = parse_phase_marker("════════ Phase 3/15 — Node.js 22 + pnpm").unwrap();
        assert_eq!(idx, 2);
        assert!(name.starts_with("Node.js"));

        let (idx, _) = parse_phase_marker("Phase 1/15 - preflight").unwrap();
        assert_eq!(idx, 0);

        assert!(parse_phase_marker("nothing here").is_none());
        assert!(parse_phase_marker("Phase 0/15").is_none());
    }

    #[test]
    fn parses_step_markers() {
        let (idx, name) =
            parse_phase_marker("Step 3/13: Hardening services...").unwrap();
        assert_eq!(idx, 2);
        assert!(name.starts_with("Hardening"));

        let (idx, name) =
            parse_phase_marker("info \"Step 1/13: Installing system packages...\"").unwrap();
        assert_eq!(idx, 0);
        assert!(name.starts_with("Installing"));

        let (idx, _) = parse_phase_marker("Step 13/13 — Starting services").unwrap();
        assert_eq!(idx, 12);

        assert!(parse_phase_marker("Step 0/13").is_none());
    }

    #[test]
    fn extracts_phase_number_in_done_lines() {
        assert_eq!(extract_phase_number("[phase 7] done"), Some(6));
        assert_eq!(extract_phase_number("Phase 12/15 done"), Some(11));
    }

    #[test]
    fn extracts_step_number_in_done_lines() {
        assert_eq!(extract_phase_number("[step 7] done"), Some(6));
        assert_eq!(extract_phase_number("Step 12/13 ✅"), Some(11));
    }
}
