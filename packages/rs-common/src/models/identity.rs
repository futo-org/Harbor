use std::collections::HashSet;

use crate::models::protos_v2::{Identity, PublicKey};

impl Identity {
    /// Canonical deduplicated key ordering: rotation_keys and signing_keys,
    /// first occurrence wins. Vector clock positions in any event that
    /// references this identity doc align to this ordering.
    pub fn deduplicated_keys(&self) -> Vec<&PublicKey> {
        let mut seen = HashSet::new();
        self.rotation_keys
            .iter()
            .chain(self.signing_keys.iter())
            .filter(|pk| seen.insert((pk.key_type, pk.key.as_slice())))
            .collect()
    }

    /// True if `pk` is listed as either a rotation or signing key — i.e.
    /// permitted to sign any event for this identity.
    pub fn authorizes_signer(&self, pk: &PublicKey) -> bool {
        self.rotation_keys
            .iter()
            .chain(self.signing_keys.iter())
            .any(|k| k.key_type == pk.key_type && k.key == pk.key)
    }

    /// True if `pk` is listed as a rotation key — i.e. permitted to extend
    /// the identity chain by signing the next identity event.
    pub fn authorizes_rotation(&self, pk: &PublicKey) -> bool {
        self.rotation_keys
            .iter()
            .any(|k| k.key_type == pk.key_type && k.key == pk.key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ED25519: i32 = 1;
    const UNSPECIFIED: i32 = 0;

    fn pk(key_type: i32, key: &[u8]) -> PublicKey {
        PublicKey {
            key_type,
            key: key.to_vec(),
        }
    }

    fn identity(rotation: Vec<PublicKey>, signing: Vec<PublicKey>) -> Identity {
        Identity {
            rotation_keys: rotation,
            signing_keys: signing,
            revocation_bounds: Vec::new(),
        }
    }

    #[test]
    fn deduplicated_keys_empty_identity() {
        let id = identity(vec![], vec![]);
        assert!(id.deduplicated_keys().is_empty());
    }

    #[test]
    fn deduplicated_keys_preserves_rotation_then_signing_order() {
        let r0 = pk(ED25519, b"r0");
        let r1 = pk(ED25519, b"r1");
        let s0 = pk(ED25519, b"s0");
        let s1 = pk(ED25519, b"s1");
        let id = identity(vec![r0.clone(), r1.clone()], vec![s0.clone(), s1.clone()]);
        let got: Vec<&PublicKey> = id.deduplicated_keys();
        assert_eq!(got, vec![&r0, &r1, &s0, &s1]);
    }

    #[test]
    fn deduplicated_keys_drops_duplicate_within_rotation() {
        let a = pk(ED25519, b"a");
        let b = pk(ED25519, b"b");
        let id = identity(vec![a.clone(), b.clone(), a.clone()], vec![]);
        let got = id.deduplicated_keys();
        assert_eq!(got, vec![&a, &b]);
    }

    #[test]
    fn deduplicated_keys_drops_duplicate_across_rotation_and_signing() {
        let shared = pk(ED25519, b"shared");
        let only_signing = pk(ED25519, b"signing-only");
        let id = identity(
            vec![shared.clone()],
            vec![shared.clone(), only_signing.clone()],
        );
        let got = id.deduplicated_keys();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].key, shared.key);
        assert_eq!(got[1].key, only_signing.key);
    }

    #[test]
    fn deduplicated_keys_drops_duplicate_within_signing() {
        let s = pk(ED25519, b"s");
        let id = identity(vec![], vec![s.clone(), s.clone()]);
        let got = id.deduplicated_keys();
        assert_eq!(got, vec![&s]);
    }

    #[test]
    fn deduplicated_keys_treats_different_key_types_as_distinct() {
        let a_ed = pk(ED25519, b"same-bytes");
        let a_unspec = pk(UNSPECIFIED, b"same-bytes");
        let id = identity(vec![a_ed.clone(), a_unspec.clone()], vec![]);
        let got = id.deduplicated_keys();
        assert_eq!(got, vec![&a_ed, &a_unspec]);
    }

    #[test]
    fn authorizes_signer_accepts_rotation_key() {
        let r = pk(ED25519, b"r");
        let id = identity(vec![r.clone()], vec![]);
        assert!(id.authorizes_signer(&r));
    }

    #[test]
    fn authorizes_signer_accepts_signing_key() {
        let s = pk(ED25519, b"s");
        let id = identity(vec![], vec![s.clone()]);
        assert!(id.authorizes_signer(&s));
    }

    #[test]
    fn authorizes_signer_rejects_unknown_key() {
        let r = pk(ED25519, b"r");
        let id = identity(vec![r], vec![]);
        assert!(!id.authorizes_signer(&pk(ED25519, b"other")));
    }

    #[test]
    fn authorizes_signer_rejects_matching_bytes_with_different_type() {
        let id = identity(vec![pk(ED25519, b"k")], vec![]);
        assert!(!id.authorizes_signer(&pk(UNSPECIFIED, b"k")));
    }

    #[test]
    fn authorizes_signer_rejects_against_empty_identity() {
        let id = identity(vec![], vec![]);
        assert!(!id.authorizes_signer(&pk(ED25519, b"anything")));
    }

    #[test]
    fn authorizes_rotation_accepts_rotation_key() {
        let r = pk(ED25519, b"r");
        let id = identity(vec![r.clone()], vec![]);
        assert!(id.authorizes_rotation(&r));
    }

    #[test]
    fn authorizes_rotation_rejects_signing_only_key() {
        let s = pk(ED25519, b"s");
        let id = identity(vec![], vec![s.clone()]);
        assert!(!id.authorizes_rotation(&s));
    }

    #[test]
    fn authorizes_rotation_rejects_unknown_key() {
        let r = pk(ED25519, b"r");
        let id = identity(vec![r], vec![]);
        assert!(!id.authorizes_rotation(&pk(ED25519, b"other")));
    }

    #[test]
    fn authorizes_rotation_rejects_matching_bytes_with_different_type() {
        let id = identity(vec![pk(ED25519, b"k")], vec![]);
        assert!(!id.authorizes_rotation(&pk(UNSPECIFIED, b"k")));
    }

    #[test]
    fn key_listed_in_both_lists_authorizes_both_signer_and_rotation() {
        let k = pk(ED25519, b"k");
        let id = identity(vec![k.clone()], vec![k.clone()]);
        assert!(id.authorizes_signer(&k));
        assert!(id.authorizes_rotation(&k));
    }
}
