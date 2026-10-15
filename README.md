# Tengwar

**A native Markdown editor with diagrams, LaTeX, Git, and Vim — built on Rust + Tauri.**

Tengwar renders 19 diagram types directly in Rust (no Mermaid.js, no headless browser), typesets LaTeX via MathML, integrates Git through libgit2, and ships a real Vim state machine. Everything runs offline, everything fits in one binary.

> _Named after the Elvish writing system from Tolkien's legendarium — because your notes deserve a script of their own._

---

## Features

### Editing
- **Tabs** with unsaved-change indicators, `Ctrl+W` / `Ctrl+Tab` navigation
- **Vim mode** with Normal / Insert / Visual, counts, undo/redo, `:s/old/new/g`, yank buffer and `.`-repeat
- **Block editor** — Notion-style "edit the render": click a paragraph, it becomes raw markdown, click out it re-renders. `Enter` = line break, `Shift+Enter` = new block
- **Undo / redo** across every mode, with toolbar buttons and a 400 ms typing-burst grouping
- **Auto-save** (toggle) with atomic writes
- **Auto-pairing** for brackets, quotes, backticks, asterisks
- **Find & replace** with regex and case-sensitivity
- **Fuzzy find** across files (`Ctrl+P`) and inside the current file (`Ctrl+F`)
- **Search in all files** (`Ctrl+Alt+F`) with grouped results and line numbers
- **Command palette** (`Ctrl+Shift+K`) covering every action
- **Crash recovery** — unsaved buffers come back after a restart

### Multi-Vault
- **Recent vaults dropdown** in the sidebar header — switch between folders with one click
- **Session persistence** — the last opened vault, its tabs, and the active tab are restored on startup
- **Missing vaults** are pruned automatically

### Preview
- **Live Markdown preview** with scroll-sync
- **LaTeX** — inline `$E = mc^2$` and display `$$ … $$` via native MathML
- **Task lists** that are clickable and mutate the source
- **Wikilinks** — `[[Target]]` and `[[Target|Display]]` resolve against the open folder; targets with spaces (`[[Big O Notation]]`) work
- **Local images** embedded as data URLs
- **Zoom** controls — `−`, `100%`, `+`, and Fit-to-width
- **Theme-aware** — preview background, headings, code, blockquotes, and diagrams follow the active theme

### Diagrams (19 types)
Rendered in-process to SVG. No external dependencies at runtime. Every color comes from a CSS variable, so diagrams follow the active theme.

| Family | Types |
|--------|-------|
| UML | `classDiagram`, `sequenceDiagram`, `stateDiagram-v2` |
| Data | `erDiagram`, `requirementDiagram` |
| Flow | `flowchart`, `graph`, `block-beta`, `packet-beta` |
| Charts | `pie`, `xychart-beta`, `quadrantChart`, `sankey-beta` |
| Planning | `gantt`, `timeline`, `journey`, `kanban` |
| Architecture | `C4Context`, `mindmap`, `gitGraph` |

Hover any diagram for **SVG / PNG** download buttons. Exported SVGs keep their theme through inlined CSS variables.

### Git
- **Status** indicators per file in the sidebar (M / A / D / U / S)
- **Stage all + commit** from the sidebar
- **Fetch / pull / push** against `origin` — pull detects divergence and reports instead of silently no-oping
- **Branch list + checkout**
- **Diff viewer** with unstaged / staged toggle, opened from the sidebar
- **Clone** and **init** buttons
- **HTTPS token** stored in `sessionStorage` (never written to disk)

### Appearance
- **Light / dark** preview themes
- **8 built-in presets** — Default, Solarized, Nord, Gruvbox, Dracula, Monokai, Tokyo Night, Catppuccin
- **Theme editor** with live preview — edit app, syntax, diagram, and diagram-box colors independently
- **Theme export / import** as JSON
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

`build.sh` runs the Rust tests, then optionally the frontend tests if a headless browser is available, then compiles the release binary, installs it to `/usr/local/bin/tengwar`, drops a `.desktop` file into `/usr/share/applications`, installs the icon, and refreshes the desktop + icon caches.

Launch it with:

```bash
tengwar
```

Or find it in your application menu under **Development**.

### Manual build

```bash
cargo build --release
./target/release/tengwar
```

The binary is self-contained — no runtime dependencies beyond the GTK stack that Tauri already links against.

---

## Usage

1. **Open Folder** — pick a directory containing your `.md` files, or click the vault button to switch to a recently-opened folder. Tengwar walks it recursively, skipping `.git`, `node_modules`, `target`, `dist`, and dotfiles.
2. **Click any file** in the sidebar — it opens as a tab.
3. **Start typing.** Preview updates as you go. Auto-save is opt-in.
4. **Drag the divider** between editor and preview to resize. Double-click it to reset.
5. **Right-click a folder** to create files or subfolders inside it, or delete it.
6. **Toggle Block editor** in Settings for a Notion-style preview-in-editor mode.
7. **Hover a diagram** to reveal SVG / PNG download buttons.

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
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
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

Supported normal-mode keys: `h j k l`, `w b e`, `0 $`, `gg G`, `i a I A o O`, `v V`, `d c y p x`, `u` (undo), `Ctrl+R` (redo), `.` (repeat). Counts work (`3dd` deletes three lines).

### Block editor

| Shortcut | Action |
|----------|--------|
| `Enter` | Line break inside the block |
| `Shift+Enter` at end | New block below |
| `Backspace` at start | Merge with previous block |
| `ArrowUp` / `ArrowDown` at edge | Move to adjacent block |
| `Esc` | Commit and leave |
| `Ctrl+S` | Commit and save |
| `Ctrl+Z` | Undo within block, then step back one commit |
| `Ctrl+Click` on link | Open the link (wiki: → file, http(s) → external) |

