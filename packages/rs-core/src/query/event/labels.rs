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

/// A moderation label with its display name and description.
#[derive(uniffi::Record)]
pub struct ModerationLabelEntry {
    /// The canonical string value (e.g. "hate", "self-harm").
    pub key: String,
    /// The user-facing display name (e.g. "Sexually Suggestive").
    pub name: String,
    /// A short description of what this label covers.
    pub description: String,
}

/// Every moderation label and its associated metadata.
#[uniffi::export]
pub fn moderation_label_entries() -> Vec<ModerationLabelEntry> {
    ModerationLabel::ALL
        .iter()
        .map(|l| ModerationLabelEntry {
            key: l.value().to_string(),
            name: l.name().to_string(),
            description: l.description().to_string(),
        })
        .collect()
}
