use crate::webroot::{candidate_paths, normalize_request_path};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::http::{Request, Response, StatusCode};

/// 在给定根目录里解析出真实文件与 MIME。找不到返回 `None`。
pub fn resolve_file(root: &Path, request_path: &str) -> Option<(PathBuf, String)> {
    let rel = normalize_request_path(request_path)?;
    for cand in candidate_paths(&rel) {
        let full = root.join(&cand);
        if full.is_file() {
            let mime = mime_guess::from_path(&full)
                .first_or_octet_stream()
                .to_string();
            return Some((full, mime));
        }
    }
    None
}

fn read_response(path: &Path, mime: &str, status: StatusCode) -> Option<Response<Vec<u8>>> {
    let bytes = std::fs::read(path).ok()?;
    Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("Cache-Control", "no-cache")
        .body(bytes)
        .ok()
}

/// 从磁盘根目录构造响应。`accept_html` 为真时用 `404.html` 兜底。
pub fn build_response(root: &Path, request_path: &str, accept_html: bool) -> Response<Vec<u8>> {
    if let Some((path, mime)) = resolve_file(root, request_path) {
        if let Some(resp) = read_response(&path, &mime, StatusCode::OK) {
            return resp;
        }
    }
    if accept_html {
        if let Some((path, mime)) = resolve_file(root, "/404.html") {
            if let Some(resp) = read_response(&path, &mime, StatusCode::NOT_FOUND) {
                return resp;
            }
        }
    }
    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(b"Not Found".to_vec())
        .expect("static response must build")
}

fn wants_html(request: &Request<Vec<u8>>) -> bool {
    request
        .headers()
        .get("accept")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.contains("text/html"))
        .unwrap_or(false)
}

/// 还没有任何可用内容包时的兜底页。
/// 正常流程不会出现（首启会先解包种子）；它是「宁可显示一句话也不要白屏」的保险。
fn bootstrap_unavailable() -> Response<Vec<u8>> {
    let body = "<!doctype html><meta charset=\"utf-8\"><title>喵洛阁</title>\
<body style=\"font:16px/1.7 system-ui;padding:2rem;background:#141210;color:#ECE8E1\">\
<h1>正在准备内容</h1><p>请关闭并重新打开应用。</p></body>"
        .as_bytes()
        .to_vec();
    Response::builder()
        .status(StatusCode::SERVICE_UNAVAILABLE)
        .header("Content-Type", "text/html; charset=utf-8")
        .body(body)
        .expect("static response must build")
}

static SEED_TRIED: AtomicBool = AtomicBool::new(false);

/// 取当前 web 根；若没有，则**懒初始化**一次内置种子（解包到 appData）。
///
/// 为什么要这层懒初始化：不依赖 `setup()` 与首个 WebView 请求的先后顺序。
/// 无论哪个先到，第一次请求都会把种子准备好再服务。
fn root_or_seed<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
    if let Some(root) = crate::webroot::current_web_root(app) {
        return Some(root);
    }
    if SEED_TRIED.swap(true, Ordering::SeqCst) {
        return None; // 已经试过，不要每个请求都重试解包
    }
    match crate::content_update::ensure_seed(app) {
        Ok(_) => crate::webroot::current_web_root(app),
        Err(e) => {
            eprintln!("[meowlo] 内置种子初始化失败: {e}");
            None
        }
    }
}

pub fn register<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.register_uri_scheme_protocol("app", |ctx, request| {
        match root_or_seed(ctx.app_handle()) {
            Some(root) => build_response(&root, request.uri().path(), wants_html(&request)),
            None => bootstrap_unavailable(),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn resolves_directory_index_and_html_variants() {
        let dir = std::env::temp_dir().join("meowlo-proto-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("about")).unwrap();
        fs::write(dir.join("index.html"), b"<h1>home</h1>").unwrap();
        fs::write(dir.join("about/index.html"), b"<h1>about</h1>").unwrap();
        fs::write(dir.join("post.html"), b"<h1>post</h1>").unwrap();

        assert_eq!(resolve_file(&dir, "/").unwrap().1, "text/html");
        assert!(resolve_file(&dir, "/about/").unwrap().0.ends_with("about/index.html"));
        assert!(resolve_file(&dir, "/post").unwrap().0.ends_with("post.html"));
        assert!(resolve_file(&dir, "/nope").is_none());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn falls_back_to_404_for_navigation() {
        let dir = std::env::temp_dir().join("meowlo-proto-404");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("404.html"), b"missing").unwrap();

        let resp = build_response(&dir, "/nope", true);
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);

        // 非导航请求不该拿到 HTML
        let resp = build_response(&dir, "/nope", false);
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
        assert_eq!(resp.body().as_slice(), b"Not Found");

        let _ = fs::remove_dir_all(&dir);
    }
}
