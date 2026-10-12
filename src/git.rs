use git2::{build::RepoBuilder, Cred, FetchOptions, PushOptions, RemoteCallbacks, Repository, Signature};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct GitFileStatus { pub path: String, pub status: String }

#[derive(Serialize)]
pub struct GitStatusResult { pub branch: String, pub files: Vec<GitFileStatus>, pub changed: usize }

#[derive(Serialize)]
pub struct RemoteInfo { pub name: String, pub url: String }

fn open(path: &str) -> Result<Repository, String> {
    // Try exact folder first — if it's a repo, use it
    match Repository::open(path) {
        Ok(repo) => return Ok(repo),
        Err(_) => {}
    }
    // Fall back to walking up the tree — handles subfolders of a repo
    Repository::discover(path)
        .map_err(|e| format!("No git repository found at or above {}: {}", path, e))
}

#[tauri::command]
pub fn git_init(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.join(".git").exists() { return Ok(()); }
    Repository::init_opts(p, git2::RepositoryInitOptions::new().initial_head("main"))
        .map_err(|e| format!("Init: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn git_current_branch(path: String) -> Result<String, String> {
    let repo = open(&path)?;
    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from))
        .unwrap_or_else(|| "no repo".to_string());
    Ok(branch)
}

#[tauri::command]
pub fn git_status(path: String) -> Result<GitStatusResult, String> {
    let repo = open(&path)?;
    let branch = repo.head().ok()
        .and_then(|h| h.shorthand().map(String::from))
        .unwrap_or_else(|| "detached".into());

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true).include_ignored(false);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| format!("Status: {e}"))?;

    let mut files = Vec::new();
    for entry in statuses.iter() {
        let p = entry.path().unwrap_or("").to_string();
        let s = entry.status();
        let code = if s.contains(git2::Status::WT_NEW) { "U" }
            else if s.contains(git2::Status::INDEX_NEW) { "A" }
            else if s.contains(git2::Status::WT_DELETED) || s.contains(git2::Status::INDEX_DELETED) { "D" }
            else if s.contains(git2::Status::INDEX_MODIFIED) { "S" }
            else { "M" };
        files.push(GitFileStatus { path: p, status: code.into() });
    }
    let changed = files.len();
    Ok(GitStatusResult { branch, files, changed })
}

#[tauri::command]
pub fn git_stage_all(path: String) -> Result<usize, String> {
    let repo = open(&path)?;
    let mut index = repo.index().map_err(|e| format!("Index: {e}"))?;
    index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
        .map_err(|e| format!("add_all: {e}"))?;

    if let Ok(head) = repo.head() {
        if let Ok(tree) = head.peel_to_tree() {
            let mut to_remove: Vec<String> = Vec::new();
            tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
                if let Some(name) = entry.name() {
                    let full = format!("{root}{name}");
                    if !Path::new(&path).join(&full).exists() { to_remove.push(full); }
                }
                git2::TreeWalkResult::Ok
            }).ok();
            for f in to_remove { let _ = index.remove_path(Path::new(&f)); }
        }
    }
    index.write().map_err(|e| format!("write: {e}"))?;
    Ok(index.len())
}

#[tauri::command]
pub fn git_commit(path: String, message: String, name: String, email: String) -> Result<String, String> {
    let repo = open(&path)?;
    let mut index = repo.index().map_err(|e| format!("Index: {e}"))?;
    let tree_id = index.write_tree().map_err(|e| format!("write_tree: {e}"))?;
    let tree = repo.find_tree(tree_id).map_err(|e| format!("find_tree: {e}"))?;
    let sig = Signature::now(&name, &email).map_err(|e| format!("Signature: {e}"))?;
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    let oid = repo.commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| format!("Commit: {e}"))?;
    Ok(oid.to_string())
}

#[tauri::command]
pub fn git_set_remote(path: String, url: String) -> Result<(), String> {
    let repo = open(&path)?;
    let _ = repo.remote_delete("origin");
    repo.remote("origin", &url).map_err(|e| format!("Remote: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn git_remotes(path: String) -> Result<Vec<RemoteInfo>, String> {
    let repo = open(&path)?;
    let mut out = Vec::new();
    if let Ok(remotes) = repo.remotes() {
        for name in remotes.iter().flatten() {
            if let Ok(r) = repo.find_remote(name) {
                out.push(RemoteInfo { name: name.into(), url: r.url().unwrap_or("").into() });
            }
        }
    }
    Ok(out)
}

fn callbacks(token: Option<String>) -> RemoteCallbacks<'static> {
    let mut cb = RemoteCallbacks::new();
    cb.credentials(move |_u, _us, _a| {
        if let Some(ref t) = token { Cred::userpass_plaintext("git", t) } else { Cred::default() }
    });
    cb
}

fn fetch_opts(token: Option<String>) -> FetchOptions<'static> {
    let mut fo = FetchOptions::new();
    fo.remote_callbacks(callbacks(token));
    fo
}

