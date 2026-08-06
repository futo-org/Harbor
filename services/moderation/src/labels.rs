//! Map an Azure Content Safety response into label events

use polycentric_common::models::protos_v2::ReportCategory;
use serde_json::Value;

/// Top of Azure's default (FourSeverityLevels) severity scale.
const MAX_SEVERITY: i64 = 6;

/// A label and the Azure category + inclusive severity band that triggers it.
struct LabelRule {
    label: &'static str,
    category: &'static str,
    min: i64,
    max: i64,
}

/// Label rules, in the order labels are emitted. `Sexual` maps to two
/// bands; the remaining categories use a single `>= 4` threshold.
const LABEL_RULES: &[LabelRule] = &[
    LabelRule {
        label: "hate",
        category: "Hate",
        min: 4,
        max: MAX_SEVERITY,
    },
    LabelRule {
        label: "self-harm",
        category: "SelfHarm",
        min: 4,
        max: MAX_SEVERITY,
    },
    LabelRule {
        label: "sexually-suggestive",
        category: "Sexual",
        min: 2,
        max: 4,
    },
    LabelRule {
        label: "sexually-explicit",
        category: "Sexual",
        min: 5,
        max: MAX_SEVERITY,
    },
    LabelRule {
        label: "violence",
        category: "Violence",
        min: 4,
        max: MAX_SEVERITY,
    },
];

/// Derive the label values that apply to a piece of content from the
/// stored Azure response.
pub fn labels_from_azure(response: &Value) -> Vec<String> {
    LABEL_RULES
        .iter()
        .filter(|rule| {
            let severity = max_severity(response, rule.category);
            severity >= rule.min && severity <= rule.max
        })
        .map(|rule| rule.label.to_string())
        .collect()
}

/// Some report categories correspond to label events, as defined
/// in this function.
pub fn label_from_report_category(category: i32) -> Option<&'static str> {
    match ReportCategory::try_from(category).ok()? {
        ReportCategory::Hate => Some("hate"),
        ReportCategory::SelfHarm => Some("self-harm"),
        ReportCategory::SexuallyExplicit => Some("sexually-explicit"),
        ReportCategory::Violence => Some("violence"),
        ReportCategory::Unspecified
        | ReportCategory::Spam
        | ReportCategory::ChildSafety
        | ReportCategory::Copyright
        | ReportCategory::ServerPolicy => None,
    }
}

/// Highest severity reported for `category` across the text result and all
/// image results. Absent/malformed entries contribute nothing.
fn max_severity(response: &Value, category: &str) -> i64 {
    let text = response.get("text").into_iter();
    let images = response
        .get("images")
        .and_then(Value::as_array)
        .map(|a| a.as_slice())
        .unwrap_or(&[])
        .iter();

    text.chain(images)
        .map(|result| severity_in(result, category))
        .max()
        .unwrap_or(0)
}

/// Severity for `category` within a single Azure analysis result's
/// `categoriesAnalysis` array, or 0 if not present.
fn severity_in(result: &Value, category: &str) -> i64 {
    result
        .get("categoriesAnalysis")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|entry| entry.get("category").and_then(Value::as_str) == Some(category))
        .and_then(|entry| entry.get("severity").and_then(Value::as_i64))
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn analysis(pairs: &[(&str, i64)]) -> Value {
        json!({
            "categoriesAnalysis": pairs
                .iter()
                .map(|(c, s)| json!({ "category": c, "severity": s }))
                .collect::<Vec<_>>()
        })
    }

    #[test]
    fn applies_label_at_or_above_threshold() {
        let response = json!({ "text": analysis(&[("Hate", 4)]), "images": [] });
        assert_eq!(labels_from_azure(&response), vec!["hate"]);
    }

    #[test]
    fn omits_label_below_threshold() {
        let response = json!({ "text": analysis(&[("Hate", 2), ("Violence", 2)]), "images": [] });
        assert!(labels_from_azure(&response).is_empty());
    }

    #[test]
    fn sexual_moderate_band_is_sexually_suggestive() {
        for severity in [2, 4] {
            let response = json!({ "text": analysis(&[("Sexual", severity)]), "images": [] });
            assert_eq!(
                labels_from_azure(&response),
                vec!["sexually-suggestive"],
                "severity {severity} should be sexually-suggestive only"
            );
        }
    }

    #[test]
    fn sexual_high_band_is_sexually_explicit() {
        let response = json!({ "text": analysis(&[("Sexual", 6)]), "images": [] });
        assert_eq!(labels_from_azure(&response), vec!["sexually-explicit"]);
    }

    #[test]
    fn sexual_below_two_is_unlabeled() {
        let response = json!({ "text": analysis(&[("Sexual", 0)]), "images": [] });
        assert!(labels_from_azure(&response).is_empty());
    }

    #[test]
    fn takes_max_severity_across_images() {
        let response = json!({
            "text": Value::Null,
            "images": [analysis(&[("Violence", 0)]), analysis(&[("Violence", 6)])],
        });
        assert_eq!(labels_from_azure(&response), vec!["violence"]);
    }

    #[test]
    fn emits_in_rule_order() {
        let response = json!({
            "text": analysis(&[("Hate", 6), ("SelfHarm", 4), ("Sexual", 6), ("Violence", 4)]),
            "images": [],
        });
        assert_eq!(
            labels_from_azure(&response),
            vec!["hate", "self-harm", "sexually-explicit", "violence"]
        );
    }

    #[test]
    fn missing_or_null_fields_yield_no_labels() {
        assert!(labels_from_azure(&json!({})).is_empty());
        assert!(labels_from_azure(&json!({ "text": null, "images": [] })).is_empty());
        assert!(labels_from_azure(&json!({ "text": { "categoriesAnalysis": [] } })).is_empty());
    }

    #[test]
    fn report_categories_with_a_label_counterpart_map_to_it() {
        for (category, label) in [
            (ReportCategory::Hate, "hate"),
            (ReportCategory::SelfHarm, "self-harm"),
            (ReportCategory::SexuallyExplicit, "sexually-explicit"),
            (ReportCategory::Violence, "violence"),
        ] {
            assert_eq!(
                label_from_report_category(category as i32),
                Some(label),
                "{category:?} should map to {label}"
            );
        }
    }

    #[test]
    fn report_categories_without_a_label_counterpart_map_to_nothing() {
        for category in [
            ReportCategory::Unspecified,
            ReportCategory::Spam,
            ReportCategory::ChildSafety,
            ReportCategory::Copyright,
            ReportCategory::ServerPolicy,
        ] {
            assert_eq!(
                label_from_report_category(category as i32),
                None,
                "{category:?} should not map to a label"
            );
        }
    }

    #[test]
    fn retired_report_categories_map_to_nothing() {
        for retired in [2, 4, 5] {
            assert_eq!(label_from_report_category(retired), None);
        }
    }

    #[test]
    fn unrecognized_report_categories_map_to_nothing() {
        assert_eq!(label_from_report_category(9999), None);
        assert_eq!(label_from_report_category(-1), None);
    }

    #[test]
    fn sexually_suggestive_is_not_reportable() {
        let reportable: Vec<&str> = (0..64).filter_map(label_from_report_category).collect();
        assert!(!reportable.contains(&"sexually-suggestive"));
    }
}
