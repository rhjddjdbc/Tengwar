// Loader — injects the feature files into <head> as classic scripts,
// in order, so they share the global script scope.

(function () {
  "use strict";

  var FILES = [
    "js/01-core.js",
    "js/02-highlight.js",
    "js/03-preview.js",
    "js/04-preview-interactive.js",
    "js/05-scroll-sync.js",
    "js/06-vim.js",
    "js/07-editing.js",
    "js/08-tabs.js",
    "js/09-toggles.js",
    "js/10-keybindings.js",
    "js/11-keybindings-editor.js",
    "js/12-editor-keys.js",
    "js/13-command-palette.js",
    "js/14-find-replace.js",
    "js/15-search.js",
    "js/16-modal.js",
    "js/17-filesystem.js",
    "js/18-context-menu.js",
    "js/19-git.js",
    "js/20-export.js",
    "js/21-toolbar.js",
    "js/22-search-all.js",
    "js/23-recovery.js",
    "js/24-diff-viewer.js",
    "js/25-graph-data.js",
    "js/26-graph-view.js",
    "js/27-theme-presets.js",
    "js/28-theme-editor.js",
    "js/29-layout.js",
    "js/30-init.js",
    "js/31-block-editor.js",
    "js/32-history.js",
    "js/33-vaults.js"
  ];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.defer = false;
      s.onload  = function () { resolve(src); };
      s.onerror = function () { reject(new Error("Failed to load " + src)); };
      document.head.appendChild(s);
    });
  }

  (async function () {
    for (var i = 0; i < FILES.length; i++) {
      try {
        await loadScript(FILES[i]);
      } catch (e) {
        console.error(e);
        var banner = document.createElement("div");
        banner.style.cssText =
          "position:fixed;top:0;left:0;right:0;z-index:99999;" +
          "background:#dc2626;color:#fff;padding:10px 16px;" +
          "font:13px/1.4 monospace;";
        banner.textContent = "Startup error: " + e.message;
        document.body.appendChild(banner);
        return;
      }
    }
  })();
})();