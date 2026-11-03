use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

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
