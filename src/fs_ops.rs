use base64::Engine;
use once_cell::sync::Lazy;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Serialize)]
pub struct SearchHit {
    pub path: String,
    pub line: usize,
    pub text: String,
}

/* ═══════════════════════════════════════════════════════════════
   WORKSPACE ROOT — restricts all fs operations to one folder
   ═══════════════════════════════════════════════════════════════ */

static WORKSPACE_ROOT: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

#[tauri::command]
pub fn set_workspace_root(path: Option<String>) -> Result<(), String> {
    let mut guard = WORKSPACE_ROOT
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    match path {
        Some(p) if !p.is_empty() => {
            let canon = Path::new(&p)
                .canonicalize()
                .map_err(|e| format!("Canonicalize: {e}"))?;
            if !canon.is_dir() {
                return Err(format!("Not a directory: {p}"));
            }
            *guard = Some(canon);
        }
        _ => {
            *guard = None;
        }
    }
    Ok(())
}

/// Rejects any path that is not (or would not be) inside the workspace.
/// When no workspace is set, allows everything.
pub(crate) fn check_in_workspace(path: &str) -> Result<(), String> {
    let guard = WORKSPACE_ROOT
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    let Some(ref root) = *guard else {
        return Ok(());
    };

    let p = Path::new(path);
    // Walk up to the nearest existing ancestor so we can canonicalize
    // paths to files/folders that don't exist yet (write, create_dir).
    let mut cur: &Path = p;
    while !cur.exists() {
        cur = cur
            .parent()
            .ok_or_else(|| format!("Path has no existing ancestor: {path}"))?;
    }
    let canon = cur
        .canonicalize()
        .map_err(|e| format!("Canonicalize: {e}"))?;
    if !canon.starts_with(root) {
        return Err(format!("Path outside workspace: {path}"));
    }
    Ok(())
}

/* ═══════════════════════════════════════════════════════════════
   FILE OPS
   ═══════════════════════════════════════════════════════════════ */

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    check_in_workspace(&path)?;
    std::fs::read_to_string(&path).map_err(|e| format!("Read failed: {e}"))
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    check_in_workspace(&path)?;
    if let Some(parent) = Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, content).map_err(|e| format!("Write failed: {e}"))
}

#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    check_in_workspace(&path)?;
    let p = Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| format!("Delete failed: {e}"))
    } else {
        std::fs::remove_file(p).map_err(|e| format!("Delete failed: {e}"))
    }
}

#[tauri::command]
pub fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    check_in_workspace(&old_path)?;
    check_in_workspace(&new_path)?;
    if let Some(parent) = Path::new(&new_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::rename(&old_path, &new_path).map_err(|e| format!("Rename failed: {e}"))
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    check_in_workspace(&path)?;
    std::fs::create_dir_all(&path).map_err(|e| format!("Create dir failed: {e}"))
}

/// Robust version: never aborts the whole walk on a single bad folder.
/// Emits both folder entries (is_dir = true) and file entries, so that
/// empty folders show up in the tree.
#[tauri::command]
pub fn list_dir(root: String) -> Result<Vec<FileEntry>, String> {
    check_in_workspace(&root)?;
    let base = PathBuf::from(&root);
    if !base.exists() {
        return Err(format!("Folder does not exist: {root}"));
    }
    if !base.is_dir() {
        return Err(format!("Not a folder: {root}"));
    }
    let mut out = Vec::new();
    walk(&base, &base, &mut out, 0);
    Ok(out)
}

fn walk(root: &Path, cur: &Path, out: &mut Vec<FileEntry>, depth: usize) {
    if depth > 24 {
        return;
    }
    let entries = match std::fs::read_dir(cur) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            if name == ".git"
                || name == "node_modules"
                || name == "target"
                || name == "dist"
                || name.starts_with('.')
            {
                continue;
            }
            // Emit the folder itself so empty folders are visible in the
            // tree. Files inside will follow as separate entries.
            let rel = path
                .strip_prefix(root)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| name.clone());
            out.push(FileEntry {
                name: name.clone(),
                path: rel,
                is_dir: true,
                size: 0,
            });
            walk(root, &path, out, depth + 1);
        } else if file_type.is_file() {
            let ext = path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            if matches!(ext.as_str(), "md" | "markdown" | "txt") {
                let rel = path
                    .strip_prefix(root)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| name.clone());
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                out.push(FileEntry {
                    name,
                    path: rel,
                    is_dir: false,
                    size,
                });
            }
        }
    }
}

#[tauri::command]
pub fn search_in_files(
    root: String,
    query: String,
    regex: bool,
    case_sensitive: bool,
) -> Result<Vec<SearchHit>, String> {
    check_in_workspace(&root)?;
    let mut hits = Vec::new();
    if query.is_empty() {
        return Ok(hits);
    }

    let matcher: Box<dyn Fn(&str) -> bool> = if regex {
        let mut pattern = String::new();
        if !case_sensitive {
            pattern.push_str("(?i)");
        }
        pattern.push_str(&query);
        match regex::Regex::new(&pattern) {
            Ok(re) => Box::new(move |s: &str| re.is_match(s)),
            Err(e) => return Err(format!("Regex error: {e}")),
        }
    } else if case_sensitive {
        let q = query.clone();
        Box::new(move |s: &str| s.contains(&q))
    } else {
        let q = query.to_lowercase();
        Box::new(move |s: &str| s.to_lowercase().contains(&q))
    };

    let base = Path::new(&root);
    if !base.exists() {
        return Err(format!("Folder does not exist: {root}"));
    }
    let mut stack = vec![base.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                if name == ".git"
                    || name == "node_modules"
                    || name == "target"
                    || name.starts_with('.')
                {
                    continue;
                }
                stack.push(path);
            } else if file_type.is_file() {
                let ext = path
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if !matches!(ext.as_str(), "md" | "markdown" | "txt") {
                    continue;
                }
                let Ok(content) = std::fs::read_to_string(&path) else {
                    continue;
                };
                let rel = path
                    .strip_prefix(base)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| name.clone());
                for (i, line) in content.lines().enumerate() {
                    if matcher(line) {
                        hits.push(SearchHit {
                            path: rel.clone(),
                            line: i + 1,
                            text: line.to_string(),
                        });
                        if hits.len() >= 500 {
                            return Ok(hits);
                        }
                    }
                }
            }
        }
    }
    Ok(hits)
}

#[tauri::command]
pub fn image_to_data_url(path: String) -> Result<String, String> {
    check_in_workspace(&path)?;
    let bytes = std::fs::read(&path).map_err(|e| format!("Read failed: {e}"))?;
    let ext = Path::new(&path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}