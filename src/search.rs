use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use serde::Serialize;

#[derive(Serialize)]
pub struct SearchHit { pub index: usize, pub score: u32, pub positions: Vec<usize> }

#[tauri::command]
pub fn fuzzy_find(query: String, items: Vec<String>, limit: usize) -> Vec<SearchHit> {
    if query.is_empty() {
        return items.iter().enumerate().take(limit)
            .map(|(i, _)| SearchHit { index: i, score: 0, positions: vec![] })
            .collect();
    }

    // Two matchers, both reused across every item. The original code
    // allocated a fresh Matcher and two Vec buffers per item, which is
    // measurable on large trees (Ctrl+P over a few thousand files).
    let mut score_matcher = Matcher::new(Config::DEFAULT.match_paths());
    let mut indices_matcher = Matcher::new(Config::DEFAULT);

    let pattern = Pattern::parse(&query, CaseMatching::Ignore, Normalization::Smart);

    let mut hits = Vec::new();
    // Utf32Str::new in nucleo-matcher 0.3.x takes &mut Vec<char>.
    // The positions output from Pattern::indices is Vec<u32>.
    let mut buf_score: Vec<char> = Vec::new();
    let mut buf_idx: Vec<char> = Vec::new();
    let mut positions: Vec<u32> = Vec::new();

    for (i, s) in items.iter().enumerate() {
        buf_score.clear();
        let haystack = Utf32Str::new(s, &mut buf_score);
        if let Some(score) = pattern.score(haystack, &mut score_matcher) {
            positions.clear();
            buf_idx.clear();
            let h2 = Utf32Str::new(s, &mut buf_idx);
            let _ = pattern.indices(h2, &mut indices_matcher, &mut positions);
            hits.push(SearchHit {
                index: i,
                score,
                positions: positions.iter().map(|&p| p as usize).collect(),
            });
        }
    }
    hits.sort_by(|a, b| b.score.cmp(&a.score));
    hits.truncate(limit);
    hits
}