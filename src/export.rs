const EXPORT_CSS: &str = r##"
* { box-sizing: border-box; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  max-width: 900px; margin: 0 auto; padding: 40px 32px;
  color: #24292f; line-height: 1.7; font-size: 15px;
  background: #ffffff;
}
h1 { font-size: 2rem; font-weight: 700; margin: 1.5em 0 0.6em; padding-bottom: 0.3em; border-bottom: 1px solid #e6e8eb; color: #0d1117; }
h2 { font-size: 1.5rem; font-weight: 600; margin: 1.5em 0 0.5em; padding-bottom: 0.25em; border-bottom: 1px solid #e6e8eb; color: #0d1117; }
h3 { font-size: 1.2rem; font-weight: 600; margin: 1.3em 0 0.4em; color: #0d1117; }
h4 { font-size: 1.05rem; font-weight: 600; margin: 1.2em 0 0.3em; color: #0d1117; }
p { margin: 0.85em 0; }
code { background: #f0f1f4; color: #cf222e; padding: 0.15em 0.4em; border-radius: 4px; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.87em; }
pre { background: #f6f8fa; padding: 16px 18px; border-radius: 10px; overflow-x: auto; margin: 1em 0; border: 1px solid #e6e8eb; font-size: 13px; line-height: 1.6; }
pre code { background: none; color: #24292f; padding: 0; font-size: inherit; }
ul, ol { margin: 0.85em 0 0.85em 1.6em; }
li { margin: 0.3em 0; }
ul.task-list { list-style: none; margin-left: 0; }
li.task-list-item { list-style: none; display: flex; align-items: flex-start; gap: 6px; margin: 0.25em 0; }
li.task-list-item input[type="checkbox"] { margin-top: 0.4em; accent-color: #5f7de0; flex-shrink: 0; }
blockquote { border-left: 4px solid #7c9cff; padding: 0.4em 0 0.4em 1.2em; color: #57606a; margin: 1em 0; background: #f6f8fa; border-radius: 0 6px 6px 0; }
table { border-collapse: collapse; margin: 1.1em 0; font-size: 0.92em; border-radius: 10px; overflow: hidden; box-shadow: 0 0 0 1px #e6e8eb; }
th, td { border: 1px solid #e6e8eb; padding: 8px 14px; text-align: left; }
th { background: #f6f8fa; font-weight: 600; color: #24292f; }
tr:nth-child(even) td { background: #fafbfc; }
a { color: #5f7de0; text-decoration: none; font-weight: 500; }
a:hover { text-decoration: underline; }
hr { border: none; height: 1px; background: linear-gradient(to right, transparent, #d0d7de 20%, #d0d7de 80%, transparent); margin: 2em 0; }
strong { font-weight: 600; color: #0d1117; }
del { color: #6e7781; }
img { max-width: 100%; height: auto; border-radius: 8px; margin: 1em 0; display: block; }
.diagram { margin: 1.6em 0; padding: 20px; background: linear-gradient(135deg, #ffffff 0%, #fafbfc 100%); border: 1px solid #e6e8eb; border-radius: 14px; text-align: center; overflow-x: auto; }
.diagram svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
.math-inline { display: inline-block; padding: 0 0.15em; }
.math-display { display: block; text-align: center; margin: 1.2em 0; overflow-x: auto; }
math { font-size: 1.05em; }
.error { color: #f87171; background: #fff5f5; border: 1px solid #ffd7d7; padding: 14px 16px; border-radius: 10px; font-family: monospace; font-size: 12.5px; margin: 1em 0; }
@media print {
  body { max-width: none; padding: 20px; }
  .diagram, pre, blockquote, table { page-break-inside: avoid; }
  a { color: #5f7de0; }
}
"##;

#[tauri::command]
pub fn export_html(html: String, path: String, title: String) -> Result<(), String> {
    crate::fs_ops::check_in_workspace(&path)?;

    let title_esc = title
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");

    let full = format!(
        r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title_esc}</title>
<style>{EXPORT_CSS}</style>
</head>
<body>
{html}
</body>
</html>"##
    );

    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create_dir_all: {e}"))?;
    }
    std::fs::write(&path, full).map_err(|e| format!("Write failed: {e}"))
}