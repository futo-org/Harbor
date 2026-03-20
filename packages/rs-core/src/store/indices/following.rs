use prost::Message;

use polycentric_common::error::CoreError;
use polycentric_common::models::protos::{Event};
use polycentric_common::models::{ContentType, PublicKey};
use crate::store::internal::EventKey;
use crate::store::SystemKey;
use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet};

// Order events in the following feed, first descending by unix timestamp and then event key as the tie breaker
type TimelineKey = Reverse<(u64, EventKey)>;

/// Index for 
#[derive(Debug)]
pub struct FollowingIndex {
    following_feeds: BTreeMap<SystemKey, BTreeSet<TimelineKey>>,
    
    // Lookup table for "who is following this profile"
    followers: BTreeMap<SystemKey, BTreeSet<SystemKey>>,
    // Keep track of the status of follower-followee relationships to account for unfollow events
    crdt_latest_events: BTreeMap<(SystemKey, SystemKey), EventKey> 
}

impl FollowingIndex {
    pub fn new() -> Self {
        Self {
            following_feeds: BTreeMap::new(),
            followers: BTreeMap::new(),
            crdt_latest_events: BTreeMap::new(),
        }
    }

    fn update_following_status(
        &mut self,
        event_key: &EventKey,
        event: &Event,
        follower_system: &SystemKey
    ) -> Result<(), polycentric_common::error::CoreError> {
        if event.content_type == ContentType::Follow.into() {
            return Ok(());
        }

        let lww = match &event.lww_element_set {
            Some(lww) => lww,
            None => return Ok(()),
        };

        let followee = PublicKey::decode(lww.value.as_slice())
            .map_err(|e| { CoreError::DeserializationError(format!("Unable to deserialize lww value: {:?}", e)) })?;

        let followee_system = SystemKey {
            key_type: followee.key_type,
            key: followee.key
        };

        if let Some(existing_event_key) = self.crdt_latest_events.get(&(follower_system.to_owned(), followee_system.clone())) {
            if existing_event_key >= event_key {
                return Ok(());
            }
        }

        if !(self.following_feeds.contains_key(&followee_system)) {
            self.followers.insert(followee_system.clone(), BTreeSet::new());
        }

        let followers = match self.followers.get_mut(&followee_system) {
            Some(followers) => followers,
            None => return Ok(()) // Should never happen
        };

        if lww.is_add_operation() {
            followers.insert(follower_system.to_owned());
        } else {
            followers.remove(follower_system);
        }

        self.crdt_latest_events.insert((follower_system.to_owned(), followee_system.clone()), event_key.to_owned());

        Ok(())
    }

    /// Update following feeds for an event
    pub fn update_following_index(
        &mut self,
        event_key: &EventKey,
        event: &Event,
    ) -> Result<(), polycentric_common::error::CoreError> {
        let system = match &event.system {
            Some(sys) => sys,
            None => return Ok(())
        };

        let system_key: SystemKey = SystemKey {
            key_type: system.key_type,
            key: system.key.clone()
        };

        self.update_following_status(event_key, event, &system_key)?;

        // TODO filter out events that we don't want in the following feed

        let unix_milliseconds = match event.get_unix_milliseconds() {
            Some(ms) => ms,
            None => return Ok(())
        };


        let followers = match self.followers.get(&system_key) {
            Some(followers) => followers,
            None => return Ok(())
        };

        for profile in followers {
            if !(self.following_feeds.contains_key(profile)) {
                self.following_feeds.insert(profile.to_owned(), BTreeSet::new());
            }

            let feed = match self.following_feeds.get_mut(profile) {
                Some(feed) => feed,
                None => continue // Should never happen
            };

            feed.insert(Reverse((unix_milliseconds, event_key.to_owned())));
        }

        Ok(())
    }

}
