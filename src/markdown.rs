use pulldown_cmark::{html, CodeBlockKind, Event, Options, Parser, Tag, TagEnd};

#[tauri::command]
pub fn render_markdown(input: String) -> String {
    // ── Preprocess: convert [[Wikilinks]] to standard markdown links ──
    let processed = preprocess_wikilinks(&input);

    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_TASKLISTS);
    opts.insert(Options::ENABLE_FOOTNOTES);
    opts.insert(Options::ENABLE_MATH);

    let parser = Parser::new_ext(&processed, opts);

    // Collect raw events up front so we can pre-scan for task lists.
    // We need this because pulldown-cmark emits Start(List) before the
    // TaskListMarker that identifies the list as a task list.
    let raw: Vec<Event> = parser.collect();
    let task_list_flags = find_task_lists(&raw);

    let mut events_out: Vec<Event> = Vec::new();
    let mut in_mermaid = false;
    let mut mermaid_buf = String::new();
    let mut list_idx: usize = 0;
    let mut replaced_stack: Vec<bool> = Vec::new();

    for ev in raw {
        match ev {
            Event::Start(Tag::CodeBlock(CodeBlockKind::Fenced(lang)))
                if lang.as_ref() == "mermaid" =>
            {
                in_mermaid = true;
                mermaid_buf.clear();
            }
            Event::End(TagEnd::CodeBlock) if in_mermaid => {
                in_mermaid = false;
                let escaped = mermaid_buf
                    .replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace('>', "&gt;")
                    .replace('"', "&quot;");
                events_out.push(Event::Html(
                    format!(r#"<div class="diagram" data-mermaid="{escaped}"></div>"#).into(),
                ));
            }
            Event::Text(t) if in_mermaid => { mermaid_buf.push_str(&t); }
            Event::Code(t) if in_mermaid => { mermaid_buf.push_str(&t); }
            Event::SoftBreak if in_mermaid => { mermaid_buf.push('\n'); }
            Event::HardBreak if in_mermaid => { mermaid_buf.push('\n'); }

            Event::InlineMath(math) => {
                let html = match render_math(&math, false) {
                    Some(mml) => format!(r#"<span class="math-inline">{mml}</span>"#),
                    None => format!(
                        r#"<span class="math-inline math-error"><code>{}</code></span>"#,
                        html_escape(&math)
                    ),
                };
                events_out.push(Event::Html(html.into()));
            }
            Event::DisplayMath(math) => {
                let html = match render_math(&math, true) {
                    Some(mml) => format!(r#"<div class="math-display">{mml}</div>"#),
                    None => format!(
                        r#"<div class="math-display math-error"><code>{}</code></div>"#,
                        html_escape(&math)
                    ),
                };
                events_out.push(Event::Html(html.into()));
            }

            Event::TaskListMarker(checked) => {
                let attr = if checked { " checked" } else { "" };
                events_out.push(Event::Html(
                    format!(r#"<input type="checkbox"{attr}> "#).into(),
                ));
            }

            // Task lists: swap pulldown-cmark's bare <ul> for our styled one.
            Event::Start(Tag::List(kind)) => {
                let is_task = task_list_flags.get(list_idx).copied().unwrap_or(false);
                list_idx += 1;
                if is_task {
                    events_out.push(Event::Html(r#"<ul class="task-list">"#.into()));
                    replaced_stack.push(true);
                } else {
                    events_out.push(Event::Start(Tag::List(kind)));
                    replaced_stack.push(false);
                }
            }
            Event::End(TagEnd::List(ordered)) => {
                if replaced_stack.pop().unwrap_or(false) {
                    events_out.push(Event::Html(r#"</ul>"#.into()));
                } else {
                    events_out.push(Event::End(TagEnd::List(ordered)));
                }
            }

            other if !in_mermaid => events_out.push(other),
            _ => {}
        }
    }

    let mut out = String::with_capacity(input.len() * 2);
    html::push_html(&mut out, events_out.into_iter());

    // Add the task-list-item class to the <li> tags. This has to be done
    // post-hoc because pulldown-cmark doesn't give us a hook at Start(Item)
    // time that knows whether the item is a task item.
    out = out.replace(
        r#"<li><input type="checkbox""#,
        r#"<li class="task-list-item"><input type="checkbox""#,
    );
    out = out.replace(
        r#"<li><p><input type="checkbox""#,
        r#"<li class="task-list-item"><p><input type="checkbox""#,
    );

    out
}

/// Returns a flag per Start(List) in `events`, indicating whether the list
/// contains at least one TaskListMarker.
fn find_task_lists(events: &[Event]) -> Vec<bool> {
    let mut flags: Vec<bool> = Vec::new();
    let mut stack: Vec<usize> = Vec::new();
    for ev in events {
        match ev {
            Event::Start(Tag::List(_)) => {
                stack.push(flags.len());
                flags.push(false);
            }
            Event::End(TagEnd::List(_)) => {
                stack.pop();
            }
            Event::TaskListMarker(_) => {
                if let Some(&idx) = stack.last() {
                    flags[idx] = true;
                }
            }
            _ => {}
        }
    }
    flags
}

/// Replaces [[Target]] with [Target](wiki:Target) and
/// [[Target|Display]] with [Display](wiki:Target).
/// Skips fenced code blocks (``` or ~~~) and inline code (` or ``).
fn preprocess_wikilinks(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 32);
    let mut in_fence = false;
    let mut fence_char: char = '`';

    for line in input.split_inclusive('\n') {
        let trimmed = line.trim_start();

        // Detect fenced-code-block delimiters (``` or ~~~).
        let starts_with_fence =
            trimmed.starts_with("```") || trimmed.starts_with("~~~");
        if starts_with_fence {
            let c = trimmed.chars().next().unwrap();
            if !in_fence {
                in_fence = true;
                fence_char = c;
            } else if c == fence_char {
                in_fence = false;
            }
            out.push_str(line);
            continue;
        }

        if in_fence {
            out.push_str(line);
            continue;
        }

        out.push_str(&process_line_wikilinks(line));
    }

    out
}

/// Processes wikilinks on a single non-fenced line, skipping inline code.
fn process_line_wikilinks(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    let mut out = String::with_capacity(line.len());
    let mut i = 0;
    let mut in_inline_code = false;

    while i < chars.len() {
        // Inline-code toggling on runs of 1 or 2 backticks.
        if chars[i] == '`' {
            let mut n = 0;
            while i + n < chars.len() && chars[i + n] == '`' {
                n += 1;
            }
            for _ in 0..n {
                out.push('`');
            }
            if n == 1 || n == 2 {
                in_inline_code = !in_inline_code;
            }
            i += n;
            continue;
        }

        if !in_inline_code
            && i + 1 < chars.len()
            && chars[i] == '['
            && chars[i + 1] == '['
        {
            // Try to find the closing ]]
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
                let (target, display) = match buf.split_once('|') {
                    Some((t, d)) => (t.trim().to_string(), d.trim().to_string()),
                    None => (buf.trim().to_string(), buf.trim().to_string()),
                };
                if !target.is_empty() {
                    out.push('[');
                    out.push_str(&display);
                    out.push_str("](wiki:");
                    out.push_str(&target);
                    out.push(')');
                    i = j + 2;
                    continue;
                }
            }
        }

        out.push(chars[i]);
        i += 1;
    }

    out
}

fn render_math(tex: &str, display: bool) -> Option<String> {
    use latex2mathml::DisplayStyle;
    let style = if display { DisplayStyle::Block } else { DisplayStyle::Inline };
    latex2mathml::latex_to_mathml(tex, style).ok()
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}