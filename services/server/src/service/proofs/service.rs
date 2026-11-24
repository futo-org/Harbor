//! Attach the stored EventProofs to outgoing bundles whose signer has been
//! revoked.

use std::collections::HashMap;

use polycentric_common::models::protos_v2::{EventBundle, EventProof};
use tonic::Status;

use crate::service::context::RequestContext;
use crate::service::identity::repository::Query as IdentityRepo;

/// Add the stored revocation `EventProof` to each bundle that has one.
pub async fn attach_proofs<'a, II, I, Auth>(
    ctx: &mut RequestContext<Auth>,
    bundles: II,
) -> Result<(), Status>
where
    II: IntoIterator<Item = &'a mut EventBundle, IntoIter = I>,
    I: Iterator<Item = &'a mut EventBundle> + 'a,
{
    let mut by_signature: HashMap<Vec<u8>, &mut EventBundle> = bundles
        .into_iter()
        .filter_map(|bundle| {
            let signature = bundle.signed_event.as_ref()?.signature.clone();
            Some((signature, bundle))
        })
        .collect();

    let signatures = by_signature.keys().cloned().collect();
    let proofs = IdentityRepo::event_proofs(&mut ctx.db, signatures)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "proofs db error");
            Status::internal("internal server error")
        })?;

    for proof in proofs {
        if let Some(bundle) = by_signature.get_mut(&proof.signature) {
            bundle.event_proofs.push(EventProof {
                target_signature: proof.target_signature,
                leaf_index: proof.leaf_index as u64,
                audit_path: proof
                    .audit_path
                    .chunks(32)
                    .map(<[u8]>::to_vec)
                    .collect(),
            });
        }
    }
    Ok(())
}
