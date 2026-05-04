use ::entity::event_model as EventModel;
use maud::{DOCTYPE, Markup, PreEscaped, html};

use super::{
    Collection, EventWithContent, STYLE_CSS, avatar_url, blob_url,
    decode_content_proto, decode_event_proto, display_label, format_pubkey,
    identity_keys, short_pubkey_list, shorten_hex, vector_clock_string,
};

pub(super) fn page_view(title: &str, body: Markup) -> Markup {
    html! {
        (DOCTYPE)
        html {
            head {
                meta charset="utf-8";
                title { (title) }
                style { (PreEscaped(STYLE_CSS)) }
            }
            body { (body) }
        }
    }
}

pub(super) fn back_to_debug_view() -> Markup {
    html! { p { a href="/" { "Back to events" } } }
}

/// Render one image variant. Returns empty markup if the image has no
/// blob/digest (shouldn't happen, but the proto types are all `Option`).
fn image_view(image: &crate::service::proto::Image) -> Markup {
    let Some(blob) = image.blob.as_ref() else {
        return html! {};
    };
    let Some(digest) = blob.digest.as_ref() else {
        return html! {};
    };
    let url = blob_url(digest);
    html! {
        figure style="display:inline-block; margin: 4px; vertical-align: top;" {
            a href=(url) target="_blank" {
                img src=(url) style="max-width: 240px; max-height: 240px; border: 1px solid #ddd; display: block;";
            }
            figcaption style="font-size: 0.8em; color: #666;" {
                (image.width) "x" (image.height) " - " (blob.mime_type) " - " (blob.size) "B"
            }
        }
    }
}

/// Lay out a profile-aware page header: avatar square on the left, caller-
/// supplied header content (heading + hex + display name) on the right.
/// Renders a grey placeholder square when the profile has no avatar.
pub(super) fn profile_row_view(
    profile: Option<&crate::service::proto::ProfileUpdate>,
    header: Markup,
) -> Markup {
    let url = avatar_url(profile);

    html! {
        div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 16px;" {
            @if let Some(url) = &url {
                img src=(url) style="width: 96px; height: 96px; object-fit: cover; border: 1px solid #ddd; flex-shrink: 0;";
            } @else {
                div style="width: 96px; height: 96px; background: #eee; border: 1px solid #ddd; flex-shrink: 0;" {}
            }
            div style="min-width: 0;" { (header) }
        }
    }
}

pub(super) fn display_name_line(
    profile: Option<&crate::service::proto::ProfileUpdate>,
) -> Markup {
    let name = profile.and_then(|p| p.name.as_deref()).unwrap_or("");
    html! {
        @if !name.is_empty() {
            p style="margin: 4px 0 0 0;" { (name) }
        }
    }
}

pub(super) fn key_link_view(key: &crate::service::proto::PublicKey) -> Markup {
    let key_hex = hex::encode(&key.key);
    let display = format_pubkey(key.key_type as i16, &key.key);
    html! {
        li { a href={ "/keypair/" (key_hex) } { (display) } }
    }
}

pub(super) fn content_view(
    content_proto: crate::service::proto::Content,
) -> Markup {
    use crate::service::proto::content::ContentBody;

    html! {
        div style="border: 1px solid #ddd; padding: 10px; margin: 10px 0;" {
            @match content_proto.content_body {
                Some(ContentBody::Post(post)) => {
                    p { strong { "Post:" } }
                    p { (post.text) }
                    @if !post.images.is_empty() {
                        div {
                            @for set in &post.images {
                                @for image in &set.images {
                                    (image_view(image))
                                }
                            }
                        }
                    }
                }
                Some(ContentBody::Follow(follow)) => {
                    p {
                        strong { "Follow: " }
                        a href={ "/identity/" (follow.identity) } { (shorten_hex(&follow.identity)) }
                    }
                }
                Some(ContentBody::Delete(delete)) => {
                    p {
                        strong { "Delete: " }
                        @if let Some(key) = delete.event_key {
                            (Collection::from(key.collection)) "." (key.sequence)
                        }
                    }
                }
                Some(ContentBody::ProfileUpdate(profile)) => {
                    p { strong { "Profile Update" } }
                    @if let Some(name) = profile.name { p { "Name: " (name) } }
                    @if let Some(desc) = profile.description { p { "Bio: " (desc) } }
                    @if let Some(avatar) = profile.avatar.as_ref() {
                        p { strong { "Avatar:" } }
                        div {
                            @for image in &avatar.images {
                                (image_view(image))
                            }
                        }
                    }
                    @if let Some(banner) = profile.banner.as_ref() {
                        p { strong { "Banner:" } }
                        div {
                            @for image in &banner.images {
                                (image_view(image))
                            }
                        }
                    }
                }
                Some(ContentBody::Identity(identity)) => {
                    p { strong { "Identity Document" } }
                    p { strong { "Rotation Keys:" } }
                    ol {
                        @for key in &identity.rotation_keys {
                            (key_link_view(key))
                        }
                    }
                    p { strong { "Signing Keys:" } }
                    ol {
                        @for key in &identity.signing_keys {
                            (key_link_view(key))
                        }
                    }
                }
                Some(ContentBody::Block(block)) => {
                    p {
                        strong { "Block: " }
                        a href={ "/identity/" (block.identity) } { (shorten_hex(&block.identity)) }
                    }
                }
                Some(ContentBody::Reaction(reaction)) => {
                    p { strong { "Reaction" } }
                    @if let Some(emoji) = reaction.emoji { p { "Emoji: " (emoji) } }
                }
                _ => { p { em { "Content type not displayed" } } }
            }
        }
    }
}

