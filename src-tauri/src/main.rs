#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! KARA desktop shell.
//!
//! Abre una ventana nativa (Tauri v2), lanza el runtime Node de KARA como
//! proceso hijo, espera a que el servidor HTTP esté listo y navega la ventana
//! a `http://127.0.0.1:<port>`. Al salir, mata el proceso del runtime.
//!
//! Nota: el runtime se ejecuta con `node` del PATH. Embeber Node en el binario
//! está en el roadmap (docs/en/positioning.md).

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
                eprintln!("[kara] no se encontró kara.config.json (buscando desde el ejecutable)");
                return Ok(());
            };

            let port = read_port(&root);

            let runtime_script = root.join("runtime").join("src").join("index.js");
            if !runtime_script.exists() {
                eprintln!("[kara] no existe {} — no se puede arrancar el runtime", runtime_script.display());
                return Ok(());
            }
            if !root.join("ui").join("dist").join("index.html").exists() {
                eprintln!("[kara] ui/dist no está construido — ejecuta: npm --prefix ui run build");
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
                    println!("[kara] runtime Node lanzado (puerto {})", port);
                }
                Err(e) => {
                    eprintln!("[kara] no se pudo lanzar node: {e}");
                    return Ok(());
                }
            }

            // Espera al servidor en un hilo y navega la ventana desde el hilo principal.
            thread::spawn(move || {
                wait_for_server(port);
                let _ = handle.run_on_main_thread(move |app| {
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
        .and_then(|v| v.get("entry").and_then(|e| e.as_str()))
        .unwrap_or("src/main.kara");
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
