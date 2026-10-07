//! Direct Open Graph extraction: fetch a page as a crawler and read its
//! `og:`/`twitter:` tags, bypassing the server scraper (whose datacenter IP many
//! video hosts block). Client-rendered pages without server-side OG won't resolve.

use std::time::Duration;

const CRAWLER_UA: &str =
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

/// The result of one fetch. 429 is distinguished so callers can back off and
/// retry (some hosts, e.g. Kick, rate-limit by volume) rather than give up.
pub enum Outcome {
    Ok {
        title: String,
        description: String,
        image: String,
    },
    /// HTTP 429 - carries the `Retry-After` delay if the server sent one.
    RateLimited(Option<Duration>),
    /// No preview (other non-2xx, fetch/decode error, or no usable tags).
    Missing,
}

/// One fetch of `url` as a crawler, extracting `(title, description, image)` from
/// its Open Graph tags (falling back to `twitter:` tags and `<title>`).
pub async fn attempt(client: &reqwest::Client, url: &str) -> Outcome {
    let resp = match client
        .get(url)
        .header("user-agent", CRAWLER_UA)
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return Outcome::Missing,
    };
    if resp.status().as_u16() == 429 {
        let retry_after = resp
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
            .map(Duration::from_secs);
        return Outcome::RateLimited(retry_after);
    }
    if !resp.status().is_success() {
        return Outcome::Missing;
    }
    let body = match resp.text().await {
        Ok(b) => b,
        Err(_) => return Outcome::Missing,
    };
    // Scan only <head> (bounded); walk back to a char boundary before slicing.
    let mut head_end = body
        .find("</head>")
        .map(|i| i + "</head>".len())
        .unwrap_or(1_000_000)
        .min(body.len());
    while !body.is_char_boundary(head_end) {
        head_end -= 1;
    }
    let html = &body[..head_end];

    let title = meta(html, "og:title")
        .or_else(|| meta(html, "twitter:title"))
        .or_else(|| title_tag(html))
        .map(|s| decode_entities(&s))
        .unwrap_or_default();
    let description = meta(html, "og:description")
        .or_else(|| meta(html, "twitter:description"))
        .map(|s| decode_entities(&s))
        .unwrap_or_default();
    let image = meta(html, "og:image")
        .or_else(|| meta(html, "twitter:image"))
        .map(|s| decode_entities(&s))
        .unwrap_or_default();

    if title.is_empty() && description.is_empty() && image.is_empty() {
        Outcome::Missing
    } else {
        Outcome::Ok {
            title,
            description,
            image,
        }
    }
}

/// Content of the first `<meta>` whose `property`/`name` equals `key`.
fn meta(html: &str, key: &str) -> Option<String> {
    let mut rest = html;
    while let Some(pos) = rest.find("<meta") {
        rest = &rest[pos + "<meta".len()..];
        let end = rest.find('>').unwrap_or(rest.len());
        let tag = &rest[..end];
        rest = &rest[end..];
        let prop = attr(tag, "property").or_else(|| attr(tag, "name"));
        if prop.as_deref() == Some(key) {
            if let Some(content) = attr(tag, "content") {
                if !content.is_empty() {
                    return Some(content);
                }
            }
        }
    }
    None
}

/// Value of quoted attribute `name` in a tag body (either quote style).
fn attr(tag: &str, name: &str) -> Option<String> {
    let mut from = 0;
    while let Some(p) = tag[from..].find(name) {
        let start = from + p;
        let before_ok = start == 0 || !tag.as_bytes()[start - 1].is_ascii_alphanumeric();
        let after = tag[start + name.len()..].trim_start();
        if before_ok {
            if let Some(v) = after.strip_prefix('=') {
                let v = v.trim_start();
                let (quote, body) = match v.strip_prefix('"') {
                    Some(b) => ('"', b),
                    None => ('\'', v.strip_prefix('\'')?),
                };
                let end = body.find(quote)?;
                return Some(body[..end].to_string());
            }
        }
        from = start + name.len();
    }
    None
}

/// Text of the `<title>` element, if any.
fn title_tag(html: &str) -> Option<String> {
    let open = html.find("<title")?;
    let gt = html[open..].find('>')? + open + 1;
    let close = html[gt..].find("</title>")? + gt;
    let text = html[gt..close].trim();
    (!text.is_empty()).then(|| text.to_string())
}

/// Decode the handful of HTML entities common in meta content.
fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#039;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_og_tags_either_attribute_order() {
        let html = r#"<head>
          <meta property="og:title" content="Hello &amp; Goodbye">
          <meta content="a description" name="og:description">
          <meta property='og:image' content='https://x/i.jpg'>
        </head>"#;
        assert_eq!(
            meta(html, "og:title").as_deref(),
            Some("Hello &amp; Goodbye")
        );
        assert_eq!(
            meta(html, "og:description").as_deref(),
            Some("a description")
        );
        assert_eq!(meta(html, "og:image").as_deref(), Some("https://x/i.jpg"));
    }

    #[test]
    fn falls_back_to_title_tag_and_decodes() {
        let html = "<head><title>Bare &#39;Title&#39;</title></head>";
        assert!(meta(html, "og:title").is_none());
        assert_eq!(title_tag(html).as_deref(), Some("Bare &#39;Title&#39;"));
        assert_eq!(decode_entities("Bare &#39;Title&#39;"), "Bare 'Title'");
    }
}
