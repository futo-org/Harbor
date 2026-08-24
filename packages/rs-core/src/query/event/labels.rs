use polycentric_common::models::moderation_label::ModerationLabel;

/// Every moderation label value in canonical order.
#[uniffi::export]
pub fn moderation_labels() -> Vec<String> {
    ModerationLabel::ALL
        .iter()
        .map(|l| l.value().to_string())
        .collect()
}

/// Whether `value` is one of the defined moderation labels.
#[uniffi::export]
pub fn is_moderation_label(value: String) -> bool {
    ModerationLabel::from_value(&value).is_some()
}
