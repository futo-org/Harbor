use std::env;

use rdkafka::config::ClientConfig;

/// Apply the broker, security protocol, and SASL settings shared by
/// every client to `config`.
///
/// SASL properties (`sasl.mechanism`, `sasl.username`, `sasl.password`) are
/// only set when their corresponding environment variables are explicitly
/// configured.
pub(crate) fn set_defaults(config: &mut ClientConfig) {
    let brokers =
        env::var("POLYCENTRIC_KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9092".to_string());
    config.set("bootstrap.servers", brokers).set(
        "security.protocol",
        env::var("POLYCENTRIC_KAFKA_SECURITY_PROTOCOL").unwrap_or_else(|_| "PLAINTEXT".to_string()),
    );

    if let Ok(value) = env::var("POLYCENTRIC_KAFKA_SASL_MECHANISM") {
        config.set("sasl.mechanism", value);
    }
    if let Ok(value) = env::var("POLYCENTRIC_KAFKA_SASL_USERNAME") {
        config.set("sasl.username", value);
    }
    if let Ok(value) = env::var("POLYCENTRIC_KAFKA_SASL_PASSWORD") {
        config.set("sasl.password", value);
    }

    config.set(
        "broker.address.family",
        env::var("POLYCENTRIC_KAFKA_BROKER_ADDRESS_FAMILY").unwrap_or_else(|_| "any".to_string()),
    );
}
