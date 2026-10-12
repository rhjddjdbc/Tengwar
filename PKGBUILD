pkgname=tengwar
pkgver=0.1.0
pkgrel=1
pkgdesc="Markdown, UML, ER editor with Git integration, written in Rust + Tauri"
arch=('x86_64')
url="https://github.com/rhjddjdbc/tengwar"
license=('GPL-3.0-or-later')
depends=(
  'webkit2gtk-4.1'
  'gtk3'
  'hicolor-icon-theme'
)
makedepends=(
  'rust'
  'gcc'
  'make'
  'pkgconf'
  'cmake'
  'clang'
  'perl'
  'git'
)

# git+URL#tag=<tag> — makepkg clones this into $srcdir/tengwar/
source=("git+$url.git#tag=v$pkgver")
sha256sums=('SKIP')

# Already stripped by Cargo (strip = true in Cargo.toml).
# !lto because makepkg's LTO flag has no effect on cargo.
options=('!strip' '!lto')

build() {
  cd "$srcdir/$pkgname"
  cargo build --release --locked
}

package() {
  cd "$srcdir/$pkgname"

  install -Dm755 "target/release/tengwar" \
    "$pkgdir/usr/bin/tengwar"

  install -Dm644 "tengwar.desktop" \
    "$pkgdir/usr/share/applications/tengwar.desktop"

  install -Dm644 "icons/icon.png" \
    "$pkgdir/usr/share/icons/hicolor/512x512/apps/tengwar.png"
}
