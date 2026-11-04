//! Aliases: `user@domain.com` names that a domain maps to a polycentric
//! identity through its `/.well-known/polycentric.json`.

/// A parsed alias.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Alias {
    /// The alias without a leading `@`: `local@domain`, or a bare domain.
    pub acct: String,
    /// Lowercased local part, or `*` for a bare domain (the domain's
    /// wildcard entry).
    pub local: String,
    pub domain: String,
}

impl Alias {
    /// The URL to look this alias up at.
    pub fn lookup_url(&self) -> String {
        format!(
            "https://{}/.well-known/polycentric.json?alias={}",
            self.domain,
            percent_encode(&self.local)
        )
    }
}

/// Whether `s` is a polycentric identity string (non-empty hex).
pub fn is_identity_key(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_hexdigit())
}

/// Conservative allow-list for an alias's local part: letters, digits,
/// dot, underscore, hyphen. Tighter than RFC 7565's `userpart`.
fn is_local_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')
}

/// A DNS label: one or more of `[A-Za-z0-9-]`, not starting or ending with
/// a hyphen.
fn is_host_label(label: &str) -> bool {
    !label.is_empty()
        && !label.starts_with('-')
        && !label.ends_with('-')
        && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Parse `user@domain.com` (optionally with a leading `@`) or a bare
/// `domain.com`. The domain must be a dotted hostname of two or more LDH
/// labels. Returns `None` for anything else.
pub fn parse_alias(alias: &str) -> Option<Alias> {
    let acct = alias.trim();
    let acct = acct.strip_prefix('@').unwrap_or(acct);

    let parts: Vec<&str> = acct.split('@').collect();
    let (local, domain) = match parts.as_slice() {
        [domain] => ("*".to_string(), *domain),
        [local, domain] => {
            // Lowercase so lookups and comparisons are case-insensitive.
            let local = local.to_lowercase();
            if local.is_empty() || !local.chars().all(is_local_char) {
                return None;
            }
            (local, *domain)
        }
        _ => return None,
    };

    let labels: Vec<&str> = domain.split('.').collect();
    if labels.len() < 2 || !labels.iter().all(|l| is_host_label(l)) {
        return None;
    }

    Some(Alias {
        acct: acct.to_string(),
        local,
        domain: domain.to_string(),
    })
}

/// Canonical form of an alias for equality comparison: `local@domain`
/// lowercased, no leading `@`. `None` when malformed.
pub fn normalize_alias(alias: &str) -> Option<String> {
    parse_alias(alias).map(|a| a.acct.to_lowercase())
}

/// The identity a `polycentric.json` document lists for `alias`, if any.
pub fn identity_from_document(alias: &Alias, document: &[u8]) -> Option<String> {
    let doc: serde_json::Value = serde_json::from_slice(document).ok()?;
    let identity = doc.get("names")?.get(&alias.local)?.as_str()?;
    is_identity_key(identity).then(|| identity.to_string())
}

/// `encodeURIComponent` for the characters a local part can hold.
fn percent_encode(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric()
                || matches!(c, '-' | '_' | '.' | '!' | '~' | '*' | '\'' | '(' | ')')
            {
                c.to_string()
            } else {
                c.to_string().bytes().map(|b| format!("%{b:02X}")).collect()
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_aliases() {
        let a = parse_alias(" @Alice@Example.com ").unwrap();
        assert_eq!(a.local, "alice");
        assert_eq!(a.domain, "Example.com");
        assert_eq!(a.acct, "Alice@Example.com");
        assert_eq!(
            a.lookup_url(),
            "https://Example.com/.well-known/polycentric.json?alias=alice"
        );

        let bare = parse_alias("example.com").unwrap();
        assert_eq!(bare.local, "*");
        assert_eq!(
            bare.lookup_url(),
            "https://example.com/.well-known/polycentric.json?alias=*"
        );
    }

    #[test]
    fn rejects_malformed_aliases() {
        for bad in [
            "",
            "@",
            "alice@",
            "alice@localhost",
            "a@b@c.com",
            "al ice@example.com",
            "alice@-example.com",
            "alice@exa_mple.com",
            "alice+tag@example.com",
        ] {
            assert!(parse_alias(bad).is_none(), "{bad:?} should not parse");
        }
    }

    #[test]
    fn normalizes_aliases() {
        assert_eq!(
            normalize_alias("@Alice@Example.COM").as_deref(),
            Some("alice@example.com")
        );
        assert_eq!(normalize_alias("nope"), None);
    }

    #[test]
    fn reads_documents() {
        let alias = parse_alias("alice@example.com").unwrap();
        let doc = br#"{"names":{"alice":"abcdef01","bob":"zz"}}"#;
        assert_eq!(
            identity_from_document(&alias, doc).as_deref(),
            Some("abcdef01")
        );
        let bob = parse_alias("bob@example.com").unwrap();
        assert_eq!(identity_from_document(&bob, doc), None);
        assert!(is_identity_key("ABCdef09"));
        assert!(!is_identity_key(""));
    }
}
