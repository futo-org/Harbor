use std::{env, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    tonic_prost_build::configure()
        .file_descriptor_set_path(out_dir.join("polycentric.bin"))
        .compile_protos(
            &[
                "../../../protos/polycentric/v2/identity.proto",
                "../../../protos/polycentric/v2/event_key.proto",
                "../../../protos/polycentric/v2/content.proto",
                "../../../protos/polycentric/v2/events.proto",
                "../../../protos/polycentric/v2/feeds.proto",
                "../../../protos/polycentric/v2/search.proto",
            ],
            &["../../../protos"],
        )
        .unwrap();

    Ok(())
}
