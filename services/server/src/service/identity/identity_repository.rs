use crate::service::proto::{Identity, PublicKey};
use prost::Message;
use sea_orm::prelude::TimeDateTime;
use sea_orm::sea_query::{Alias, Condition, Expr, Query as SeaQuery};
use sea_orm::*;
use std::collections::{HashMap, HashSet};

type PubKey = (i32, Vec<u8>);

#[derive(Debug, Clone)]
pub struct AuthorizedKey {
    pub key: PublicKey,
    /// If the key was revoked, the timestamp (client `created_at`) of the
    /// revocation event.  Events signed by this key at or after this time
    /// should be excluded.
    pub revoked_at: Option<TimeDateTime>,
}

pub struct Query;

impl Query {
    /// Returns all authorized public keys for an identity via CRDT replay.
    ///
    /// `identity_id` is the serialized Identity message bytes.
    /// Single query: starts from content_identity, LEFT JOINs through the
    /// claim and issue tables (scoped by identity_id bytes) to collect
    /// (claimer_key, issuer_key) pairs, then resolves authorization in Rust.
    pub async fn authorized_keys(
        db: &DbConn,
        identity_id: &[u8],
    ) -> Result<Vec<AuthorizedKey>, DbErr> {
        // Decode to extract the initial public key
        let identity = Identity::decode(identity_id).map_err(|e| {
            DbErr::Custom(format!("Invalid Identity bytes: {e}"))
        })?;
        let initial_pk = identity.public_key.ok_or_else(|| {
            DbErr::Custom("Identity missing public_key".into())
        })?;

        let ci = Alias::new("ci");
        let cic = Alias::new("cic");
        let cc = Alias::new("cc");
        let ce = Alias::new("ce");
        let iss = Alias::new("iss");
        let ic = Alias::new("ic");
        let ie = Alias::new("ie");

        let id_col = Alias::new("identity_id");

        let mut query = SeaQuery::select();
        query
            // initial key type and key (known from the decoded Identity)
            .expr_as(
                Expr::value(initial_pk.key_type as i16),
                Alias::new("initial_key_type"),
            )
            .expr_as(
                Expr::value(initial_pk.key.clone()),
                Alias::new("initial_key"),
            )
            // claimer key (from claim's event)
            .expr_as(
                Expr::col((ce.clone(), Alias::new("public_key_type"))),
                Alias::new("claimer_key_type"),
            )
            .expr_as(
                Expr::col((ce.clone(), Alias::new("public_key"))),
                Alias::new("claimer_key"),
            )
            // issuer key (from issue's event)
            .expr_as(
                Expr::col((ie.clone(), Alias::new("public_key_type"))),
                Alias::new("issuer_key_type"),
            )
            .expr_as(
                Expr::col((ie.clone(), Alias::new("public_key"))),
                Alias::new("issuer_key"),
            )
            .from_as(Alias::new("content_identity_create"), ci.clone())
            .and_where(Expr::col((ci.clone(), id_col.clone())).eq(identity_id))
            // claim on this identity (matched by identity_id bytes)
            .join_as(
                JoinType::LeftJoin,
                Alias::new("content_identity_claim"),
                cic.clone(),
                Expr::col((cic.clone(), id_col.clone()))
                    .equals((ci.clone(), id_col.clone())),
            )
            // claim → content
            .join_as(
                JoinType::LeftJoin,
                Alias::new("content"),
                cc.clone(),
                Expr::col((cic.clone(), Alias::new("content_id")))
                    .equals((cc.clone(), Alias::new("id"))),
            )
            // claim content → event (claimer's signing key)
            .join_as(
                JoinType::LeftJoin,
                Alias::new("events"),
                ce.clone(),
                Condition::all()
                    .add(
                        Expr::col((cc.clone(), Alias::new("digest_type")))
                            .equals((
                                ce.clone(),
                                Alias::new("content_digest_type"),
                            )),
                    )
                    .add(
                        Expr::col((cc.clone(), Alias::new("digest_bytes")))
                            .equals((
                                ce.clone(),
                                Alias::new("content_digest_bytes"),
                            )),
                    ),
            )
            // issue for this identity where issued key matches the claimer key
            .join_as(
                JoinType::LeftJoin,
                Alias::new("content_identity_issue"),
                iss.clone(),
                Condition::all()
                    .add(
                        Expr::col((iss.clone(), id_col.clone()))
                            .equals((ci.clone(), id_col.clone())),
                    )
                    .add(
                        Expr::col((
                            iss.clone(),
                            Alias::new("issued_public_key_type"),
                        ))
                        .equals((ce.clone(), Alias::new("public_key_type"))),
                    )
                    .add(
                        Expr::col((
                            iss.clone(),
                            Alias::new("issued_public_key"),
                        ))
                        .equals((ce.clone(), Alias::new("public_key"))),
                    ),
            )
            // issue → content
            .join_as(
                JoinType::LeftJoin,
                Alias::new("content"),
                ic.clone(),
                Expr::col((iss.clone(), Alias::new("content_id")))
                    .equals((ic.clone(), Alias::new("id"))),
            )
            // issue content → event (issuer's signing key)
            .join_as(
                JoinType::LeftJoin,
                Alias::new("events"),
                ie.clone(),
                Condition::all()
                    .add(
                        Expr::col((ic.clone(), Alias::new("digest_type")))
                            .equals((
                                ie.clone(),
                                Alias::new("content_digest_type"),
                            )),
                    )
                    .add(
                        Expr::col((ic.clone(), Alias::new("digest_bytes")))
                            .equals((
                                ie.clone(),
                                Alias::new("content_digest_bytes"),
                            )),
                    ),
            );

        let stmt = db.get_database_backend().build(&query);
        let rows = IdentityKeyRow::find_by_statement(stmt).all(db).await?;

        // Resolve: initial key is always authorized, delegated keys are
        // authorized when their issuer is in the authorized set.
        let mut authorized: HashSet<PubKey> = HashSet::new();

        if let Some(first) = rows.first() {
            authorized.insert((
                first.initial_key_type as i32,
                first.initial_key.clone(),
            ));
        }

        loop {
            let mut added = false;
            for row in &rows {
                if let (
                    Some(claimer_kt),
                    Some(claimer_k),
                    Some(issuer_kt),
                    Some(issuer_k),
                ) = (
                    row.claimer_key_type,
                    &row.claimer_key,
                    row.issuer_key_type,
                    &row.issuer_key,
                ) {
                    let issuer: PubKey = (issuer_kt as i32, issuer_k.clone());
                    let claimer: PubKey =
                        (claimer_kt as i32, claimer_k.clone());
                    if authorized.contains(&issuer)
                        && !authorized.contains(&claimer)
                    {
                        authorized.insert(claimer);
                        added = true;
                    }
                }
            }
            if !added {
                break;
            }
        }

        // Query revocation timestamps for the authorized keys.
        // Join: content_identity_revoke → content → events to get the
        // revocation event's created_at timestamp.
        let revoke = Alias::new("revoke");
        let revoke_content = Alias::new("revoke_content");
        let revoke_event = Alias::new("revoke_event");

        let mut rev_query = SeaQuery::select();
        rev_query
            .expr_as(
                Expr::col((
                    revoke.clone(),
                    Alias::new("revoked_public_key_type"),
                )),
                Alias::new("revoked_key_type"),
            )
            .expr_as(
                Expr::col((revoke.clone(), Alias::new("revoked_public_key"))),
                Alias::new("revoked_key"),
            )
            .expr_as(
                Expr::col((revoke_event.clone(), Alias::new("created_at"))),
                Alias::new("revoked_at"),
            )
            .from_as(Alias::new("content_identity_revoke"), revoke.clone())
            .and_where(
                Expr::col((revoke.clone(), Alias::new("identity_id")))
                    .eq(identity_id),
            )
            // revoke → content
            .join_as(
                JoinType::InnerJoin,
                Alias::new("content"),
                revoke_content.clone(),
                Expr::col((revoke.clone(), Alias::new("content_id")))
                    .equals((revoke_content.clone(), Alias::new("id"))),
            )
            // content → event (to get the revocation event timestamp)
            .join_as(
                JoinType::InnerJoin,
                Alias::new("events"),
                revoke_event.clone(),
                Condition::all()
                    .add(
                        Expr::col((
                            revoke_content.clone(),
                            Alias::new("digest_type"),
                        ))
                        .equals((
                            revoke_event.clone(),
                            Alias::new("content_digest_type"),
                        )),
                    )
                    .add(
                        Expr::col((
                            revoke_content.clone(),
                            Alias::new("digest_bytes"),
                        ))
                        .equals((
                            revoke_event.clone(),
                            Alias::new("content_digest_bytes"),
                        )),
                    ),
            );

        let rev_stmt = db.get_database_backend().build(&rev_query);
        let rev_rows =
            RevocationRow::find_by_statement(rev_stmt).all(db).await?;

        // Build a map: revoked key → earliest revocation time
        let mut revoked_at_map: HashMap<PubKey, TimeDateTime> = HashMap::new();
        for r in rev_rows {
            let key: PubKey = (r.revoked_key_type as i32, r.revoked_key);
            revoked_at_map
                .entry(key)
                .and_modify(|existing| {
                    if r.revoked_at < *existing {
                        *existing = r.revoked_at;
                    }
                })
                .or_insert(r.revoked_at);
        }

        Ok(authorized
            .into_iter()
            .map(|(key_type, key)| {
                let revoked_at =
                    revoked_at_map.get(&(key_type, key.clone())).copied();
                AuthorizedKey {
                    key: PublicKey { key_type, key },
                    revoked_at,
                }
            })
            .collect())
    }
}

#[derive(Debug, FromQueryResult)]
struct IdentityKeyRow {
    pub initial_key_type: i16,
    pub initial_key: Vec<u8>,
    pub claimer_key_type: Option<i16>,
    pub claimer_key: Option<Vec<u8>>,
    pub issuer_key_type: Option<i16>,
    pub issuer_key: Option<Vec<u8>>,
}

#[derive(Debug, FromQueryResult)]
struct RevocationRow {
    pub revoked_key_type: i16,
    pub revoked_key: Vec<u8>,
    pub revoked_at: TimeDateTime,
}
