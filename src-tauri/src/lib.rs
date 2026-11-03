mod content_update;
mod protocol;
mod webroot;

use serde_json::json;
use tauri::Manager;

#[tauri::command]
fn app_status(app: tauri::AppHandle) -> serde_json::Value {
    let state = webroot::read_active(&app);
    // 语义约定：active.json 指向了某个 build，但该目录里没有 index.html，
    // 说明这份内容包是坏的（解压不完整/被杀毒清理/手工删过）。
    // 这是 app_status 里 lastError 唯一的触发条件，前端据此显示「回到上一版本」。
    let broken = !state.active.is_empty() && !webroot::active_build_is_usable(&app, &state.active);
    let last_error = if broken {
        Some("当前内容包不完整：缺少首页文件")
    } else {
        None
    };
    let source = if broken {
        "downloaded"
    } else if webroot::active_web_dir(&app).is_some() {
        "downloaded"
    } else {
        "embedded"
    };
    json!({
        "embeddedBuild": std::option_env!("MEOWLO_EMBEDDED_BUILD").unwrap_or("unknown"),
        "activeBuild": state.active,
        "source": source,
        "pendingBuild": state.previous,
        "platform": std::env::consts::OS,
        "lastError": last_error,
    })
}

#[tauri::command]
async fn content_check(app: tauri::AppHandle, manifest_url: String) -> serde_json::Value {
    let handle = app.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        content_update::fetch_manifest(&manifest_url)
    })
    .await;

    match joined {
        Ok(Ok(manifest)) => {
            let active = webroot::read_active(&handle);
            if active.active == manifest.build {
                json!({ "state": "up-to-date", "build": manifest.build })
            } else {
                json!({
                    "state": "update-available",
                    "build": manifest.build,
                    "bytes": manifest.archive.bytes,
                    "generatedAt": manifest.generated_at,
                })
            }
        }
        Ok(Err(message)) => {
            // 断网与服务器错误区分开：断网要静默
            if message.contains("网络请求失败") {
                json!({ "state": "offline" })
            } else {
                json!({ "state": "error", "message": message })
            }
        }
        Err(_) => json!({ "state": "error", "message": "内部任务失败" }),
    }
}

#[tauri::command]
async fn content_install(app: tauri::AppHandle, manifest_url: String) -> serde_json::Value {
    let handle = app.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        content_update::install(&handle, &manifest_url)
    })
    .await;

    match joined {
        Ok(Ok(build)) => json!({ "ok": true, "build": build }),
        Ok(Err(message)) => json!({ "ok": false, "message": message }),
        Err(_) => json!({ "ok": false, "message": "内部任务失败" }),
    }
}

#[tauri::command]
fn content_rollback(app: tauri::AppHandle) -> serde_json::Value {
    match content_update::rollback(&app) {
        Ok(build) => json!({ "ok": true, "build": build }),
        Err(message) => json!({ "ok": false, "build": "", "message": message }),
    }
}

// 移动端必需：mobile_entry_point 是**属性宏**（官方模板写法
// `#[cfg_attr(mobile, tauri::mobile_entry_point)]`），挂在入口函数上生成 JNI
// 符号；`mobile` 是 tauri-build 注入的 cfg alias。桌面端由 main.rs 直接调
// run()，不需要该宏。不能写成独立语句 `tauri::mobile_entry_point!(run);`
// —— 它不是普通过程宏（CI 第 5 轮实锤：expected macro, found attribute macro）。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 预热内置种子。注意：setup 与首个 WebView 请求的先后顺序在不同平台上
            // 并不保证一致，所以 protocol.rs 里还有一层懒初始化兜底；这里只是让首屏更快。
            match content_update::ensure_seed(app.handle()) {
                Ok(Some(build)) => eprintln!("[meowlo] 已从内置种子初始化内容: {build}"),
                Ok(None) => {}
                Err(e) => eprintln!("[meowlo] 内置种子初始化失败: {e}"),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_status,
            content_check,
            content_install,
            content_rollback
        ]);

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }
    }));

    let builder = protocol::register(builder);
    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

