use std::fmt;

#[derive(Debug)]
pub enum SignatureError {
    PublicKeyLength,
    PublicKey,
    SignatureLength,
    Signature,
}

impl fmt::Display for SignatureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SignatureError::PublicKeyLength => {
                write!(f, "public key must be 32 bytes")
            }
            SignatureError::PublicKey => write!(f, "invalid public key"),
            SignatureError::SignatureLength => {
                write!(f, "signature must be 64 bytes")
            }
            SignatureError::Signature => write!(f, "invalid signature"),
        }
    }
}

/// Verify an ed25519 signature over the given message bytes.
pub fn verify_ed25519_signature(
    public_key_bytes: &[u8],
    signature_bytes: &[u8],
    message: &[u8],
) -> Result<(), SignatureError> {
    let public_key_bytes: [u8; 32] = public_key_bytes
        .try_into()
        .map_err(|_| SignatureError::PublicKeyLength)?;

    let public_key = ed25519_dalek::VerifyingKey::from_bytes(&public_key_bytes)
        .map_err(|_| SignatureError::PublicKey)?;

    let signature_bytes: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| SignatureError::SignatureLength)?;

    let signature = ed25519_dalek::Signature::from_bytes(&signature_bytes);

    public_key
        .verify_strict(message, &signature)
        .map_err(|_| SignatureError::Signature)?;

    Ok(())
}
