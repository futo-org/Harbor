use std::fs;
use std::path::Path;

/// Minimal `.env` loader. Parses `KEY=VALUE` lines, skips blanks and
/// `#` comments, strips surrounding single or double quotes from the
/// value, and only sets vars that aren't already present in the
/// environment (so shell exports still win). Silently does nothing if
/// the file is missing — that's the expected state in production.
pub fn load(path: impl AsRef<Path>) {
    let contents = match fs::read_to_string(path.as_ref()) {
        Ok(s) => s,
        Err(_) => return,
    };

    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            continue;
        };

        let key = key.trim();
        if key.is_empty() {
            continue;
        }

        // Honor real env vars over .env.
        if std::env::var_os(key).is_some() {
            continue;
        }

        let value = value.trim();
        let value = strip_quotes(value);

        // SAFETY: set_var is unsafe in Rust 2024. This runs before any
        // threads read the environment (at the top of main), which is
        // the documented safe window.
        unsafe {
            std::env::set_var(key, value);
        }
    }
}

fn strip_quotes(s: &str) -> &str {
    if s.len() >= 2
        && ((s.starts_with('"') && s.ends_with('"'))
            || (s.starts_with('\'') && s.ends_with('\'')))
    {
        &s[1..s.len() - 1]
    } else {
        s
    }
}
