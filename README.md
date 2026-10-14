# Tengwar

**A native Markdown editor with diagrams, LaTeX, Git, and Vim — built on Rust + Tauri.**

Tengwar renders 19 diagram types directly in Rust (no Mermaid.js, no headless browser), typesets LaTeX via MathML, integrates Git through libgit2, and ships a real Vim state machine. Everything runs offline, everything fits in one binary.

> _Named after the Elvish writing system from Tolkien's legendarium — because your notes deserve a script of their own._

---

## Features

### Editing
- **Tabs** with unsaved-change indicators, `Ctrl+W` / `Ctrl+Tab` navigation
- **Vim mode** with Normal / Insert / Visual, counts, undo/redo, `:s/old/new/g`, marks and yank buffer
- **Auto-save** (toggle) with atomic writes
- **Auto-pairing** for brackets, quotes, backticks, asterisks
- **Find & replace** with regex and case-sensitivity
- **Fuzzy find** across files (`Ctrl+P`) and inside the current file (`Ctrl+F`)
- **Search in all files** (`Ctrl+Alt+F`) with grouped results and line numbers
- **Command palette** (`Ctrl+Shift+K`) covering every action, including format helpers
- **Crash recovery** — unsaved buffers come back after a restart

### Preview
- **Live Markdown preview** with scroll-sync (per-origin tracking to avoid feedback loops)
- **LaTeX** — inline `$E = mc^2$` and display `$$ … $$` via native MathML
- **Task lists** that are clickable and mutate the source
- **Wikilinks** — `[[Target]]` and `[[Target|Display]]` resolve against the open folder, broken links are flagged
- **Local images** embedded as data URLs, so the preview works without a web server
- **Zoom** controls — `−`, `100%`, `+`, and Fit-to-width

### Diagrams (19 types)
Rendered in-process to SVG. No external dependencies at runtime.

| Family | Types |
|--------|-------|
| UML | `classDiagram`, `sequenceDiagram`, `stateDiagram-v2` |
| Data | `erDiagram`, `requirementDiagram` |
| Flow | `flowchart`, `graph`, `block-beta`, `packet-beta` |
| Charts | `pie`, `xychart-beta`, `quadrantChart`, `sankey-beta` |
| Planning | `gantt`, `timeline`, `journey`, `kanban` |
| Architecture | `C4Context`, `mindmap`, `gitGraph` |

Hover any diagram for **SVG / PNG** download buttons. Diagram colors follow the app theme through CSS variables, so exported SVGs still look right in a browser.

### Git
- **Status** indicators per file in the sidebar (M / A / D / U / S)
- **Stage all + commit** from the sidebar
- **Fetch / pull / push** against `origin`
- **Branch list + checkout**
- **Diff viewer** with unstaged / staged toggle
- **Clone** and **init** buttons
- **HTTPS token** stored in `sessionStorage` (never written to disk)

### Appearance
- **Light / dark** preview themes
- **8 built-in presets** — Default, Solarized, Nord, Gruvbox, Dracula, Monokai, Tokyo Night, Catppuccin
- **Theme editor** with live preview — edit app, syntax, diagram, and diagram-box colors independently for light and dark modes
- **Theme export/import** as JSON
- **Keybinding editor** — every shortcut is rebindable, conflicts are flagged
- **Layout controls** — split direction, pane swap, focus editor / focus preview, reset

### Link graph
Force-directed graph of every `.md` file in the open folder, with edges for each wikilink. Drag to reposition, scroll to zoom, double-click to open.

---
## Installation

### Arch Linux

A `PKGBUILD` is included in the repository root. Since it uses a `git+` source, you don't need to clone the full repository — just fetch the `PKGBUILD` and let `makepkg` pull the tagged release:

```bash
curl -O https://raw.githubusercontent.com/rhjddjdbc/tengwar/main/PKGBUILD
makepkg -si
```

`makepkg` clones the tagged release from GitHub, builds it, and installs it through pacman. `pacman -Q tengwar` tracks the install and `pacman -R tengwar` removes it cleanly.

### Windows

Requirements:
- [Rust toolchain](https://rustup.rs/) — install with default settings (target `x86_64-pc-windows-msvc`)
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — include the **Desktop development with C++** workload
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) — preinstalled on Windows 11 and recent Windows 10, otherwise install the Evergreen Bootstrapper
- A C toolchain in `PATH` (comes with the MSVC build tools)

