package org.futo.polycentric.core

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.futo.polycentric.ffi.ContentEntry
import polycentric.v2.Content
import polycentric.v2.ContentDigest
import polycentric.v2.ContentDigestType
import polycentric.v2.Event
import polycentric.v2.EventKey
import polycentric.v2.Identity
import polycentric.v2.IdentityBackup
import polycentric.v2.KeyType
import polycentric.v2.PrivateKey
import polycentric.v2.PublicKey
import polycentric.v2.RevocationBound
import polycentric.v2.ServerList
import polycentric.v2.SignedEvent
import polycentric.v2.VectorClock
import java.security.MessageDigest
import java.util.logging.Logger

/**
 * Resolved identity state from the latest Identity document.
 * Port of js-core `IdentityState`.
 */
class IdentityState(
    /** The identity key (hex-encoded sha256 of the initial Identity content). */
    val identityKey: String?,
    /** Rotation keys that control the identity. */
    val rotationKeys: List<PublicKey>,
    /** Signing keys authorized to sign events. */
    val signingKeys: List<PublicKey>,
    /**
     * Servers this identity pushes to and pulls from. `null` when the
     * identity has never configured its list (clients fall back to their
     * defaults); an empty list is an intentionally empty list.
     */
    val servers: List<String>?,
    /**
     * Bounds (sequence numbers) that designate events signed before a key
     * was revoked as valid.
     */
    val revocationBounds: List<RevocationBound> = emptyList(),
    /**
     * A specific key, meant for backing up to a file, that can sign a new
     * rotation key on a new device.
     */
    val recoveryKey: PublicKey? = null,
)

private val EMPTY_STATE = IdentityState(null, emptyList(), emptyList(), null)

private fun Identity.toState(identityKey: String) =
    IdentityState(
        identityKey = identityKey,
        rotationKeys = rotation_keys,
        signingKeys = signing_keys,
        servers = servers?.urls,
        revocationBounds = revocation_bounds,
        recoveryKey = recovery_key,
    )

class PublishResult(
    val identityKey: String,
    val signedEvent: SignedEvent,
)

/**
 * IdentityManager owns all identity lifecycle operations — publishing,
 * claiming, key rotation — and the authorization checks that go with them.
 *
 * Port of js-core `client-internal/identity-manager.ts`. Chain-validity
 * rules live in rs-core; like js-core, methods here do only the local
 * bookkeeping and the "basic precaution" checks noted per method.
 */
