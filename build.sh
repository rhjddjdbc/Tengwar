#!/usr/bin/env bash
#
# build.sh — build Tengwar, run tests, install system-wide
#
set -euo pipefail

# Always operate from the script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ─── Colours ────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    C_RESET='\033[0m'
    C_BOLD='\033[1m'
    C_BLUE='\033[38;5;75m'
    C_GREEN='\033[38;5;78m'
    C_YELLOW='\033[38;5;221m'
    C_RED='\033[38;5;203m'
else
    C_RESET='' C_BOLD='' C_BLUE='' C_GREEN='' C_YELLOW='' C_RED=''
fi

log()  { printf "${C_BLUE}==>${C_RESET} ${C_BOLD}%s${C_RESET}\n" "$*"; }
ok()   { printf "${C_GREEN}  ✓${C_RESET} %s\n" "$*"; }
warn() { printf "${C_YELLOW}  !${C_RESET} %s\n" "$*"; }
fail() { printf "${C_RED}  ✗${C_RESET} %s\n" "$*" >&2; exit 1; }

# ─── Locate sudo ────────────────────────────────────────────────
SUDO="$(command -v sudo || true)"

# ─── Sanity checks ──────────────────────────────────────────────
log "Checking prerequisites"

[[ -f "Cargo.toml" ]]      || fail "Cargo.toml not found — run this from the project root"
[[ -f "Cargo.lock" ]]      || fail "Cargo.lock not found"
[[ -f "build.rs" ]]        || fail "build.rs not found"
[[ -f "tauri.conf.json" ]] || fail "tauri.conf.json not found"
[[ -f "tengwar.desktop" ]] || fail "tengwar.desktop missing"
[[ -f "icons/icon.png" ]]  || fail "icons/icon.png missing"

command -v cargo >/dev/null 2>&1 || fail "cargo not found in PATH"
[[ -n "$SUDO" ]] || fail "sudo not found in PATH — install sudo or run the install steps manually"

# ─── dist/ completeness ─────────────────────────────────────────
[[ -d "dist" ]]            || fail "dist/ directory missing"
[[ -f "dist/index.html" ]] || fail "dist/index.html missing"
[[ -f "dist/app.js" ]]     || fail "dist/app.js missing"
[[ -f "dist/styles.css" ]] || fail "dist/styles.css missing"
[[ -f "dist/welcome.md" ]] || fail "dist/welcome.md missing — 30-init.js fetches it at startup"
[[ -d "dist/js" ]]         || fail "dist/js/ directory missing"

missing_files=()
while IFS= read -r rel; do
    [[ -f "dist/$rel" ]] || missing_files+=("dist/$rel")
done < <(grep -oE '"js/[0-9]+-[a-z0-9-]+\.js"' dist/app.js | tr -d '"')

if (( ${#missing_files[@]} > 0 )); then
    warn "These files are listed in dist/app.js but do not exist:"
    for f in "${missing_files[@]}"; do printf "      %s\n" "$f"; done
    fail "${#missing_files[@]} frontend file(s) missing"
fi

ok "All prerequisites satisfied"

# ─── Tests ──────────────────────────────────────────────────────
log "Running Rust tests"

if ! cargo test --quiet; then
    fail "Rust tests failed — aborting build"
fi

ok "All Rust tests passed"

# Frontend tests can't run headlessly without extra tooling, but we
# still want to remind the user they exist. Their presence is not
# gating the build — open them manually when you touch 01-34.js.
if [[ -f "tests/frontend.html" ]]; then
    warn "Frontend tests not run automatically"
    warn "  → open  tests/frontend.html  in a browser to run them"
fi

# ─── Build ──────────────────────────────────────────────────────
log "Building release binary (this may take several minutes)"
if command -v cargo-tauri >/dev/null 2>&1; then
    cargo tauri build
else
    cargo build --release
fi

BINARY="target/release/tengwar"
[[ -x "$BINARY" ]] || fail "Build finished but $BINARY is missing"

SIZE=$(du -h "$BINARY" | cut -f1)
ok "Binary built: $BINARY ($SIZE)"

# ─── Install ────────────────────────────────────────────────────
log "Installing system-wide (requires sudo)"

$SUDO install -Dm755 "$BINARY"       /usr/local/bin/tengwar
$SUDO install -Dm644 tengwar.desktop /usr/share/applications/tengwar.desktop
$SUDO install -Dm644 icons/icon.png  /usr/share/icons/hicolor/512x512/apps/tengwar.png

ok "Installed to /usr/local/bin/tengwar"
ok "Desktop entry: /usr/share/applications/tengwar.desktop"
ok "Icon:           /usr/share/icons/hicolor/512x512/apps/tengwar.png"

# ─── Refresh caches ─────────────────────────────────────────────
log "Refreshing desktop database and icon cache"

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    $SUDO gtk-update-icon-cache -f -t /usr/share/icons/hicolor >/dev/null 2>&1 \
        || warn "gtk-update-icon-cache failed (not fatal)"
else
    warn "gtk-update-icon-cache not found (not fatal)"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
    $SUDO update-desktop-database -q >/dev/null 2>&1 \
        || warn "update-desktop-database failed (not fatal)"
else
    warn "update-desktop-database not found (not fatal)"
fi

ok "Caches refreshed"

# ─── Done ───────────────────────────────────────────────────────
printf "\n${C_GREEN}${C_BOLD}Build complete.${C_RESET}\n"
printf "Launch with:  ${C_BOLD}tengwar${C_RESET}\n"
printf "Or find it in your application menu.\n\n"