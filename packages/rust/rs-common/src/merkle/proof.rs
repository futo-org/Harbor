//! EventProof verification against an `EventProofTarget`.

use crate::{
    error::CoreError,
    models::protos_v2::{EventProof, EventProofTarget, Identity, PublicKey},
};

use super::leaves::CanonicalKey;
use super::tree::{Hash, MerkleTree, verify_inclusion};

/// Proofs for the `events` that keys revoked in `document` signed, each with
/// the event's index in `events`. `events` are all those of one collection.
pub fn revocation_proofs(
    document: &Identity,
    collection: i32,
    events: &[(PublicKey, CanonicalKey)],
) -> Vec<(usize, EventProof)> {
    let mut canonical: Vec<usize> = (0..events.len()).collect();
    canonical.sort_by(|a, b| events[*a].1.cmp(&events[*b].1));
    let tree = MerkleTree::new(canonical.iter().map(|event| events[*event].1.2.as_slice()));

    canonical
        .iter()
        .enumerate()
        .filter_map(|(leaf_index, &event)| {
            let signer = &events[event].0;
            if document.authorizes_signer(signer) {
                return None;
            }
            let target = document.revocation_target_for(signer, collection)?;
            let leaf_count = usize::try_from(target.leaf_count).ok()?;
            // Our events must be the ones the target committed to.
            if tree.root(leaf_count)?.as_slice() != target.root.as_slice() {
                return None;
            }
            let audit_path = tree.audit_path(leaf_index, leaf_count)?;
            Some((
                event,
                EventProof {
                    target_signature: target.signature.clone(),
                    leaf_index: leaf_index as u64,
                    audit_path: audit_path.iter().map(|hash| hash.to_vec()).collect(),
                },
            ))
        })
        .collect()
}

