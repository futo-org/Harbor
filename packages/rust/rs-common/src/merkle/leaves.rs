use crate::models::protos_v2::Event;
use prost::Message;

/// Canonical-ordered signatures for an event stream. Each input is a
/// `(event_bytes, signature)` pair — the two fields stored on
/// `SignedEvent`. Sort key: `sum(vector_clock)`, then `created_at`,
/// then signature bytes.
///
/// Sum is a linear extension of the happens-before partial order: if
/// A → B then `VC_A ≤ VC_B` componentwise with a strict component, so
/// `sum(VC_A) < sum(VC_B)`. Ties on sum can only occur for concurrent
/// events; the `created_at` + signature tiebreakers resolve them
/// deterministically.
pub fn canonical_signatures<'a, I>(items: I) -> Vec<Vec<u8>>
where
    I: IntoIterator<Item = (&'a [u8], &'a [u8])>,
{
    let mut decoded: Vec<(u64, u64, Vec<u8>)> = items
        .into_iter()
        .filter_map(|(event_bytes, signature)| {
            let inner = Event::decode(event_bytes).ok()?;
            let vc_sum: u64 = inner
                .vector_clock
                .as_ref()
                .map(|vc| vc.sequence.iter().sum())
                .unwrap_or(0);
            Some((vc_sum, inner.created_at, signature.to_vec()))
        })
        .collect();
    decoded.sort_by(|a, b| {
        a.0.cmp(&b.0)
            .then_with(|| a.1.cmp(&b.1))
            .then_with(|| a.2.cmp(&b.2))
    });
    decoded.into_iter().map(|(_, _, sig)| sig).collect()
}
