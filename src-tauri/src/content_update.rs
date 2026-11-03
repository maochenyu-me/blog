use crate::webroot::{is_valid_build, read_active, web_base, ActiveState, ACTIVE_FILE};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{BufReader, Read, Write};
use std::path::Path;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const MAX_ARCHIVE_BYTES: u64 = 200 * 1024 * 1024;
const MAX_EXTRACTED_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveInfo {
    pub name: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub schema: u32,
    pub build: String,
    pub generated_at: String,
    pub file_count: u64,
    pub total_bytes: u64,
    pub archive: ArchiveInfo,
    pub files: BTreeMap<String, String>,
}

fn emit_progress<R: Runtime>(app: &AppHandle<R>, phase: &str, received: u64, total: u64) {
    let _ = app.emit(
        "content://progress",
        serde_json::json!({ "phase": phase, "received": received, "total": total }),
    );
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .user_agent("meowlo-app/0.1.0")
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败: {e}"))
}

pub fn fetch_manifest(manifest_url: &str) -> Result<Manifest, String> {
    let client = http_client()?;
    let resp = client
        .get(manifest_url)
        .send()
        .map_err(|e| format!("网络请求失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("服务端返回 {}", resp.status()));
    }
    let manifest: Manifest = resp
        .json()
        .map_err(|e| format!("清单解析失败: {e}"))?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

pub fn validate_manifest(m: &Manifest) -> Result<(), String> {
    if m.schema != 1 {
        return Err(format!("不支持的清单版本: {}", m.schema));
    }
    if !is_valid_build(&m.build) {
        return Err(format!("非法 build 标识: {}", m.build));
    }
    if m.archive.sha256.len() != 64 || !m.archive.sha256.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("压缩包 sha256 格式非法".into());
    }
    if m.archive.bytes == 0 || m.archive.bytes > MAX_ARCHIVE_BYTES {
        return Err("压缩包体积超出允许范围".into());
    }
    if m.files.is_empty() {
        return Err("清单未包含任何文件".into());
    }
    if !m.files.contains_key("index.html") {
        return Err("清单缺少 index.html".into());
    }
    for (rel, hash) in &m.files {
        if rel.starts_with('/') || rel.split('/').any(|s| s == "..") || rel.contains('\\') {
            return Err(format!("清单包含非法路径: {rel}"));
        }
        if hash.len() != 64 {
            return Err(format!("文件 {rel} 的哈希格式非法"));
        }
    }
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("读取失败: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn download_archive<R: Runtime>(
    app: &AppHandle<R>,
    url: &str,
    dest: &Path,
    expected_sha256: &str,
    expected_bytes: u64,
) -> Result<(), String> {
    let client = http_client()?;
    let mut resp = client
        .get(url)
        .send()
        .map_err(|e| format!("下载失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载返回 {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(expected_bytes);
    let mut file = File::create(dest).map_err(|e| format!("创建临时文件失败: {e}"))?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = resp.read(&mut buf).map_err(|e| format!("读取响应失败: {e}"))?;
        if n == 0 {
            break;
        }
        received += n as u64;
        if received > MAX_ARCHIVE_BYTES {
            return Err("压缩包超过体积上限".into());
        }
        hasher.update(&buf[..n]);
        file.write_all(&buf[..n])
            .map_err(|e| format!("写入失败: {e}"))?;
        emit_progress(app, "download", received, total.max(received));
    }
    file.flush().map_err(|e| format!("落盘失败: {e}"))?;
    let actual = format!("{:x}", hasher.finalize());
    if actual != expected_sha256 {
        return Err("压缩包校验失败（哈希不匹配）".into());
    }
    Ok(())
}

fn extract_archive(dest: &Path, archive: &Path, allowed: &BTreeMap<String, String>) -> Result<u64, String> {
    let file = File::open(archive).map_err(|e| format!("打开压缩包失败: {e}"))?;
    let decoder = flate2::read::GzDecoder::new(BufReader::new(file));
    let mut tar = tar::Archive::new(decoder);
    let mut total: u64 = 0;
    for entry in tar.entries().map_err(|e| format!("读取归档失败: {e}"))? {
        let mut entry = entry.map_err(|e| format!("读取条目失败: {e}"))?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let raw = entry.path().map_err(|e| format!("条目路径非法: {e}"))?;
        let rel = raw.to_string_lossy().replace('\\', "/");
        let rel = rel.trim_start_matches("./");
        // 白名单：只解压清单里声明的文件，其余一律丢弃（最强的穿越防护）
        if !allowed.contains_key(rel) {
            continue;
        }
        total += entry.size();
        if total > MAX_EXTRACTED_BYTES {
            return Err("解压后体积超过上限".into());
        }
        let out = dest.join(rel);
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
        entry
            .unpack(&out)
            .map_err(|e| format!("解压 {rel} 失败: {e}"))?;
    }
    Ok(total)
}

fn verify_extracted(dir: &Path, files: &BTreeMap<String, String>) -> Result<(), String> {
    for (rel, expected) in files {
        let path = dir.join(rel);
        if !path.is_file() {
            return Err(format!("缺少文件: {rel}"));
        }
        let actual = sha256_file(&path)?;
        if &actual != expected {
            return Err(format!("文件校验失败: {rel}"));
        }
    }
    Ok(())
}

fn write_active<R: Runtime>(app: &AppHandle<R>, active: &str, previous: Option<String>) -> Result<(), String> {
    let base = web_base(app)?;
    let state = ActiveState {
        active: active.to_string(),
        previous,
    };
    let tmp = base.join(format!("{ACTIVE_FILE}.tmp"));
    let body = serde_json::to_vec(&state).map_err(|e| format!("序列化失败: {e}"))?;
    fs::write(&tmp, body).map_err(|e| format!("写入状态失败: {e}"))?;
    fs::rename(&tmp, base.join(ACTIVE_FILE)).map_err(|e| format!("提交状态失败: {e}"))?;
    Ok(())
}

pub fn install<R: Runtime>(app: &AppHandle<R>, manifest_url: &str) -> Result<String, String> {
    let manifest = fetch_manifest(manifest_url)?;
    let base = web_base(app)?;
    let target = base.join(&manifest.build);

    if target.join("index.html").is_file() {
        return Ok(manifest.build);
    }

    let tmp = base.join(format!("{}.tmp", manifest.build));
    if tmp.exists() {
        fs::remove_dir_all(&tmp).map_err(|e| format!("清理临时目录失败: {e}"))?;
    }
    fs::create_dir_all(&tmp).map_err(|e| format!("创建临时目录失败: {e}"))?;

    // 注意：archive 的 URL 由 manifestUrl 同目录推导，保证单一来源
    let archive_url = match manifest_url.rsplit_once('/') {
        Some((dir, _)) => format!("{dir}/{}", manifest.archive.name),
        None => return Err("清单地址非法".into()),
    };
    let archive_path = tmp.join("content.tar.gz");
    if let Err(e) = download_archive(app, &archive_url, &archive_path, &manifest.archive.sha256, manifest.archive.bytes) {
        let _ = fs::remove_dir_all(&tmp);
        return Err(e);
    }

    emit_progress(app, "extract", 0, manifest.file_count);
    if let Err(e) = extract_archive(&tmp, &archive_path, &manifest.files) {
        let _ = fs::remove_dir_all(&tmp);
        return Err(e);
    }
    let _ = fs::remove_file(&archive_path);

    if let Err(e) = verify_extracted(&tmp, &manifest.files) {
        let _ = fs::remove_dir_all(&tmp);
        return Err(e);
    }

    if target.exists() {
        fs::remove_dir_all(&target).map_err(|e| format!("覆盖旧版本失败: {e}"))?;
    }
    fs::rename(&tmp, &target).map_err(|e| format!("切换版本失败: {e}"))?;

    let prev = read_active(app);
    let previous = if prev.active.is_empty() || prev.active == manifest.build {
        prev.previous
    } else {
        Some(prev.active)
    };
    write_active(app, &manifest.build, previous)?;
    Ok(manifest.build)
}

pub fn rollback<R: Runtime>(app: &AppHandle<R>) -> Result<String, String> {
    let state = read_active(app);
    let Some(prev) = state.previous.clone() else {
        return Err("没有可回滚的上一版本".into());
    };
    if !is_valid_build(&prev) {
        return Err("上一版本标识非法".into());
    }
    let base = web_base(app)?;
    let dir = base.join(&prev);
    if !dir.join("index.html").is_file() {
        return Err("上一版本文件已不存在".into());
    }
    write_active(app, &prev, Some(state.active))?;
    Ok(prev)
}

/// 首启/内容缺失时，把 `bundle.resources` 里的内置种子解包成可用的 web 根。
///
/// 种子包与网络更新包**格式完全相同**，因此这条路径同时也验证了更新机制的
/// 校验、解包与原子切换；一旦这里通了，`install` 的正确性也基本有了保障。
pub fn ensure_seed<R: Runtime>(app: &AppHandle<R>) -> Result<Option<String>, String> {
    let state = read_active(app);
    if !state.active.is_empty() && crate::webroot::active_build_is_usable(app, &state.active) {
        return Ok(None);
    }

    let manifest_path = app
        .path()
        .resolve("seed/manifest.json", BaseDirectory::Resource)
        .map_err(|e| format!("找不到内置清单: {e}"))?;
    let raw = fs::read_to_string(&manifest_path).map_err(|e| format!("读取内置清单失败: {e}"))?;
    let manifest: Manifest =
        serde_json::from_str(&raw).map_err(|e| format!("内置清单解析失败: {e}"))?;
    validate_manifest(&manifest)?;

    let base = web_base(app)?;
    let target = base.join(&manifest.build);
    if target.join("index.html").is_file() {
        write_active(app, &manifest.build, None)?;
        return Ok(Some(manifest.build));
    }

    let tmp = base.join(format!("{}.tmp", manifest.build));
    if tmp.exists() {
        fs::remove_dir_all(&tmp).map_err(|e| format!("清理临时目录失败: {e}"))?;
    }
    fs::create_dir_all(&tmp).map_err(|e| format!("创建临时目录失败: {e}"))?;

    let archive = app
        .path()
        .resolve("seed/content.tar.gz", BaseDirectory::Resource)
        .map_err(|e| format!("找不到内置压缩包: {e}"))?;

    if let Err(e) = extract_archive(&tmp, &archive, &manifest.files) {
        let _ = fs::remove_dir_all(&tmp);
        return Err(e);
    }
    if let Err(e) = verify_extracted(&tmp, &manifest.files) {
        let _ = fs::remove_dir_all(&tmp);
        return Err(e);
    }
    if target.exists() {
        fs::remove_dir_all(&target).map_err(|e| format!("覆盖旧目录失败: {e}"))?;
    }
    fs::rename(&tmp, &target).map_err(|e| format!("切换失败: {e}"))?;
    write_active(app, &manifest.build, None)?;
    Ok(Some(manifest.build))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Manifest {
        let mut files = BTreeMap::new();
        files.insert("index.html".to_string(), "a".repeat(64));
        Manifest {
            schema: 1,
            build: "8c1f0a2b3d4e5f60".into(),
            generated_at: "2026-11-03T00:00:00Z".into(),
            file_count: 1,
            total_bytes: 10,
            archive: ArchiveInfo {
                name: "content.tar.gz".into(),
                bytes: 100,
                sha256: "b".repeat(64),
            },
            files,
        }
    }

    #[test]
    fn accepts_well_formed_manifest() {
        assert!(validate_manifest(&sample()).is_ok());
    }

    #[test]
    fn rejects_traversal_in_file_list() {
        let mut m = sample();
        m.files.insert("../evil".into(), "c".repeat(64));
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn rejects_missing_index() {
        let mut m = sample();
        m.files.clear();
        assert!(validate_manifest(&m).is_err());
    }

    #[test]
    fn rejects_uppercase_build() {
        let mut m = sample();
        m.build = "8C1F0A2B3D4E5F60".into();
        assert!(validate_manifest(&m).is_err());
    }
}
