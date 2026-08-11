pub mod error;
pub mod jwt;
pub mod merkle;
pub mod models;
pub mod platform;
pub mod signing;

fn encode_hex(bytes: &[u8]) -> String {
    const HEX_CHARS: [u8; 16] = *b"0123456789abcdef";
    let mut buf = String::with_capacity(2 * bytes.len());
    for byte in bytes {
        buf.push(HEX_CHARS[usize::from(byte >> 4)] as char);
        buf.push(HEX_CHARS[usize::from(byte & 0b1111)] as char);
    }
    buf
}