Clone and build:

```powershell
git clone https://github.com/rhjddjdbc/tengwar.git
cd tengwar
cargo build --release
```

The binary lands at `target\release\tengwar.exe`. Double-click it, or run from PowerShell:

```powershell
.\target\release\tengwar.exe
```

To install system-wide, copy `tengwar.exe` anywhere on your `PATH`. There's no installer or Start Menu entry yet — right-click the `.exe` and choose **Send to → Desktop (create shortcut)** if you want one.

**Known limitation on Windows:** Git push / pull requires a GitHub Personal Access Token, set via the 🔑 button in the sidebar. OAuth is not implemented.

### From source (any Linux distribution)

Requirements:
- Rust 1.77+
- A C toolchain (`cc`)
- `webkit2gtk-4.1`, `libgtk-3-dev`, `libssl-dev`, `libayatana-appindicator3-dev` (or the equivalents for your distro)
- `sudo` for the system-wide install step

```bash
git clone https://github.com/rhjddjdbc/tengwar.git
cd tengwar
./build.sh
```

`build.sh` compiles the release binary, installs it to `/usr/local/bin/tengwar`, drops a `.desktop` file into `/usr/share/applications`, installs the icon, and refreshes the desktop + icon caches.

Launch it with:

```bash
tengwar
```

Or find it in your application menu under **Development**.

### Manual build

If you'd rather not run the install script:

```bash
cargo build --release
./target/release/tengwar
```

The binary is self-contained — no runtime dependencies beyond the GTK stack that Tauri already links against.

---

## Usage

1. **Open Folder** — pick a directory containing your `.md` files. Tengwar walks it recursively, skipping `.git`, `node_modules`, `target`, `dist`, and dotfiles.
2. **Click any file** in the sidebar — it opens as a tab.
3. **Start typing.** Preview updates as you go. Auto-save is opt-in.
4. **Drag the divider** between editor and preview to resize. Double-click it to reset.
5. **Hover a diagram** to reveal SVG / PNG download buttons.

The session (folder, open tabs, active tab, zoom) persists across restarts via `localStorage`.

---

## Keyboard shortcuts

Every shortcut below is rebindable from **Settings → Keyboard shortcuts…**.

### File

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+N` | New file |
| `Ctrl+O` | Open folder |
| `Ctrl+Alt+P` | Print / PDF |

### Edit

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Fuzzy-find files |
| `Ctrl+F` | Fuzzy-find lines in current file |
| `Ctrl+H` | Find & replace (regex) |
| `Ctrl+Alt+F` | Search in all files |
| `Ctrl+Shift+K` | Command palette |

### Format

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+K` | Link |
| `Ctrl+Shift+C` | Code block |

### View

| Shortcut | Action |
|----------|--------|
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |
| `Ctrl+Shift+D` | Toggle dark mode |
| `Ctrl+Shift+V` | Toggle Vim mode |
| `Ctrl+Shift+A` | Toggle auto-save |
| `Ctrl+G` | Open link graph |
| `Ctrl+W` | Close tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |

### Layout

