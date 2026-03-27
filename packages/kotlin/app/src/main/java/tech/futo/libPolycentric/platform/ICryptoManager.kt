package tech.futo.libPolycentric.platform

/**
 * CryptoManager interface for cryptographic operations
 */
interface ICryptoManager {
    /**
     * Generate a new key pair for the specified key type
     *
     * @param keyType The type of key to generate (e.g., ED25519)
     * @return A key pair containing both private and public keys
     * @throws Exception If the key type is not supported or key generation fails
     */
    fun generateKeyPair(keyType: Long): RawKeyPair

    /**
     * Derive the public key from a private key
     *
     * @param privateKey The private key bytes
     * @param keyType The type of key (e.g., ED25519)
     * @return The public key bytes
     * @throws Exception If the key type is not supported or private key is invalid
     */
    fun derivePublicKey(privateKey: ByteArray, keyType: Long): ByteArray

    /**
     * Sign a message with a private key
     *
     * @param privateKey The private key bytes
     * @param message The message to sign
     * @param keyType The type of key (e.g., ED25519)
     * @return The signature bytes
     * @throws Exception If the key type is not supported or signing fails
     */
    fun sign(privateKey: ByteArray, message: ByteArray, keyType: Long): ByteArray

    /**
     * Verify a signature against a message and public key
     *
     * @param publicKey The public key bytes
     * @param message The original message
     * @param signature The signature to verify
     * @param keyType The type of key (e.g., ED25519)
     * @return true if signature is valid, false otherwise
     * @throws Exception If the key type is not supported
     */
    fun verify(publicKey: ByteArray, message: ByteArray, signature: ByteArray, keyType: Long): Boolean

    /**
     * Generate a random process ID
     *
     * Process ID's are generated as the first 16 bytes of an Ed25519 private key.
     * This is NOT the same private key used for a process.
     * The Ed25519 key is only used here to ensure randomness.
     *
     * @return 16 random bytes
     */
    fun generateProcessId(): ByteArray

    /**
     * Get the list of supported key types
     *
     * @return List of supported key type constants
     */
    fun getSupportedKeyTypes(): List<Long>
}

data class RawKeyPair(
    val privateKey: ByteArray,
    val publicKey: ByteArray,
)