/// Inline byline for a post-style card: 32x32 avatar + display name (or
/// short hex fallback), the whole thing linked to the identity page.
/// `stopPropagation` keeps the click from bubbling to a parent card's
/// `onclick` (which navigates to the post itself).
fn post_byline_view(
    identity: &str,
    profile: Option<&crate::service::proto::ProfileUpdate>,
) -> Markup {
    let url = avatar_url(profile);
    let label = display_label(identity, profile);
    let href = format!("/identity/{}", identity);
    html! {
        a href=(href) onclick="event.stopPropagation()"
          style="display: inline-flex; gap: 8px; align-items: center; text-decoration: none; color: inherit;" {
            @if let Some(url) = &url {
                img src=(url) style="width: 32px; height: 32px; object-fit: cover; border-radius: 50%; flex-shrink: 0;";
            } @else {
                div style="width: 32px; height: 32px; background: #eee; border-radius: 50%; flex-shrink: 0;" {}
            }
            span style="text-decoration: underline;" { (label) }
        }
    }
}

/// "Reply to <display name>" chip linking to the parent post's detail page.
pub(super) fn reply_chip_view(
    parent: &crate::service::proto::EventKey,
    profile: Option<&crate::service::proto::ProfileUpdate>,
) -> Markup {
    let label = display_label(&parent.identity, profile);
    let href = format!(
        "/event/{}/{}/{}",
        parent.identity, parent.collection, parent.sequence
    );
    html! {
        p { em {
            "Reply to "
            a href=(href) { (label) }
        } }
    }
}

/// Render a post as a clickable card. The caller assembles the byline
/// (e.g. plain hex link for replies, full pfp+name for the expanded
/// feed view) and an optional reply chip; this function just supplies
/// the chrome (card div, onclick to the post's detail page, post text,
/// image variants).
pub(super) fn post_card_view(
    event: &EventModel::Model,
    post: &crate::service::proto::Post,
    byline: Markup,
    reply_chip: Option<Markup>,
) -> Markup {
    let onclick = format!(
        "window.location='/event/{}/{}/{}'",
        event.identity, event.collection, event.sequence
    );
    html! {
        div class="event-card" style="cursor: pointer; display: block; max-width: 600px;" onclick=(onclick) {
            (byline)
            @if let Some(chip) = reply_chip { (chip) }
            p style="white-space: pre-wrap;" { (post.text) }
            @if !post.images.is_empty() {
                div {
                    @for set in &post.images {
                        @for image in &set.images {
                            (image_view(image))
                        }
                    }
                }
            }
        }
    }
}

/// Render a single event card. `dimmed` greys out events not signed by a
/// focused key (used on the keypair page); `verbose` adds sequence,
/// vector clock, and identity-key summaries.
pub(super) fn event_card_view(
    event: &EventWithContent,
    dimmed: bool,
    verbose: bool,
) -> Markup {
    let (ev, content) = event;
    let collection = Collection::from(ev.collection);
    let signer_key_hex = hex::encode(&ev.public_key);
    let signer_key_display = format_pubkey(ev.public_key_type, &ev.public_key);

    let card_style = if dimmed {
        "cursor: pointer; background: #eee; opacity: 0.6;"
    } else {
        "cursor: pointer;"
    };
    let onclick = format!(
        "window.location='/event/{}/{}/{}'",
        ev.identity, ev.collection, ev.sequence
    );

    let proto = verbose
        .then(|| decode_event_proto(&ev.event_bytes))
        .flatten();
    let id_keys = verbose
        .then(|| identity_keys(ev, content.as_ref()))
        .flatten();

    html! {
        div class="event-card" style=(card_style) onclick=(onclick) {
            span class="event-identifier" {
                (collection.name().to_lowercase()) "." (ev.sequence)
            }
            div class="event-meta" {
                "Identity: "
                a href={ "/identity/" (ev.identity) } { (shorten_hex(&ev.identity)) }
            }
            div class="event-meta" {
                "Signer Key: "
                a href={ "/keypair/" (signer_key_hex) } { (shorten_hex(&signer_key_display)) }
            }
            @if verbose {
                @let identity_seq = proto.as_ref().map(|e| e.identity_sequence.to_string()).unwrap_or_else(|| "n/a".to_string());
                @let vc = vector_clock_string(proto.as_ref());
                div class="event-meta" {
                    "Seq: " (ev.sequence) " - Identity Seq: " (identity_seq) " - VC: " code { (vc) }
                }
                @if let Some(identity) = id_keys {
                    div class="event-meta" style="font-size:0.85em" {
                        "Rotation: [" (short_pubkey_list(&identity.rotation_keys)) "]"
                    }
                    div class="event-meta" style="font-size:0.85em" {
                        "Signing: [" (short_pubkey_list(&identity.signing_keys)) "]"
                    }
                }
            }
            div class="event-meta" { "Created: " (ev.created_at) }
        }
    }
}

