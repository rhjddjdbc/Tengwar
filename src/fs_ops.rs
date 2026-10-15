use base64::Engine;
use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashMap;
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
        _ => { *guard = None; }
    }
    Ok(())
}

pub(crate) fn check_in_workspace(path: &str) -> Result<(), String> {
    let guard = WORKSPACE_ROOT
        .lock()
        .map_err(|_| "workspace lock poisoned".to_string())?;
    let Some(ref root) = *guard else { return Ok(()); };

    let p = Path::new(path);
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

#[tauri::command]
pub fn list_dir(root: String) -> Result<Vec<FileEntry>, String> {
    check_in_workspace(&root)?;
    let base = PathBuf::from(&root);
    if !base.exists() { return Err(format!("Folder does not exist: {root}")); }
    if !base.is_dir() { return Err(format!("Not a folder: {root}")); }
    let mut out = Vec::new();
    walk(&base, &base, &mut out, 0);
    Ok(out)
}

fn walk(root: &Path, cur: &Path, out: &mut Vec<FileEntry>, depth: usize) {
    if depth > 24 { return; }
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
            // `.template` is included so vault-local templates show up
            // in `allFiles`. The frontend filters them by path prefix
            // (`templates/`) and by extension when building the
            // template cache; the file tree shows them like any other
            // file, which is what you want — they're editable.
            if matches!(ext.as_str(), "md" | "markdown" | "txt" | "template") {
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
    if query.is_empty() { return Ok(hits); }

    let matcher: Box<dyn Fn(&str) -> bool> = if regex {
        let mut pattern = String::new();
        if !case_sensitive { pattern.push_str("(?i)"); }
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
    if !base.exists() { return Err(format!("Folder does not exist: {root}")); }
    let mut stack = vec![base.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(file_type) = entry.file_type() else { continue };
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
                let Ok(content) = std::fs::read_to_string(&path) else { continue };
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
                        if hits.len() >= 500 { return Ok(hits); }
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

/* ═══════════════════════════════════════════════════════════════
   BACKLINKS
   ═══════════════════════════════════════════════════════════════ */

#[derive(Serialize)]
pub struct BacklinkEntry {
    pub path: String,
    pub name: String,
    pub line: usize,
    pub text: String,
}

/// Walk the workspace and find every file that links to `target`.
/// `target` is the relative path of the file we want backlinks for,
/// e.g. `notes/Big O Notation.md`. Matching follows the same rules
/// as the frontend's `resolveWikiTarget`.
#[tauri::command]
pub fn find_backlinks(root: String, target: String) -> Result<Vec<BacklinkEntry>, String> {
    check_in_workspace(&root)?;
    let base = Path::new(&root);
    if !base.is_dir() {
        return Err(format!("Not a folder: {root}"));
    }

    // Collect all markdown files and build a lookup so we can resolve
    // wikilink targets the same way the graph does.
    let mut files: Vec<(String, String)> = Vec::new(); // (rel_path, name)
    let mut stack = vec![base.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(file_type) = entry.file_type() else { continue };
            if file_type.is_dir() {
                if name == ".git"
                    || name == "node_modules"
                    || name == "target"
                    || name == "dist"
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
                if matches!(ext.as_str(), "md" | "markdown") {
                    let rel = path
                        .strip_prefix(base)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| name.clone());
                    files.push((rel, name));
                }
            }
        }
    }

    // Lookup tables: stem (filename without .md), full rel path, and
    // rel path without extension — all lowercased for case-insensitive
    // matching.
    let mut by_name: HashMap<String, String> = HashMap::new();
    for (rel, name) in &files {
        let stem = Path::new(name)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| name.clone());
        by_name.insert(stem.to_lowercase(), rel.clone());
        by_name.insert(rel.to_lowercase(), rel.clone());
        let without_ext = rel
            .trim_end_matches(".md")
            .trim_end_matches(".markdown");
        by_name.insert(without_ext.to_lowercase(), rel.clone());
    }

    let target_norm = target.to_lowercase();
    let mut out = Vec::new();

    for (rel, name) in &files {
        if rel == &target {
            continue; // skip self-links
        }
        let full_path = base.join(rel);
        let Ok(content) = std::fs::read_to_string(&full_path) else { continue };

        for (i, line) in content.lines().enumerate() {
            if !line.contains("[[") {
                continue;
            }
            let targets = extract_wikilink_targets(line);
            for target_str in targets {
                if resolve_target(&target_str, &by_name, &target_norm) {
                    out.push(BacklinkEntry {
                        path: rel.clone(),
                        name: name.clone(),
                        line: i + 1,
                        text: line.to_string(),
                    });
                    break; // one hit per line is enough
                }
            }
        }
    }

    Ok(out)
}

fn extract_wikilink_targets(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0;
    while i + 1 < chars.len() {
        if chars[i] == '[' && chars[i + 1] == '[' {
            let mut j = i + 2;
            let mut buf = String::new();
            let mut closed = false;
            while j < chars.len() {
                if j + 1 < chars.len() && chars[j] == ']' && chars[j + 1] == ']' {
                    closed = true;
                    break;
                }
                if chars[j] == '\n' {
                    break;
                }
                buf.push(chars[j]);
                j += 1;
            }
            if closed {
                let target = buf.split('|').next().unwrap_or("").trim().to_string();
                if !target.is_empty() {
                    out.push(target);
                }
                i = j + 2;
                continue;
            }
        }
        i += 1;
    }
    out
}

fn resolve_target(
    target: &str,
    by_name: &HashMap<String, String>,
    wanted: &str,
) -> bool {
    let t = target.to_lowercase();
    if t == *wanted {
        return true;
    }
    if let Some(rel) = by_name.get(&t) {
        if rel.to_lowercase() == *wanted {
            return true;
        }
    }
    let with_ext = format!("{t}.md");
    if let Some(rel) = by_name.get(&with_ext) {
        if rel.to_lowercase() == *wanted {
            return true;
        }
    }
    false
}

/* ═══════════════════════════════════════════════════════════════
   ABSOLUTE-PATH I/O — templates and journal

   These commands deliberately bypass `check_in_workspace`. Their
   whole purpose is to read/write files outside the open vault:
   a global templates folder and a global journal folder, both
   picked by the user through a native dialog.

   Since the paths come from the OS picker (not from arbitrary
   input), and the app is offline / single-user, this is the same
   trust level as the file-tree operations — just without the
   workspace confinement, which would defeat the feature.
   ═══════════════════════════════════════════════════════════════ */

#[derive(Serialize)]
pub struct AbsFileEntry {
    pub name: String,
    pub path: String,
}

#[tauri::command]
pub fn list_md_files_abs(root: String) -> Result<Vec<AbsFileEntry>, String> {
    let base = Path::new(&root);
    if !base.is_dir() {
        return Err(format!("Not a folder: {root}"));
    }
    let mut out = Vec::new();
    let entries = std::fs::read_dir(base)
        .map_err(|e| format!("Read dir: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(ft) = entry.file_type() else { continue };
        if !ft.is_file() { continue; }
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !matches!(ext.as_str(), "md" | "markdown" | "txt") {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        out.push(AbsFileEntry {
            name,
            path: path.to_string_lossy().to_string(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub fn read_text_file_abs(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Read failed: {e}"))
}

#[tauri::command]
pub fn write_text_file_abs(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create_dir_all: {e}"))?;
    }
    std::fs::write(&path, content).map_err(|e| format!("Write failed: {e}"))
}