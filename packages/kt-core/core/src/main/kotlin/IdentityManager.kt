package org.futo.polycentric.core

import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.futo.polycentric.ffi.ListEventsArgs
import org.futo.polycentric.ffi.Query
import org.futo.polycentric.ffi.QueryOpts
import polycentric.v2.Content
import polycentric.v2.ContentDigest
import polycentric.v2.ContentDigestType
import polycentric.v2.Event
import polycentric.v2.EventKey
import polycentric.v2.Identity
import polycentric.v2.PublicKey
import polycentric.v2.RevocationBound
import polycentric.v2.ServerList
import polycentric.v2.SignedEvent
import polycentric.v2.VectorClock
import java.security.MessageDigest

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
    /** Sequence number bounds that keep pre-revocation events from revoked signers valid. */
    val revocationBounds: List<RevocationBound> = emptyList(),
    /**
     * A key meant for external backups that is authorized to create a new rotation key on
     * an identity.
     */
    val recoveryKey: PublicKey? = null,
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
     * Resolves the active identity's validated head document from the core
     * (js-core `resolveIdentity()`). Returns an empty state when there is no
     * active identity or no valid chain for it is known locally.
     */
    suspend fun getCurrent(): IdentityState =
        client.activeIdentityKey?.let { resolveIdentity(it) }
            ?: IdentityState(null, emptyList(), emptyList(), null)

    /**
     * Publishes a new Identity document with the given contents. Every
     * field is written as given, so a caller updating an existing document
     * must pass through the fields it is not changing.
     *
     * The identity key is the hex-encoded sha256 of the initial Identity
     * content. For a new identity, pass null and it is computed — the
     * bootstrap event is built by hand (sequence = 1, identitySequence = 1,
     * vectorClock = [1], empty previous signature) because the core cannot
     * resolve an identity document that doesn't exist yet.
     *
     * Updates to an existing identity must be signed by one of its rotation
     * keys. [isLogin] skips that check for specific scenarios: a signing key
     * republishing the head document, or an identity recovery.
     */
    suspend fun publish(
        identityKey: String?,
        rotationKeys: List<PublicKey>,
        signingKeys: List<PublicKey>,
        servers: List<String>? = null,
        revocationBounds: List<RevocationBound> = emptyList(),
        recoveryKey: PublicKey? = null,
        recoverySignature: ByteString? = null,
        isLogin: Boolean = false,
    ): PublishResult {
        val keyPair = client.currentKeyPair ?: throw NoActiveKeyPairException()
        val publicKeyProto = keyPair.toPublicKeyProto()

        val identity =
            Identity(
                rotation_keys = rotationKeys,
                signing_keys = signingKeys,
                revocation_bounds = revocationBounds,
                servers = servers?.let { ServerList(urls = it) },
                recovery_key = recoveryKey,
                recovery_signature = recoverySignature,
            )
        val content = Content(identity = identity)

        val isBootstrap = identityKey == null
        val resolvedIdentityKey: String
        if (isBootstrap) {
            if (rotationKeys.size != 1 ||
                signingKeys.isNotEmpty() ||
                revocationBounds.isNotEmpty() ||
                !keysEqual(rotationKeys[0], publicKeyProto)
            ) {
                throw PolycentricException(
                    "Initial identity must have exactly one rotation key (the current key), no signing keys and no revocation bounds",
                )
            }
            resolvedIdentityKey = sha256(Identity.ADAPTER.encode(identity)).toHex()
        } else {
            if (!isLogin) {
                val oldHead = resolveIdentity(identityKey) ?: throw IdentityNotFoundException(identityKey)
                if (oldHead.rotationKeys.none { keysEqual(it, publicKeyProto) }) {
                    throw UnauthorizedKeyException()
                }
            }
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
        // so adopt it before syncing — a newly added server receives the push.
        if (servers != null) {
            client.adoptServers(servers)
        }

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

        // Hydrate the identity's events from the server into the core's local
        // store so its chain can be validated as a whole. Identity chains are
        // small; a generous size fetches the full collection.
        coreCall {
            client.core.awaitQuery(
                Query.ListEvents(
                    ListEventsArgs(
                        size = IDENTITY_CHAIN_FETCH_SIZE,
                        identity = identityKey,
                        collection = Collections.IDENTITY,
                        signedBy = null,
                        sequenceGt = null,
                        sequenceLt = null,
                        heads = null,
                    ),
                ),
                queryKey = listOf("list_events_for_server", targetServer, identityKey),
                opts =
                    QueryOpts(
                        fetchMode = null,
                        updateMode = null,
                        servers = listOf(targetServer),
                        emitMode = null,
                        serverTimeoutMs = null,
                    ),
            )
        }

        return resolveIdentity(identityKey)
            ?: throw IdentityNotFoundException(identityKey)
    }

    /**
     * Resolve an identity's latest validated state from the core's LOCAL
     * store via rs-common chain validation (js-core #200). Returns null when
     * no valid chain is known locally — callers hydrate the events first
     * (e.g. [fetchIdentityState] or a sync).
     */
    private fun resolveIdentity(identityKey: String): IdentityState? {
        val bytes = coreCall { client.core.resolveIdentity(identityKey) } ?: return null
        return Identity.ADAPTER.decode(bytes).toState(identityKey)
    }

    /**
     * The state of the Identity document. `recovery_signature` is left out: it only
     * belongs on the event that performs a recovery.
     */
    private fun Identity.toState(identityKey: String) =
        IdentityState(
            identityKey = identityKey,
            rotationKeys = rotation_keys,
            signingKeys = signing_keys,
            servers = servers?.urls,
            revocationBounds = revocation_bounds,
            recoveryKey = recovery_key,
        )

    /**
     * Claims an identity after pairing on all servers associated with the
     * identity, and sets it as the active identity.
     * On any failure, restores the previous active identity and server list
     * and rethrows. Returns the adopted identity state.
     */
    suspend fun claim(
        identityKey: String,
        servers: List<String>? = null,
    ): IdentityState {
        val keyPair = client.currentKeyPair ?: throw NoActiveKeyPairException()
        val publicKeyProto = keyPair.toPublicKeyProto()

        // Store these in case we need to roll back
        val previousIdentityKey = client.activeIdentityKey
        val previousServers = client.servers

        try {
            if (servers != null) {
                client.adoptServers(servers)
            }

            // Hydrate the identity's chain from all servers into the core
            client.listEvents(
                identity = identityKey,
                collection = Collections.IDENTITY,
                limit = IDENTITY_CHAIN_FETCH_SIZE,
            )
            val state = resolveIdentity(identityKey)
            if (state == null || !isAuthorized(state, publicKeyProto)) {
                throw UnauthorizedKeyException()
            }

            client.setActiveIdentityKey(identityKey)
            client.sync(SyncStrategy.PARTIAL_PULL)

            // Re-validate after pulling the full history
            val pulled = resolveIdentity(identityKey)
            if (pulled == null || !isAuthorized(pulled, publicKeyProto)) {
                throw UnauthorizedKeyException()
            }

            publish(
                identityKey = identityKey,
                rotationKeys = pulled.rotationKeys,
                signingKeys = pulled.signingKeys,
                servers = pulled.servers,
                revocationBounds = pulled.revocationBounds,
                recoveryKey = pulled.recoveryKey,
                isLogin = true,
            )

            return pulled
        } catch (e: Throwable) {
            // Roll back
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

    /** Adds a signing key to the current identity and publishes the update. */
    suspend fun addSigningKey(publicKey: PublicKey): SignedEvent =
        mutationMutex.withLock {
            val state = getCurrent()
            val identityKey = state.identityKey ?: throw NoActiveIdentityException()
            publish(
                identityKey = identityKey,
                rotationKeys = state.rotationKeys,
                signingKeys = state.signingKeys + publicKey,
                servers = state.servers,
                revocationBounds = state.revocationBounds,
                recoveryKey = state.recoveryKey,
            ).signedEvent
        }

    /** Adds a rotation key to the current identity and publishes the update. */
    suspend fun addRotationKey(publicKey: PublicKey): SignedEvent =
        mutationMutex.withLock {
            val state = getCurrent()
            val identityKey = state.identityKey ?: throw NoActiveIdentityException()
            if (state.rotationKeys.any { keysEqual(it, publicKey) }) {
                throw PolycentricException("Rotation key already exists")
            }
            publish(
                identityKey = identityKey,
                rotationKeys = state.rotationKeys + publicKey,
                signingKeys = state.signingKeys,
                servers = state.servers,
                revocationBounds = state.revocationBounds,
                recoveryKey = state.recoveryKey,
            ).signedEvent
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

            publish(
                identityKey = identityKey,
                rotationKeys = state.rotationKeys,
                signingKeys = state.signingKeys,
                servers = servers + url,
                revocationBounds = state.revocationBounds,
                recoveryKey = state.recoveryKey,
            ).signedEvent
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

            publish(
                identityKey = identityKey,
                rotationKeys = state.rotationKeys,
                signingKeys = state.signingKeys,
                servers = servers,
                revocationBounds = state.revocationBounds,
                recoveryKey = state.recoveryKey,
            ).signedEvent
        }

    private fun sha256(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
}
