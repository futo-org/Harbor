package org.futo.polycentric.core.platform

import polycentric.v2.ContentDigest
import polycentric.v2.EventKey
import polycentric.v2.SignedEvent

/**
 * 1:1 ports of js-core platform-interfaces. Implementations are
 * pluggable so the library core stays storage-agnostic (SQLite on
 * Android, in-memory in tests) — the same pattern js-core uses for
 * IndexedDB vs sqlite vs postgres drivers.
 */

interface IEventRepository {
    suspend fun save(signedEvent: SignedEvent)
    suspend fun getAll(): List<SignedEvent>
    suspend fun getByEventKey(key: EventKey): SignedEvent?

    /**
     * All events for an identity; with [headsOnly] return only the
     * highest-sequence event per (signer, collection) stream — the
     * anchors for a partial pull.
     */
    suspend fun getByIdentity(identity: String, headsOnly: Boolean = false): List<SignedEvent>
}

interface IContentRepository {
    suspend fun save(digest: ContentDigest, contentBytes: ByteArray)
    suspend fun get(digest: ContentDigest): ByteArray?
    suspend fun getAll(): List<Pair<ContentDigest, ByteArray>>
}

interface IKeysRepository {
    /** Persist a keypair (private key bytes are the caller's concern to encrypt). */
    suspend fun save(publicKey: ByteArray, keyType: Int, privateKey: ByteArray)
    suspend fun getAll(): List<StoredKeyPair>
    suspend fun getByPublicKey(publicKey: ByteArray): StoredKeyPair?
    suspend fun delete(publicKey: ByteArray)
}

class StoredKeyPair(
    val keyType: Int,
    val publicKey: ByteArray,
    val privateKey: ByteArray,
)

/** Tracks which servers have acked which events, enabling partial push. */
interface IEventAckRepository {
    suspend fun recordAck(server: String, key: EventKey)
    suspend fun isAcked(server: String, key: EventKey): Boolean
}

/** Content-addressed blob storage (avatar/post images), keyed by digest. */
interface IFileStoreDriver {
    suspend fun put(digest: ContentDigest, bytes: ByteArray)
    suspend fun get(digest: ContentDigest): ByteArray?
    suspend fun has(digest: ContentDigest): Boolean = get(digest) != null
}

interface IStorageDriver {
    fun createEventRepository(): IEventRepository
    fun createContentRepository(): IContentRepository
    fun createKeysRepository(): IKeysRepository
    fun createEventAckRepository(): IEventAckRepository

    /** Which identity key a device keypair last acted as (js-core parity). */
    suspend fun saveActiveIdentityKey(publicKey: ByteArray, identityKey: String?)
    suspend fun loadActiveIdentityKey(publicKey: ByteArray): String?
}

interface ICryptoManager {
    fun generateKeyPair(keyType: Int): StoredKeyPair
    suspend fun sign(privateKey: ByteArray, message: ByteArray, keyType: Int): ByteArray
    fun verify(publicKey: ByteArray, signature: ByteArray, message: ByteArray, keyType: Int): Boolean
}
