mod engine;

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};  // Manager: asset_protocol_scope()

/// What the last library read told us: where the launcher keeps its settings.json.
#[derive(Default)]
struct Shared {
    data_dir: Mutex<Option<PathBuf>>,
}

/// Runs blocking work (the launcher exe) off the window's thread.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

/// Every game, its actions and their state, the UI texts and the user's stats (`--list --json`). The covers' folders
/// are opened to the window's asset protocol so it can show them.
#[tauri::command]
async fn library(app: AppHandle, shared: State<'_, Shared>) -> Result<serde_json::Value, String> {
    let lib = blocking(|| engine::run_json(&["--list".into(), "--json".into()])).await?;
    if let Some(dir) = lib.get("dataDir").and_then(|v| v.as_str()) {
        *shared.data_dir.lock().unwrap() = Some(PathBuf::from(dir));
    }
    let scope = app.asset_protocol_scope();
    if let Some(games) = lib.get("games").and_then(|v| v.as_array()) {
        for g in games {
            if let Some(img) = g.get("image").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                let _ = scope.allow_file(img);
            }
        }
    }
    Ok(lib)
}

/// The PC mods: game found, installed and newest version (`--mods --json`; asks mods-info, so it takes a moment).
#[tauri::command]
async fn mods() -> Result<serde_json::Value, String> {
    blocking(|| engine::run_json(&["--mods".into(), "--json".into()])).await
}

/// A game's open rooms on the central server (`--rooms <id> --json`).
#[tauri::command]
async fn rooms(game: String) -> Result<serde_json::Value, String> {
    blocking(move || engine::run_json(&["--rooms".into(), game, "--json".into()])).await
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchEnded {
    session: u32,
    game: String,
    code: i32,
    message: String,
}

/// Starts an action (`--launch game:action`, with a room code or an address when joining). Returns at once; a
/// `launch-ended` event follows when the launcher returns: straight after the player starts, or for a host action
/// (which keeps the relay up) when the game closes.
#[tauri::command]
fn launch(app: AppHandle, game: String, action: String, code: Option<String>, address: Option<String>) -> Result<u32, String> {
    static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);
    let session = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let mut args = vec!["--launch".to_string(), format!("{game}:{action}")];
    if let Some(c) = code.filter(|c| !c.is_empty()) {
        args.extend(["--join".into(), c]);
    }
    if let Some(a) = address.filter(|a| !a.is_empty()) {
        args.extend(["--address".into(), a]);
    }
    engine::find_exe()?;
    std::thread::spawn(move || {
        let (code, message) = match engine::run(&args) {
            Ok(o) => (o.code, if o.code == 0 { o.stdout.trim().to_string() } else { o.stderr.trim().to_string() }),
            Err(e) => (-1, e),
        };
        let _ = app.emit("launch-ended", LaunchEnded { session, game, code, message });
    });
    Ok(session)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModEvent {
    game: String,
    line: String,
    done: bool,
    ok: bool,
}

/// Installs, updates, repairs or removes a PC mod (`--install-mod` and the rest). Progress lines arrive as
/// `mod-progress` events, the last one with `done`.
#[tauri::command]
fn mod_job(app: AppHandle, op: String, game: String, game_dir: Option<String>) -> Result<(), String> {
    let flag = match op.as_str() {
        "install" => "--install-mod",
        "repair" => "--repair-mod",
        "uninstall" => "--uninstall-mod",
        _ => return Err(format!("Unknown mod operation {op}")),
    };
    let mut args = vec![flag.to_string(), game.clone()];
    if let Some(d) = game_dir.filter(|d| !d.is_empty()) {
        args.extend(["--game-dir".into(), d]);
    }
    engine::find_exe()?;
    std::thread::spawn(move || {
        let progress = |line: &str| {
            let _ = app.emit("mod-progress", ModEvent { game: game.clone(), line: line.to_string(), done: false, ok: true });
        };
        let (ok, line) = match engine::stream(&args, progress) {
            Ok((0, _)) => (true, String::new()),
            Ok((_, err)) => (false, err),
            Err(e) => (false, e),
        };
        let _ = app.emit("mod-progress", ModEvent { game, line, done: true, ok });
    });
    Ok(())
}

/// Marks a game a favorite in the launcher's own settings.json, so both windows agree.
#[tauri::command]
fn set_favorite(shared: State<'_, Shared>, game: String, on: bool) -> Result<(), String> {
    let dir = shared.data_dir.lock().unwrap().clone().ok_or("The library hasn't been read yet")?;
    let path = dir.join("settings.json");
    let mut root: serde_json::Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let games = root.as_object_mut().ok_or("settings.json isn't an object")?.entry("games").or_insert_with(|| serde_json::json!({}));
    let entry = games.as_object_mut().ok_or("settings.json games isn't an object")?.entry(game).or_insert_with(|| serde_json::json!({}));
    entry.as_object_mut().ok_or("bad game entry")?.insert("favorite".into(), serde_json::Value::Bool(on));
    let text = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    // Written beside and moved over, so a crash never leaves half a file.
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Opens a folder in Explorer or a link in the browser.
#[tauri::command]
fn open(target: String) -> Result<(), String> {
    if !(target.starts_with("https://") || target.starts_with("http://") || std::path::Path::new(&target).exists()) {
        return Err(format!("Not a folder or web link: {target}"));
    }
    std::process::Command::new("explorer").arg(&target).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Shared::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![library, mods, rooms, launch, mod_job, set_favorite, open])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
