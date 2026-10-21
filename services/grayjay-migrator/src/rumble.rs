//! Rumble link previews via its oEmbed API - page-scraping Rumble gets
//! rate-limited, the oEmbed endpoint returns title + thumbnail directly.

use serde::Deserialize;
use std::time::Duration;

/// True for a Rumble video URL (`rumble.com/v…`); channel/user pages have no oEmbed.
pub fn is_video_url(url: &str) -> bool {
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let (host, path) = rest.split_once('/').unwrap_or((rest, ""));
    let host = host.trim_start_matches("www.").trim_start_matches("m.");
    host == "rumble.com" && path.starts_with('v') && path.len() > 1
}

#[derive(Deserialize)]
struct OEmbed {
    #[serde(default)]
    title: String,
    #[serde(default)]
    thumbnail_url: String,
}

/// One oEmbed attempt; `RateLimited` (429) is kept distinct so callers back off.
pub enum Outcome {
    Ok { title: String, thumbnail: String },
    RateLimited(Option<Duration>),
    Missing,
}

pub async fn oembed(client: &reqwest::Client, url: &str) -> Outcome {
    let resp = match client
        .get("https://rumble.com/api/Media/oembed.json")
        .query(&[("url", url)])
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
    match resp.json::<OEmbed>().await {
        Ok(d) if !d.title.is_empty() => Outcome::Ok {
            title: d.title,
            thumbnail: d.thumbnail_url,
        },
        _ => Outcome::Missing,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_video_urls() {
        assert!(is_video_url("https://rumble.com/v42qoht-some-title.html"));
        assert!(is_video_url("https://www.rumble.com/v1abc-x.html"));
        assert!(!is_video_url("https://rumble.com/c/Rumble"));
        assert!(!is_video_url("https://rumble.com/user/someone"));
        assert!(!is_video_url("https://youtube.com/watch?v=abc"));
    }
}
