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
    MerkleTree::new(leaves.iter().map(Vec::as_slice)).root(leaves.len())
}

/// Audit path for the leaf at `index`.
pub fn build_audit_path(leaves: &[Vec<u8>], index: u64) -> Option<Vec<Hash>> {
    MerkleTree::new(leaves.iter().map(Vec::as_slice)).audit_path(index as usize, leaves.len())
}

/// A Merkle tree that keeps its hashes, so appends, roots and audit paths are `O(log n)`.
#[derive(Clone, Debug, Default)]
pub struct MerkleTree {
    /// `levels[k][i]` is the hash of leaves `i * 2^k .. (i + 1) * 2^k`.
    levels: Vec<Vec<Hash>>,
}

impl MerkleTree {
    pub fn new<'a>(leaves: impl IntoIterator<Item = &'a [u8]>) -> Self {
        let mut tree = Self::default();
        for leaf in leaves {
            tree.push(leaf);
        }
        tree
    }

    /// Number of leaves.
    pub fn len(&self) -> usize {
        self.levels.first().map_or(0, Vec::len)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Add a leaf after the others.
    pub fn push(&mut self, leaf: &[u8]) {
        let mut hash = leaf_hash(leaf);
        for level in 0.. {
            if self.levels.len() == level {
                self.levels.push(Vec::new());
            }
            let hashes = &mut self.levels[level];
            hashes.push(hash);
            let count = hashes.len();
            if count % 2 == 1 {
                break;
            }
            // An even count completes a node on the next level.
            hash = node_hash(&hashes[count - 2], &hashes[count - 1]);
        }
    }

    /// Merkle tree hash of the first `leaf_count` leaves.
    pub fn root(&self, leaf_count: usize) -> Option<Hash> {
        (1..=self.len())
            .contains(&leaf_count)
            .then(|| self.range_hash(0, leaf_count))
    }

    /// Audit path for leaf `index` in the tree of the first `leaf_count` leaves.
    pub fn audit_path(&self, index: usize, leaf_count: usize) -> Option<Vec<Hash>> {
        if index >= leaf_count || leaf_count > self.len() {
            return None;
        }
        let mut path = Vec::new();
        self.fill_audit_path(index, 0, leaf_count, &mut path);
        Some(path)
    }

    fn fill_audit_path(&self, index: usize, start: usize, len: usize, path: &mut Vec<Hash>) {
        if len <= 1 {
            return;
        }
        let k = largest_pow2_lt(len);
        if index < k {
            self.fill_audit_path(index, start, k, path);
            path.push(self.range_hash(start + k, len - k));
        } else {
            self.fill_audit_path(index - k, start + k, len - k, path);
            path.push(self.range_hash(start, k));
        }
    }

    /// Hash of the subtree over leaves `start .. start + len`.
    fn range_hash(&self, start: usize, len: usize) -> Hash {
        if len.is_power_of_two() {
            let level = len.trailing_zeros() as usize;
            return self.levels[level][start >> level];
        }
        let k = largest_pow2_lt(len);
        node_hash(
            &self.range_hash(start, k),
            &self.range_hash(start + k, len - k),
        )
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
    fn kept_tree_proves_every_prefix() {
        let ls = leaves(35);
        let mut tree = MerkleTree::default();
        assert!(tree.is_empty());
        assert_eq!(tree.root(0), None);
        for (pushed, leaf) in ls.iter().enumerate() {
            tree.push(leaf);
            assert_eq!(tree.len(), pushed + 1);
            for leaf_count in 1..=tree.len() {
                let root = tree.root(leaf_count).unwrap();
                for (index, leaf) in ls.iter().enumerate().take(leaf_count) {
                    let path = tree.audit_path(index, leaf_count).unwrap();
                    assert!(
                        verify_inclusion(leaf, index as u64, leaf_count as u64, &path, &root),
                        "pushed={pushed} leaf_count={leaf_count} index={index}"
                    );
                }
            }
        }
        assert_eq!(tree.root(36), None);
        assert_eq!(tree.audit_path(3, 3), None);
        assert_eq!(tree.audit_path(0, 36), None);
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
