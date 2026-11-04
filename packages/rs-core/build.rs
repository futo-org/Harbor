use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

use prost::Message;

#[path = "build/records.rs"]
mod records;

/// The v2 protos the records are generated from (as rs-common compiles them).
const V2_PROTOS: &[&str] = &[
    "polycentric/v2/keypair.proto",
    "polycentric/v2/event_key.proto",
    "polycentric/v2/identity.proto",
    "polycentric/v2/identity_service.proto",
    "polycentric/v2/events.proto",
    "polycentric/v2/backup.proto",
    "polycentric/v2/content.proto",
    "polycentric/v2/feeds.proto",
    "polycentric/v2/server.proto",
    "polycentric/v2/search.proto",
    "polycentric/v2/notifications.proto",
    "polycentric/v2/pairing_service.proto",
    "polycentric/v2/verifications.proto",
    "polycentric/v2/verifications_service.proto",
    "polycentric/v2/graph_service.proto",
    "polycentric/v2/profile_service.proto",
    "polycentric/v2/moderation_service.proto",
];

/// Generate `records.rs` (UniFFI records for the v2 messages) into OUT_DIR.
fn generate_records(
    protos_dir: &std::path::Path,
    out_dir: &std::path::Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let descriptor_path = out_dir.join("polycentric_v2_records.bin");
    let status = Command::new(prost_build::protoc_from_env())
        .arg("--include_imports")
        .arg("--include_source_info")
        .arg(format!(
            "--descriptor_set_out={}",
            descriptor_path.display()
        ))
        .arg(format!("-I{}", protos_dir.display()))
        .args(V2_PROTOS.iter().map(|p| protos_dir.join(p)))
        .status()?;
    if !status.success() {
        return Err(format!("protoc failed: {status}").into());
    }
    let fds = prost_types::FileDescriptorSet::decode(fs::read(&descriptor_path)?.as_slice())?;
    fs::write(out_dir.join("records.rs"), records::generate(&fds))?;
    for proto in V2_PROTOS {
        println!(
            "cargo:rerun-if-changed={}",
            protos_dir.join(proto).display()
        );
    }
    println!("cargo:rerun-if-changed=build/records.rs");
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let protos_dir = PathBuf::from("../../protos");
    if !protos_dir.is_dir() {
        return Err("Proto directory not found at ../../protos".into());
    }

    let proto_file_path = protos_dir.join("polycentric.proto");
    let ffi_proto_file_path = protos_dir.join("rs-core-ffi.proto");

    prost_build::Config::new().compile_protos(
        &[proto_file_path.as_path(), ffi_proto_file_path.as_path()],
        &[protos_dir.as_path()],
    )?;

    // Post-process the generated code to fix packed encoding for CountReferencesResult.counts
    let out_dir = env::var("OUT_DIR")?;
    let generated_file = PathBuf::from(&out_dir).join("polycentric.rs");

    if generated_file.exists() {
        let content = fs::read_to_string(&generated_file)?;

        let fixed_content = content.replace(
            "#[prost(uint64, repeated, tag = \"1\")]\n    pub counts:",
            "#[prost(uint64, repeated, packed, tag = \"1\")]\n    pub counts:",
        );

        if content != fixed_content {
            fs::write(&generated_file, fixed_content)?;
            println!("cargo:warning=Applied packed encoding fix to CountReferencesResult.counts");
        }
    }

    println!("cargo:rerun-if-changed={}", proto_file_path.display());
    println!("cargo:rerun-if-changed={}", ffi_proto_file_path.display());

    generate_records(&protos_dir, &PathBuf::from(&out_dir))?;

    Ok(())
}
