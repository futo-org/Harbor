//! Decode gRPC responses from bytes.
//!
//! It reads one or more files and writes the fmt::Debug representation to
//! `$file.txt`.
//!
//! Usage:
//!
//! ```bash
//! cargo run --bin decode_response -- $TYPE [paths...]
//!
//! # For example:
//! cargo run --bin decode_response -- SuggestFollowResponse suggest_follow_response
//! # Parses the `suggest_follow_response` file as `SuggestFollowResponse` and
//! # writes the result to `suggest_follow_response.txt`.
//! ```

use polycentric_common::models::protos_v2::*;
use prost::Message;

fn main() {
    let mut args = std::env::args();
    args.next(); // Binary.

    let decode_type = match args.next().as_deref() {
        Some("ListFollowsResponse") => decode_type::<ListFollowsResponse>,
        Some("SuggestFollowResponse") => decode_type::<SuggestFollowResponse>,
        Some(ty) => panic!("unknown type: `{ty}`"),
        None => panic!("missing type"),
    };

    for path in args {
        let frame = std::fs::read(&path)
            .unwrap_or_else(|err| panic!("failed to read '{path}': {err}"));
        let msg_bytes = skip_response_frame_bytes(&frame);

        let response = decode_type(msg_bytes);
        let out = format!("{path}.txt");
        std::fs::write(out, &response).unwrap();
    }
}

fn skip_response_frame_bytes(frame: &[u8]) -> &[u8] {
    if frame.len() < 5 {
        panic!("gRPC frame is too short");
    }
    if frame[0] != 0 {
        panic!("response is compressed");
    }

    let message_len =
        u32::from_be_bytes([frame[1], frame[2], frame[3], frame[4]]) as usize;
    if frame.len() < 5 + message_len {
        panic!("incomplete message");
    }

    &frame[5..5 + message_len]
}

fn decode_type<T: Message + std::fmt::Debug + Default>(bytes: &[u8]) -> String {
    let msg = T::decode(bytes).expect("failed to decode message");
    format!("{msg:#?}")
}
