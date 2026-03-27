package tech.futo.libPolycentric.platform

import polycentric.PrivateKey
import polycentric.PublicKey

data class StoredKeyPair(
    val privateKey: PrivateKey,
    val publicKey: PublicKey,
)

/**
 * KeysRepository interface for storing and retrieving cryptographic keys in a database
 */
interface IKeysRepository {
    /**
     * Store a key pair
     *
     * @param keys A key pair containing private and public keys
     * @throws Exception If the keys are invalid or storing fails
     */
    fun storeKeys(keys: StoredKeyPair)

    /**
     * Retrieve a key pair by public key
     *
     * @param publicKey The public key to look up
     * @return The key pair, or null if not found
     */
    fun retrieveKeysByPublicKey(publicKey: PublicKey): StoredKeyPair?

    /**
     * Removes a key pair from storage
     *
     * @param publicKey The public key of the key pair to be removed
     * @throws Exception If the keys are invalid or removal fails
     */
    fun removeKeys(publicKey: PublicKey)

    /**
     * Gets all stored key pairs
     *
     * @return A list of all stored key pairs
     */
    fun getAllKeys(): List<StoredKeyPair>
}
