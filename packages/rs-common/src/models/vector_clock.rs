use crate::error::CoreError;
use crate::models::protos_v2::{Identity, PublicKey, VectorClock};

impl VectorClock {
    /// Returns a signers position in the vector clock
    pub fn get_signer_position(
        &self,
        identity_content: &Identity,
        signer: &PublicKey,
        expected_self_sequence: u64,
    ) -> Result<usize, CoreError> {
        let dedup = identity_content.deduplicated_keys();
        if self.sequence.len() != dedup.len() {
            return Err(CoreError::InvalidEvent(format!(
                "vector_clock has {} entries but identity doc lists {} keys",
                self.sequence.len(),
                dedup.len()
            )));
        }
        let pos = dedup
            .iter()
            .position(|pk| pk.key_type == signer.key_type && pk.key == signer.key)
            .ok_or_else(|| {
                CoreError::InvalidEvent(
                    "Signer not present in identity doc — cannot index vector clock".into(),
                )
            })?;
        if self.sequence[pos] != expected_self_sequence {
            return Err(CoreError::InvalidEvent(format!(
                "vector_clock self entry {} doesn't match expected sequence {}",
                self.sequence[pos], expected_self_sequence
            )));
        }
        Ok(pos)
    }

    /// Strict happens-before in the Lamport sense: every entry in `self` is
    /// <= the corresponding entry in `other`, and at least one is strictly
    /// less. VCs of different length are treated as incomparable.
    pub fn happens_before(&self, other: &VectorClock) -> bool {
        if self.sequence.len() != other.sequence.len() {
            return false;
        }
        let mut strict = false;
        for (a, b) in self.sequence.iter().zip(other.sequence.iter()) {
            if a > b {
                return false;
            }
            if a < b {
                strict = true;
            }
        }
        strict
    }

