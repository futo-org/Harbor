//! The moderation label enumeration.
//!
//! `Labels` events currently describe labels as strings, such that the
//! labels events can be used for tagging content. There are, however,
//! specific label values which are defined as markers for objectionable
//! content for warnings or filtering, as defined in this file.

/// Label values defined to be relevant for moderation, for use with
/// content warnings and filtering.
///
/// The uniffi bindings expose these as strings, so the harbor client mirrors
/// the vocabulary as a TypeScript union in
/// `apps/harbor/src/common/settings/moderationLabels.ts`. Update it when
/// adding or removing a label here.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ModerationLabel {
    Hate,
    SelfHarm,
    SexuallySuggestive,
    SexuallyExplicit,
    Violence,
}

impl ModerationLabel {
    /// Iterable list of all moderation-relevant labels.
    pub const ALL: [Self; 5] = [
        Self::Hate,
        Self::SelfHarm,
        Self::SexuallySuggestive,
        Self::SexuallyExplicit,
        Self::Violence,
    ];

    /// The defined string-value for this moderation label.
    pub const fn value(self) -> &'static str {
        match self {
            Self::Hate => "hate",
            Self::SelfHarm => "self-harm",
            Self::SexuallySuggestive => "sexually-suggestive",
            Self::SexuallyExplicit => "sexually-explicit",
            Self::Violence => "violence",
        }
    }

    /// The label with this defined value, or `None` when it isn't one of
    /// [`Self::ALL`].
    pub fn from_value(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|label| label.value() == value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn values_are_stable_and_ordered() {
        assert_eq!(
            ModerationLabel::ALL.map(ModerationLabel::value),
            [
                "hate",
                "self-harm",
                "sexually-suggestive",
                "sexually-explicit",
                "violence"
            ]
        );
    }

    #[test]
    fn from_value_round_trips_every_label() {
        for label in ModerationLabel::ALL {
            assert_eq!(ModerationLabel::from_value(label.value()), Some(label));
        }
    }

    #[test]
    fn from_value_rejects_values_outside_the_vocabulary() {
        assert_eq!(ModerationLabel::from_value("spam"), None);
        assert_eq!(ModerationLabel::from_value("Hate"), None);
        assert_eq!(ModerationLabel::from_value("self_harm"), None);
        assert_eq!(ModerationLabel::from_value(""), None);
    }
}
