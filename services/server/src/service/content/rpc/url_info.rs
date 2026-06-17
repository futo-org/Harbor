//! `url_info`: fetch a URL server-side and extract Open Graph / HTML
//! metadata into a `Link`. Read-only — does not touch the DB or filestore.
//!
//! Doing the fetch server-side (rather than in each client) avoids leaking
//! reader IPs to arbitrary hosts and lets one fetch be shared/cached. The fetch
//! goes through [`crate::util::safe_http`], which enforces the SSRF trust
//! boundary (scheme/host validation + an internal-address-filtering resolver).

use crate::service::proto::{Link, UrlInfoRequest};
use crate::util::safe_http;
use reqwest::Url;
use tonic::Status;

/// Hard cap on how much of a response body we read before giving up. OG tags
/// live in `<head>`, so a couple MiB is plenty and bounds memory per request.
const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;

pub async fn handle(req: UrlInfoRequest) -> Result<Link, Status> {
    let mut resp = safe_http::get(&req.url).await.map_err(|e| match e {
        safe_http::FetchError::InvalidUrl(reason) => {
            Status::invalid_argument(reason)
        }
        safe_http::FetchError::Request(err) => {
            Status::unavailable(format!("failed to fetch url: {err}"))
        }
    })?;

    if !resp.status().is_success() {
        return Err(Status::unavailable(format!(
            "upstream returned status {}",
            resp.status()
        )));
    }

    // Only HTML documents carry OG/meta tags — nothing to parse otherwise.
    let is_html = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|ct| ct.contains("text/html"));
    if !is_html {
        return Err(Status::failed_precondition(
            "url did not return an HTML document",
        ));
    }

    let final_url = resp.url().clone();

    // Read at most MAX_BODY_BYTES; we don't need the whole page for `<head>`.
    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| Status::unavailable(format!("failed to read body: {e}")))?
    {
        body.extend_from_slice(&chunk);
        if body.len() >= MAX_BODY_BYTES {
            break;
        }
    }
    let html = String::from_utf8_lossy(&body);

    let meta = extract_metadata(&html, &final_url);

    Ok(Link {
        title: meta.title.unwrap_or_default(),
        description: meta.description.unwrap_or_default(),
        image: meta.image.unwrap_or_default(),
        url: req.url,
    })
}

#[derive(Default)]
struct Metadata {
    title: Option<String>,
    description: Option<String>,
    image: Option<String>,
}

/// Extract preview metadata from an HTML document, preferring Open Graph,
/// then Twitter cards, then plain HTML (`<title>`, `<meta name=description>`).
/// `base` is the final (post-redirect) URL, used to resolve relative images.
fn extract_metadata(html: &str, base: &Url) -> Metadata {
    use scraper::{Html, Selector};

    let doc = Html::parse_document(html);

    // `scraper`'s types are !Send, but everything here is synchronous: nothing
    // is held across an await, so `handle` stays Send.
    let meta_sel = Selector::parse("meta").unwrap();

    let mut og_title = None;
    let mut og_desc = None;
    let mut og_image = None;
    let mut tw_title = None;
    let mut tw_desc = None;
    let mut tw_image = None;
    let mut meta_desc = None;

    for el in doc.select(&meta_sel) {
        let v = el.value();
        // OG uses `property`; Twitter/standard use `name`.
        let key = v.attr("property").or_else(|| v.attr("name"));
        let (Some(key), Some(content)) = (key, v.attr("content")) else {
            continue;
        };
        let content = content.trim();
        if content.is_empty() {
            continue;
        }
        match key.to_ascii_lowercase().as_str() {
            "og:title" => og_title.get_or_insert_with(|| content.to_string()),
            "og:description" => {
                og_desc.get_or_insert_with(|| content.to_string())
            }
            "og:image" | "og:image:url" | "og:image:secure_url" => {
                og_image.get_or_insert_with(|| content.to_string())
            }
            "twitter:title" => {
                tw_title.get_or_insert_with(|| content.to_string())
            }
            "twitter:description" => {
                tw_desc.get_or_insert_with(|| content.to_string())
            }
            "twitter:image" | "twitter:image:src" => {
                tw_image.get_or_insert_with(|| content.to_string())
            }
            "description" => {
                meta_desc.get_or_insert_with(|| content.to_string())
            }
            _ => continue,
        };
    }

    let html_title = Selector::parse("title").ok().and_then(|sel| {
        doc.select(&sel).next().map(|e| {
            e.text()
                .collect::<String>()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        })
    });

    let image = og_image.or(tw_image).and_then(|img| {
        // Resolve relative URLs (e.g. `/og.png`) against the page URL.
        base.join(&img).ok().map(|u| u.to_string())
    });

    Metadata {
        title: og_title
            .or(tw_title)
            .or(html_title)
            .filter(|s| !s.is_empty()),
        description: og_desc.or(tw_desc).or(meta_desc),
        image,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_open_graph_then_falls_back() {
        let base = Url::parse("https://example.com/post").unwrap();
        let html = r#"
            <html><head>
              <title>Plain Title</title>
              <meta name="description" content="plain desc">
              <meta property="og:title" content="OG Title">
              <meta property="og:image" content="/cover.png">
            </head><body></body></html>
        "#;
        let m = extract_metadata(html, &base);
        assert_eq!(m.title.as_deref(), Some("OG Title"));
        // No og:description, falls back to <meta name=description>.
        assert_eq!(m.description.as_deref(), Some("plain desc"));
        // Relative image resolved against the page URL.
        assert_eq!(m.image.as_deref(), Some("https://example.com/cover.png"));
    }

    #[test]
    fn title_falls_back_to_html_title() {
        let base = Url::parse("https://example.com/").unwrap();
        let html = "<html><head><title>  Spaced   Title </title></head></html>";
        let m = extract_metadata(html, &base);
        assert_eq!(m.title.as_deref(), Some("Spaced Title"));
        assert!(m.image.is_none());
    }
}