#[tauri::command]
pub fn git_clone(url: String, target: String, token: Option<String>) -> Result<(), String> {
    let mut builder = RepoBuilder::new();
    builder.fetch_options(fetch_opts(token));
    builder.clone(&url, Path::new(&target)).map_err(|e| format!("Clone: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn git_fetch(path: String, token: Option<String>) -> Result<(), String> {
    let repo = open(&path)?;
    let mut remote = repo.find_remote("origin").map_err(|e| format!("Remote: {e}"))?;
    let mut fo = fetch_opts(token);
    remote.fetch(&[] as &[&str], Some(&mut fo), None).map_err(|e| format!("Fetch: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn git_pull(path: String, token: Option<String>) -> Result<(), String> {
    git_fetch(path.clone(), token)?;
    let repo = open(&path)?;
    let head = repo.head().map_err(|e| format!("HEAD: {e}"))?;
    let branch = head.shorthand().unwrap_or("main").to_string();
    let fetch_head = repo
        .find_reference("FETCH_HEAD")
        .map_err(|e| format!("FETCH_HEAD: {e}"))?;
    let fetch_commit = repo
        .reference_to_annotated_commit(&fetch_head)
        .map_err(|e| format!("annotated: {e}"))?;
    let (analysis, _) = repo
        .merge_analysis(&[&fetch_commit])
        .map_err(|e| format!("analysis: {e}"))?;

    if analysis.is_fast_forward() {
        let refname = format!("refs/heads/{branch}");
        let mut r = repo
            .find_reference(&refname)
            .map_err(|e| format!("find_reference({refname}): {e}"))?;
        r.set_target(fetch_commit.id(), "Fast-forward")
            .map_err(|e| format!("set_target: {e}"))?;
        repo.set_head(&refname)
            .map_err(|e| format!("set_head: {e}"))?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .map_err(|e| format!("checkout: {e}"))?;
        Ok(())
    } else if analysis.is_up_to_date() {
        Ok(())
    } else {
        Err("Local branch has diverged from remote — merge or rebase required".into())
    }
}

#[tauri::command]
pub fn git_push(path: String, token: Option<String>) -> Result<(), String> {
    let repo = open(&path)?;
    let mut remote = repo.find_remote("origin").map_err(|e| format!("Remote: {e}"))?;
    let head = repo.head().map_err(|e| format!("HEAD: {e}"))?;
    let branch = head.shorthand().unwrap_or("main").to_string();
    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    let mut cb = RemoteCallbacks::new();
    cb.credentials(move |_u, _us, _a| {
        if let Some(ref t) = token { Cred::userpass_plaintext("git", t) } else { Cred::default() }
    });
    let mut po = PushOptions::new();
    po.remote_callbacks(cb);
    remote.push(&[&refspec], Some(&mut po)).map_err(|e| format!("Push: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn git_list_branches(path: String) -> Result<Vec<String>, String> {
    let repo = open(&path)?;
    let branches = repo.branches(Some(git2::BranchType::Local)).map_err(|e| format!("branches: {e}"))?;
    let mut out = Vec::new();
    for b in branches.flatten() {
        if let Some(name) = b.0.name().ok().flatten() { out.push(name.into()); }
    }
    Ok(out)
}

#[tauri::command]
pub fn git_checkout(path: String, branch: String) -> Result<(), String> {
    let repo = open(&path)?;
    let refname = format!("refs/heads/{branch}");
    let obj = repo.revparse_single(&refname).map_err(|e| format!("revparse: {e}"))?;
    repo.checkout_tree(&obj, None).map_err(|e| format!("checkout_tree: {e}"))?;
    repo.set_head(&refname).map_err(|e| format!("set_head: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn git_diff(path: String, staged: bool, file: Option<String>) -> Result<String, String> {
    let repo = open(&path)?;
    let mut opts = git2::DiffOptions::new();
    if let Some(f) = &file {
        opts.pathspec(f);
    }
    opts.context_lines(3);

    let diff = if staged {
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))
    } else {
        repo.diff_index_to_workdir(None, Some(&mut opts))
    }.map_err(|e| format!("Diff: {e}"))?;

    let mut out = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        let prefix = match origin {
            '+' | '-' | ' ' => format!("{}", origin),
            '=' | '>' | '<' => format!("{}", origin),
            _ => String::new(),
        };
        out.push_str(&prefix);
        out.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    }).map_err(|e| format!("Diff print: {e}"))?;

    if out.is_empty() {
        out.push_str("(no changes)");
    }
    Ok(out)
}

#[tauri::command]
pub fn git_diff_stats(path: String) -> Result<Vec<(String, usize, usize)>, String> {
    let repo = open(&path)?;
    let diff = repo
        .diff_index_to_workdir(None, None)
        .map_err(|e| format!("Diff: {e}"))?;

    let mut out = Vec::new();
    for (idx, delta) in diff.deltas().enumerate() {
        let p = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let (mut ins, mut del) = (0usize, 0usize);
        if let Ok(Some(patch)) = git2::Patch::from_diff(&diff, idx) {
            if let Ok((_, additions, deletions)) = patch.line_stats() {
                ins = additions;
                del = deletions;
            }
        }
        out.push((p, ins, del));
    }
    Ok(out)
}

#[tauri::command]
pub fn git_diff_last(path: String) -> Result<String, String> {
    let repo = open(&path)?;
    let head = repo.head().map_err(|e| format!("No commits yet: {e}"))?;
    let head_commit = head.peel_to_commit().map_err(|e| format!("HEAD commit: {e}"))?;
    let head_tree = head_commit.tree().map_err(|e| format!("HEAD tree: {e}"))?;

    let parent_tree = match head_commit.parent(0) {
        Ok(parent) => Some(parent.tree().map_err(|e| format!("Parent tree: {e}"))?),
        Err(_) => None,
    };

    let mut opts = git2::DiffOptions::new();
    opts.context_lines(3);

    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&head_tree), Some(&mut opts))
        .map_err(|e| format!("Diff: {e}"))?;

    let mut out = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        let prefix = match origin {
            '+' | '-' | ' ' => format!("{}", origin),
            '=' | '>' | '<' => format!("{}", origin),
            _ => String::new(),
        };
        out.push_str(&prefix);
        out.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    })
    .map_err(|e| format!("Diff print: {e}"))?;

    if out.is_empty() {
        out.push_str("(no changes)");
    }
    Ok(out)
}