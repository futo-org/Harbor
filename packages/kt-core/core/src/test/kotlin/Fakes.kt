package org.futo.polycentric.core

import okio.ByteString.Companion.toByteString
import org.futo.polycentric.ffi.AuthTokenProvider
import org.futo.polycentric.ffi.ContentEntry
import org.futo.polycentric.ffi.CoreException
import org.futo.polycentric.ffi.ListEventsArgs
import org.futo.polycentric.ffi.PolycentricCoreInterface
import org.futo.polycentric.ffi.Query
import org.futo.polycentric.ffi.QueryObservable
import org.futo.polycentric.ffi.QueryOpts
import org.futo.polycentric.ffi.SignBytesCallback
import polycentric.v2.Content
import polycentric.v2.ContentDigest
import polycentric.v2.EventBundle
import polycentric.v2.ListEventsResponse
import polycentric.v2.SignedEvent
import polycentric.v2.UploadBlobRequest

// Port of js-core `polycentric-client.sync.test.ts`.

/**
 * In-memory `IEventRepository` backed by a map keyed by EventKey. `saved`
 * records the events written via `save` (seeded events are inserted without
 * being recorded) so tests can distinguish newly persisted events from
 * pre-existing ones.
 */
class FakeEventRepository(
    events: List<SignedEvent> = emptyList(),
) : IEventRepository {
    val map = LinkedHashMap<String, SignedEvent>()
    val saved = mutableListOf<SignedEvent>()

    init {
        for (e in events) insert(e)
    }

    /** Insert without recording as a save, for seeding the store. */
    private fun insert(signedEvent: SignedEvent) {
        val event =
            polycentric.v2.Event.ADAPTER
                .decode(signedEvent.event_bytes)
        map[eventKeyString(requireNotNull(event.key))] = signedEvent
    }

    override suspend fun save(signedEvent: SignedEvent) {
        saved.add(signedEvent)
        insert(signedEvent)
    }

    override suspend fun getAll(): List<SignedEvent> = map.values.toList()

    override suspend fun getByEventKey(key: polycentric.v2.EventKey): SignedEvent? = map[eventKeyString(key)]

    /** Returns stored events for an identity, optionally filtered by signer/collection, optionally heads-only (max sequence per collection+signer stream). */
    override suspend fun getByIdentity(
        identity: String,
        signer: polycentric.v2.PublicKey?,
        collection: Int?,
        headsOnly: Boolean,
    ): List<SignedEvent> {
        val events =
            map.values
                .map {
                    it to
                        polycentric.v2.Event.ADAPTER
                            .decode(it.event_bytes)
                }.filter { (_, event) -> event.key?.identity == identity }

        var filtered = events
        if (signer != null) {
            val wanted = signer.key.hex()
            filtered =
                filtered.filter { (_, event) ->
                    event.key
                        ?.signed_by
                        ?.key
                        ?.hex() == wanted
                }
        }
        if (collection != null) {
            filtered = filtered.filter { (_, event) -> event.key?.collection == collection }
        }

        if (headsOnly) {
            // One head (max sequence) per (collection, signer) stream.
            val heads = LinkedHashMap<String, Pair<SignedEvent, Long>>()
            for ((se, event) in filtered) {
                val key = requireNotNull(event.key)
                val stream = "${key.collection}|${requireNotNull(key.signed_by).key.hex()}"
                val seq = key.sequence
                val current = heads[stream]
                if (current == null || seq > current.second) heads[stream] = se to seq
            }
            return heads.values.map { it.first }
        }

        return filtered.map { it.first }
    }
}

/** In-memory `IContentRepository` keyed by digest; `saved` records writes. */
class FakeContentRepository(
    contents: List<Pair<ContentDigest, Content>> = emptyList(),
) : IContentRepository {
    val map = LinkedHashMap<String, Pair<ContentDigest, ByteArray>>()
    val saved = mutableListOf<Pair<ContentDigest, ByteArray>>()

    init {
        for ((digest, content) in contents) map[digestKey(digest)] = digest to Content.ADAPTER.encode(content)
    }

    override suspend fun save(
        digest: ContentDigest,
        contentBytes: ByteArray,
    ) {
        saved.add(digest to contentBytes)
        map[digestKey(digest)] = digest to contentBytes
    }

    override suspend fun get(digest: ContentDigest): ByteArray? = map[digestKey(digest)]?.second

    override suspend fun getAll(): List<Pair<ContentDigest, ByteArray>> = map.values.toList()
}

