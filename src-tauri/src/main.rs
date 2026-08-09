#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! KARA desktop shell.
//!
//! Opens a native window (Tauri v2), launches the KARA Node runtime as a child
//! process, waits for the HTTP server to be ready and navigates the window to
//! `http://127.0.0.1:<port>`. Kills the runtime process on exit.
//!
//! Note: the runtime runs with `node` from PATH. Embedding Node in the binary
//! is on the roadmap (docs/en/positioning.md).

use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use tauri::{Manager, RunEvent};

/// Estado gestionado: el proceso hijo del runtime (se mata al salir).
struct NodeRuntime(Mutex<Option<Child>>);

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();

            let Some(root) = find_project_root() else {
                eprintln!("[kara] kara.config.json not found (searched from the executable)");
                return Ok(());
            };

            let port = read_port(&root);

            let runtime_script = root.join("runtime").join("src").join("index.js");
            if !runtime_script.exists() {
                eprintln!("[kara] {} not found — cannot start the runtime", runtime_script.display());
                return Ok(());
            }
            if !root.join("ui").join("dist").join("index.html").exists() {
                eprintln!("[kara] ui/dist is not built — run: npm --prefix ui run build");
            }

            match Command::new("node")
                .arg(&runtime_script)
                .current_dir(&root)
                .env("KARA_ENTRY", read_entry(&root))
                .env("KARA_CONFIG_PATH", root.join("kara.config.json"))
                .env("KARA_PROJECT_ROOT", &root)
                .spawn()
            {
                Ok(child) => {
                    app.manage(NodeRuntime(Mutex::new(Some(child))));
                    println!("[kara] Node runtime started (port {})", port);
                }
                Err(e) => {
                    eprintln!("[kara] failed to launch node: {e}");
                    return Ok(());
                }
            }

            // Espera al servidor en un hilo y navega la ventana desde el hilo principal.
            thread::spawn(move || {
                wait_for_server(port);
                let app = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    if let Some(window) = app.get_webview_window("main") {
                        let url = format!("http://127.0.0.1:{port}");
                        if let Ok(u) = url.parse() {
                            let _ = window.navigate(u);
                        }
                    }
                });
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<NodeRuntime>() {
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        }
    });
}

/// Camina hacia arriba desde el ejecutable buscando `kara.config.json`.
fn find_project_root() -> Option<PathBuf> {
    let mut dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    for _ in 0..6 {
        if dir.join("kara.config.json").exists() {
            return Some(dir);
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

/// Puerto del proyecto (`kara.config.json` → `port`, default 5179).
fn read_port(root: &Path) -> u16 {
    read_config(root)
        .and_then(|v| v.get("port").and_then(|p| p.as_u64()))
        .map(|p| p.clamp(1, 65535) as u16)
        .unwrap_or(5179)
}

/// Entry del proyecto (`kara.config.json` → `entry`, default `src/main.kara`).
fn read_entry(root: &Path) -> PathBuf {
    let entry = read_config(root)
        .and_then(|v| v.get("entry").and_then(|e| e.as_str().map(String::from)))
        .unwrap_or_else(|| "src/main.kara".to_string());
    root.join(entry)
}

fn read_config(root: &Path) -> Option<serde_json::Value> {
    let text = std::fs::read_to_string(root.join("kara.config.json")).ok()?;
    serde_json::from_str(&text).ok()
}

/// Sondea `127.0.0.1:port` hasta que el servidor responda (máx. 15 s).
fn wait_for_server(port: u16) {
    let deadline = std::time::Instant::now() + Duration::from_secs(15);
    while std::time::Instant::now() < deadline {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return;
        }
        thread::sleep(Duration::from_millis(300));
    }
}
