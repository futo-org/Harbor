use crate::models::protos_v2::{PublicKey, SignedMessage};

impl SignedMessage {
    /// Verify the signature against the provided public key and return
    /// (key, msg, sig).
    pub fn open_with_sig(self) -> Option<(PublicKey, Vec<u8>, Vec<u8>)> {
        let SignedMessage {
            public_key,
            message_bytes,
            signature,
        } = self;

        let public_key = public_key?;
        if !public_key.sig_matches(&signature, &message_bytes) {
            return None;
        }

        Some((public_key, message_bytes, signature))
    }

    /// Verify the signature and return `(public_key, message_bytes)`.
    pub fn open(self) -> Option<(PublicKey, Vec<u8>)> {
        let (public_key, message_bytes, _signature) = self.open_with_sig()?;
        Some((public_key, message_bytes))
    }
}