| Shortcut | Action |
|----------|--------|
| `Ctrl+\` | Toggle split direction |
| `Ctrl+Shift+X` | Swap editor / preview |
| `Ctrl+Shift+E` | Focus editor |
| `Ctrl+Shift+O` | Focus preview |

### Vim mode

Press `:` in Normal mode to open the command popup:

| Command | Action |
|---------|--------|
| `:w` | Save |
| `:w name.md` | Save As |
| `:e file.md` | Open file |
| `:42` | Go to line 42 |
| `:s/old/new/g` | Substitute |

The state machine supports `h j k l`, `w b e`, `0 $`, `gg G`, `i a I A o O`, `v V`, `d c y p x`, `u Ctrl+R`, `.`, counts, and `[` `]` for indent adjustment.

---

## Architecture

The project uses Tauri 2's flat layout — the Rust crate and the frontend live side by side at the repository root, with no separate `src-tauri/` wrapper.

```
tengwar/
├── Cargo.toml              # Rust crate manifest
├── Cargo.lock
├── build.rs                # Tauri build script
├── tauri.conf.json         # Tauri app config (frontendDist: ./dist)
├── build.sh                # release build + /usr/local install
├── PKGBUILD                # Arch Linux package build
├── tengwar.desktop         # freedesktop launcher entry
├── readme.md
├── capabilities/
│   └── default.json        # Tauri permission set
├── icons/
│   └── icon.png
├── src/                    # Rust backend
│   ├── main.rs             # Tauri builder + command registry
│   ├── state.rs            # Mutex-wrapped VimState
│   ├── vim.rs              # Vim state machine
│   ├── markdown.rs         # pulldown-cmark → HTML, math, wikilinks
│   ├── fs_ops.rs           # file I/O, workspace confinement, search
│   ├── git.rs              # libgit2 wrapper
│   ├── search.rs           # nucleo-matcher fuzzy find
│   ├── watcher.rs          # notify-based file watcher
│   ├── export.rs           # standalone HTML export
│   ├── link_graph.rs       # wikilink graph builder
│   └── diagram/
│       ├── mod.rs          # dispatcher
│       ├── common.rs       # shared SVG scaffolding + theme CSS
│       ├── block.rs
│       ├── c4.rs
│       ├── class.rs
│       ├── er.rs
│       ├── flowchart.rs
│       ├── gantt.rs
│       ├── gitgraph.rs
│       ├── journey.rs
│       ├── kanban.rs
│       ├── mindmap.rs
│       ├── packet.rs
│       ├── pie.rs
│       ├── quadrant.rs
│       ├── requirement.rs
│       ├── sankey.rs
│       ├── sequence.rs
│       ├── state.rs
│       ├── timeline.rs
│       └── xychart.rs
└── dist/                   # frontend — served as frontendDist
    ├── index.html
    ├── styles.css
    ├── app.js              # sequential loader for the 30 js/ modules
    ├── welcome.md
    └── js/
        ├── 01-core.js
        ├── 02-highlight.js
        ├── …                # 30 files total, loaded in numeric order
        └── 30-init.js
```

### The frontend is plain JavaScript

No bundler, no framework, no transpiler. Thirty classic scripts are loaded sequentially by `app.js` and share one global scope. This makes the editor debuggable with DevTools alone and eliminates the entire Node toolchain from the build.

### The backend is a plain Tauri app

Every command returns `Result<T, String>` so failures surface as clean toasts instead of panics. File operations are confined to the workspace root that the frontend declares via `set_workspace_root` after opening a folder — the backend rejects any path that escapes it.

### Rendering is one-way

Markdown → HTML → SVG happens entirely in Rust. The preview, the HTML export, and the PDF print path all go through the same renderer, so a diagram looks identical in all three. The frontend only ever injects the finished SVG.

---

## Security

- **CSP** is set to `default-src 'self'` with explicit exceptions for Tauri's IPC and inline styles.
- **All file commands** check that the target lives inside the currently open workspace. Escape attempts are rejected with a `Path outside workspace` error.
- **Git tokens** are stored in `sessionStorage` and cleared when the app exits. They are never logged, never written to disk, and only sent to `origin`.
- **Markdown HTML** is rendered with CSP-protected `innerHTML` — no inline scripts, no `javascript:` URLs.

---

## Building

```bash
# Debug build with DevTools
cargo build

# Release build (LTO, opt-level=s, stripped)
cargo build --release

# Full system install to /usr/local
./build.sh
```

`build.sh` verifies that every JavaScript file listed in `dist/app.js` actually exists under `dist/js/` before compiling — a missing file is caught at build time instead of producing a startup banner at runtime.

---

## Contributing

Issues and pull requests are welcome. Before opening a PR:

- Run `cargo clippy --all-targets` and fix any warnings.
- Verify that the change works in both light and dark preview modes.
- If you touch a diagram renderer, include a small `.md` snippet in the PR description that reproduces the before/after.

The codebase is intentionally small and free of external tooling — please keep it that way.

By contributing, you agree that your contributions will be licensed under the **GNU General Public License v3.0 or later** (see below).

---

## License

Copyright (C) 2025 rhjddjdbc

Licensed under the **GNU General Public License v3.0 or later**. See [`LICENSE`](LICENSE) for the full text.