    /// Two VCs are concurrent if neither happens-before the other.
    pub fn concurrent_with(&self, other: &VectorClock) -> bool {
        !self.happens_before(other) && !other.happens_before(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ED25519: i32 = 1;

    fn pk(key: &[u8]) -> PublicKey {
        PublicKey {
            key_type: ED25519,
            key: key.to_vec(),
        }
    }

    fn identity(rotation: Vec<PublicKey>, signing: Vec<PublicKey>) -> Identity {
        Identity {
            rotation_keys: rotation,
            signing_keys: signing,
            revocation_bounds: Vec::new(),
            servers: None,
            recovery_key: None,
            recovery_signature: None,
        }
    }

    fn vc(seq: &[u64]) -> VectorClock {
        VectorClock {
            sequence: seq.to_vec(),
        }
    }

    fn assert_invalid_event(err: CoreError, needle: &str) {
        match err {
            CoreError::InvalidEvent(msg) => assert!(
                msg.contains(needle),
                "expected message to contain {needle:?}, got {msg:?}",
            ),
            other => panic!("expected InvalidEvent, got {other:?}"),
        }
    }

    // ------- get_signer_position -------

    #[test]
    fn signer_position_returns_index_in_dedup_order() {
        let a = pk(b"a");
        let b = pk(b"b");
        let c = pk(b"c");
        let doc = identity(vec![a.clone(), b.clone()], vec![c.clone()]);

        assert_eq!(vc(&[7, 0, 0]).get_signer_position(&doc, &a, 7).unwrap(), 0);
        assert_eq!(vc(&[0, 4, 0]).get_signer_position(&doc, &b, 4).unwrap(), 1);
        assert_eq!(vc(&[0, 0, 9]).get_signer_position(&doc, &c, 9).unwrap(), 2);
    }

    #[test]
    fn signer_position_uses_dedup_ordering_not_raw_lists() {
        // `shared` appears in both rotation and signing — dedup keeps only the
        // first occurrence, so the doc's positions are [shared, signing-only].
        let shared = pk(b"shared");
        let signing_only = pk(b"signing-only");
        let doc = identity(
            vec![shared.clone()],
            vec![shared.clone(), signing_only.clone()],
        );

        let pos = vc(&[3, 0]).get_signer_position(&doc, &shared, 3).unwrap();
        assert_eq!(pos, 0);
        let pos = vc(&[0, 5])
            .get_signer_position(&doc, &signing_only, 5)
            .unwrap();
        assert_eq!(pos, 1);
    }

    #[test]
    fn signer_position_rejects_length_mismatch() {
        let doc = identity(vec![pk(b"a"), pk(b"b")], vec![]);
        let err = vc(&[1])
            .get_signer_position(&doc, &pk(b"a"), 1)
            .unwrap_err();
        assert_invalid_event(err, "2 keys");

        let err = vc(&[1, 2, 3])
            .get_signer_position(&doc, &pk(b"a"), 1)
            .unwrap_err();
        assert_invalid_event(err, "3 entries");
    }

    #[test]
    fn signer_position_rejects_unknown_signer() {
        let doc = identity(vec![pk(b"a"), pk(b"b")], vec![]);
        let err = vc(&[1, 2])
            .get_signer_position(&doc, &pk(b"unknown"), 1)
            .unwrap_err();
        assert_invalid_event(err, "Signer not present");
    }

    #[test]
    fn signer_position_rejects_wrong_self_sequence() {
        let doc = identity(vec![pk(b"a"), pk(b"b")], vec![]);
        let err = vc(&[7, 0])
            .get_signer_position(&doc, &pk(b"a"), 8)
            .unwrap_err();
        assert_invalid_event(err, "self entry");
    }

    #[test]
    fn signer_position_accepts_zero_self_sequence_when_expected() {
        let doc = identity(vec![pk(b"a"), pk(b"b")], vec![]);
        assert_eq!(
            vc(&[0, 0]).get_signer_position(&doc, &pk(b"a"), 0).unwrap(),
            0
        );
    }

    #[test]
    fn signer_position_empty_doc_rejects_any_signer() {
        let doc = identity(vec![], vec![]);
        // length matches (0 == 0), but signer cannot be found.
        let err = vc(&[]).get_signer_position(&doc, &pk(b"a"), 0).unwrap_err();
        assert_invalid_event(err, "Signer not present");
    }

    // ------- happens_before -------

    #[test]
    fn happens_before_strictly_less_in_one_position() {
        assert!(vc(&[1, 2, 3]).happens_before(&vc(&[1, 2, 4])));
    }

    #[test]
    fn happens_before_strictly_less_in_all_positions() {
        assert!(vc(&[0, 0, 0]).happens_before(&vc(&[1, 2, 3])));
    }

    #[test]
    fn happens_before_equal_vcs_are_not_strict() {
        assert!(!vc(&[1, 2, 3]).happens_before(&vc(&[1, 2, 3])));
    }

    #[test]
    fn happens_before_rejects_when_any_entry_is_greater() {
        assert!(!vc(&[1, 5, 3]).happens_before(&vc(&[1, 2, 4])));
    }

    #[test]
    fn happens_before_rejects_different_length() {
        assert!(!vc(&[1, 2]).happens_before(&vc(&[1, 2, 3])));
        assert!(!vc(&[1, 2, 3]).happens_before(&vc(&[1, 2])));
    }

    #[test]
    fn happens_before_empty_vcs_not_strict() {
        assert!(!vc(&[]).happens_before(&vc(&[])));
    }

    #[test]
    fn happens_before_is_antisymmetric() {
        let a = vc(&[1, 2, 3]);
        let b = vc(&[1, 2, 4]);
        assert!(a.happens_before(&b));
        assert!(!b.happens_before(&a));
    }

    // ------- concurrent_with -------

    #[test]
    fn concurrent_with_crossed_inequalities() {
        let a = vc(&[5, 1]);
        let b = vc(&[2, 9]);
        assert!(a.concurrent_with(&b));
        assert!(b.concurrent_with(&a));
    }

    #[test]
    fn concurrent_with_equal_vcs_are_concurrent() {
        // Neither happens-before the other, so they qualify as concurrent.
        let a = vc(&[1, 2, 3]);
        assert!(a.concurrent_with(&a.clone()));
    }

    #[test]
    fn concurrent_with_ordered_vcs_are_not_concurrent() {
        let a = vc(&[1, 2, 3]);
        let b = vc(&[1, 2, 4]);
        assert!(!a.concurrent_with(&b));
        assert!(!b.concurrent_with(&a));
    }

    #[test]
    fn concurrent_with_different_lengths_are_concurrent() {
        // Different-length VCs are incomparable under happens_before, so
        // concurrent_with reports them as concurrent.
        let a = vc(&[1, 2]);
        let b = vc(&[1, 2, 3]);
        assert!(a.concurrent_with(&b));
        assert!(b.concurrent_with(&a));
    }

    #[test]
    fn concurrent_with_empty_vcs_are_concurrent() {
        assert!(vc(&[]).concurrent_with(&vc(&[])));
    }
}
