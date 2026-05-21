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
