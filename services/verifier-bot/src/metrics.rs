//! Prometheus metrics (scraped by VictoriaMetrics via the pod annotations,
//! see deploy/charts/harbor-verifier-bot). Everything is `verifier_bot_`
//! prefixed so the dashboard needs no namespace filter, and every series
//! carries `service="verifier-bot"`. `platform` is the route slug (bounded
//! by the platform list; anything else is '').

use std::collections::HashSet;
use std::sync::LazyLock;

use prometheus::{
    CounterVec, Encoder, Gauge, GaugeVec, HistogramOpts, HistogramVec, Opts, Registry, TextEncoder,
};

pub static REGISTRY: LazyLock<Registry> = LazyLock::new(|| {
    let labels = [("service".to_string(), "verifier-bot".to_string())].into();
    let registry = Registry::new_custom(None, Some(labels)).expect("registry labels are valid");
    #[cfg(target_os = "linux")]
    registry
        .register(Box::new(
            prometheus::process_collector::ProcessCollector::for_self(),
        ))
        .expect("process collector registers once");
    registry
});

fn register<T: prometheus::core::Collector + Clone + 'static>(metric: T) -> T {
    REGISTRY
        .register(Box::new(metric.clone()))
        .expect("metric registers once");
    metric
}

fn counter(name: &str, help: &str, labels: &[&str]) -> CounterVec {
    register(CounterVec::new(Opts::new(name, help), labels).expect("valid counter"))
}

fn histogram(name: &str, help: &str, labels: &[&str], buckets: &[f64]) -> HistogramVec {
    register(
        HistogramVec::new(
            HistogramOpts::new(name, help).buckets(buckets.to_vec()),
            labels,
        )
        .expect("valid histogram"),
    )
}

fn gauge(name: &str, help: &str, labels: &[&str]) -> GaugeVec {
    register(GaugeVec::new(Opts::new(name, help), labels).expect("valid gauge"))
}

pub static HTTP_REQUESTS: LazyLock<CounterVec> = LazyLock::new(|| {
    counter(
        "verifier_bot_http_requests_total",
        "Requests handled, by platform, endpoint and status.",
        &["platform", "endpoint", "status"],
    )
});

pub static HTTP_DURATION: LazyLock<HistogramVec> = LazyLock::new(|| {
    histogram(
        "verifier_bot_http_request_duration_seconds",
        "Wall time to answer a request, by platform and endpoint.",
        &["platform", "endpoint"],
        &[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 20.0, 30.0, 60.0],
    )
});

/// How a verify request ended (the `outcome` label).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VerificationOutcome {
    Ok,
    BadRequest,
    ClaimFetchFailed,
    SchemaMismatch,
    PlatformMismatch,
    Rejected,
    PublishFailed,
}

impl VerificationOutcome {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::BadRequest => "bad_request",
            Self::ClaimFetchFailed => "claim_fetch_failed",
            Self::SchemaMismatch => "schema_mismatch",
            Self::PlatformMismatch => "platform_mismatch",
            Self::Rejected => "rejected",
            Self::PublishFailed => "publish_failed",
        }
    }
}

pub static VERIFICATIONS: LazyLock<CounterVec> = LazyLock::new(|| {
    counter(
        "verifier_bot_verifications_total",
        "Verify requests by platform, verifier type and outcome.",
        &["platform", "verifier", "outcome"],
    )
});

pub static VERIFICATION_DURATION: LazyLock<HistogramVec> = LazyLock::new(|| {
    histogram(
        "verifier_bot_verification_duration_seconds",
        "End-to-end verify time including the upstream profile fetch and publish.",
        &["platform", "verifier"],
        &[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 20.0, 30.0, 60.0],
    )
});

/// outcome: ok | failed (returned an error) | error (panicked)
pub static HEALTH_CHECKS: LazyLock<CounterVec> = LazyLock::new(|| {
    counter(
        "verifier_bot_health_checks_total",
        "Platform health checks (scheduled and on demand) by outcome.",
        &["platform", "verifier", "outcome"],
    )
});

pub static HEALTH_CHECK_DURATION: LazyLock<HistogramVec> = LazyLock::new(|| {
    histogram(
        "verifier_bot_health_check_duration_seconds",
        "Time a platform health check took.",
        &["platform", "verifier"],
        &[0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 20.0, 30.0, 60.0],
    )
});

pub static HEALTH_CHECK_UP: LazyLock<GaugeVec> = LazyLock::new(|| {
    gauge(
        "verifier_bot_health_check_up",
        "1 when the last health check for the platform passed, else 0.",
        &["platform", "verifier"],
    )
});

