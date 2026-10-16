use std::collections::BTreeMap;

use crate::models::protos_v2::{EventKey, ListHeadsResponse};

/// Highest event key per (collection, signer).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Heads(BTreeMap<(i32, i32, Vec<u8>), EventKey>);

impl Heads {
    /// Merges `keys` in, returning whether any head moved forward.
    pub fn merge(&mut self, keys: impl IntoIterator<Item = EventKey>) -> bool {
        let mut changed = false;
        for key in keys {
            let (key_type, signer) = key
                .signed_by
                .as_ref()
                .map(|pk| (pk.key_type, pk.key.clone()))
                .unwrap_or_default();
            let head = (key.collection, key_type, signer);
            if self
                .0
                .get(&head)
                .is_none_or(|current| current.sequence < key.sequence)
            {
                self.0.insert(head, key);
                changed = true;
            }
        }
        changed
    }

    pub fn to_response(&self) -> ListHeadsResponse {
        ListHeadsResponse {
            heads: self.0.values().cloned().collect(),
        }
    }
}

impl FromIterator<EventKey> for Heads {
    fn from_iter<I: IntoIterator<Item = EventKey>>(keys: I) -> Self {
        let mut heads = Heads::default();
        heads.merge(keys);
        heads
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::protos_v2::PublicKey;

    fn key(collection: i32, signer: u8, sequence: u64) -> EventKey {
        EventKey {
            collection,
            identity: "bob".to_string(),
            signed_by: Some(PublicKey {
                key_type: 1,
                key: vec![signer],
            }),
            sequence,
        }
    }

    #[test]
    fn merge_keeps_the_highest_sequence_per_collection_and_signer() {
        let mut heads: Heads = [key(2, 1, 5), key(2, 1, 3), key(2, 2, 1)]
            .into_iter()
            .collect();
        assert!(heads.merge([key(3, 1, 1)]));
        assert_eq!(
            heads.to_response().heads,
            [key(2, 1, 5), key(2, 2, 1), key(3, 1, 1)]
        );
        assert!(!heads.merge([key(2, 1, 5), key(2, 1, 4)]), "nothing newer");
    }
}
