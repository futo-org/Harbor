use std::env;
use std::fs;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let types_base_dir = PathBuf::from("proto");
    if !types_base_dir.is_dir() {
        return Err("Proto submodule not initialized. Run `git submodule update --init`.".into());
    }

    let proto_file_path = types_base_dir.join("protos/polycentric.proto");
    let ffi_proto_file_path = types_base_dir.join("protos/rs-core-ffi.proto");

    prost_build::Config::new().compile_protos(
        &[proto_file_path.as_path(), ffi_proto_file_path.as_path()],
        &[types_base_dir.as_path()],
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

    Ok(())
}
