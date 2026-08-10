pub mod error;
pub mod jwt;
pub mod merkle;
pub mod models;
pub mod platform;
pub mod signing;

fn encode_hex(bytes: &[u8]) -> String {
    const HEX_CHARS: [u8; 16] = [
        b'0', b'1', b'2', b'3', b'4', b'5', b'6', b'7', b'8', b'9', b'a', b'b', b'c', b'd', b'e',
        b'f',
    ];
    let mut buf = String::with_capacity(2 * bytes.len());
    for byte in bytes {
        buf.push(HEX_CHARS[usize::from(byte >> 4)] as char);
        buf.push(HEX_CHARS[usize::from(byte & 0b1111)] as char);
    }
    buf
}
