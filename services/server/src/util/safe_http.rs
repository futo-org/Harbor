//! SSRF-protected HTTP client for fetching untrusted, user-supplied URLs.
//!
//! Use [`client`] for any server-side request to a caller-controlled URL, and
//! [`validate_url`] to parse/pre-validate the URL string first. Together they
//! enforce the trust boundary for outbound fetches:
//!
//! - only `http`/`https` schemes are allowed;
//! - IP-literal / `localhost` targets in internal ranges are rejected up front;
//! - the custom DNS resolver drops any hostname that resolves to an internal
//!   address, and reqwest dials exactly the addresses it returns — closing the
//!   DNS→private-IP and DNS-rebinding vectors a string check alone would miss;
//! - redirects are capped and re-checked on every hop.

use reqwest::Url;
use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

type BoxError = Box<dyn std::error::Error + Send + Sync>;

const FETCH_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REDIRECTS: usize = 5;
const USER_AGENT: &str =
    "Mozilla/5.0 (compatible; PolycentricBot/1.0; +mailto:support@futo.org)";

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// Shared, lazily-built HTTP client with SSRF protections baked in. Safe to use
/// for any outbound request to an untrusted URL. Pre-validate the URL with
/// [`validate_url`] for an early, clear rejection before connecting.
pub fn client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(FETCH_TIMEOUT)
            .user_agent(USER_AGENT)
            // Primary SSRF defense: every connection (initial + each redirect)
            // resolves through this resolver, which drops internal addresses.
            // reqwest dials exactly the addresses returned here, so the IP we
            // validate is the IP we connect to — closing both the DNS→private
            // gap and DNS-rebinding.
            .dns_resolver(Arc::new(SsrfGuardResolver))
            // Defense-in-depth: cap redirects and reject hops to IP-literal /
            // localhost targets. (The resolver only runs for hostnames, so
            // IP-literal redirects must be caught here.)
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() > MAX_REDIRECTS {
                    return attempt.error("too many redirects");
                }
                match attempt.url().host_str() {
                    Some(host) if is_blocked_host(host) => {
                        attempt.error("redirect to disallowed host")
                    }
                    _ => attempt.follow(),
                }
            }))
            .build()
            .expect("failed to build safe_http client")
    })
}

/// Error from [`get`]. Kept as two variants so callers can distinguish a bad
/// URL (a client error — 4xx / `invalid_argument`) from a request failure (an
/// upstream error — 5xx / `unavailable`).
#[derive(Debug)]
pub enum FetchError {
    /// URL rejected before connecting (bad scheme/host/SSRF); the string is a
    /// human-readable reason.
    InvalidUrl(&'static str),
    /// The HTTP request itself failed (DNS, connect, TLS, timeout, …).
    Request(reqwest::Error),
}

impl std::fmt::Display for FetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FetchError::InvalidUrl(reason) => {
                write!(f, "invalid url: {reason}")
            }
            FetchError::Request(e) => write!(f, "request failed: {e}"),
        }
    }
}

impl std::error::Error for FetchError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            FetchError::Request(e) => Some(e),
            FetchError::InvalidUrl(_) => None,
        }
    }
}

/// Validate `url` and issue a GET through the SSRF-protected [`client`]. This is
/// the one-call entry point for fetching an untrusted URL: it runs
/// [`validate_url`] first (so a bad/blocked URL fails before any network), then
/// sends the request.
pub async fn get(url: &str) -> Result<reqwest::Response, FetchError> {
    let url = validate_url(url).map_err(FetchError::InvalidUrl)?;
    client().get(url).send().await.map_err(FetchError::Request)
}

/// Parse and validate a URL before fetching it.
///
/// First SSRF layer: only `http`/`https` is allowed, and IP-literal /
/// `localhost` targets in internal ranges are rejected up front. Hostnames that
/// resolve to internal addresses are caught at connect time by
/// [`SsrfGuardResolver`], and redirects are re-checked by the client's redirect
/// policy. Returns a human-readable reason on rejection so callers can map it to
/// whatever error type they use.
pub fn validate_url(raw: &str) -> Result<Url, &'static str> {
    let url = Url::parse(raw).map_err(|_| "invalid url")?;

    match url.scheme() {
        "http" | "https" => {}
        _ => return Err("url must be http or https"),
    }

    let host = url.host_str().ok_or("url has no host")?;
    if is_blocked_host(host) {
        return Err("url host not allowed");
    }

    Ok(url)
}

/// Custom DNS resolver that refuses to hand back any internal address.
///
/// This is the core SSRF protection: it resolves the hostname via the system
/// resolver, filters out every private/loopback/link-local/etc. address, and
/// returns only the public ones. Because reqwest connects to the addresses
/// this returns (rather than re-resolving), a hostname that resolves to an
/// internal IP is blocked, and there's no resolve-then-reconnect window for
/// DNS rebinding to exploit.
struct SsrfGuardResolver;

impl Resolve for SsrfGuardResolver {
    fn resolve(&self, name: Name) -> Resolving {
        Box::pin(async move {
            // Port is irrelevant here — reqwest overrides it with the real
            // port before dialing. We only care about filtering IPs.
            let resolved = tokio::net::lookup_host((name.as_str(), 0u16))
                .await
                .map_err(BoxError::from)?;
            let addrs: Addrs = Box::new(filter_external_addrs(resolved)?);
            Ok(addrs)
        })
    }
}

