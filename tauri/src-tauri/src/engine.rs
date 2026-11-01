//! The C++ launcher as the engine: until each part is rewritten in Rust, the window asks the tested launcher exe
//! (`MultiplayerEverythingLauncher.exe`) for the library (`--list --json`), the mods (`--mods --json`) and the rooms
//! (`--rooms <id> --json`), and starts games and mod jobs through `--launch` and `--install-mod` and the rest.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// No console window flashing up for each call.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const EXE: &str = "MultiplayerEverythingLauncher.exe";

/// `FL_LAUNCHER_EXE` (development), else the launcher next to this app (the shipped layout).
pub fn find_exe() -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("FL_LAUNCHER_EXE") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Ok(p);
        }
        return Err(format!("FL_LAUNCHER_EXE points at {}, which doesn't exist", p.display()));
    }
    let here = std::env::current_exe().map_err(|e| e.to_string())?;
    let beside = here.with_file_name(EXE);
    if beside.is_file() {
        return Ok(beside);
    }
    Err(format!("{EXE} wasn't found next to this app; set FL_LAUNCHER_EXE to it"))
}

fn command(args: &[String]) -> Result<Command, String> {
    let mut c = Command::new(find_exe()?);
    c.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    c.creation_flags(CREATE_NO_WINDOW);
    Ok(c)
}

pub struct Output {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Runs the launcher with these arguments and waits for it.
pub fn run(args: &[String]) -> Result<Output, String> {
    let out = command(args)?.output().map_err(|e| format!("Cannot start the launcher: {e}"))?;
    Ok(Output {
        code: out.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

/// Runs a `--json` command and parses what it prints.
pub fn run_json(args: &[String]) -> Result<serde_json::Value, String> {
    let out = run(args)?;
    let text = out.stdout.trim();
    if text.is_empty() {
        let why = out.stderr.trim();
        return Err(if why.is_empty() { format!("The launcher printed nothing (exit {})", out.code) } else { why.to_string() });
    }
    serde_json::from_str(text).map_err(|e| format!("The launcher's answer isn't JSON: {e}"))
}

/// Starts the launcher and hands each line it prints to `line` as it comes; returns the exit code and the last
/// error text once it ends. For long jobs (mod installs) whose progress the window shows.
pub fn stream(args: &[String], mut line: impl FnMut(&str)) -> Result<(i32, String), String> {
    let mut child = command(args)?.spawn().map_err(|e| format!("Cannot start the launcher: {e}"))?;
    let stderr = child.stderr.take();
    let err_reader = std::thread::spawn(move || {
        let mut text = String::new();
        if let Some(s) = stderr {
            for l in BufReader::new(s).lines().map_while(Result::ok) {
                text.push_str(&l);
                text.push('\n');
            }
        }
        text
    });
    if let Some(out) = child.stdout.take() {
        for l in BufReader::new(out).lines().map_while(Result::ok) {
            line(&l);
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let err = err_reader.join().unwrap_or_default();
    Ok((status.code().unwrap_or(-1), err.trim().to_string()))
}
