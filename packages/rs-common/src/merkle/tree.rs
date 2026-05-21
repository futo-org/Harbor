//! RFC 6962 Merkle tree primitives.
//! Leaf hash:     SHA256(0x00 || leaf_bytes)
//! Internal hash: SHA256(0x01 || left || right)

use sha2::{Digest, Sha256};

const LEAF_PREFIX: u8 = 0x00;
const NODE_PREFIX: u8 = 0x01;

pub type Hash = [u8; 32];

pub fn leaf_hash(data: &[u8]) -> Hash {
    let mut h = Sha256::new();
    h.update([LEAF_PREFIX]);
    h.update(data);
    h.finalize().into()
}

pub fn node_hash(left: &Hash, right: &Hash) -> Hash {
    let mut h = Sha256::new();
    h.update([NODE_PREFIX]);
    h.update(left);
    h.update(right);
    h.finalize().into()
}

/// Largest power of 2 < `n`. Requires `n >= 2`.
fn largest_pow2_lt(n: usize) -> usize {
    debug_assert!(n >= 2);
    let mut p = 1;
    while p * 2 < n {
        p *= 2;
    }
    p
}

/// Merkle tree hash of `leaves`. `None` if empty.
pub fn merkle_tree_hash(leaves: &[Vec<u8>]) -> Option<Hash> {
    if leaves.is_empty() {
        return None;
    }
    Some(mth(leaves))
}

fn mth(leaves: &[Vec<u8>]) -> Hash {
    if leaves.len() == 1 {
        return leaf_hash(&leaves[0]);
    }
    let k = largest_pow2_lt(leaves.len());
    node_hash(&mth(&leaves[..k]), &mth(&leaves[k..]))
}

/// Audit path for the leaf at `index`.
pub fn build_audit_path(leaves: &[Vec<u8>], index: u64) -> Option<Vec<Hash>> {
    if (index as usize) >= leaves.len() {
        return None;
    }
    let mut path = Vec::new();
    fill_audit_path(leaves, index, &mut path);
    Some(path)
}

fn fill_audit_path(leaves: &[Vec<u8>], index: u64, path: &mut Vec<Hash>) {
    if leaves.len() <= 1 {
        return;
    }
    let k = largest_pow2_lt(leaves.len()) as u64;
    if index < k {
        fill_audit_path(&leaves[..k as usize], index, path);
        path.push(mth(&leaves[k as usize..]));
    } else {
        fill_audit_path(&leaves[k as usize..], index - k, path);
        path.push(mth(&leaves[..k as usize]));
    }
}

/// Verify `leaf_data` is at `leaf_index` in the tree of size `tree_size`
/// rooted at `expected_root`, given an audit path.
pub fn verify_inclusion(
    leaf_data: &[u8],
    leaf_index: u64,
    tree_size: u64,
    audit_path: &[Hash],
    expected_root: &Hash,
) -> bool {
    if tree_size == 0 || leaf_index >= tree_size {
        return false;
    }

    let mut r = leaf_hash(leaf_data);
    let mut fn_idx = leaf_index;
    let mut sn = tree_size - 1;

    for sibling in audit_path {
        if sn == 0 {
            return false;
        }
        if fn_idx & 1 == 1 || fn_idx == sn {
            r = node_hash(sibling, &r);
            if fn_idx & 1 == 0 {
                while fn_idx & 1 == 0 && sn != 0 {
                    fn_idx >>= 1;
                    sn >>= 1;
                }
            }
        } else {
            r = node_hash(&r, sibling);
        }
        fn_idx >>= 1;
        sn >>= 1;
    }

    sn == 0 && &r == expected_root
}

#[cfg(test)]
mod tests {
    use super::*;

    fn leaves(n: usize) -> Vec<Vec<u8>> {
        (0..n).map(|i| vec![i as u8]).collect()
    }

    #[test]
    fn pow2_lt() {
        assert_eq!(largest_pow2_lt(2), 1);
        assert_eq!(largest_pow2_lt(3), 2);
        assert_eq!(largest_pow2_lt(4), 2);
        assert_eq!(largest_pow2_lt(5), 4);
        assert_eq!(largest_pow2_lt(8), 4);
        assert_eq!(largest_pow2_lt(9), 8);
    }