---

## Architecture

The project uses Tauri 2's flat layout — the Rust crate and the frontend live side by side at the repository root, with no separate `src-tauri/` wrapper. `src/lib.rs` holds the Tauri builder so that integration tests in `tests/` can import the modules without launching the GUI.

```
tengwar/
├── Cargo.toml
├── Cargo.lock
├── build.rs
├── tauri.conf.json
├── build.sh
├── PKGBUILD
├── readme.md
├── capabilities/
│   └── default.json
├── icons/
│   └── icon.png
├── tests/                       # integration + frontend tests
│   ├── vim.rs
│   ├── markdown.rs
│   ├── link_graph.rs
│   ├── diagram.rs
│   └── frontend.html            # runs in the browser, 100+ pure-function tests
├── src/                         # Rust backend
│   ├── lib.rs                   # Tauri builder + pub fn run()
│   ├── main.rs                  # 3-line entry point
│   ├── state.rs
│   ├── vim.rs
│   ├── markdown.rs
│   ├── fs_ops.rs
│   ├── git.rs
│   ├── search.rs
│   ├── watcher.rs
│   ├── export.rs
│   ├── link_graph.rs
│   └── diagram/
│       ├── mod.rs
│       ├── common.rs
│       ├── block.rs    c4.rs        class.rs     er.rs
│       ├── flowchart.rs gantt.rs    gitgraph.rs  journey.rs
│       ├── kanban.rs   mindmap.rs   packet.rs    pie.rs
│       ├── quadrant.rs requirement.rs sankey.rs  sequence.rs
│       ├── state.rs    timeline.rs  xychart.rs
│       └── ...
└── dist/                        # frontend — served as frontendDist
    ├── index.html
    ├── styles.css               # reset + body + scrollbars + print
    ├── app.js                   # sequential loader for the 33 js/ modules
    ├── welcome.md
    ├── css/
    │   ├── theme.css            # :root + body.preview-dark variables
    │   ├── chrome.css           # sidebar, toolbar, tabs, statusbar
    │   ├── editor.css           # editor overlay, tokens, block editor, no-file banner
    │   ├── preview.css          # preview pane, diagrams, math
    │   └── modals.css           # every popup and overlay
    └── js/
        ├── 01-core.js
        ├── 02-highlight.js
        ├── 03-preview.js
        ├── 04-preview-interactive.js
        ├── 05-scroll-sync.js
        ├── 06-vim.js
        ├── 07-editing.js
        ├── 08-tabs.js
        ├── 09-toggles.js
        ├── 10-keybindings.js
        ├── 11-keybindings-editor.js
        ├── 12-editor-keys.js
        ├── 13-command-palette.js
        ├── 14-find-replace.js
        ├── 15-search.js
        ├── 16-modal.js
        ├── 17-filesystem.js
        ├── 18-context-menu.js
        ├── 19-git.js
        ├── 20-export.js
        ├── 21-toolbar.js
        ├── 22-search-all.js
        ├── 23-recovery.js
        ├── 24-diff-viewer.js
        ├── 25-graph-data.js
        ├── 26-graph-view.js
        ├── 27-theme-presets.js
        ├── 28-theme-editor.js
        ├── 29-layout.js
        ├── 30-init.js
        ├── 31-block-editor.js
        ├── 32-history.js
        └── 33-vaults.js
```

### The frontend is plain JavaScript

No bundler, no framework, no transpiler. Thirty-three classic scripts are loaded sequentially by `app.js` and share one global scope. This makes the editor debuggable with DevTools alone and eliminates the entire Node toolchain from the build.

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

## Testing

Two test suites.

**Rust integration tests** (56 tests, one file per module):

```bash
cargo test
```

Covers:
- `tests/vim.rs` — state machine, undo grouping, UTF-8 safety, counts, visual mode
- `tests/markdown.rs` — wikilink preprocessing, soft-break rendering, HTML escaping
- `tests/link_graph.rs` — `[[…]]` extraction edge cases
- `tests/diagram.rs` — smoke tests for all 19 renderers

**Frontend pure-function tests** (100+ tests, runs in the browser):

```
tests/frontend.html
```

Open the file in any browser. It loads the real source files, stubs the DOM and Tauri minimally, and runs assertions against `escapeHtml`, `byteToJsIndex`, `highlightMarkdown`, `resolveWikiTarget`, `normalizeCombo`, `splitIntoBlocks`, `vaultName`, `THEME_VARS`, `PRESETS`, and more. Green means the pure logic is intact.

`./build.sh` runs the Rust tests automatically and, if a headless Chromium is available, also drives the frontend tests and gates the build on the result.

---

## Building

```bash
# Debug build with DevTools
cargo build

# Release build (LTO, opt-level=s, stripped)
cargo build --release

# Full pipeline: Rust tests + frontend tests + release + system install
./build.sh
```

`build.sh` verifies that every JavaScript file listed in `dist/app.js` actually exists under `dist/js/` before compiling — a missing file is caught at build time instead of producing a startup banner at runtime.

---

## Contributing

Issues and pull requests are welcome. Before opening a PR:

- Run `cargo test` and `cargo clippy --all-targets`, fix any warnings.
- Open `tests/frontend.html` in a browser and check that the frontend tests still pass.
- Verify that the change works in both light and dark preview modes.
- If you touch a diagram renderer, include a small `.md` snippet in the PR description that reproduces the before/after.

The codebase is intentionally small and free of external tooling — please keep it that way.

By contributing, you agree that your contributions will be licensed under the **GNU General Public License v3.0 or later** (see below).

---

## License

Copyright (C) 2025 rhjddjdbc

Licensed under the **GNU General Public License v3.0 or later**. See [`LICENSE`](LICENSE) for the full text.