/** In-memory `IFileStoreDriver`; `put` is recorded so tests assert which blobs landed. */
open class FakeFileStore(
    entries: List<Pair<ContentDigest, ByteArray>> = emptyList(),
) : IFileStoreDriver {
    val map = LinkedHashMap<String, ByteArray>()
    val puts = mutableListOf<Pair<ContentDigest, ByteArray>>()

    init {
        for ((digest, bytes) in entries) map[digestKey(digest)] = bytes
    }

    override suspend fun put(
        digest: ContentDigest,
        bytes: ByteArray,
    ) {
        puts.add(digest to bytes)
        map[digestKey(digest)] = bytes
    }

    override suspend fun get(digest: ContentDigest): ByteArray? = map[digestKey(digest)]

    override suspend fun delete(digest: ContentDigest) {
        map.remove(digestKey(digest))
    }
}

/** In-memory `IKeysRepository` for the storage driver fake (initialize tests). */
class FakeKeysRepository : IKeysRepository {
    val map = LinkedHashMap<String, StoredKeyPair>()

    override suspend fun save(
        publicKey: ByteArray,
        keyType: Int,
        privateKey: ByteArray,
    ) {
        map[publicKey.hex()] = StoredKeyPair(keyType = keyType, publicKey = publicKey, privateKey = privateKey)
    }

    override suspend fun getAll(): List<StoredKeyPair> = map.values.toList()

    override suspend fun getByPublicKey(publicKey: ByteArray): StoredKeyPair? = map[publicKey.hex()]

    override suspend fun delete(publicKey: ByteArray) {
        map.remove(publicKey.hex())
    }
}

/**
 * `IStorageDriver` returning the fakes from the factory methods — Kotlin's
 * intended injection point (js-core had to poke `client.storageHandle`
 * post-construction). The session/binding state is kept in memory so
 * initialize/keypair tests can exercise hydration.
 */
class FakeStorageDriver(
    eventRepository: FakeEventRepository = FakeEventRepository(),
    contentRepository: FakeContentRepository = FakeContentRepository(),
    keysRepository: FakeKeysRepository = FakeKeysRepository(),
) : IStorageDriver {
    val eventRepository = eventRepository
    val contentRepository = contentRepository
    val keysRepository = keysRepository
    val bindings = LinkedHashMap<String, String>()

    var session: String? = null

    override fun createEventRepository(): IEventRepository = eventRepository

    override fun createContentRepository(): IContentRepository = contentRepository

    override fun createKeysRepository(): IKeysRepository = keysRepository

    override fun createEventAckRepository(): IEventAckRepository = NoopEventAckRepository

    override suspend fun saveActiveIdentityKey(
        publicKey: ByteArray,
        identityKey: String?,
    ) {
        if (identityKey == null) {
            bindings.remove(publicKey.hex())
        } else {
            bindings[publicKey.hex()] = identityKey
        }
    }

    override suspend fun loadActiveIdentityKey(publicKey: ByteArray): String? = bindings[publicKey.hex()]

    override suspend fun saveActiveSession(identityKey: String?) {
        session = identityKey
    }

    override suspend fun loadActiveSession(): String? = session
}

private object NoopEventAckRepository : IEventAckRepository {
    override suspend fun recordAck(
        server: String,
        key: polycentric.v2.EventKey,
    ) {}

    override suspend fun isAcked(
        server: String,
        key: polycentric.v2.EventKey,
    ): Boolean = false
}

/**
 * Per-server behavior for the mocked pull/push paths — the port of js-core's
 * `CoreMockOptions`.
 */
class FakeCoreOptions {
    /** Returns the bundles a pull should yield. */
    var pullBundles: ((ListEventsArgs) -> List<EventBundle>)? = null

    /** Non-null makes `awaitQuery` throw, modelling a failed pull. */
    var pullError: String? = null

    /** Per-server push response (serialized `PutEventsResponse`) or null. May throw. */
    var pushResponse: ((identity: String, server: String, partial: Boolean) -> ByteArray?)? = null

    /** Serialized identity doc returned by `resolveIdentity`. */
    var resolveIdentityResponse: ByteArray? = null

    /** Non-null makes `copyEvents` throw (hydration failure). */
    var copyEventsError: Throwable? = null

    /** Non-null makes `setServers` throw (later-step initialize failure). */
    var setServersError: Throwable? = null
}

/**
 * A stand-in for the rs-core instance (`PolycentricCoreInterface`). Pulls
 * delegate to [FakeCoreOptions.pullBundles] and pushes to
 * [FakeCoreOptions.pushResponse]; every call is recorded so tests can
 * assert the arguments the client passes (identity, server, partial flag,
 * head filters). Unused methods throw so an accidental dependency fails
 * loudly.
 */
