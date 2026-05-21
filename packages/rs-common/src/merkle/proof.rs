//! EventProof verification against an `EventProofTarget`.

use crate::{error::CoreError, models::protos_v2::EventProofTarget};

use super::tree::{Hash, verify_inclusion};

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
