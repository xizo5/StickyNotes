#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const QUICK_NOTE_LABEL: &str = "quick-note";

struct CurrentShortcut {
    hotkey: Shortcut,
    text: String,
}

struct ShortcutSlot(Mutex<CurrentShortcut>);

fn default_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space)
}

fn shortcut_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|directory| directory.join("shortcut.txt"))
}

fn load_shortcut_text(app: &AppHandle) -> Option<String> {
    let text = std::fs::read_to_string(shortcut_file(app)?).ok()?;
    let text = text.trim().to_string();
    (!text.is_empty()).then_some(text)
}

fn save_shortcut_text(app: &AppHandle, text: &str) {
    let Some(path) = shortcut_file(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Err(error) = std::fs::write(&path, text) {
        eprintln!("failed to save shortcut: {error}");
    }
}

fn initial_shortcut(app: &AppHandle) -> CurrentShortcut {
    let fallback = default_shortcut();
    let fallback_text = fallback.clone().into_string();

    if let Some(saved) = load_shortcut_text(app) {
        if let Ok(hotkey) = saved.parse::<Shortcut>() {
            if !hotkey.mods.is_empty()
                && app.global_shortcut().register(hotkey.clone()).is_ok()
            {
                return CurrentShortcut {
                    hotkey,
                    text: saved,
                };
            }
        }
    }

    if let Err(error) = app.global_shortcut().register(fallback.clone()) {
        eprintln!("failed to register fallback shortcut: {error}");
    }
    save_shortcut_text(app, &fallback_text);
    CurrentShortcut {
        hotkey: fallback,
        text: fallback_text,
    }
}

fn show_quick_note(app: &AppHandle) {
    let Some(window) = app.get_webview_window(QUICK_NOTE_LABEL) else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn toggle_quick_note(app: &AppHandle) {
    let Some(window) = app.get_webview_window(QUICK_NOTE_LABEL) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "打开便签", true, None::<&str>)?;
    let shortcut_item = MenuItem::with_id(app, "shortcut", "更换快捷键", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &shortcut_item, &quit_item])?;

    let mut builder = TrayIconBuilder::new()
        .tooltip("便签")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_quick_note(app),
            "shortcut" => {
                show_quick_note(app);
                if let Some(window) = app.get_webview_window(QUICK_NOTE_LABEL) {
                    let _ = window.emit("shortcut-edit", ());
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_quick_note(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

#[tauri::command]
fn hide_quick_note(window: tauri::WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn get_shortcut(slot: tauri::State<ShortcutSlot>) -> Result<String, String> {
    slot.0
        .lock()
        .map(|current| current.text.clone())
        .map_err(|_| "无法读取快捷键".to_string())
}

#[tauri::command]
fn set_shortcut(
    app: AppHandle,
    slot: tauri::State<ShortcutSlot>,
    accelerator: String,
) -> Result<String, String> {
    let candidate = accelerator
        .parse::<Shortcut>()
        .map_err(|_| "无法识别这个组合键".to_string())?;

    if candidate.mods.is_empty() {
        return Err("请同时按住 Ctrl、Alt 或 Shift".to_string());
    }

    let mut current = slot
        .0
        .lock()
        .map_err(|_| "快捷键设置被占用，请重试".to_string())?;

    if candidate == current.hotkey {
        return Ok(current.text.clone());
    }

    let _ = app.global_shortcut().unregister(current.hotkey.clone());

    if let Err(error) = app.global_shortcut().register(candidate.clone()) {
        let _ = app.global_shortcut().register(current.hotkey.clone());
        return Err(format!("这个组合键被占用了，请换一个（{error}）"));
    }

    let text = candidate.clone().into_string();
    current.hotkey = candidate;
    current.text = text.clone();
    save_shortcut_text(&app, &text);
    Ok(text)
}

#[tauri::command]
async fn save_quick_note(
    app: AppHandle,
    text: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    let dialog = app.clone();
    let documents = app.path().document_dir().ok();

    let selected = tauri::async_runtime::spawn_blocking(move || {
        let mut builder = dialog
            .dialog()
            .file()
            .set_title("保存便签")
            .set_file_name(suggested_name)
            .add_filter("文本文件", &["txt"]);
        if let Some(directory) = documents {
            builder = builder.set_directory(directory);
        }
        builder.blocking_save_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let Some(file_path) = selected else {
        return Ok(None);
    };

    let path = file_path
        .into_path()
        .map_err(|error| error.to_string())?;

    std::fs::write(&path, text).map_err(|error| error.to_string())?;

    Ok(Some(path.display().to_string()))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, pressed, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let Some(slot) = app.try_state::<ShortcutSlot>() else {
                        return;
                    };
                    let matches = slot
                        .0
                        .lock()
                        .map(|current| current.hotkey == *pressed)
                        .unwrap_or(false);
                    if matches {
                        toggle_quick_note(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            hide_quick_note,
            save_quick_note,
            get_shortcut,
            set_shortcut
        ])
        .setup(move |app| {
            let current = initial_shortcut(app.handle());
            app.manage(ShortcutSlot(Mutex::new(current)));
            if let Err(error) = build_tray(app) {
                eprintln!("failed to create tray icon: {error}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != QUICK_NOTE_LABEL {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running the sticky notes app");
}
