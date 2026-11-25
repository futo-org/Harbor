//! Mentions in post text, mirroring the client's `parseTextLinks`
//! (`apps/harbor/src/common/util/parseTextLinks.ts`). Keep the two in sync.
//!
//! A standalone `@` (not glued to a preceding word character, so an email's
//! `@` never starts one) begins a mention:
//! - `@{<64 hex>,Name}` / `@{<64 hex>}` — identity mention, rendered as
//!   `@Name` (or `@<64 hex>` without one). The only form that may be glued to
//!   what precedes it (`hi@{…}`, `@@{…}`): only clients write it.
//! - `@<64 hex>` — identity mention.
//! - otherwise plain text. That includes `@user@domain.com`, which the client
//!   still links as an alias mention in older posts but which never notifies.

use std::sync::LazyLock;

use regex::Regex;

/// A mention found in text: its byte range, the mentioned identity (64 hex
/// chars) and how the client renders it.
struct FoundMention {
    start: usize,
    end: usize,
    identity: String,
    rendered: String,
}

/// Curly mentions first so one is taken whole; then any other `@` run, which
/// stops before an `@{` so a curly mention glued to it is still found.
static MENTION_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"@\{[^}]+\}|@(?:[^\s@]|@[^\s{])+").unwrap());

/// Punctuation that commonly trails a mention in prose but isn't part of it.
const TRAILING_PUNCT: &[char] = &['.', ',', '!', '?', ';', ':', '\'', '"', ')', ']', '}'];

fn is_hex64(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// A char that glues an `@` to the preceding word, disqualifying it as a
/// mention other than a curly one (the client's `TOKEN_PRECEDER`).
fn is_mention_preceder(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '@'
}

fn scan_mentions(text: &str) -> Vec<FoundMention> {
    MENTION_REGEX
        .find_iter(text)
        .filter_map(|m| {
            let mut raw_mention = m.as_str();
            let is_curly = raw_mention.starts_with("@{") && raw_mention.ends_with('}');
            if !is_curly
                && text[..m.start()]
                    .chars()
                    .next_back()
                    .is_some_and(is_mention_preceder)
            {
                return None;
            }
            if !is_curly {
                raw_mention = raw_mention.trim_end_matches(TRAILING_PUNCT);
            }

            let (identity, rendered) = if is_curly {
                let curly_body = &raw_mention[2..raw_mention.len() - 1];
                let (identity, name) = match curly_body.split_once(',') {
                    Some((identity, name)) => (identity, name),
                    None => (curly_body, ""),
                };
                if !is_hex64(identity) {
                    return None;
                }
                let rendered = match name.is_empty() {
                    true => format!("@{identity}"),
                    false => format!("@{name}"),
                };
                (identity.to_string(), rendered)
            } else {
                let body = &raw_mention[1..];
                if !is_hex64(body) {
                    return None;
                }
                (body.to_string(), raw_mention.to_string())
            };

            Some(FoundMention {
                start: m.start(),
                end: m.start() + raw_mention.len(),
                identity,
                rendered,
            })
        })
        .collect()
}

/// Every identity mentioned in `text`, in order of appearance, duplicates
/// included.
pub fn extract_mentioned_identities(text: &str) -> Vec<String> {
    scan_mentions(text)
        .into_iter()
        .map(|f| f.identity)
        .collect()
}

/// `text` as the client renders it: `@{<64 hex>,Name}` becomes `@Name` and
/// `@{<64 hex>}` becomes `@<64 hex>`. Anything else, including a malformed
/// `@{...}`, stays as is.
pub fn mentions_to_plain_text(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut copied_up_to = 0;
    for f in scan_mentions(text) {
        out.push_str(&text[copied_up_to..f.start]);
        out.push_str(&f.rendered);
        copied_up_to = f.end;
    }
    out.push_str(&text[copied_up_to..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    /// Shared with the client's `parseTextLinks.test.ts`, which runs the same
    /// file — so both parsers agree on every case. Alias mentions there are
    /// client-only links (older posts) that never notify, so they're skipped.
    const FIXTURES: &str = include_str!("mentions.fixtures.json");

    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Expected {
        Identity { identity: String },
        Alias {},
    }

    #[derive(Deserialize)]
    struct Fixture {
        name: String,
        text: String,
        mentions: Vec<Expected>,
        plain: String,
    }

    #[test]
    fn matches_the_shared_fixtures() {
        let fixtures: Vec<Fixture> = serde_json::from_str(FIXTURES).unwrap();
        assert!(!fixtures.is_empty());
        for f in fixtures {
            let expected: Vec<String> = f
                .mentions
                .into_iter()
                .filter_map(|m| match m {
                    Expected::Identity { identity } => Some(identity),
                    Expected::Alias {} => None,
                })
                .collect();
            assert_eq!(
                extract_mentioned_identities(&f.text),
                expected,
                "{}",
                f.name
            );
            assert_eq!(mentions_to_plain_text(&f.text), f.plain, "{}", f.name);
        }
    }
}
