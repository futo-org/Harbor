//! Platform health checks. Each verifier's health check fetches a known
//! profile (text) or confirms its credentials (OAuth); the results feed the
//! per-platform gauges on the dashboard. The loop runs the checks one after
//! another so the headless-browser verifiers never overlap.

use std::sync::Arc;
use std::time::{Duration, Instant};

use futures::FutureExt;

use crate::error::{VResult, VerifierError};
use crate::metrics::{
    HEALTH_CHECK_DURATION, HEALTH_CHECK_LAST_SUCCESS, HEALTH_CHECK_UP, HEALTH_CHECKS,
};
use crate::util::unix_seconds;
use crate::verifier::Verifier;

/// Run one verifier's health check and record it. A panicking check counts
/// as an `error` outcome rather than taking the caller down.
pub async fn run_health_check(verifier: &Verifier) -> VResult<()> {
    let platform = verifier.slug();
    let kind = verifier.verifier_type().as_str();
    let labels = [platform.as_str(), kind];
    let started = Instant::now();

    let (result, outcome) = match std::panic::AssertUnwindSafe(verifier.health_check())
        .catch_unwind()
        .await
    {
        Ok(Ok(())) => (Ok(()), "ok"),
        Ok(Err(e)) => (Err(e), "failed"),
        Err(panic) => {
            let detail = panic
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| panic.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic".into());
            (
                Err(VerifierError::msg(format!("Health check threw: {detail}"))),
                "error",
            )
        }
    };

    HEALTH_CHECK_DURATION
        .with_label_values(&labels)
        .observe(started.elapsed().as_secs_f64());
    HEALTH_CHECKS
        .with_label_values(&[platform.as_str(), kind, outcome])
        .inc();
    HEALTH_CHECK_UP
        .with_label_values(&labels)
        .set(if result.is_ok() { 1.0 } else { 0.0 });
    if result.is_ok() {
        HEALTH_CHECK_LAST_SUCCESS
            .with_label_values(&labels)
            .set(unix_seconds());
    }
    result
}

/// Health check every verifier now, then again every `interval`, forever.
pub async fn health_check_loop(verifiers: Vec<Arc<Verifier>>, interval: Duration) {
    loop {
        for verifier in &verifiers {
            let result = run_health_check(verifier).await;
            tracing::info!(
                "Health check {}/{}: {}",
                verifier.slug(),
                verifier.verifier_type().as_str(),
                match &result {
                    Ok(()) => "ok",
                    Err(e) => e.message.as_str(),
                }
            );
        }
        tokio::time::sleep(interval).await;
    }
}

#[cfg(test)]
mod tests {
    use async_trait::async_trait;

    use super::*;
    use crate::claims::ClaimField;
    use crate::metrics::{REGISTRY, render};
    use crate::verifier::TextPlatform;

    #[derive(Clone, Copy)]
    enum Behaviour {
        Ok,
        Fail,
        Panic,
    }

    struct Fake(Behaviour);

    #[async_trait]
    impl TextPlatform for Fake {
        async fn get_text(&self, _field: &ClaimField) -> VResult<String> {
            Ok(String::new())
        }

        async fn get_claim_fields_by_url(&self, _url: &str) -> VResult<Vec<ClaimField>> {
            Ok(Vec::new())
        }

        async fn health_check(&self) -> VResult<()> {
            match self.0 {
                Behaviour::Ok => Ok(()),
                Behaviour::Fail => Err(VerifierError::msg("down")),
                Behaviour::Panic => panic!("boom"),
            }
        }
    }

    fn gauge(name: &str, platform: &str) -> Option<f64> {
        REGISTRY
            .gather()
            .into_iter()
            .find(|f| f.name() == name)?
            .get_metric()
            .iter()
            .find(|m| {
                m.get_label()
                    .iter()
                    .any(|l| l.name() == "platform" && l.value() == platform)
            })
            .map(|m| m.get_gauge().get_value())
    }

    fn outcome(platform: &str, outcome: &str) -> f64 {
        HEALTH_CHECKS
            .with_label_values(&[platform, "text", outcome])
            .get()
    }

    // Each test uses its own platform so the shared registry's series don't
    // collide when tests run in parallel.

    #[tokio::test]
    async fn records_a_pass() {
        let before = unix_seconds();
        let verifier = Verifier::text("Health Pass", Fake(Behaviour::Ok));
        assert!(run_health_check(&verifier).await.is_ok());
        assert_eq!(
            gauge("verifier_bot_health_check_up", "health-pass"),
            Some(1.0)
        );
        let last = gauge(
            "verifier_bot_health_check_last_success_timestamp_seconds",
            "health-pass",
        )
        .unwrap();
        assert!(last >= before.floor());
        assert_eq!(outcome("health-pass", "ok"), 1.0);
    }

    #[tokio::test]
    async fn records_a_failure_without_clearing_the_last_success() {
        let platform = "Health Flaky";
        assert!(
            run_health_check(&Verifier::text(platform, Fake(Behaviour::Ok)))
                .await
                .is_ok()
        );
        let result = run_health_check(&Verifier::text(platform, Fake(Behaviour::Fail))).await;
        assert_eq!(result.unwrap_err().message, "down");
        assert_eq!(
            gauge("verifier_bot_health_check_up", "health-flaky"),
            Some(0.0)
        );
        assert!(
            gauge(
                "verifier_bot_health_check_last_success_timestamp_seconds",
                "health-flaky"
            )
            .is_some()
        );
        assert_eq!(outcome("health-flaky", "failed"), 1.0);
    }

    #[tokio::test]
    async fn turns_a_panicking_check_into_an_error_outcome() {
        let verifier = Verifier::text("Health Panic", Fake(Behaviour::Panic));
        let err = run_health_check(&verifier).await.unwrap_err();
        assert!(err.message.contains("boom"), "{}", err.message);
        assert_eq!(outcome("health-panic", "error"), 1.0);
    }

    #[tokio::test]
    async fn exposes_the_series_on_the_registry() {
        let verifier = Verifier::text("Health Exposed", Fake(Behaviour::Fail));
        let _ = run_health_check(&verifier).await;
        let body = render().unwrap();
        let line = body
            .lines()
            .find(|l| {
                l.starts_with("verifier_bot_health_check_up{")
                    && l.contains("platform=\"health-exposed\"")
            })
            .unwrap();
        assert!(line.ends_with(" 0"), "{line}");
    }
}
