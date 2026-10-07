//! YouTube link previews via the Data API v3 (`videos.list`, 50 ids/call) -
//! quota-based, avoiding the per-IP rate-limiting that page-scraping hits.

use serde::Deserialize;
use std::collections::HashMap;

/// True for any YouTube host (never send these to the scraper - it rate-limits them).
pub fn is_youtube_url(url: &str) -> bool {
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = host
        .trim_start_matches("www.")
        .trim_start_matches("m.")
        .trim_start_matches("music.");
    host == "youtube.com" || host == "youtu.be"
}

/// Extract the 11-character video id from a YouTube URL, if it is one.
/// Handles `watch?v=`, `youtu.be/`, `shorts/`, `embed/`, and `v/` forms.
pub fn video_id(url: &str) -> Option<String> {
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let (host, path_query) = rest.split_once('/').unwrap_or((rest, ""));
    let host = host
        .trim_start_matches("www.")
        .trim_start_matches("m.")
        .trim_start_matches("music.");

    let candidate = if host == "youtu.be" {
        path_query
            .split(['?', '&', '#', '/'])
            .next()
            .unwrap_or_default()
            .to_string()
    } else if host == "youtube.com" {
        let (path, query) = path_query.split_once('?').unwrap_or((path_query, ""));
        if path == "watch" || path.is_empty() {
            query
                .split('&')
                .find_map(|kv| kv.strip_prefix("v="))
                .unwrap_or_default()
                .to_string()
        } else if let Some(id) = path
            .strip_prefix("shorts/")
            .or_else(|| path.strip_prefix("embed/"))
            .or_else(|| path.strip_prefix("v/"))
        {
            id.split('/').next().unwrap_or_default().to_string()
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    is_video_id(&candidate).then_some(candidate)
}

/// A YouTube video id is exactly 11 URL-safe base64 characters.
pub fn is_video_id(s: &str) -> bool {
    s.len() == 11
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Metadata for one video (mirrors what a `Link` needs).
#[derive(Clone, Debug)]
pub struct VideoMeta {
    pub title: String,
    pub description: String,
    pub thumbnail: String,
}

/// Max ids per `videos.list` call.
pub const BATCH: usize = 50;

// --- Data API response shapes (only the fields we use) ---
#[derive(Deserialize)]
struct ListResponse {
    #[serde(default)]
    items: Vec<Item>,
    error: Option<ApiError>,
}
#[derive(Deserialize)]
struct ApiError {
    code: i64,
    message: String,
}
#[derive(Deserialize)]
struct Item {
    id: String,
    snippet: Snippet,
}
#[derive(Deserialize)]
struct Snippet {
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    thumbnails: HashMap<String, Thumbnail>,
}
#[derive(Deserialize)]
struct Thumbnail {
    url: String,
}

/// Fetch metadata for up to [`BATCH`] video ids in one API call, keyed by id.
/// Ids the API doesn't return (private/deleted) are simply absent.
pub async fn fetch_batch(
    client: &reqwest::Client,
    api_key: &str,
    ids: &[String],
) -> Result<HashMap<String, VideoMeta>, String> {
    let resp = client
        .get("https://www.googleapis.com/youtube/v3/videos")
        .query(&[
            ("part", "snippet"),
            ("id", &ids.join(",")),
            ("key", api_key),
            ("maxResults", "50"),
        ])
        .send()
        .await
        .map_err(|e| format!("youtube api request: {e}"))?;

    let status = resp.status();
    let body: ListResponse = resp
        .json()
        .await
        .map_err(|e| format!("youtube api decode: {e}"))?;
    if let Some(err) = body.error {
        return Err(format!("youtube api error {}: {}", err.code, err.message));
    }
    if !status.is_success() {
        return Err(format!("youtube api status {status}"));
    }

    let mut out = HashMap::with_capacity(body.items.len());
    for item in body.items {
        // Prefer the largest available thumbnail; fall back to the deterministic
        // hqdefault (always exists for a valid id).
        let thumbnail = ["maxres", "standard", "high", "medium", "default"]
            .iter()
            .find_map(|k| item.snippet.thumbnails.get(*k).map(|t| t.url.clone()))
            .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", item.id));
        out.insert(
            item.id,
            VideoMeta {
                title: item.snippet.title,
                description: item.snippet.description,
                thumbnail,
            },
        );
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_video_ids() {
        for (url, id) in [
            ("https://www.youtube.com/watch?v=papQ8xQxizA", "papQ8xQxizA"),
            (
                "https://youtube.com/watch?v=papQ8xQxizA&t=30s",
                "papQ8xQxizA",
            ),
            ("https://youtu.be/papQ8xQxizA", "papQ8xQxizA"),
            ("https://youtu.be/papQ8xQxizA?si=abc", "papQ8xQxizA"),
            ("https://www.youtube.com/shorts/papQ8xQxizA", "papQ8xQxizA"),
            ("https://m.youtube.com/watch?v=papQ8xQxizA", "papQ8xQxizA"),
        ] {
            assert_eq!(video_id(url).as_deref(), Some(id), "{url}");
        }
        assert_eq!(video_id("https://www.twitch.tv/videos/123"), None);
        assert_eq!(video_id("https://rumble.com/v45uecb-title.html"), None);
    }
}
