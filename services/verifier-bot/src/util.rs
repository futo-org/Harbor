//! Helpers shared by the routes and the platform verifiers.

use std::sync::LazyLock;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
use base64::engine::{DecodePaddingMode, general_purpose};
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use regex::Regex;
use serde::Serialize;
use serde::de::DeserializeOwned;

use crate::error::VerifierError;

/// Desktop Chrome, sent by the HTTP client most verifiers use.
pub const DESKTOP_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36";

/// Upper bound for one upstream request.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// A fresh HTTP client that keeps cookies across the requests it makes
/// (some platforms set a session cookie on the home page that the API call
/// then needs) and presents itself as desktop Chrome.
pub fn browser_like_client() -> reqwest::Client {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT_LANGUAGE,
        reqwest::header::HeaderValue::from_static("en-US"),
    );
    reqwest::Client::builder()
        .cookie_store(true)
        .user_agent(DESKTOP_USER_AGENT)
        .default_headers(headers)
        .timeout(REQUEST_TIMEOUT)
        .build()
        .expect("HTTP client configuration is valid")
}

/// A plain HTTP client, for the calls that never needed cookies or a
/// browser user agent.
pub fn plain_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .expect("HTTP client configuration is valid")
}

/// URL-safe slug for a platform name, used in route paths and the OAuth
/// callback URL (`Hacker News` -> `hacker-news`).
pub fn slug(name: &str) -> String {
    static NON_ALNUM: LazyLock<Regex> = LazyLock::new(|| Regex::new("[^a-z0-9]+").unwrap());
    let lower = name.to_lowercase();
    let dashed = NON_ALNUM.replace_all(&lower, "-");
    dashed.trim_matches('-').to_string()
}

/// The characters JavaScript's `encodeURIComponent` escapes: everything but
/// `A-Z a-z 0-9 - _ . ! ~ * ' ( )`.
const URI_COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

/// JavaScript's `encodeURIComponent`.
pub fn encode_uri_component(s: &str) -> String {
    utf8_percent_encode(s, URI_COMPONENT).to_string()
}

/// JavaScript's `decodeURIComponent`, failing on malformed escapes.
pub fn decode_uri_component(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    // `%` must be followed by two hex digits.
    for (i, b) in bytes.iter().enumerate() {
        if *b == b'%'
            && !(bytes.get(i + 1).is_some_and(u8::is_ascii_hexdigit)
                && bytes.get(i + 2).is_some_and(u8::is_ascii_hexdigit))
        {
            return None;
        }
    }
    percent_encoding::percent_decode_str(s)
        .decode_utf8()
        .ok()
        .map(|c| c.into_owned())
}

/// The OAuth tokens handed to clients: URI-encoded base64 of the JSON.
pub fn encode_object<T: Serialize>(value: &T) -> String {
    let json = serde_json::to_vec(value).expect("token serializes");
    encode_uri_component(&general_purpose::STANDARD.encode(json))
}

/// Base64 decoding as lenient as Node's `Buffer.from(s, 'base64')`: both
/// alphabets, padding optional, anything outside the alphabet skipped and
/// decoding stops at the first `=`.
pub fn lenient_base64_decode(input: &str) -> Vec<u8> {
    const ENGINE: GeneralPurpose = GeneralPurpose::new(
        &base64::alphabet::STANDARD,
        GeneralPurposeConfig::new()
            .with_decode_allow_trailing_bits(true)
            .with_decode_padding_mode(DecodePaddingMode::Indifferent),
    );
    let mut cleaned: String = input
        .split('=')
        .next()
        .unwrap_or_default()
        .chars()
        .filter_map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '+' | '/' => Some(c),
            '-' => Some('+'),
            '_' => Some('/'),
            _ => None,
        })
        .collect();
    // A lone trailing sextet carries no whole byte.
    if cleaned.len() % 4 == 1 {
        cleaned.pop();
    }
    ENGINE.decode(cleaned).unwrap_or_default()
}

/// Decode the base64 JSON a client sends back (the `oauthData` query
/// parameter, a challenge response).
pub fn decode_object<T: DeserializeOwned>(base64: &str) -> Result<T, serde_json::Error> {
    let bytes = lenient_base64_decode(base64);
    let text = String::from_utf8_lossy(&bytes);
    serde_json::from_str(&text)
}

/// The callback URL a platform's OAuth flow returns to.
pub fn callback_for_platform(callback_domain: &str, platform: &str) -> String {
    format!(
        "{callback_domain}/platforms/{}/oauth/callback",
        slug(platform)
    )
}

/// Turn a failed upstream response into the error the client sees.
pub fn http_response_to_error(code: u16, data: &str, endpoint_name: &str) -> VerifierError {
    if code == 500 {
        VerifierError::new(
            "Verifier encountered an error getting your profile information",
            "An error was encountered while getting the OAuth Token and Username",
        )
    } else {
        VerifierError::new(
            "Verifier was unable to validate your login information",
            format!("Returned {code} on {endpoint_name} endpoint with content: {data}"),
        )
    }
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    getrandom::fill(&mut bytes).expect("system randomness is available");
    bytes
}

/// A 24 hex character id shaped like a BSON ObjectId (seconds since the
/// epoch, then random bytes). Used for request ids and OAuth `state`.
pub fn object_id() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as u32)
        .unwrap_or_default();
    let mut bytes = [0u8; 12];
    bytes[..4].copy_from_slice(&secs.to_be_bytes());
    bytes[4..].copy_from_slice(&random_bytes::<8>());
    hex::encode(bytes)
}

/// A short random base-36 token (what `Math.random().toString(36)` gave).
pub fn random_token() -> String {
    const ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    random_bytes::<13>()
        .iter()
        .map(|b| ALPHABET[(*b as usize) % ALPHABET.len()] as char)
        .collect()
}