class FakeCore(
    configure: FakeCoreOptions.() -> Unit = {},
) : PolycentricCoreInterface {
    val options = FakeCoreOptions().apply(configure)

    /** The `ListEventsArgs` of every pull query, in call order. */
    val pullQueryArgs = mutableListOf<ListEventsArgs>()

    /** Recorded `(identity, server, partial)` push calls. */
    val pushCalls = mutableListOf<Triple<String, String, Boolean>>()

    /** Recorded `(serverUrl, serialized UploadBlobRequest)` blob uploads. */
    val uploadCalls = mutableListOf<Pair<String, ByteArray>>()

    val copyEventsCalls = mutableListOf<List<ByteArray>>()
    val copyContentsCalls = mutableListOf<List<ContentEntry>>()
    val setServersCalls = mutableListOf<List<String>>()
    var clearAuthTokensCount = 0

    fun decodeUpload(pair: Pair<String, ByteArray>): Pair<String, UploadBlobRequest> =
        pair.first to UploadBlobRequest.ADAPTER.decode(pair.second)

    override fun copyEvents(signedEvents: List<ByteArray>) {
        options.copyEventsError?.let { throw it }
        copyEventsCalls.add(signedEvents)
    }

    override fun copyContents(contents: List<ContentEntry>) {
        copyContentsCalls.add(contents)
    }

    override fun setServers(servers: List<String>) {
        options.setServersError?.let { throw it }
        setServersCalls.add(servers)
    }

    override fun setAuthTokenProvider(provider: AuthTokenProvider) {}

    override fun clearAuthTokens() {
        clearAuthTokensCount++
    }

    override fun nextSequence(
        identity: String,
        collection: Int,
    ): ULong = error("not used by sync tests")

    override fun getIdentitySequence(
        identity: String,
        signer: ByteArray,
    ): ULong? = error("not used by sync tests")

    override fun buildVectorClock(
        identity: String,
        collection: Int,
        identitySequence: ULong,
        signedBy: ByteArray,
        currentSequence: ULong,
        identityContent: ByteArray?,
    ): ByteArray = error("not used by sync tests")

    override fun previousSignature(
        identity: String,
        collection: Int,
    ): ByteArray = error("not used by sync tests")

    override fun previousRoot(
        identity: String,
        collection: Int,
    ): ByteArray = error("not used by sync tests")

    /** Mirrors the real core: returns canonical SignedEvent bytes signed via the callback. */
    override suspend fun signEvent(
        eventBytes: ByteArray,
        callback: SignBytesCallback,
    ): ByteArray =
        polycentric.v2.SignedEvent
            .ADAPTER
            .encode(
                polycentric.v2.SignedEvent(
                    signature = callback.sign(eventBytes).toByteString(),
                    event_bytes = eventBytes.toByteString(),
                ),
            )

    /** js-core verifies elsewhere; faking keeps the guard cases exercised. */
    override fun verifySignedEvent(signedEvent: ByteArray): ByteArray = signedEvent

    override suspend fun pushLocalEvents(
        identity: String,
        server: String,
        partial: Boolean,
    ): ByteArray? {
        pushCalls.add(Triple(identity, server, partial))
        return options.pushResponse?.invoke(identity, server, partial)
    }

    override suspend fun uploadBlob(
        serverUrl: String,
        requestBytes: ByteArray,
    ) {
        uploadCalls.add(serverUrl to requestBytes)
    }

    override fun listValidEvents(
        identity: String,
        collection: Int,
    ): ByteArray = error("not used by sync tests")

    override suspend fun awaitQuery(
        query: Query,
        queryKey: List<String>?,
        opts: QueryOpts?,
    ): ByteArray? {
        val args = (query as? Query.ListEvents)?.v1 ?: error("FakeCore only handles ListEvents queries")
        pullQueryArgs.add(args)
        options.pullError?.let { throw CoreException.Network("Query failed on all servers: $it") }
        val bundles = options.pullBundles?.invoke(args) ?: emptyList()
        return ListEventsResponse.ADAPTER.encode(ListEventsResponse(event_bundles = bundles))
    }

    override fun resolveIdentity(identity: String): ByteArray? = options.resolveIdentityResponse

    override suspend fun getServerInfo(serverUrl: String): ByteArray = error("not used by sync tests")

    override suspend fun getPairingSession(
        serverUrl: String,
        digestSha256: ByteArray,
    ): ByteArray = error("not used by sync tests")

    override suspend fun joinPairingSession(
        serverUrl: String,
        digestSha256: ByteArray,
        claimerKey: org.futo.polycentric.ffi.PublicKey,
    ) = error("not used by sync tests")

    override suspend fun putPairingSession(
        serverUrl: String,
        signedIssuerState: ByteArray,
    ): ByteArray = error("not used by sync tests")

    override suspend fun pollForAuthorization(
        serverUrl: String,
        digestSha256: ByteArray,
        claimerKey: org.futo.polycentric.ffi.PublicKey,
    ): Boolean = error("not used by sync tests")

    override suspend fun pollForClaimers(
        serverUrl: String,
        digestSha256: ByteArray,
    ): List<org.futo.polycentric.ffi.PublicKey> = error("not used by sync tests")

    override fun fetchQuery(
        queryKey: List<String>?,
        query: Query,
        opts: QueryOpts?,
    ): QueryObservable = error("not used by sync tests")

    override fun assembleRecoveryPayload(
        identity: String,
        publicKey: ByteArray,
    ): ByteArray = error("not used by sync tests")

    override fun blockedIdentities(): List<String> = error("not used by sync tests")

    override suspend fun getAttributedToReactionCounts(
        serverUrl: String,
        requestBytes: ByteArray,
    ): ByteArray = error("not used by sync tests")

    override fun getServers(): List<String> = error("not used by sync tests")

    override fun invalidateAllQueries() = error("not used by sync tests")

    override fun invalidateQuery(queryKey: List<String>) = error("not used by sync tests")

    override fun isBlocked(identity: String): Boolean = error("not used by sync tests")

    override suspend fun listHeads(
        serverUrl: String,
        requestBytes: ByteArray,
    ): ByteArray = error("not used by sync tests")

    override fun processImageToJpeg(
        image: ByteArray,
        width: UInt,
        height: UInt,
        mode: String,
    ): org.futo.polycentric.ffi.ProcessedImage = error("not used by sync tests")

    override suspend fun putEvents(
        serverUrl: String,
        eventBundlesBytes: ByteArray,
    ): ByteArray = error("not used by sync tests")

    override suspend fun registerPushNotifications(
        serverUrl: String,
        signedMessageBytes: ByteArray,
    ) = error("not used by sync tests")

    override fun resolveIdentityChain(identity: String): ByteArray = error("not used by sync tests")

    override fun setActiveIdentity(identity: String?) = error("not used by sync tests")

    override suspend fun setBanStatus(
        serverUrl: String,
        requestBytes: ByteArray,
    ): ByteArray = error("not used by sync tests")

    override suspend fun urlInfo(
        serverUrl: String,
        url: String,
    ): ByteArray = error("not used by sync tests")
}

