package org.futo.polycentric.core

import polycentric.v2.ContentDigest
import polycentric.v2.EventKey
import polycentric.v2.PublicKey
import polycentric.v2.SignedEvent

/*
 * 1:1 ports of js-core platform-interfaces. Implementations are
 * pluggable so the library core stays storage-agnostic (SQLite on
 * Android, in-memory in tests) — the same pattern js-core uses for
 * IndexedDB vs sqlite vs postgres drivers.
 */

/** Persistent store of signed events, keyed by their v2 `EventKey`. */
interface IEventRepository {
    /** Upserts an event; saving the same key twice must be idempotent. */
    suspend fun save(signedEvent: SignedEvent)

    /** Batch save; drivers with transactions should override this. */
    suspend fun saveAll(signedEvents: List<SignedEvent>) {
        for (signedEvent in signedEvents) save(signedEvent)
    }

    /** Every stored event; used to hydrate the Rust core at startup. */
    suspend fun getAll(): List<SignedEvent>

    /** The event stored under [key], or null (also when `signed_by` is absent). */
    suspend fun getByEventKey(key: EventKey): SignedEvent?

    /**
     * Events for an identity; order is unspecified. Optional
     * [signer] and [collection] narrow the scan. With [headsOnly] return
     * only the highest-sequence event per (signer, collection) stream.
     */
    suspend fun getByIdentity(
        identity: String,
        signer: PublicKey? = null,
        collection: Int? = null,
        headsOnly: Boolean = false,
    ): List<SignedEvent>
}

/**
 * Persistent store of event content, keyed by its `ContentDigest`. Bodies
 * are serialized `Content` bytes; callers decode them.
 */
interface IContentRepository {
    /** Upserts the content bytes for [digest]. Does not verify the digest. */
    suspend fun save(
        digest: ContentDigest,
        contentBytes: ByteArray,
    )

    /** The content bytes for [digest], or null when not stored. */
    suspend fun get(digest: ContentDigest): ByteArray?

    /** Every stored (digest, bytes) pair; used to hydrate the Rust core at startup. */
    suspend fun getAll(): List<Pair<ContentDigest, ByteArray>>
}

/** Persistent store of this device's key pairs, keyed by raw public-key bytes. */
interface IKeysRepository {
    /** Persist a keypair (private key bytes are the caller's concern to encrypt). */
    suspend fun save(
        publicKey: ByteArray,
        keyType: Int,
        privateKey: ByteArray,
    )

    /** Every stored key pair, including private keys. */
    suspend fun getAll(): List<StoredKeyPair>

    /** The key pair whose raw public key is [publicKey], or null. */
    suspend fun getByPublicKey(publicKey: ByteArray): StoredKeyPair?

    /** Removes the key pair; a no-op when it is not stored. */
    suspend fun delete(publicKey: ByteArray)
}

/** A device key pair as raw bytes, including the private key. */
class StoredKeyPair(
    /** A [KeyTypes] value; only [KeyTypes.ED25519] is supported. */
    val keyType: Int,
    /** Raw public key (32 bytes for Ed25519). */
    val publicKey: ByteArray,
    /** Raw private key (32 bytes for Ed25519). */
    val privateKey: ByteArray,
)

/** Tracks which servers have acked which events, enabling partial push. */
interface IEventAckRepository {
    /** Records that [server] has accepted the event at [key]. */
    suspend fun recordAck(
        server: String,
        key: EventKey,
    )

    /** Whether [server] is known to have accepted the event at [key]. */
    suspend fun isAcked(
        server: String,
        key: EventKey,
    ): Boolean
}

/** Content-addressed blob storage (avatar/post images), keyed by digest. */
interface IFileStoreDriver {
    /** Stores [bytes] under [digest], replacing any existing blob. Does not verify the digest. */
    suspend fun put(
        digest: ContentDigest,
        bytes: ByteArray,
    )

    /** The blob for [digest], or null when not stored. */
    suspend fun get(digest: ContentDigest): ByteArray?

    /** Removes the blob; a no-op when it is not stored. */
    suspend fun delete(digest: ContentDigest)

    /** Whether a blob is stored for [digest]. Override to avoid reading the bytes. */
    suspend fun has(digest: ContentDigest): Boolean = get(digest) != null
}

/** Factory for the persistent repositories, plus identity/session bookkeeping. */
interface IStorageDriver {
    /** Creates the event store. */
    fun createEventRepository(): IEventRepository

    /** Creates the content store. */
    fun createContentRepository(): IContentRepository

    /** Creates the key pair store. */
    fun createKeysRepository(): IKeysRepository

    /** Creates the ack store; may be a no-op implementation. */
    fun createEventAckRepository(): IEventAckRepository

    /**
     * The identity a device keypair holds — the durable binding used to list
     * and switch identities. Passing `null` removes the binding (identity
     * deleted from the device); logout does NOT go through here.
     */
    suspend fun saveActiveIdentityKey(
        publicKey: ByteArray,
        identityKey: String?,
    )

    /** The identity bound to the device key [publicKey], or null when none is. */
    suspend fun loadActiveIdentityKey(publicKey: ByteArray): String?

    /**
     * The currently signed-in identity, or `null` when logged out. Persisted
     * separately from the binding so logout survives a restart without
     * forgetting the identity.
     */
    suspend fun saveActiveSession(identityKey: String?)

    /** The signed-in identity saved by [saveActiveSession], or null when logged out. */
    suspend fun loadActiveSession(): String?
}

/**
 * Parameter order matches js-core's ICryptoManager exactly — in
 * particular `verify(publicKey, message, signature, keyType)` — so code
 * ported between the two wrappers can't silently swap two ByteArrays.
 */
interface ICryptoManager {
    /**
     * Generates a fresh random key pair.
     *
     * @throws IllegalArgumentException if [keyType] is unsupported.
     */
    fun generateKeyPair(keyType: Int): StoredKeyPair

    /**
     * Derives the public key for [privateKey].
     *
     * @throws InvalidKeyLengthException if [privateKey] has the wrong length.
     */
    fun derivePublicKey(
        privateKey: ByteArray,
        keyType: Int,
    ): ByteArray

    /**
     * Signs [message]. Suspends so implementations can sign off-thread or
     * on external hardware.
     *
     * @throws InvalidKeyLengthException if [privateKey] has the wrong length.
     */
    suspend fun sign(
        privateKey: ByteArray,
        message: ByteArray,
        keyType: Int,
    ): ByteArray

    /**
     * Returns whether [signature] is valid for [message] under [publicKey].
     *
     * @throws InvalidSignatureException if [signature] has the wrong length.
     * @throws InvalidKeyLengthException if [publicKey] has the wrong length.
     */
    fun verify(
        publicKey: ByteArray,
        message: ByteArray,
        signature: ByteArray,
        keyType: Int,
    ): Boolean

    /** The [KeyTypes] values this implementation handles. */
    fun getSupportedKeyTypes(): List<Int>
}