class IdentityManager(
    private val client: PolycentricClient,
) {
    companion object {
        private const val IDENTITY_CHAIN_FETCH_SIZE = 1000
        private val log = Logger.getLogger("IdentityManager")

        fun keysEqual(
            a: PublicKey,
            b: PublicKey,
        ): Boolean = a.key_type == b.key_type && a.key == b.key
    }

    /**
     * Serializes identity-document mutations (add/remove key or server). Each
     * is a getCurrent() → publish() read-modify-write against the same
     * document; running two concurrently (e.g. approving two paired devices at
     * once) makes the second overwrite the first's change based on a stale
     * read, dropping a key. Holding this across the whole read-modify-write
     * makes them run one at a time. Only guards same-process concurrency;
     * cross-device conflicts are resolved by sequence numbers on the server.
     */
    private val mutationMutex = Mutex()

    /**
     * Resolves the active identity's latest validated state (see
     * [resolveIdentity]), or an empty state when there is none.
     */
    suspend fun getCurrent(): IdentityState {
        val activeKey = client.activeIdentityKey ?: return EMPTY_STATE
        return resolveIdentity(activeKey) ?: EMPTY_STATE
    }

    /**
     * Publishes a new Identity document with the given rotation and
     * signing keys.
     *
     * The identity key is the hex-encoded sha256 of the initial Identity
     * content. For a new identity, pass null and it is computed — the
     * bootstrap event is built by hand (sequence = 1, identitySequence = 1,
     * vectorClock = [1], empty previous signature) because the core cannot
     * resolve an identity document that doesn't exist yet.
     *
     * Every argument not passed is published empty. Use with [getCurrent] to
     * maintain existing fields with [publish].
     */
    suspend fun publish(
        identityKey: String?,
        rotationKeys: List<PublicKey>,
        signingKeys: List<PublicKey>,
        servers: List<String>? = null,
        revocationBounds: List<RevocationBound> = emptyList(),
        recoveryKey: PublicKey? = null,
        recoverySignature: ByteString? = null,
    ): PublishResult =
        publishDocument(
            identityKey,
            Identity(
                rotation_keys = rotationKeys,
                signing_keys = signingKeys,
                revocation_bounds = revocationBounds,
                servers = servers?.let { ServerList(urls = it) },
                recovery_key = recoveryKey,
                recovery_signature = recoverySignature,
            ),
        )

    /** Publishes [identity] as the next identity document (see [publish]). */
    private suspend fun publishDocument(
        identityKey: String?,
        identity: Identity,
    ): PublishResult {
        val keyPair = client.currentKeyPair ?: throw NoActiveKeyPairException()
        val publicKeyProto = keyPair.toPublicKeyProto()
        val content = Content(identity = identity)

        val isBootstrap = identityKey == null
        val resolvedIdentityKey: String
        if (isBootstrap) {
            if (identity.rotation_keys.size != 1 ||
                identity.signing_keys.isNotEmpty() ||
                identity.revocation_bounds.isNotEmpty() ||
                !keysEqual(identity.rotation_keys[0], publicKeyProto)
            ) {
                throw PolycentricException(
                    "Initial identity must have exactly one rotation key (the current key), " +
                        "no signing keys and no revocation bounds",
                )
            }
            resolvedIdentityKey = sha256(Identity.ADAPTER.encode(identity)).toHex()
        } else {
            resolvedIdentityKey = identityKey
        }

        val contentBytes = Content.ADAPTER.encode(content)
        val digest =
            ContentDigest(
                type = ContentDigestType.CONTENT_DIGEST_TYPE_SHA256,
                value_ = sha256(contentBytes).toByteString(),
            )
        client.contents.save(digest, contentBytes)
        client.setActiveIdentityKey(resolvedIdentityKey)

        val event =
            if (isBootstrap) {
                Event(
                    key =
                        EventKey(
                            collection = Collections.IDENTITY,
                            identity = resolvedIdentityKey,
                            signed_by = publicKeyProto,
                            sequence = 1L,
                        ),
                    identity_sequence = 1L,
                    vector_clock = VectorClock(sequence = listOf(1L)),
                    previous_signature = ByteString.EMPTY,
                    content_digest = digest,
                    created_at = System.currentTimeMillis(),
                    application = client.application,
                )
            } else {
                client.buildEvent(content, Collections.IDENTITY)
            }

        val signedEvent = client.signEvent(event)
        client.commitEvent(signedEvent, content)

        // The identity document is the source of truth for the server list,
        // so adopt it before syncing.
        identity.servers?.let { client.adoptServers(it.urls) }

        client.sync(SyncStrategy.PARTIAL_PUSH)

        return PublishResult(resolvedIdentityKey, signedEvent)
    }

    /**
     * Fetches and validates the identity state of any identity from one
     * server (intended for polling while pairing). Hydrates the identity's
     * full event chain from the server into the core, then resolves it via
     * the core's rs-common chain logic — which validates content-digest
     * match, vector-clock/collection integrity, and signer authorization
     * across the whole chain, rather than trusting a single event
     * (js-core #200: "always use rs-common for identity chain logic").
     */
    suspend fun fetchIdentityState(
        identityKey: String,
        server: String? = null,
    ): IdentityState {
        val targetServer =
            server ?: client.servers.firstOrNull()
                ?: throw PolycentricException("No servers configured")
        return fetchIdentityState(identityKey, listOf(targetServer))
    }

    /** [fetchIdentityState] hydrating from every server in [servers]. */
    private suspend fun fetchIdentityState(
        identityKey: String,
        servers: List<String>,
    ): IdentityState {
        if (servers.isEmpty()) throw PolycentricException("No servers configured")

        // Hydrate the identity's events from the servers into the core's local
        // store so its chain can be validated as a whole. Identity chains are
        // small; a generous size fetches the full collection.
        client.listEvents(
            identity = identityKey,
            collection = Collections.IDENTITY,
            limit = IDENTITY_CHAIN_FETCH_SIZE,
            queryKey = listOf("list_events_for_servers", identityKey) + servers,
            servers = servers,
        )

        return resolveIdentity(identityKey)
            ?: throw IdentityNotFoundException(identityKey)
    }

    /**
     * Resolve an identity's latest validated state from the core's LOCAL
     * store via rs-common chain validation (js-core #200). Returns null when
     * no valid chain is known locally — callers hydrate the events first
     * (e.g. [fetchIdentityState] or a sync).
     */
    private fun resolveIdentity(identityKey: String): IdentityState? = resolveDocument(identityKey)?.toState(identityKey)

    /** The head identity document behind [resolveIdentity]. */
    private fun resolveDocument(identityKey: String): Identity? =
        coreCall { client.core.resolveIdentity(identityKey) }?.let { Identity.ADAPTER.decode(it) }

    /**
     * Claims an identity: verifies the current key is authorized on it,
     * sets it active, pulls the full identity event history, then
     * re-publishes the same document signed by our own key — proving this
     * key acknowledged its membership (the only mutation a signing key is
     * allowed to make).
     *
     * Passing [servers] will first replace the current identity's server
     * list. On any failure the previous active identity and server list
     * are restored.
     */
    suspend fun claim(
        identityKey: String,
        servers: List<String>? = null,
    ): IdentityState {
        val keyPair = client.currentKeyPair ?: throw NoActiveKeyPairException()
        val publicKeyProto = keyPair.toPublicKeyProto()

        val previousIdentityKey = client.activeIdentityKey
        val previousServers = client.servers

        try {
            if (servers != null) client.adoptServers(servers)

            // Validate authorization via rs-common chain logic before adopting.
            val state = fetchIdentityState(identityKey, client.servers)
            if (!isAuthorized(state, publicKeyProto)) {
                throw UnauthorizedKeyException()
            }

            client.setActiveIdentityKey(identityKey)
            client.sync(SyncStrategy.PARTIAL_PULL)

            // Re-validate after pulling the full history
            val head = resolveDocument(identityKey)
            val pulled = head?.toState(identityKey)
            if (pulled == null || !isAuthorized(pulled, publicKeyProto)) {
                throw UnauthorizedKeyException()
            }

            // A signing key may only republish the head unchanged, and the
            // head's recovery signature belongs to the event that recovered it.
            publishDocument(identityKey, head.copy(recovery_signature = null))

            return pulled
        } catch (e: Throwable) {
            // Roll back even when cancelled, so the client isn't left signed
            // in to an identity it could not claim.
            withContext(NonCancellable) {
                if (client.activeIdentityKey != previousIdentityKey) {
                    client.setActiveIdentityKey(previousIdentityKey)
                }
                client.adoptServers(previousServers)
            }
            throw e
        }
    }

    /** Whether [state] authorizes [myKey] (present as a rotation or signing key). */
    private fun isAuthorized(
        state: IdentityState,
        myKey: PublicKey,
    ): Boolean =
        state.rotationKeys.any { keysEqual(it, myKey) } ||
            state.signingKeys.any { keysEqual(it, myKey) }

    suspend fun isRotationKeyForIdentity(
        identityKey: String,
        publicKey: PublicKey,
    ): Boolean {
        val state = getCurrent()
        if (state.identityKey != identityKey) return false
        return state.rotationKeys.any { keysEqual(it, publicKey) }
    }

    /**
     * Generates a new recovery key pair for the active identity and publishes
     * its public key. Returns the private key, which the caller must save
     * (e.g. in an [IdentityBackup]); the previous one stops working.
     */
    suspend fun rotateRecoveryKey(): PrivateKey =
        mutationMutex.withLock {
            val state = getCurrent()
            val identityKey = state.identityKey ?: throw NoActiveIdentityException()

            val generated = client.crypto.generateKeyPair(KeyTypes.ED25519)
            publishIdentityUpdate(
                identityKey,
                state.rotationKeys,
                state.signingKeys,
                recoveryKey = PublicKey(key_type = KeyType.KEY_TYPE_ED25519, key = generated.publicKey.toByteString()),
            )
            PrivateKey(key_type = KeyType.KEY_TYPE_ED25519, key = generated.privateKey.toByteString())
        }

    /**
     * Whether [privateKey] matches the recovery key on [identityKey]'s head
     * (default: the active identity).
     */
    fun checkRecoveryKey(
        privateKey: PrivateKey,
        identityKey: String? = client.activeIdentityKey,
    ): Boolean {
        if (privateKey.key_type != KeyType.KEY_TYPE_ED25519) return false
        val recoveryKey = identityKey?.let { resolveIdentity(it) }?.recoveryKey ?: return false
        if (recoveryKey.key_type != KeyType.KEY_TYPE_ED25519) return false

        val derived =
            runCatching { client.crypto.derivePublicKey(privateKey.key.toByteArray(), KeyTypes.ED25519) }
                .getOrElse { return false }
        return derived.contentEquals(recoveryKey.key.toByteArray())
    }

    /** Copies a backup's identity chain into the core's local storage. */
    fun copyBackupEvents(backup: IdentityBackup) {
        val events = mutableListOf<ByteArray>()
        val contents = mutableListOf<ContentEntry>()

        for (bundle in backup.identity_chain) {
            val signedEvent = bundle.signed_event ?: continue
            events.add(SignedEvent.ADAPTER.encode(signedEvent))

            val contentBytes = bundle.serialized_content?.content_bytes ?: continue
            val digest = runCatching { Event.ADAPTER.decode(signedEvent.event_bytes).content_digest }.getOrNull() ?: continue
            contents.add(ContentEntry(ContentDigest.ADAPTER.encode(digest), contentBytes.toByteArray()))
        }

        try {
            coreCall { client.core.copyContents(contents) }
            coreCall { client.core.copyEvents(events) }
        } catch (e: PolycentricException) {
            log.warning("Backup data failed to copy: $e")
        }
    }

    /**
     * Uses [backup]'s recovery key to add the current key as a rotation key
     * of the backed-up identity, and signs in to it. The recovery signature
     * vouches for the current key, which the identity doesn't authorize yet.
     * On failure the previous active identity and server list are restored.
     */
    suspend fun recoverIdentity(backup: IdentityBackup) {
        val keyPair = client.currentKeyPair ?: throw NoActiveKeyPairException()
        val publicKeyProto = keyPair.toPublicKeyProto()
        val identityKey = backup.identity_key
        val recoveryKey = backup.recovery_key ?: throw PolycentricException("Backup has no recovery key")

        val previousIdentityKey = client.activeIdentityKey
        val previousServers = client.servers

        try {
            mutationMutex.withLock {
                // Read the head off the backup's chain, then include what the
                // servers know about it.
                copyBackupEvents(backup)
                val backupState =
                    resolveIdentity(identityKey)
                        ?: throw PolycentricException("Backup has no valid identity chain")
                backupState.servers?.takeIf { it.isNotEmpty() }?.let { client.adoptServers(it) }

                client.listEvents(identity = identityKey, collection = Collections.IDENTITY)

                val state =
                    resolveIdentity(identityKey)
                        ?: throw PolycentricException("No valid identity chain to recover")
                state.servers?.takeIf { it.isNotEmpty() }?.let { client.adoptServers(it) }

                if (!checkRecoveryKey(recoveryKey, identityKey)) {
                    throw PolycentricException("Unable to recover this identity with this backup")
                }

                val payload =
                    coreCall {
                        client.core.assembleRecoveryPayload(identityKey, PublicKey.ADAPTER.encode(publicKeyProto))
                    }
                val recoverySignature =
                    client.crypto.sign(recoveryKey.key.toByteArray(), payload, recoveryKey.key_type.value)

                val rotationKeys =
                    if (state.rotationKeys.any { keysEqual(it, publicKeyProto) }) {
                        state.rotationKeys
                    } else {
                        state.rotationKeys + publicKeyProto
                    }
                publishIdentityUpdate(
                    identityKey,
                    rotationKeys,
                    state.signingKeys,
                    recoverySignature = recoverySignature.toByteString(),
                )
            }
        } catch (e: Throwable) {
            withContext(NonCancellable) {
                if (client.activeIdentityKey != previousIdentityKey) {
                    client.setActiveIdentityKey(previousIdentityKey)
                }
                client.adoptServers(previousServers)
            }
            throw e
        }

        try {
            client.sync(SyncStrategy.PARTIAL_PULL)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            log.warning("Pull failed after identity recovery: $e")
        }
    }

    /** Adds a signing key to the current identity and publishes the update. */
    suspend fun addSigningKey(publicKey: PublicKey): SignedEvent =
        mutationMutex.withLock {
            val state = getCurrent()
            val identityKey = state.identityKey ?: throw NoActiveIdentityException()
            publishIdentityUpdate(identityKey, state.rotationKeys, state.signingKeys + publicKey)
        }

    /** Adds a rotation key to the current identity and publishes the update. */
    suspend fun addRotationKey(publicKey: PublicKey): SignedEvent =
        mutationMutex.withLock {
            val state = getCurrent()
            val identityKey = state.identityKey ?: throw NoActiveIdentityException()
            if (state.rotationKeys.any { keysEqual(it, publicKey) }) {
                throw PolycentricException("Rotation key already exists")
            }
            publishIdentityUpdate(identityKey, state.rotationKeys + publicKey, state.signingKeys)
        }

    /**
     * Adds a server to the current identity document and publishes the
     * update. Calls the server's `GetInfo` first — an unreachable server
     * is not added.
     */
    suspend fun addServer(url: String): SignedEvent =
        mutationMutex.withLock {
            val state = getCurrent()
            val identityKey = state.identityKey ?: throw NoActiveIdentityException()

            // An identity that has never configured its list starts from the
            // client's effective (default) servers.
            val servers = state.servers ?: client.servers
            if (url in servers) {
                throw ServerAlreadyAddedException()
            }

            coreCall { client.core.getServerInfo(url) }

            publishIdentityUpdate(identityKey, state.rotationKeys, state.signingKeys, servers + url)
        }

    /** Removes a server from the current identity document and publishes the update. */
    suspend fun removeServer(url: String): SignedEvent =
        mutationMutex.withLock {
            val state = getCurrent()
            val identityKey = state.identityKey ?: throw NoActiveIdentityException()

            val current = state.servers ?: client.servers
            val servers = current.filter { it != url }
            if (servers.size == current.size) {
                throw PolycentricException("Server not found")
            }

            publishIdentityUpdate(identityKey, state.rotationKeys, state.signingKeys, servers)
        }

    /**
     * Removes a rotation key, writing revocation bounds for it so its earlier
     * events stay valid. See [rotateKeys].
     */
    suspend fun removeRotationKey(
        publicKey: PublicKey,
        allowSelfRemoval: Boolean = false,
    ): SignedEvent =
        updateKeys(allowSelfRemoval) { state ->
            if (state.rotationKeys.none { keysEqual(it, publicKey) }) {
                throw PolycentricException("Rotation key not found")
            }
            state.rotationKeys.filter { !keysEqual(it, publicKey) } to state.signingKeys
        }

    /**
     * Removes a signing key, writing revocation bounds for it so its earlier
     * events stay valid. See [rotateKeys].
     */
    suspend fun removeSigningKey(
        publicKey: PublicKey,
        allowSelfRemoval: Boolean = false,
    ): SignedEvent =
        updateKeys(allowSelfRemoval) { state ->
            if (state.signingKeys.none { keysEqual(it, publicKey) }) {
                throw PolycentricException("Signing key not found")
            }
            state.rotationKeys to state.signingKeys.filter { !keysEqual(it, publicKey) }
        }

    /**
     * Replaces both key sets with a new identity event. Every dropped key gets
     * a revocation bound covering the events it signed, so they stay valid
     * while any new ones will not.
     * - Pulls the identity's complete history from every server first, such
     *   that we can ensure all bounds completely cover all previous events.
     * - The current key must be a rotation key, and the new key sets
     *   must keep a rotation key.
     * - Dropping the current key as a rotation key locks this device out of
     *   further changes, so it needs [allowSelfRemoval].
     */
    suspend fun rotateKeys(
        rotationKeys: List<PublicKey>,
        signingKeys: List<PublicKey>,
        allowSelfRemoval: Boolean = false,
    ): SignedEvent = updateKeys(allowSelfRemoval) { rotationKeys to signingKeys }

    private suspend fun updateKeys(
        allowSelfRemoval: Boolean,
        newKeys: (IdentityState) -> Pair<List<PublicKey>, List<PublicKey>>,
    ): SignedEvent =
        mutationMutex.withLock {
            val keyPair = client.currentKeyPair ?: throw NoActiveKeyPairException()
            val myKey = keyPair.toPublicKeyProto()
            val identityKey = client.activeIdentityKey ?: throw NoActiveIdentityException()

            client.pullComplete()

            val state = resolveIdentity(identityKey) ?: throw IdentityNotFoundException(identityKey)
            if (state.rotationKeys.none { keysEqual(it, myKey) }) {
                throw PolycentricException("Only a rotation key can change an identity's keys")
            }
            val (rotationKeys, signingKeys) = newKeys(state)
            if (rotationKeys.isEmpty()) {
                throw PolycentricException("An identity needs at least one rotation key")
            }
            if (!allowSelfRemoval && rotationKeys.none { keysEqual(it, myKey) }) {
                throw PolycentricException("Removing the current key as a rotation key requires allowSelfRemoval")
            }

            publishIdentityUpdate(identityKey, rotationKeys, signingKeys)
        }

    /** Publishes the next identity update, using local identity state. */
    private suspend fun publishIdentityUpdate(
        identityKey: String,
        rotationKeys: List<PublicKey>,
        signingKeys: List<PublicKey>,
        servers: List<String>? = null,
        recoveryKey: PublicKey? = null,
        recoverySignature: ByteString? = null,
    ): SignedEvent {
        val document =
            coreCall {
                client.core.buildIdentityUpdate(
                    identityKey,
                    rotationKeys.map { PublicKey.ADAPTER.encode(it) },
                    signingKeys.map { PublicKey.ADAPTER.encode(it) },
                    servers,
                    recoveryKey?.let { PublicKey.ADAPTER.encode(it) },
                )
            }
        val identity = Identity.ADAPTER.decode(document).copy(recovery_signature = recoverySignature)
        return publishDocument(identityKey, identity).signedEvent
    }

    private fun sha256(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}
