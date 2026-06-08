use std::env;

use rdkafka::config::ClientConfig;

/// Apply the broker, security protocol, and SASL settings shared by
/// every client to `config`.
pub(crate) fn set_defaults(config: &mut ClientConfig) {
    let brokers =
        env::var("POLYCENTRIC_KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9092".to_string());
    config
        .set("bootstrap.servers", brokers)
        .set(
            "security.protocol",
            env::var("POLYCENTRIC_KAFKA_SECURITY_PROTOCOL")
                .unwrap_or_else(|_| "PLAINTEXT".to_string()),
        )
        .set(
            "sasl.mechanism",
            env::var("POLYCENTRIC_KAFKA_SASL_MECHANISM").unwrap_or_else(|_| "PLAIN".to_string()),
        )
        .set(
            "sasl.username",
            env::var("POLYCENTRIC_KAFKA_SASL_USERNAME").unwrap_or_default(),
        )
        .set(
            "sasl.password",
            env::var("POLYCENTRIC_KAFKA_SASL_PASSWORD").unwrap_or_default(),
        )
        .set(
            "broker.address.family",
            env::var("POLYCENTRIC_KAFKA_BROKER_ADDRESS_FAMILY")
                .unwrap_or_else(|_| "any".to_string()),
        );
}