/// In expanded mode on the index page: try to render a feed event as a
/// full post card. If the content can't be decoded as a `Post` (e.g. a
/// non-post feed event, or missing/corrupt content), fall back to the
/// regular event card so the row still appears.
pub(super) fn expanded_feed_card_or_fallback(
    event: &EventWithContent,
    profile_by_identity: &std::collections::HashMap<
        String,
        (i64, crate::service::proto::ProfileUpdate),
    >,
) -> Markup {
    use crate::service::proto::content::ContentBody;
    let (ev, content) = event;
    let post = content
        .as_ref()
        .and_then(|c| decode_content_proto(&c.serialized_bytes))
        .and_then(|p| match p.content_body {
            Some(ContentBody::Post(post)) => Some(post),
            _ => None,
        });

    let Some(post) = post else {
        return event_card_view(event, false, false);
    };

    let profile = profile_by_identity.get(&ev.identity).map(|(_, p)| p);
    let parent = post.reply.as_ref().and_then(|r| r.parent.as_ref());
    let parent_profile = parent
        .and_then(|p| profile_by_identity.get(&p.identity))
        .map(|(_, p)| p);

    let byline = html! {
        div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;" {
            (post_byline_view(&ev.identity, profile))
            span class="event-meta" { "- " (ev.created_at) }
        }
    };
    let reply_chip = parent.map(|p| reply_chip_view(p, parent_profile));
    post_card_view(ev, &post, byline, reply_chip)
}

/// Filter bar at the top of the index page. Plain GET form: each field
/// becomes a query parameter on submit, the page re-renders honoring
/// them. The hidden `submitted=1` field lets the handler distinguish
/// "user hasn't filtered yet, show all" from "user explicitly unchecked
/// everything, show nothing." Collection checkboxes are named
/// `show_<collection>` (e.g. `show_identity`).
pub(super) fn filter_bar_view(
    filters: &std::collections::HashMap<String, String>,
) -> Markup {
    let submitted = filters.contains_key("submitted");
    let get = |k: &str| filters.get(k).map(|s| s.as_str()).unwrap_or("");
    let cb_checked = |key: &str| -> bool {
        if !submitted {
            true
        } else {
            filters.contains_key(&format!("show_{}", key))
        }
    };
    let collections: Vec<(&str, &str, bool)> = vec![
        ("identity", "Identity", cb_checked("identity")),
        ("feed", "Feed", cb_checked("feed")),
        ("profile", "Profile", cb_checked("profile")),
        ("interactions", "Interactions", cb_checked("interactions")),
        ("social_graph", "Social Graph", cb_checked("social_graph")),
    ];

    html! {
        form method="get"
             style="border: 1px solid #ddd; padding: 12px; margin-bottom: 16px; background: #f9f9f9;" {
            input type="hidden" name="submitted" value="1";
            div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 8px;" {
                label { "Display name: " input type="text" name="name" value=(get("name")); }
                label { "Identity: " input type="text" name="identity" value=(get("identity")); }
                label { "Pubkey: " input type="text" name="key" value=(get("key")); }
                button type="submit" { "Apply" }
                a href="/" { "Reset" }
            }
            div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px;" {
                @for (key, label_text, checked) in &collections {
                    label {
                        input type="checkbox" name={ "show_" (key) } value="1" checked[*checked] onchange="this.form.submit()";
                        " " (label_text)
                    }
                }
            }
            div style="margin-bottom: 8px;" {
                label {
                    input type="checkbox" name="expand" value="1" checked[filters.contains_key("expand")] onchange="this.form.submit()";
                    " Expand feed posts"
                }
            }
        }
    }
}

/// Render `<h2>Collection (count)</h2>` sections of event cards, in
/// collection order. `dim_key` dims events not signed by that key.
pub(super) fn collections_view(
    collections: &std::collections::BTreeMap<i16, Vec<&EventWithContent>>,
    dim_key: Option<&[u8]>,
    verbose: bool,
) -> Markup {
    html! {
        @for (collection, col_events) in collections {
            h2 { (Collection::from(*collection)) " (" (col_events.len()) ")" }
            @for event in col_events {
                @let dimmed = dim_key.is_some_and(|k| event.0.public_key != k);
                (event_card_view(event, dimmed, verbose))
            }
        }
    }
}