    #[test]
    fn empty_tree_has_no_root() {
        assert!(merkle_tree_hash(&[]).is_none());
    }

    #[test]
    fn single_leaf_root_is_leaf_hash() {
        let ls = leaves(1);
        assert_eq!(merkle_tree_hash(&ls).unwrap(), leaf_hash(&ls[0]));
    }

    #[test]
    fn single_leaf_proof_is_empty() {
        let ls = leaves(1);
        let path = build_audit_path(&ls, 0).unwrap();
        assert!(path.is_empty());
        let root = merkle_tree_hash(&ls).unwrap();
        assert!(verify_inclusion(&ls[0], 0, 1, &path, &root));
    }

    #[test]
    fn roundtrip_all_positions_powers_of_two() {
        for size in [2usize, 4, 8, 16, 32] {
            let ls = leaves(size);
            let root = merkle_tree_hash(&ls).unwrap();
            for i in 0..size as u64 {
                let path = build_audit_path(&ls, i).unwrap();
                assert!(
                    verify_inclusion(&ls[i as usize], i, size as u64, &path, &root),
                    "size={size} index={i}"
                );
            }
        }
    }

    #[test]
    fn roundtrip_all_positions_non_power_of_two() {
        for size in [3usize, 5, 6, 7, 9, 13, 100] {
            let ls = leaves(size);
            let root = merkle_tree_hash(&ls).unwrap();
            for i in 0..size as u64 {
                let path = build_audit_path(&ls, i).unwrap();
                assert!(
                    verify_inclusion(&ls[i as usize], i, size as u64, &path, &root),
                    "size={size} index={i}"
                );
            }
        }
    }

    #[test]
    fn tampered_sibling_rejected() {
        let ls = leaves(8);
        let root = merkle_tree_hash(&ls).unwrap();
        let mut path = build_audit_path(&ls, 3).unwrap();
        path[0][0] ^= 0x01;
        assert!(!verify_inclusion(&ls[3], 3, 8, &path, &root));
    }

    #[test]
    fn wrong_leaf_data_rejected() {
        let ls = leaves(8);
        let root = merkle_tree_hash(&ls).unwrap();
        let path = build_audit_path(&ls, 3).unwrap();
        assert!(!verify_inclusion(&ls[4], 3, 8, &path, &root));
    }

    #[test]
    fn out_of_range_index_rejected() {
        let ls = leaves(4);
        let root = merkle_tree_hash(&ls).unwrap();
        let path = build_audit_path(&ls, 0).unwrap();
        assert!(!verify_inclusion(&ls[0], 4, 4, &path, &root));
        assert!(!verify_inclusion(&ls[0], 999, 4, &path, &root));
    }

    #[test]
    fn path_too_long_rejected() {
        let ls = leaves(2);
        let root = merkle_tree_hash(&ls).unwrap();
        let mut path = build_audit_path(&ls, 0).unwrap();
        path.push([0u8; 32]);
        assert!(!verify_inclusion(&ls[0], 0, 2, &path, &root));
    }

    #[test]
    fn path_too_short_rejected() {
        let ls = leaves(4);
        let root = merkle_tree_hash(&ls).unwrap();
        let mut path = build_audit_path(&ls, 0).unwrap();
        path.pop();
        assert!(!verify_inclusion(&ls[0], 0, 4, &path, &root));
    }

    #[test]
    fn wrong_root_rejected() {
        let ls = leaves(4);
        let mut root = merkle_tree_hash(&ls).unwrap();
        root[0] ^= 0x01;
        let path = build_audit_path(&ls, 1).unwrap();
        assert!(!verify_inclusion(&ls[1], 1, 4, &path, &root));
    }

    #[test]
    fn five_leaf_lone_right_child() {
        // size=5 leaf=4 is alone in the right subtree; audit path has length 1.
        let ls = leaves(5);
        let root = merkle_tree_hash(&ls).unwrap();
        let path = build_audit_path(&ls, 4).unwrap();
        assert_eq!(path.len(), 1);
        assert!(verify_inclusion(&ls[4], 4, 5, &path, &root));
    }
}
