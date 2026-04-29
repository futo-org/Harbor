use crate::service::events::events_repository as events_repo;
use crate::service::identity::identity_repository as id_repo;
use crate::service::invitation::invitation_repository as inv_repo;
use crate::service::proto as Proto;
use crate::service::proto::identity_service_server::{
    IdentityService, IdentityServiceServer,
};
use crate::service::proto::{
    ClaimInvitationBody, EventBundle, GetIdentityStateRequest,
    GetInvitationStatusRequest, IdentityInvitation, InvitationStatus,
    SignedMessage,
};
use crate::util;
use prost::Message;
use sea_orm::DatabaseConnection;
use tonic::{Request, Response, Status};

// `polycentric.v2.EventKey.collection` identity stream (see `event_key.proto`).
const IDENTITY_COLLECTION: i16 = 1;

pub struct IdentityServiceImpl {
    db: DatabaseConnection,
}

#[tonic::async_trait]
impl IdentityService for IdentityServiceImpl {
    async fn get_identity_state(
        &self,
        request: Request<GetIdentityStateRequest>,
    ) -> Result<Response<EventBundle>, Status> {
        let identity_key = request.into_inner().identity;

        let rows = events_repo::Query::list_events(
            &self.db,
            Some(1),
            Some(IDENTITY_COLLECTION as i32),
            Some(identity_key),
            None,
            None,
            None,
        )
        .await
        .map_err(|_| Status::internal("database error"))?;

        let (event, content) = rows
            .into_iter()
            .next()
            .ok_or_else(|| Status::not_found("identity event not found"))?;
        let content = content.ok_or_else(|| {
            Status::not_found("identity event content not found")
        })?;

        let signed_event = Proto::SignedEvent {
            event_bytes: event.event_bytes,
            signature: event.signature,
        };

        let serialized_content = Proto::SerializedContent {
            content_bytes: content.serialized_bytes,
        };

        Ok(Response::new(Proto::EventBundle {
            signed_event: Some(signed_event),
            serialized_content: Some(serialized_content),
        }))
    }

    async fn create_invitation(
        &self,
        request: Request<SignedMessage>,
    ) -> Result<Response<IdentityInvitation>, Status> {
        let msg = request.into_inner();
        let public_key = verify_signed_message(&msg)?;

        let invitation =
            Proto::IdentityInvitation::decode(&msg.message_bytes[..])
                .map_err(|_| Status::invalid_argument("invalid invitation"))?;

        let identity_key = invitation.identity.clone();
        let invitation_signature = util::hex::encode(&msg.signature);

        let is_rotation_key = id_repo::Query::is_rotation_key(
            &self.db,
            &identity_key,
            public_key.key.as_slice(),
        )
        .await
        .map_err(|_| Status::internal("internal server error"))?;

        if !is_rotation_key {
            return Err(Status::permission_denied("not authorized"));
        }

        let row = inv_repo::Query::create_invitation(
            &self.db,
            &identity_key,
            &invitation_signature,
        )
        .await
        .map_err(|_| Status::internal("internal server error"))?;

        Ok(Response::new(Proto::IdentityInvitation {
            identity: row.identity,
            created_at: row.created_at.timestamp_millis(),
            ttl_seconds: row.ttl_seconds,
        }))
    }

    async fn get_invitation_status(
        &self,
        request: Request<GetInvitationStatusRequest>,
    ) -> Result<Response<InvitationStatus>, Status> {
        let req = request.into_inner();

        let status =
            build_invitation_status(&self.db, &req.invitation_signature)
                .await?;

        Ok(Response::new(status))
    }

    async fn claim_invitation(
        &self,
        request: Request<SignedMessage>,
    ) -> Result<Response<InvitationStatus>, Status> {
        let msg = request.into_inner();
        let public_key = verify_signed_message(&msg)?;

        let body = ClaimInvitationBody::decode(&msg.message_bytes[..])
            .map_err(|_| Status::invalid_argument("invalid body"))?;

        let invitation = inv_repo::Query::get_invitation(
            &self.db,
            &body.invitation_signature,
        )
        .await
        .map_err(|_| Status::not_found("invitation not found"))?;
        if inv_repo::is_invitation_expired(&invitation) {
            return Err(Status::deadline_exceeded("invitation expired"));
        }

        inv_repo::Query::add_claimer(
            &self.db,
            &body.invitation_signature,
            &public_key,
        )
        .await
        .map_err(|_| Status::internal("internal server error"))?;

        let status =
            build_invitation_status(&self.db, &body.invitation_signature)
                .await?;

        Ok(Response::new(status))
    }
}

fn verify_signed_message(
    msg: &SignedMessage,
) -> Result<Proto::PublicKey, Status> {
    let public_key = msg
        .public_key
        .clone()
        .ok_or_else(|| Status::invalid_argument("public_key is required"))?;
    util::signing::verify_signature(
        &public_key.key,
        &msg.signature,
        &msg.message_bytes,
    )
    .map_err(|e| Status::unauthenticated(e.to_string()))?;
    Ok(public_key)
}

async fn build_invitation_status(
    db: &DatabaseConnection,
    invitation_signature: &str,
) -> Result<Proto::InvitationStatus, Status> {
    let invitation = inv_repo::Query::get_invitation(db, invitation_signature)
        .await
        .map_err(|_| Status::not_found("invitation not found"))?;

    let is_expired = inv_repo::is_invitation_expired(&invitation);

    let claimers = inv_repo::Query::list_claimers(db, invitation_signature)
        .await
        .map_err(|_| Status::internal("internal server error"))?;

    Ok(Proto::InvitationStatus {
        invitation: Some(Proto::IdentityInvitation {
            identity: invitation.identity.clone(),
            created_at: invitation.created_at.timestamp_millis(),
            ttl_seconds: invitation.ttl_seconds,
        }),
        claimers,
        expired: is_expired,
    })
}

pub fn build_identity_service(
    db: DatabaseConnection,
) -> IdentityServiceServer<IdentityServiceImpl> {
    IdentityServiceServer::new(IdentityServiceImpl { db })
}
