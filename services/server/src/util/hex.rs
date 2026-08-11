use std::fmt::Write as _;

/// Lowercase hex encoding of arbitrary bytes.
pub fn encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(s, "{b:02x}");
    }
    s
}

#[derive(Debug)]
pub enum DecodeError {
    OddLength,
    InvalidDigit,
}

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DecodeError::OddLength => write!(f, "hex string has odd length"),
            DecodeError::InvalidDigit => write!(f, "invalid hex digit"),
        }
    }
}

impl std::error::Error for DecodeError {}

/// Decode a hex string into bytes. Accepts upper- or lowercase.
pub fn decode(hex: &str) -> Result<Vec<u8>, DecodeError> {
    if !hex.len().is_multiple_of(2) {
        return Err(DecodeError::OddLength);
    }
    let mut out = Vec::with_capacity(hex.len() / 2);
    for chunk in hex.as_bytes().as_chunks::<2>().0 {
        let s = std::str::from_utf8(chunk)
            .map_err(|_| DecodeError::InvalidDigit)?;
        out.push(
            u8::from_str_radix(s, 16).map_err(|_| DecodeError::InvalidDigit)?,
        );
    }
    Ok(out)
}
