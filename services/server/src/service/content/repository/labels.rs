use super::split_event_key;
use crate::service::proto::Labels;
use entity::content_label;
use sea_orm::DbErr;
use sea_orm::sea_query::{
    CommonTableExpression, DynIden, Expr, InsertStatement, SelectStatement,
    WithClause,
};
use tonic::Status;

pub(super) fn add_query(
    with: &mut WithClause,
    labels: Labels,
    content_id: (DynIden, DynIden),
) -> Result<Option<InsertStatement>, Status> {
    let Labels {
        event_key,
        mut label_values,
    } = labels;
    // An empty set still needs a row, so that it is found as the newest
    // label event for its target and clears the labels before it.
    if label_values.is_empty() {
        label_values.push(String::new());
    }

    let key = split_event_key(event_key, "labels content")?;

    // The CTE must select the VALUES column; without it every row is the
    // empty record and that is what got stored as the label.
    const LABEL_VALES: &str = "label_values";
    const VALUE: &str = "value";
    let mut label_values_query = SelectStatement::new();
    label_values_query
        .expr_as(Expr::col(("values", "column1")), VALUE)
        .from_values(label_values, "values");
    let mut cte = CommonTableExpression::new();
    cte.table_name(LABEL_VALES).query(label_values_query);
    with.cte(cte);

    let mut query = InsertStatement::new();
    query.into_table(content_label::Entity).columns([
        content_label::Column::ContentId,
        content_label::Column::LabelValue,
        content_label::Column::EventKeyCollection,
        content_label::Column::EventKeyIdentity,
        content_label::Column::EventKeyPublicKeyType,
        content_label::Column::EventKeyPublicKey,
        content_label::Column::EventKeySequence,
    ])
        .select_from({
            let mut q = SelectStatement::new();
            q.from(content_id.0.clone())
                .from(LABEL_VALES)
                .expr(Expr::col(content_id))
                .expr(Expr::col((LABEL_VALES, VALUE)))
                .expr(Expr::from(key.collection))
                .expr(Expr::from(key.identity.clone()))
                .expr(Expr::from(key.public_key_type))
                .expr(Expr::from(key.public_key.clone()))
                .expr(Expr::from(key.sequence));
            q
        })
        .map_err(|err| {
            let err = DbErr::Custom(format!("incorrect amount of values: {err}"));
            tracing::error!(error = %err, "failed to create query to store labels content");
            Status::internal("internal server error")
        })?;

    Ok(Some(query))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto::{EventKey, PublicKey};
    use sea_orm::sea_query::{PostgresQueryBuilder, Value};

    fn labels(values: &[&str]) -> Labels {
        Labels {
            event_key: Some(EventKey {
                collection: 2,
                identity: "alice".into(),
                signed_by: Some(PublicKey {
                    key_type: 1,
                    key: vec![1, 2, 3],
                }),
                sequence: 7,
            }),
            label_values: values.iter().map(|v| v.to_string()).collect(),
        }
    }

    /// The SQL of the CTEs and of the insert, plus the bound values.
    fn build(labels: Labels) -> (String, String, Vec<Value>) {
        let mut with = WithClause::new();
        let insert = add_query(&mut with, labels, ("c".into(), "id".into()))
            .unwrap()
            .unwrap();
        let (insert_sql, _) = insert.build(PostgresQueryBuilder);
        let mut select = SelectStatement::new();
        select.expr(Expr::Constant(true.into()));
        let (cte_sql, values) = select.with(with).build(PostgresQueryBuilder);
        (cte_sql, insert_sql, values.into_iter().collect())
    }

    #[test]
    fn indexes_each_label_value() {
        let (cte_sql, insert_sql, values) =
            build(labels(&["hate", "violence"]));
        assert!(
            cte_sql.contains(r#""values"."column1" AS "value""#),
            "{cte_sql}"
        );
        assert!(
            insert_sql.contains(r#""label_values"."value""#),
            "{insert_sql}"
        );
        assert!(values.contains(&Value::from("hate")), "{values:?}");
        assert!(values.contains(&Value::from("violence")), "{values:?}");
    }

    #[test]
    fn empty_label_set_is_indexed_as_one_blank_row() {
        let (_, _, values) = build(labels(&[]));
        assert!(values.contains(&Value::from("")), "{values:?}");
    }
}