/// Keep only addresses that are safe to connect to. Errors if nothing remains,
/// so a host that resolves *only* to internal addresses fails closed.
fn filter_external_addrs<I>(
    addrs: I,
) -> Result<std::vec::IntoIter<SocketAddr>, BoxError>
where
    I: Iterator<Item = SocketAddr>,
{
    let allowed: Vec<SocketAddr> =
        addrs.filter(|sa| !is_internal_ip(&sa.ip())).collect();
    if allowed.is_empty() {
        return Err("host resolves only to internal addresses".into());
    }
    Ok(allowed.into_iter())
}

/// Whether an address is one we refuse to connect to: private, loopback,
/// link-local, CGNAT, unspecified, etc.
fn is_internal_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                // Carrier-grade NAT 100.64.0.0/10
                || (v4.octets()[0] == 100 && (v4.octets()[1] & 0xc0) == 64)
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                // Unique-local fc00::/7
                || (v6.segments()[0] & 0xfe00) == 0xfc00
                // Link-local fe80::/10
                || (v6.segments()[0] & 0xffc0) == 0xfe80
                // IPv4-mapped — re-check the embedded v4.
                || v6.to_ipv4_mapped().is_some_and(|v4| is_internal_ip(&IpAddr::V4(v4)))
        }
    }
}

/// True for hosts we refuse to fetch: `localhost`, and IP literals in
/// private/loopback/link-local ranges.
fn is_blocked_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") {
        return true;
    }
    // Bracketed IPv6 literals arrive as `[::1]`; strip the brackets.
    let ip_str = host
        .strip_prefix('[')
        .and_then(|h| h.strip_suffix(']'))
        .unwrap_or(&host);
    if let Ok(ip) = ip_str.parse::<IpAddr>() {
        return is_internal_ip(&ip);
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn get_rejects_blocked_url_before_connecting() {
        // Validation runs first, so a blocked host fails without any network.
        let err = get("http://127.0.0.1/").await.unwrap_err();
        assert!(matches!(err, FetchError::InvalidUrl(_)));
    }

    #[test]
    fn rejects_non_http_scheme() {
        assert!(validate_url("file:///etc/passwd").is_err());
        assert!(validate_url("ftp://example.com").is_err());
        assert!(validate_url("not a url").is_err());
    }

    #[test]
    fn blocks_internal_hosts() {
        assert!(validate_url("http://localhost/x").is_err());
        assert!(validate_url("http://127.0.0.1/x").is_err());
        assert!(validate_url("http://10.0.0.5/x").is_err());
        assert!(validate_url("http://192.168.1.1/x").is_err());
        assert!(validate_url("http://169.254.169.254/latest").is_err());
        assert!(validate_url("http://[::1]/x").is_err());
    }

    #[test]
    fn allows_public_urls() {
        assert!(validate_url("https://example.com/a/b?c=d").is_ok());
        assert!(validate_url("http://8.8.8.8/").is_ok());
    }

    #[test]
    fn is_internal_ip_covers_unspecified_and_mapped() {
        // `0.0.0.0` is the exact form that bypassed activitypub-federation
        // (GHSA-q537-8fr5-cw35); on Linux connecting to it reaches localhost.
        assert!(is_internal_ip(&"0.0.0.0".parse().unwrap()));
        assert!(is_internal_ip(&"::".parse().unwrap()));
        // IPv4-mapped IPv6 must be unwrapped and re-checked.
        assert!(is_internal_ip(&"::ffff:127.0.0.1".parse().unwrap()));
        assert!(is_internal_ip(&"::ffff:10.0.0.1".parse().unwrap()));
        // Sanity: genuinely public addresses are not flagged.
        assert!(!is_internal_ip(&"1.1.1.1".parse().unwrap()));
        assert!(!is_internal_ip(&"2606:4700:4700::1111".parse().unwrap()));
    }

    #[test]
    fn validate_url_blocks_alternate_ip_encodings() {
        // Non-dotted / alternate encodings that resolve to loopback or 0.0.0.0.
        // The WHATWG `url` parser normalizes these to canonical IPs, which the
        // IP filter then rejects — so they're caught at the validate_url layer,
        // not only by the connect-time resolver.
        for raw in [
            "http://0.0.0.0/",
            "http://0/",          // -> 0.0.0.0
            "http://127.1/",      // -> 127.0.0.1
            "http://2130706433/", // -> 127.0.0.1
            "http://0x7f.0.0.1/", // -> 127.0.0.1
            "http://[::]/",
            "http://[::ffff:127.0.0.1]/",
        ] {
            assert!(
                validate_url(raw).is_err(),
                "expected {raw} to be blocked, got {:?}",
                validate_url(raw),
            );
        }
    }

    #[test]
    fn filter_external_addrs_drops_internal() {
        let addrs = [
            "8.8.8.8:0".parse().unwrap(),   // public — kept
            "10.0.0.1:0".parse().unwrap(),  // private — dropped
            "127.0.0.1:0".parse().unwrap(), // loopback — dropped
            "169.254.169.254:0".parse().unwrap(), // metadata — dropped
        ];
        let out: Vec<_> =
            filter_external_addrs(addrs.into_iter()).unwrap().collect();
        assert_eq!(out, vec!["8.8.8.8:0".parse().unwrap()]);
    }

    #[test]
    fn filter_external_addrs_fails_when_all_internal() {
        // A hostname resolving only to internal IPs (the DNS-rebinding / DNS
        // SSRF vector) must fail closed.
        let addrs = ["10.0.0.1:0".parse().unwrap(), "[::1]:0".parse().unwrap()];
        assert!(filter_external_addrs(addrs.into_iter()).is_err());
    }
}
