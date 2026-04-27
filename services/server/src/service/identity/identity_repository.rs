use crate::service::proto::{Identity, PublicKey};
use prost::Message;
use sea_orm::sea_query::{Alias, Expr, Query as SeaQuery};
use sea_orm::*;

#[derive(Debug, Clone)]
pub struct AuthorizedKey {
    pub key: PublicKey,
    pub is_rotation_key: bool,
}

pub struct Query;

impl Query {
    /// Returns all authorized public keys for an identity.
    ///
    /// Queries the latest `content_identity` row for the given identity string,
    /// decodes the Identity proto, and returns the rotation_keys and signing_keys.
    pub async fn authorized_keys(
        db: &DbConn,
        identity: &str,
    ) -> Result<Vec<AuthorizedKey>, DbErr> {
        let ci = Alias::new("ci");
        let ce = Alias::new("ce");

        // Find the latest content_identity for this identity by joining
        // to the events table and ordering by sequence descending.
        let mut query = SeaQuery::select();
        query
            .expr_as(
                Expr::col((ci.clone(), Alias::new("identity_bytes"))),
                Alias::new("identity_bytes"),
            )
            .from_as(Alias::new("content_identity"), ci.clone())
            .and_where(
                Expr::col((ci.clone(), Alias::new("identity"))).eq(identity),
            )
            // Join to content then events to order by sequence
            .join_as(
                JoinType::InnerJoin,
                Alias::new("content"),
                Alias::new("c"),
                Expr::col((ci.clone(), Alias::new("content_id")))
                    .equals((Alias::new("c"), Alias::new("id"))),
            )
            .join_as(
                JoinType::InnerJoin,
                Alias::new("events"),
                ce.clone(),
                sea_orm::sea_query::Condition::all()
                    .add(
                        Expr::col((Alias::new("c"), Alias::new("digest_type")))
                            .equals((
                                ce.clone(),
                                Alias::new("content_digest_type"),
                            )),
                    )
                    .add(
                        Expr::col((
                            Alias::new("c"),
                            Alias::new("digest_bytes"),
                        ))
                        .equals((
                            ce.clone(),
                            Alias::new("content_digest_bytes"),
                        )),
                    ),
            )
            .order_by((ce, Alias::new("sequence")), Order::Desc)
            .limit(1);

        let stmt = db.get_database_backend().build(&query);
        let rows = IdentityBytesRow::find_by_statement(stmt).all(db).await?;

        let Some(row) = rows.first() else {
            return Ok(vec![]);
        };

        let identity_proto = Identity::decode(row.identity_bytes.as_slice())
            .map_err(|e| {
                DbErr::Custom(format!("Invalid Identity bytes: {e}"))
            })?;

        let mut keys = Vec::new();

        for pk in identity_proto.rotation_keys {
            keys.push(AuthorizedKey {
                key: pk,
                is_rotation_key: true,
            });
        }

        for pk in identity_proto.signing_keys {
            keys.push(AuthorizedKey {
                key: pk,
                is_rotation_key: false,
            });
        }

        Ok(keys)
    }

    pub async fn identity_for_public_key(
        db: &DbConn,
        public_key: &crate::service::proto::PublicKey,
    ) -> Result<Option<String>, DbErr> {
        use ::entity::event_model as EventModel;

        let row = EventModel::Entity::find()
            .filter(
                EventModel::Column::PublicKeyType
                    .eq(public_key.key_type as i16),
            )
            .filter(EventModel::Column::PublicKey.eq(public_key.key.clone()))
            .order_by_desc(EventModel::Column::Id)
            .one(db)
            .await?;

        let identity = match row.map(|r| r.identity) {
            Some(id) => id,
            None => return Ok(None),
        };

        let authorized_keys = Query::authorized_keys(db, &identity).await?;

        let key_is_authorized =
            authorized_keys.iter().any(|key| key.key == *public_key);

        match key_is_authorized {
            true => Ok(Some(identity)),
            false => Ok(None),
        }
    }
}

#[derive(Debug, FromQueryResult)]
struct IdentityBytesRow {
    pub identity_bytes: Vec<u8>,
}
