use sea_orm::sea_query::{Alias, Condition, Expr, Query as SeaQuery};
use sea_orm::*;
use std::collections::HashSet;

pub type PubKey = (i16, Vec<u8>);

pub struct Query;

impl Query {
    /// Returns all authorized public keys for an identity via CRDT replay.
    ///
    /// Single query: starts from content_identity, LEFT JOINs through the
    /// claim and issue chains to collect (claimer_key, issuer_key) pairs,
    /// then resolves authorization in Rust.
    pub async fn authorized_keys(
        db: &DbConn,
        identity_id: &[u8],
    ) -> Result<Vec<PubKey>, DbErr> {
        let ci = Alias::new("ci");
        let cic = Alias::new("cic");
        let cc = Alias::new("cc");
        let ce = Alias::new("ce");
        let iss = Alias::new("iss");
        let ic = Alias::new("ic");
        let ie = Alias::new("ie");

        let mut query = SeaQuery::select();
        query
            .expr_as(
                Expr::col((ci.clone(), Alias::new("initial_public_key_type"))),
                Alias::new("initial_key_type"),
            )
            .expr_as(
                Expr::col((ci.clone(), Alias::new("initial_public_key"))),
                Alias::new("initial_key"),
            )
            .expr_as(
                Expr::col((ce.clone(), Alias::new("public_key_type"))),
                Alias::new("claimer_key_type"),
            )
            .expr_as(
                Expr::col((ce.clone(), Alias::new("public_key"))),
                Alias::new("claimer_key"),
            )
            .expr_as(
                Expr::col((ie.clone(), Alias::new("public_key_type"))),
                Alias::new("issuer_key_type"),
            )
            .expr_as(
                Expr::col((ie.clone(), Alias::new("public_key"))),
                Alias::new("issuer_key"),
            )
            .from_as(Alias::new("content_identity"), ci.clone())
            .and_where(
                Expr::col((ci.clone(), Alias::new("identity_id")))
                    .eq(identity_id),
            )
            // claim on this identity
            .join_as(
                JoinType::LeftJoin,
                Alias::new("content_identity_claim"),
                cic.clone(),
                Expr::col((cic.clone(), Alias::new("claimed_identity_id")))
                    .equals((ci.clone(), Alias::new("identity_id"))),
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
                        Expr::col((
                            cc.clone(),
                            Alias::new("digest_type"),
                        ))
                        .equals((
                            ce.clone(),
                            Alias::new("content_digest_type"),
                        )),
                    )
                    .add(
                        Expr::col((
                            cc.clone(),
                            Alias::new("digest_bytes"),
                        ))
                        .equals((
                            ce.clone(),
                            Alias::new("content_digest_bytes"),
                        )),
                    ),
            )
            // issue where issued key matches the claimer key
            .join_as(
                JoinType::LeftJoin,
                Alias::new("content_identity_issue"),
                iss.clone(),
                Condition::all()
                    .add(
                        Expr::col((
                            iss.clone(),
                            Alias::new("issued_public_key_type"),
                        ))
                        .equals((
                            ce.clone(),
                            Alias::new("public_key_type"),
                        )),
                    )
                    .add(
                        Expr::col((
                            iss.clone(),
                            Alias::new("issued_public_key"),
                        ))
                        .equals((
                            ce.clone(),
                            Alias::new("public_key"),
                        )),
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
                        Expr::col((
                            ic.clone(),
                            Alias::new("digest_type"),
                        ))
                        .equals((
                            ie.clone(),
                            Alias::new("content_digest_type"),
                        )),
                    )
                    .add(
                        Expr::col((
                            ic.clone(),
                            Alias::new("digest_bytes"),
                        ))
                        .equals((
                            ie.clone(),
                            Alias::new("content_digest_bytes"),
                        )),
                    ),
            );

        let stmt = db.get_database_backend().build(&query);
        let rows =
            IdentityKeyRow::find_by_statement(stmt).all(db).await?;

        // Resolve: initial key is always authorized, delegated keys are
        // authorized when their issuer is in the authorized set.
        let mut authorized: HashSet<PubKey> = HashSet::new();

        if let Some(first) = rows.first() {
            authorized
                .insert((first.initial_key_type, first.initial_key.clone()));
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
                    let issuer: PubKey = (issuer_kt, issuer_k.clone());
                    let claimer: PubKey = (claimer_kt, claimer_k.clone());
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

        Ok(authorized.into_iter().collect())
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
