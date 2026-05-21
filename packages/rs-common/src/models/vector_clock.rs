use crate::error::CoreError;
use crate::models::protos_v2::{Identity, PublicKey, VectorClock};

impl VectorClock {
    /// Validate the VC's structure against the identity doc whose
    /// deduplicated key ordering defines its positions:
    ///   - length matches the dedup'd key count
    ///   - the signer is present in that ordering
    ///   - the entry at the signer's position equals `expected_self_sequence`
    ///
    /// Returns the signer's position so callers can reuse it (e.g. for
    /// causal-prerequisite checks).
    pub fn check_structure(
        &self,
        doc: &Identity,
        signer: &PublicKey,
        expected_self_sequence: u64,
    ) -> Result<usize, CoreError> {
        let dedup = doc.deduplicated_keys();
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
