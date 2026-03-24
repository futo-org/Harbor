use std::{
    cmp,
    collections::{HashMap, HashSet},
};

use polycentric_common::{error::CoreError, models::SignedEvent};

/// Combines multiple feeds from different servers while ensuring that each server feed shows up equally often and no server can dominate.
///
/// # Arguments
/// * `server_feeds` - The list of server feeds to combine
/// * `max_per_server` - The maximum number of events to allow per server, if this argument is not set each server will be able to return as many events as it wants.
pub fn combine_server_feeds(
    server_feeds: Vec<Vec<SignedEvent>>,
    max_per_server: Option<usize>,
) -> Vec<SignedEvent> {
    let mut feed: Vec<SignedEvent> = vec![];

    let mut max_index = 0;

    for server_feed in server_feeds.iter() {
        max_index = cmp::max(max_index, server_feed.len());
    }

    if let Some(max) = max_per_server {
        max_index = max;
    }

    for i in 0..max_index {
        for server_feed in server_feeds.iter() {
            let feed_item = server_feed.get(i);

            if let Some(event) = feed_item {
                feed.push(event.clone());
            }
        }
    }

    feed
}

/// Removes all duplicate events and merges all moderation tags
///
/// # Arguments
/// * `engine` - The list of SignedEvent objects to deduplicate
pub fn deduplicate_events(
    events: Vec<SignedEvent>,
) -> std::result::Result<Vec<SignedEvent>, CoreError> {
    let mut combined_moderation_tags: HashMap<Vec<u8>, SignedEvent> = HashMap::new();

    for evt in events.iter() {
        if let Some(signed_event) = combined_moderation_tags.get_mut(&evt.event) {
            for i in 0..cmp::min(
                signed_event.moderation_tags.len(),
                evt.moderation_tags.len(),
            ) {
                let existing_tag = signed_event
                    .moderation_tags
                    .get(i)
                    .ok_or(CoreError::Unknown(format!("Index {:?} out of bounds", i)))?;
                let new_tag = evt
                    .moderation_tags
                    .get(i)
                    .ok_or(CoreError::Unknown(format!("Index {:?} out of bounds", i)))?;

                existing_tag.merge(new_tag);
            }
        } else {
            combined_moderation_tags.insert(evt.event.clone(), evt.clone());
        }
    }

    let mut existing_events: HashSet<Vec<u8>> = HashSet::new();
    let mut deduplicated_events: Vec<SignedEvent> = vec![];

    for evt in events {
        if existing_events.contains(&evt.event) {
            continue;
        }

        deduplicated_events.push(combined_moderation_tags.remove(&evt.event).ok_or(
            CoreError::Unknown("Failed to combine moderation tags".into()),
        )?);

        existing_events.insert(evt.event);
    }

    Ok(deduplicated_events)
}
