//! Stores cached metadata from servers for posts or other events.

use std::collections::BTreeMap;

use polycentric_common::models::protos_v2::EventMetadata;

use super::keys::EventKey;

#[derive(Debug, Default)]
pub struct MetaStore {
    meta_map: BTreeMap<EventKey, EventMetadata>,
}

impl MetaStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Create metadata entry for `key` if not already present
    /// and overwrite any non-null fields with `meta`'s data.
    pub fn include(&mut self, event_key: EventKey, meta: EventMetadata) {
        let stored = self.meta_map.entry(event_key).or_default();

        if let Some(reply_count) = meta.reply_count {
            stored.reply_count = Some(reply_count);
        }

        if let Some(reaction_count) = meta.reaction_count {
            stored.reaction_count = Some(reaction_count);
        }

        if let Some(upvote_count) = meta.upvote_count {
            stored.upvote_count = Some(upvote_count);
        }

        if let Some(downvote_count) = meta.downvote_count {
            stored.downvote_count = Some(downvote_count);
        }

        // Reactions tallies are a repeated field, so there is no way to
        // distinguish between "empty" and "not present."
        // We will use presence of tallies or a total reaction count as a heuristic.
        if meta.reaction_count.is_some() || !meta.emoji_reactions.is_empty() {
            stored.emoji_reactions = meta.emoji_reactions;
        }
    }

    /// Get the cached metadata for an event, if it is present.
    pub fn get(&self, event_key: &EventKey) -> Option<&EventMetadata> {
        self.meta_map.get(event_key)
    }

    /// Remove and return the cached metadata for an event if it is present.
    pub fn remove(&mut self, event_key: &EventKey) -> Option<EventMetadata> {
        self.meta_map.remove(event_key)
    }
}