pub static HEALTH_CHECK_LAST_SUCCESS: LazyLock<GaugeVec> = LazyLock::new(|| {
    gauge(
        "verifier_bot_health_check_last_success_timestamp_seconds",
        "Unix time of the last passing health check for the platform.",
        &["platform", "verifier"],
    )
});

/// OAuth sign-ins started (URL handed out) but not yet called back. Set
/// from the session store on every scrape.
pub static OAUTH_SESSIONS_PENDING: LazyLock<Gauge> = LazyLock::new(|| {
    register(
        Gauge::new(
            "verifier_bot_oauth_sessions_pending",
            "OAuth sign-ins started but not yet returned to the callback.",
        )
        .expect("valid gauge"),
    )
});

/// Create every metric up front so they all show on the first scrape.
pub fn init() {
    LazyLock::force(&HTTP_REQUESTS);
    LazyLock::force(&HTTP_DURATION);
    LazyLock::force(&VERIFICATIONS);
    LazyLock::force(&VERIFICATION_DURATION);
    LazyLock::force(&HEALTH_CHECKS);
    LazyLock::force(&HEALTH_CHECK_DURATION);
    LazyLock::force(&HEALTH_CHECK_UP);
    LazyLock::force(&HEALTH_CHECK_LAST_SUCCESS);
    LazyLock::force(&OAUTH_SESSIONS_PENDING);
}

/// Content type of [`render`]'s output.
pub const CONTENT_TYPE: &str = "text/plain; version=0.0.4; charset=utf-8";

/// The registry in the Prometheus text format.
pub fn render() -> Result<String, prometheus::Error> {
    let mut buf = Vec::new();
    TextEncoder::new().encode(&REGISTRY.gather(), &mut buf)?;
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

const VERIFIER_ENDPOINTS: &[&str] = &[
    "verify",
    "url",
    "token",
    "check",
    "get-claim-fields-by-url",
    "health-check",
];

/// Bounded labels for a request path. Platform routes collapse to their slug
/// and endpoint; anything unrecognised is 'other' so bad URLs can't grow the
/// series set.
pub fn route_labels(path: &str, known_platforms: &HashSet<String>) -> (String, String) {
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segments.len() == 1 && ["metrics", "identity", "platforms"].contains(&segments[0]) {
        return (String::new(), segments[0].to_string());
    }
    if segments.first() != Some(&"platforms")
        || !segments
            .get(1)
            .is_some_and(|s| known_platforms.contains(*s))
    {
        return (String::new(), "other".into());
    }
    let platform = segments[1].to_string();
    if segments.len() == 2 {
        return (platform, "platform".into());
    }
    if segments.len() == 4 && segments[2] == "oauth" && segments[3] == "callback" {
        return (platform, "oauth-callback".into());
    }
    if segments.len() == 4 && VERIFIER_ENDPOINTS.contains(&segments[3]) {
        return (platform, segments[3].to_string());
    }
    (platform, "other".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels(path: &str) -> (String, String) {
        let known: HashSet<String> = ["github".to_string(), "x".to_string()].into();
        route_labels(path, &known)
    }

    fn pair(platform: &str, endpoint: &str) -> (String, String) {
        (platform.into(), endpoint.into())
    }

    #[test]
    fn names_the_fixed_routes() {
        assert_eq!(labels("/metrics"), pair("", "metrics"));
        assert_eq!(labels("/platforms"), pair("", "platforms"));
        assert_eq!(labels("/identity"), pair("", "identity"));
    }

    #[test]
    fn splits_platform_routes_into_platform_and_endpoint() {
        assert_eq!(labels("/platforms/github"), pair("github", "platform"));
        assert_eq!(
            labels("/platforms/github/text/verify"),
            pair("github", "verify")
        );
        assert_eq!(
            labels("/platforms/x/oauth/callback"),
            pair("x", "oauth-callback")
        );
    }

    #[test]
    fn collapses_anything_unknown_so_labels_stay_bounded() {
        assert_eq!(labels("/platforms/nope/text/verify"), pair("", "other"));
        assert_eq!(
            labels("/platforms/github/text/whatever"),
            pair("github", "other")
        );
        assert_eq!(labels("/wp-admin"), pair("", "other"));
        assert_eq!(labels("/"), pair("", "other"));
    }

    #[test]
    fn render_includes_the_service_label() {
        init();
        HTTP_REQUESTS
            .with_label_values(&["render-test", "verify", "200"])
            .inc();
        let body = render().unwrap();
        assert!(body.contains("verifier_bot_http_requests_total{"));
        assert!(body.contains("service=\"verifier-bot\""));
    }
}