/** The bundle makeClient returns. */
class ClientFixture(
    val client: PolycentricClient,
    val core: FakeCore,
    val eventRepository: FakeEventRepository,
    val contentRepository: FakeContentRepository,
    val fileStore: FakeFileStore,
    val storageDriver: FakeStorageDriver,
)

class MakeClientArgs {
    var core: FakeCore? = null

    /** The active identity; its identity event/document are seeded too. */
    var identity: TestIdentity? = null

    /** Other identities present in the store (seeded but not made active). */
    var otherIdentities: List<TestIdentity> = emptyList()
    var signer: TestSigner? = null
    var events: List<SignedEvent> = emptyList()
    var contents: List<Pair<ContentDigest, Content>> = emptyList()
    var fileStore: FakeFileStore? = null

    /** null → js default `['http://server-1']`; an empty list means no servers. */
    var servers: List<String>? = null
}

/**
 * Build a `PolycentricClient` wired to the in-memory mocks and ready to sync.
 * The constructor does not run `initialize()`, so the fields that step would
 * normally populate are set directly here, exactly as the js-core tests do.
 */
fun makeClient(configure: MakeClientArgs.() -> Unit = {}): ClientFixture {
    val args = MakeClientArgs().apply(configure)
    val core = args.core ?: FakeCore()

    val seededIdentities = listOfNotNull(args.identity) + args.otherIdentities
    val fileStore = args.fileStore ?: FakeFileStore()
    // Seed through the driver: the client reads the repos from the
    // storageDriver factories, so these must be the same instances.
    val storageDriver =
        FakeStorageDriver(
            eventRepository =
                FakeEventRepository(seededIdentities.flatMap { it.identityEvents } + args.events),
            contentRepository =
                FakeContentRepository(seededIdentities.flatMap { it.identityContents } + args.contents),
        )

    val client =
        PolycentricClient(
            core = core,
            storageDriver = storageDriver,
            filestore = fileStore,
            seedServers = args.servers ?: listOf("http://server-1"),
        )

    client.activeIdentityKey = args.identity?.key
    args.signer?.let {
        client.currentKeyPair =
            StoredKeyPair(
                keyType = KeyTypes.ED25519,
                publicKey = it.publicKey.key.toByteArray(),
                privateKey = it.privateKey,
            )
    }

    return ClientFixture(client, core, storageDriver.eventRepository, storageDriver.contentRepository, fileStore, storageDriver)
}