/// Verify `leaf_signature` is at `leaf_index` in the tree of size
/// `target.leaf_count` rooted at `target.root`.
pub fn verify_proof(
    leaf_signature: &[u8],
    leaf_index: u64,
    target: &EventProofTarget,
    audit_path: &[Vec<u8>],
) -> Result<(), CoreError> {
    if leaf_index >= target.leaf_count {
        return Err(CoreError::InvalidEvent(format!(
            "leaf_index {} >= target leaf_count {}",
            leaf_index, target.leaf_count,
        )));
    }
    if target.root.len() != 32 {
        return Err(CoreError::InvalidEvent(
            "target root must be 32 bytes".into(),
        ));
    }
    if audit_path.iter().any(|h| h.len() != 32) {
        return Err(CoreError::InvalidEvent(
            "audit_path entries must be 32 bytes".into(),
        ));
    }

    let mut expected_root: Hash = [0u8; 32];
    expected_root.copy_from_slice(&target.root);
    let siblings: Vec<Hash> = audit_path
        .iter()
        .map(|h| {
            let mut a = [0u8; 32];
            a.copy_from_slice(h);
            a
        })
        .collect();

    if !verify_inclusion(
        leaf_signature,
        leaf_index,
        target.leaf_count,
        &siblings,
        &expected_root,
    ) {
        return Err(CoreError::InvalidEvent(
            "EventProof does not verify against target".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::tree::{build_audit_path, merkle_tree_hash};
    use super::*;

    fn leaves(n: usize) -> Vec<Vec<u8>> {
        (0..n).map(|i| vec![i as u8]).collect()
    }

    fn target(leaves: &[Vec<u8>]) -> EventProofTarget {
        EventProofTarget {
            collection: 0,
            signature: Vec::new(),
            root: merkle_tree_hash(leaves).unwrap().to_vec(),
            leaf_count: leaves.len() as u64,
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

    #[test]
    fn builds_proofs_for_the_events_of_revoked_keys() {
        use crate::models::protos_v2::RevocationBound;

        let key = |byte: u8| PublicKey {
            key_type: 1,
            key: vec![byte; 32],
        };
        let (kept, revoked) = (key(1), key(2));
        // Four events in canonical order: the revoked key signed 0, 2 and 3.
        let events: Vec<(PublicKey, CanonicalKey)> = [&revoked, &kept, &revoked, &revoked]
            .into_iter()
            .enumerate()
            .map(|(index, signer)| (signer.clone(), (index as u64, 0, vec![index as u8; 64])))
            .collect();
        let signatures: Vec<Vec<u8>> = events.iter().map(|(_, key)| key.2.clone()).collect();
        // Revoked at event 3, committing to the three events before it.
        let target = EventProofTarget {
            collection: 2,
            signature: signatures[3].clone(),
            root: merkle_tree_hash(&signatures[..3]).unwrap().to_vec(),
            leaf_count: 3,
        };
        let document = Identity {
            rotation_keys: vec![kept],
            revocation_bounds: vec![RevocationBound {
                revoked_key: Some(revoked),
                targets: vec![target.clone()],
            }],
            ..Default::default()
        };

        let proofs = revocation_proofs(&document, 2, &events);
        let proven: Vec<usize> = proofs.iter().map(|(event, _)| *event).collect();
        assert_eq!(proven, [0, 2]);
        for (event, proof) in &proofs {
            verify_proof(
                &signatures[*event],
                proof.leaf_index,
                &target,
                &proof.audit_path,
            )
            .unwrap();
        }

        // With an event missing, the root no longer matches.
        assert!(revocation_proofs(&document, 2, &events[1..]).is_empty());
    }

    #[test]
    fn verifies_valid_proof() {
        let ls = leaves(8);
        let t = target(&ls);
        for i in 0..ls.len() as u64 {
            let path = build_audit_path(&ls, i).unwrap();
            let path_bytes: Vec<Vec<u8>> = path.iter().map(|h| h.to_vec()).collect();
            verify_proof(&ls[i as usize], i, &t, &path_bytes)
                .unwrap_or_else(|e| panic!("index {i}: {e:?}"));
        }
    }

    #[test]
    fn verifies_single_leaf_with_empty_path() {
        let ls = leaves(1);
        let t = target(&ls);
        verify_proof(&ls[0], 0, &t, &[]).unwrap();
    }

    #[test]
    fn verifies_non_power_of_two_sizes() {
        for size in [3usize, 5, 7, 13] {
            let ls = leaves(size);
            let t = target(&ls);
            for i in 0..size as u64 {
                let path = build_audit_path(&ls, i).unwrap();
                let path_bytes: Vec<Vec<u8>> = path.iter().map(|h| h.to_vec()).collect();
                verify_proof(&ls[i as usize], i, &t, &path_bytes)
                    .unwrap_or_else(|e| panic!("size={size} index={i}: {e:?}"));
            }
        }
    }

    #[test]
    fn rejects_index_out_of_range() {
        let ls = leaves(4);
        let t = target(&ls);
        let path = build_audit_path(&ls, 0).unwrap();
        let path_bytes: Vec<Vec<u8>> = path.iter().map(|h| h.to_vec()).collect();

        let err = verify_proof(&ls[0], 4, &t, &path_bytes).unwrap_err();
        assert_invalid_event(err, "leaf_index");

        let err = verify_proof(&ls[0], u64::MAX, &t, &path_bytes).unwrap_err();
        assert_invalid_event(err, "leaf_index");
    }

    #[test]
    fn rejects_root_with_wrong_length() {
        let ls = leaves(4);
        let mut t = target(&ls);
        let path = build_audit_path(&ls, 0).unwrap();
        let path_bytes: Vec<Vec<u8>> = path.iter().map(|h| h.to_vec()).collect();

        t.root = vec![0u8; 31];
        let err = verify_proof(&ls[0], 0, &t, &path_bytes).unwrap_err();
        assert_invalid_event(err, "root must be 32 bytes");

        t.root = Vec::new();
        let err = verify_proof(&ls[0], 0, &t, &path_bytes).unwrap_err();
        assert_invalid_event(err, "root must be 32 bytes");

        t.root = vec![0u8; 33];
        let err = verify_proof(&ls[0], 0, &t, &path_bytes).unwrap_err();
        assert_invalid_event(err, "root must be 32 bytes");
    }

    #[test]
    fn rejects_audit_path_entry_with_wrong_length() {
        let ls = leaves(4);
        let t = target(&ls);
        let mut path_bytes: Vec<Vec<u8>> = build_audit_path(&ls, 0)
            .unwrap()
            .iter()
            .map(|h| h.to_vec())
            .collect();

        path_bytes[0].truncate(31);
        let err = verify_proof(&ls[0], 0, &t, &path_bytes).unwrap_err();
        assert_invalid_event(err, "audit_path entries must be 32 bytes");

        path_bytes[0] = vec![0u8; 33];
        let err = verify_proof(&ls[0], 0, &t, &path_bytes).unwrap_err();
        assert_invalid_event(err, "audit_path entries must be 32 bytes");
    }

    #[test]
    fn rejects_tampered_audit_path() {
        let ls = leaves(8);
        let t = target(&ls);
        let mut path_bytes: Vec<Vec<u8>> = build_audit_path(&ls, 3)
            .unwrap()
            .iter()
            .map(|h| h.to_vec())
            .collect();
        path_bytes[0][0] ^= 0x01;

        let err = verify_proof(&ls[3], 3, &t, &path_bytes).unwrap_err();
        assert_invalid_event(err, "does not verify");
    }

    #[test]
    fn rejects_wrong_leaf_signature() {
        let ls = leaves(8);
        let t = target(&ls);
        let path = build_audit_path(&ls, 3).unwrap();
        let path_bytes: Vec<Vec<u8>> = path.iter().map(|h| h.to_vec()).collect();

        let err = verify_proof(&ls[4], 3, &t, &path_bytes).unwrap_err();
        assert_invalid_event(err, "does not verify");
    }

    #[test]
    fn rejects_wrong_root_bytes() {
        let ls = leaves(4);
        let mut t = target(&ls);
        t.root[0] ^= 0x01;
        let path = build_audit_path(&ls, 1).unwrap();
        let path_bytes: Vec<Vec<u8>> = path.iter().map(|h| h.to_vec()).collect();

        let err = verify_proof(&ls[1], 1, &t, &path_bytes).unwrap_err();
        assert_invalid_event(err, "does not verify");
    }

    #[test]
    fn rejects_mismatched_path_length() {
        let ls = leaves(4);
        let t = target(&ls);
        let mut path_bytes: Vec<Vec<u8>> = build_audit_path(&ls, 0)
            .unwrap()
            .iter()
            .map(|h| h.to_vec())
            .collect();

        let mut too_long = path_bytes.clone();
        too_long.push(vec![0u8; 32]);
        let err = verify_proof(&ls[0], 0, &t, &too_long).unwrap_err();
        assert_invalid_event(err, "does not verify");

        path_bytes.pop();
        let err = verify_proof(&ls[0], 0, &t, &path_bytes).unwrap_err();
        assert_invalid_event(err, "does not verify");
    }

    #[test]
    fn rejects_when_leaf_count_is_zero() {
        let t = EventProofTarget {
            collection: 0,
            signature: Vec::new(),
            root: vec![0u8; 32],
            leaf_count: 0,
        };
        let err = verify_proof(&[0u8], 0, &t, &[]).unwrap_err();
        assert_invalid_event(err, "leaf_index");
    }

    #[test]
    fn target_signature_field_is_ignored_by_verification() {
        let ls = leaves(4);
        let mut t = target(&ls);
        t.signature = vec![0xAA; 64];
        let path = build_audit_path(&ls, 2).unwrap();
        let path_bytes: Vec<Vec<u8>> = path.iter().map(|h| h.to_vec()).collect();

        verify_proof(&ls[2], 2, &t, &path_bytes).unwrap();
    }
}
