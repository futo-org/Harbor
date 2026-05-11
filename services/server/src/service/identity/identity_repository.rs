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

    /// Returns true when `public_key` is a rotation key on the latest identity state.
    pub async fn is_rotation_key(
        db: &DbConn,
        identity_key: &str,
        public_key: &[u8],
    ) -> Result<bool, DbErr> {
        let authorized_keys = Self::authorized_keys(db, identity_key).await?;
        Ok(authorized_keys
            .iter()
            .any(|k| k.is_rotation_key && k.key.key.as_slice() == public_key))
    }

    /// Returns the display name from the latest `content_profile_update` for
    /// this identity, or `None` if no profile update with a name has been
    /// persisted yet. Absence is not an error.
    pub async fn display_name(
        db: &DbConn,
        identity: &str,
    ) -> Result<Option<String>, DbErr> {
        let profile = Alias::new("profile");
        let content = Alias::new("content");
        let event = Alias::new("event");

        // events (filtered by identity, latest sequence)
        //   → content (joined on digest)
        //   → content_profile_update (joined on content_id)
        let mut query = SeaQuery::select();
        query
            .expr_as(
                Expr::col((profile.clone(), Alias::new("name"))),
                Alias::new("name"),
            )
            .from_as(Alias::new("events"), event.clone())
            .and_where(
                Expr::col((event.clone(), Alias::new("identity"))).eq(identity),
            )
            .join_as(
                JoinType::InnerJoin,
                Alias::new("content"),
                content.clone(),
                sea_orm::sea_query::Condition::all()
                    .add(
                        Expr::col((content.clone(), Alias::new("digest_type")))
                            .equals((
                                event.clone(),
                                Alias::new("content_digest_type"),
                            )),
                    )
                    .add(
                        Expr::col((content.clone(), Alias::new("digest_bytes")))
                            .equals((
                                event.clone(),
                                Alias::new("content_digest_bytes"),
                            )),
                    ),
            )
            .join_as(
                JoinType::InnerJoin,
                Alias::new("content_profile_update"),
                profile.clone(),
                Expr::col((profile.clone(), Alias::new("content_id")))
                    .equals((content.clone(), Alias::new("id"))),
            )
            .order_by((event, Alias::new("sequence")), Order::Desc)
            .limit(1);

        let stmt = db.get_database_backend().build(&query);
        let rows = DisplayNameRow::find_by_statement(stmt).all(db).await?;

        Ok(rows.into_iter().next().and_then(|r| r.name))
    }
}

#[derive(Debug, FromQueryResult)]
struct IdentityBytesRow {
    pub identity_bytes: Vec<u8>,
}

#[derive(Debug, FromQueryResult)]
struct DisplayNameRow {
    pub name: Option<String>,
}