/// Seconds since the Unix epoch, fractional.
pub fn unix_seconds() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or_default()
}

/// A request's text body, or the error the verifiers report when it
/// couldn't be fetched at all.
pub struct Fetched {
    pub status: u16,
    pub status_text: String,
    pub body: String,
}

impl Fetched {
    pub fn ok(&self) -> bool {
        self.status == 200
    }

    pub fn json(&self) -> serde_json::Value {
        serde_json::from_str(&self.body).unwrap_or(serde_json::Value::Null)
    }
}

/// Send `request` and read its body as text. A transport failure (DNS,
/// connection, timeout) comes back as status 0 so callers treat it like any
/// other unexpected status.
pub async fn fetch(request: reqwest::RequestBuilder) -> Fetched {
    match request.send().await {
        Ok(response) => {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            Fetched {
                status: status.as_u16(),
                status_text: status.canonical_reason().unwrap_or_default().to_string(),
                body,
            }
        }
        Err(e) => {
            tracing::warn!("request failed: {e}");
            Fetched {
                status: 0,
                status_text: e.to_string(),
                body: String::new(),
            }
        }
    }
}

/// The text of `element` laid out the way node-html-parser's
/// `structuredText` does: block elements on their own lines, whitespace
/// collapsed, blank lines dropped.
pub fn structured_text(element: scraper::ElementRef<'_>) -> String {
    const BLOCK: &[&str] = &[
        "address",
        "article",
        "aside",
        "blockquote",
        "br",
        "dd",
        "div",
        "dl",
        "dt",
        "fieldset",
        "figcaption",
        "figure",
        "footer",
        "form",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "hr",
        "li",
        "main",
        "nav",
        "ol",
        "p",
        "pre",
        "section",
        "table",
        "tr",
        "ul",
    ];
    let mut raw = String::new();
    for edge in element.traverse() {
        match edge {
            ego_tree::iter::Edge::Open(node) => {
                if let Some(text) = node.value().as_text() {
                    // Whitespace (newlines included) inside text collapses;
                    // only block boundaries break lines.
                    for (i, word) in text.split_whitespace().enumerate() {
                        if i > 0 || text.starts_with(char::is_whitespace) {
                            raw.push(' ');
                        }
                        raw.push_str(word);
                    }
                    if text.ends_with(char::is_whitespace) {
                        raw.push(' ');
                    }
                } else if let Some(el) = node.value().as_element()
                    && BLOCK.contains(&el.name())
                {
                    raw.push('\n');
                }
            }
            ego_tree::iter::Edge::Close(node) => {
                if let Some(el) = node.value().as_element()
                    && BLOCK.contains(&el.name())
                {
                    raw.push('\n');
                }
            }
        }
    }
    raw.lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

/// `textContent` of `element`: all descendant text, untouched.
pub fn text_content(element: scraper::ElementRef<'_>) -> String {
    element.text().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_produces_url_safe_platform_routes() {
        assert_eq!(slug("X"), "x");
        assert_eq!(slug("YouTube"), "youtube");
        assert_eq!(slug("Hacker News"), "hacker-news");
        assert_eq!(slug("SoundCloud"), "soundcloud");
        assert_eq!(slug("  Fake  Platform! "), "fake-platform");
    }

    #[test]
    fn encode_uri_component_matches_javascript() {
        assert_eq!(
            encode_uri_component("{\"a\":\"b c/d?e=f&g\"}"),
            "%7B%22a%22%3A%22b%20c%2Fd%3Fe%3Df%26g%22%7D"
        );
        assert_eq!(encode_uri_component("-_.!~*'()"), "-_.!~*'()");
        assert_eq!(encode_uri_component("abc+/="), "abc%2B%2F%3D");
    }

    #[test]
    fn decode_uri_component_rejects_bad_escapes() {
        assert_eq!(decode_uri_component("a%2Bb").as_deref(), Some("a+b"));
        assert_eq!(decode_uri_component("100%"), None);
        assert_eq!(decode_uri_component("%zz"), None);
    }

    #[test]
    fn objects_round_trip() {
        #[derive(Serialize, serde::Deserialize, PartialEq, Debug)]
        struct Token {
            token: String,
        }
        let value = Token {
            token: "abc".into(),
        };
        let encoded = encode_object(&value);
        let base64 = decode_uri_component(&encoded).unwrap();
        assert_eq!(decode_object::<Token>(&base64).unwrap(), value);
    }

    #[test]
    fn lenient_base64_accepts_what_node_accepts() {
        assert_eq!(lenient_base64_decode("aGVsbG8="), b"hello");
        assert_eq!(lenient_base64_decode("aGVsbG8"), b"hello");
        assert_eq!(lenient_base64_decode("aGVs bG8\n"), b"hello");
        assert_eq!(lenient_base64_decode("-_-_"), vec![0xfb, 0xff, 0xbf]);
        assert_eq!(lenient_base64_decode("aGVsbG8=trailing"), b"hello");
    }

    #[test]
    fn ids_have_the_expected_shape() {
        let id = object_id();
        assert_eq!(id.len(), 24);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
        let token = random_token();
        assert_eq!(token.len(), 13);
        assert!(token.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn structured_text_lays_out_blocks() {
        let html = scraper::Html::parse_fragment(
            "<div class=\"d\"><p>Hello   <b>there</b></p>\n\n<p>token\n here</p><br>x</div>",
        );
        let selector = scraper::Selector::parse(".d").unwrap();
        let el = html.select(&selector).next().unwrap();
        assert_eq!(structured_text(el), "Hello there\ntoken here\nx");
    }
}
