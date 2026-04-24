use std::env;
use std::fs;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let protos_dir = PathBuf::from("../../protos");
    if !protos_dir.is_dir() {
        return Err("Proto directory not found at ../../protos".into());
    }

    // ── v1 protos (prost_build) ──────────────────────────────────
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

    // ── v2 protos (tonic_prost_build) ────────────────────────────
    let v2_protos = [
        "../../protos/polycentric/v2/keypair.proto",
        "../../protos/polycentric/v2/event_key.proto",
        "../../protos/polycentric/v2/identity.proto",
        "../../protos/polycentric/v2/events.proto",
        "../../protos/polycentric/v2/content.proto",
        "../../protos/polycentric/v2/feeds.proto",
        "../../protos/polycentric/v2/server.proto",
    ];

    let out_dir_path = PathBuf::from(&out_dir);
    tonic_prost_build::configure()
        .build_transport(false)
        .file_descriptor_set_path(out_dir_path.join("polycentric_v2.bin"))
        .compile_protos(&v2_protos, &["../../protos"])?;

    // ── rerun-if-changed ─────────────────────────────────────────
    println!("cargo:rerun-if-changed={}", proto_file_path.display());
    println!("cargo:rerun-if-changed={}", ffi_proto_file_path.display());
    for proto in &v2_protos {
        println!("cargo:rerun-if-changed={proto}");
    }

    Ok(())
}
