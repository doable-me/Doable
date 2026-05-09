use crossterm::event::{KeyCode, KeyModifiers};

/// Events fed into the TUI app loop. The runner produces phase + log events;
/// the input task produces key + tick events.
#[derive(Debug, Clone)]
pub enum AppEvent {
    LogLine(String),
    PhaseStarted(usize),
    PhaseDone(usize),
    PhaseFailed(usize, String),
    /// Key press + modifiers. The form needs Ctrl-V detection so we surface
    /// modifiers here rather than collapsing them in the input task.
    KeyPressMods(KeyCode, KeyModifiers),
    /// All phases done — show the end screen.
    Finished { success: bool },
    /// 250ms heartbeat for elapsed-time refresh.
    Tick,
}
