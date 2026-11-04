//! The protocol's messages as UniFFI records, generated from the v2 protos
//! by `build/records.rs`. These are the data types every host sees.

include!(concat!(env!("OUT_DIR"), "/records.rs"));

/// The event a signed event carries, if its signature verifies against the
/// event's signer. Records only ever expose verified events.
pub(crate) fn verified_event(
    signed: &polycentric_common::models::protos_v2::SignedEvent,
) -> Option<polycentric_common::models::protos_v2::Event> {
    use polycentric_common::models::protos_v2::{Event, KeyType};
    let event = <Event as prost::Message>::decode(signed.event_bytes.as_slice()).ok()?;
    let signer = event.key.as_ref()?.signed_by.as_ref()?;
    if signer.key_type != KeyType::Ed25519 as i32 {
        return None;
    }
    polycentric_common::signing::verify_ed25519_signature(
        &signer.key,
        &signed.signature,
        &signed.event_bytes,
    )
    .ok()?;
    Some(event)
}

#[cfg(test)]
mod tests {
    #[test]
    fn schema_digests_are_derived_from_the_encoding() {
        use super::{FieldDef, FieldKind, SerializedVerificationSchema, VerificationSchema};
        let schema = VerificationSchema {
            name: "Platform".into(),
            description: "d".into(),
            fields: vec![FieldDef {
                key: "account".into(),
                kind: FieldKind::String,
                ..Default::default()
            }],
        };
        let record = SerializedVerificationSchema {
            schema: Some(schema.clone()),
            // Whatever a host passes is ignored.
            digest: None,
        };
        let wire: pb::SerializedVerificationSchema = record.into();
        assert_eq!(
            wire.schema_bytes,
            pb::VerificationSchema::from(schema).encode_to_vec()
        );
        assert_eq!(
            wire.digest,
            Some(crate::sdk::client::content_digest_of_bytes(
                &wire.schema_bytes
            ))
        );
    }

    use polycentric_common::models::protos_v2 as pb;
    use prost::Message;

    #[test]
    fn signed_events_expose_only_verified_events() {
        let key_pair = crate::sdk::keys::KeyPair::generate().unwrap();
        let event = pb::Event {
            key: Some(pb::EventKey {
                collection: 2,
                identity: "a".repeat(64),
                signed_by: Some(key_pair.public_key()),
                sequence: 1,
            }),
            ..Default::default()
        };
        let event_bytes = event.encode_to_vec();
        let signed = pb::SignedEvent {
            signature: key_pair.sign(&event_bytes),
            event_bytes: event_bytes.clone(),
        };
        let record: super::SignedEvent = signed.clone().into();
        assert_eq!(record.event.unwrap().key.unwrap().sequence, 1);

        let forged = pb::SignedEvent {
            signature: vec![0; 64],
            event_bytes,
        };
        let record: super::SignedEvent = forged.into();
        assert!(record.event.is_none());
        assert_eq!(record.signature, vec![0; 64]);
    }
}
