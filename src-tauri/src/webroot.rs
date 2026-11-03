use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

pub const ACTIVE_FILE: &str = "active.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ActiveState {
    pub active: String,
    pub previous: Option<String>,
}

/// build 标识只允许 16 位小写十六进制。
/// 这是安全边界：build 会被拼进文件系统路径，必须拒绝 `..`、`/`、`:` 等字符。
pub fn is_valid_build(build: &str) -> bool {
    build.len() == 16
        && build
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn hex_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex_val(b[i + 1]), hex_val(b[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// 归一化请求路径：去掉查询串/锚点与首斜杠，拒绝 `..` 与 NUL。
/// 返回 `None` 表示这是非法请求，调用方应直接回 404。
pub fn normalize_request_path(raw: &str) -> Option<String> {
    let no_query = raw.split(['?', '#']).next().unwrap_or("");
    let decoded = percent_decode(no_query).replace('\\', "/");
    if decoded.contains('\0') {
        return None;
    }
    // Windows 盘符段（如 `C:/Users/...`）会使 `Path::join` 因带 prefix 替换基底而逃逸 web 根；
    // NTFS 文件名本身禁止 `:`，合法静态资源不含它，顺带挡住 ADS（`file:stream`）。
    if decoded.contains(':') {
        return None;
    }
    let mut parts: Vec<&str> = Vec::new();
    for seg in decoded.split('/') {
        match seg {
            "" | "." => continue,
            ".." => return None,
            s => parts.push(s),
        }
    }
    Some(parts.join("/"))
}

/// 按序生成候选相对路径：`P` → `P/index.html` → `P.html`
pub fn candidate_paths(rel: &str) -> Vec<String> {
    if rel.is_empty() {
        return vec!["index.html".to_string()];
    }
    vec![
        rel.to_string(),
        format!("{rel}/index.html"),
        format!("{rel}.html"),
    ]
}

/// 解析当前应当服务的磁盘目录。返回 `None` 表示还没有任何可用内容包。
///
/// 正常运行时这里总应命中：首启由 `content_update::ensure_seed` 把内置种子
/// （`bundle.resources` 里的 `seed/`）解包成 `<appData>/web/<build>/` 并写入 active.json。
pub fn current_web_root<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
    let state = read_active(app);
    if !is_valid_build(&state.active) {
        return None;
    }
    let base = web_base(app).ok()?;
    let dir = base.join(&state.active);
    if dir.join("index.html").is_file() {
        Some(dir)
    } else {
        None
    }
}

pub fn web_base<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录: {e}"))?;
    let base = dir.join("web");
    std::fs::create_dir_all(&base).map_err(|e| format!("无法创建 web 目录: {e}"))?;
    Ok(base)
}

pub fn read_active<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> ActiveState {
    let Ok(base) = web_base(app) else {
        return ActiveState::default();
    };
    let file = base.join(ACTIVE_FILE);
    let Ok(raw) = std::fs::read_to_string(file) else {
        return ActiveState::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn active_web_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
    let state = read_active(app);
    if !is_valid_build(&state.active) {
        return None;
    }
    let base = web_base(app).ok()?;
    Some(base.join(state.active))
}

/// active.json 指向的 build 是否真的能用来服务页面。
/// 只有「存在 build 且目录里有 index.html」才算可用。
pub fn active_build_is_usable<R: tauri::Runtime>(app: &tauri::AppHandle<R>, build: &str) -> bool {
    if !is_valid_build(build) {
        return false;
    }
    let Ok(base) = web_base(app) else {
        return false;
    };
    base.join(build).join("index.html").is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_must_be_16_lowercase_hex() {
        assert!(is_valid_build("8c1f0a2b3d4e5f60"));
        assert!(!is_valid_build("8C1F0A2B3D4E5F60")); // 大写不允许
        assert!(!is_valid_build("8c1f0a2b3d4e5f6")); // 长度不足
        assert!(!is_valid_build("../../etc/passw"));
        assert!(!is_valid_build(""));
    }

    #[test]
    fn root_and_query_are_stripped() {
        assert_eq!(normalize_request_path("/").unwrap(), "");
        assert_eq!(normalize_request_path("/about/").unwrap(), "about");
        assert_eq!(
            normalize_request_path("/about/index.html?x=1#top").unwrap(),
            "about/index.html"
        );
    }

    #[test]
    fn traversal_is_rejected() {
        assert!(normalize_request_path("/../secret").is_none());
        assert!(normalize_request_path("/a/../../b").is_none());
        // 编码过的穿越也要挡
        assert!(normalize_request_path("/%2e%2e/secret").is_none());
        assert!(normalize_request_path("/a%5c..%5cb").is_none());
        // Windows 盘符段：绝对形态与含 `:` 的普通段
        assert!(normalize_request_path("/C:/Users/x").is_none());
        assert!(normalize_request_path("/a:b").is_none());
    }

    #[test]
    fn candidates_follow_nuxt_static_layout() {
        assert_eq!(candidate_paths(""), vec!["index.html"]);
        assert_eq!(
            candidate_paths("about"),
            vec!["about", "about/index.html", "about.html"]
        );
        assert_eq!(
            candidate_paths("2026/post"),
            vec!["2026/post", "2026/post/index.html", "2026/post.html"]
        );
    }
}
