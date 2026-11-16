use crate::error::{CoreError, CoreResult};
use crate::models::protos_v2::{PublicKey, PushSubscription, PushTarget};
use prost::Message;

impl PushSubscription {
    /// Verify the signature and decode the inner `PushTarget`.
    /// Returns the subscription's identity key, signing key, and push target.
    pub fn open(self) -> CoreResult<(String, PublicKey, PushTarget)> {
        let PushSubscription {
            push_target_bytes,
            signature,
            signer,
            identity,
        } = self;

        let signer = signer.ok_or_else(|| {
            CoreError::SignatureError("push subscription has no signer".to_owned())
        })?;

        if !signer.sig_matches(&signature, &push_target_bytes) {
            return Err(CoreError::SignatureError(
                "push subscription signature is invalid".to_owned(),
            ));
        }

        let target = PushTarget::decode(push_target_bytes.as_slice()).map_err(|e| {
            CoreError::DeserializationError(format!("Unable to deserialize push target: {e}"))
        })?;

        Ok((identity, signer, target))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::protos_v2::KeyType;
    use ed25519_dalek::{Signer, SigningKey};

    fn signing_key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    fn signer(key: &SigningKey) -> PublicKey {
        PublicKey {
            key_type: KeyType::Ed25519.into(),
            key: key.verifying_key().to_bytes().to_vec(),
        }
    }

    fn target() -> PushTarget {
        PushTarget {
            service: "expo".to_owned(),
            token: "ExponentPushToken[abc123]".to_owned(),
        }
    }

    fn subscription(push_target_bytes: Vec<u8>) -> PushSubscription {
        let key = signing_key();
        PushSubscription {
            signature: key.sign(&push_target_bytes).to_bytes().to_vec(),
            push_target_bytes,
            signer: Some(signer(&key)),
            identity: "identity".to_owned(),
        }
    }

    #[test]
    fn opens_a_valid_subscription() {
        let sub = subscription(target().encode_to_vec());
        let (identity, opened_signer, opened_target) = sub.open().expect("valid subscription");
        assert_eq!(identity, "identity");
        assert_eq!(opened_signer, signer(&signing_key()));
        assert_eq!(opened_target, target());
    }

    #[test]
    fn rejects_a_bad_signature() {
        let mut sub = subscription(target().encode_to_vec());
        sub.signature[0] ^= 0xff;
        assert!(matches!(sub.open(), Err(CoreError::SignatureError(_))));
    }

    #[test]
    fn rejects_a_missing_signer() {
        let mut sub = subscription(target().encode_to_vec());
        sub.signer = None;
        assert!(matches!(sub.open(), Err(CoreError::SignatureError(_))));
    }

    #[test]
    fn rejects_bytes_that_are_not_a_push_target() {
        // Field 1 specified with a length of 5 bytes but only 1 given.
        let sub = subscription(vec![0x0a, 0x05, b'a']);
        assert!(matches!(
            sub.open(),
            Err(CoreError::DeserializationError(_))
        ));
    }
}
