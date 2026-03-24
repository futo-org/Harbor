package tech.futo.libPolycentric

import PolycentricException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import tech.futo.libPolycentric.platform.ICryptoManager
import tech.futo.libPolycentric.platform.IStorageDriver
import tech.futo.libPolycentric.services.queries.QueryManager
import tech.futo.libPolycentric.services.ContentManager
import tech.futo.libPolycentric.services.EventService
import tech.futo.libPolycentric.services.FFIService
import tech.futo.libPolycentric.services.IdentityManager
import tech.futo.libPolycentric.services.Identity
import tech.futo.libPolycentric.services.KeyPair
import okio.ByteString.Companion.toByteString
import polycentric.ClaimFieldEntry
import polycentric.Event
import polycentric.EventCreationData
import polycentric.EventKey
import polycentric.FeedResult
import polycentric.ImageManifest
import polycentric.LWWElement
import polycentric.Pointer
import polycentric.PrivateKey
import polycentric.Process
import polycentric.PublicKey
import polycentric.Reference
import polycentric.SignedEvent
import polycentric_ffi.ServerError
import tech.futo.libPolycentric.platform.INetworkManager
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.services.IdentityOptions
import tech.futo.libPolycentric.services.SyncService
import tech.futo.libPolycentric.services.queries.FeedQuery

enum class ClientState {
    UNINITIALIZED,
    INITIALIZING,
    READY,
    ERROR,
}

enum class HydrationStrategy {
    FULL,
    ASYNC,
}

enum class HydrationState(val message: String){
    NOT_STARTED("Not started"),
    IN_PROGRESS("In progress"),
    FAILED("Failed"),
    COMPLETED("Completed")
}

enum class InitializationStep(val message: String) {
    STARTING("Starting initialization..."),
    INITIALIZING_FFI("Initializing FFI..."),
    LOADING_PROCESS_ID("Loading process ID..."),
    CREATING_PROCESS_ID("Creating process ID..."),
    HYDRATING_EVENTS("Hydrating events..."),
    CREATING_EPHEMERAL_IDENTITY("Creating ephemeral identity..."),
    COMPLETE("Initialization complete."),
}

data class HydrationConfig(
    val strategy: HydrationStrategy = HydrationStrategy.FULL,
    val batchSize: Int = 100,
)

data class PolycentricClientConfig(
    val cryptoManager: ICryptoManager,
    val storageDriver: IStorageDriver,
    val networkManager: INetworkManager,
    val hydration: HydrationConfig = HydrationConfig(),
)

class PolycentricClient(
    private val config: PolycentricClientConfig,
) {
    internal val crypto: ICryptoManager = config.cryptoManager
    internal val storage: IStorageDriver = config.storageDriver
    internal val network: INetworkManager = config.networkManager
    internal val hydrationConfig: HydrationConfig = config.hydration
    val ffiService = FFIService(this)
    val syncService = SyncService(this)
    val contentManager = ContentManager(this)
    val identityManager = IdentityManager(this)
    val queryManager = QueryManager(this)
    val events = EventService()

    internal val keysRepository by lazy { storage.createKeysRepository() }
    internal val processIdRepository by lazy { storage.createProcessIdRepository() }
    internal val processStateRepository by lazy { storage.createProcessStateRepository() }
    internal val eventRepository by lazy { storage.createEventRepository() }

    var state: ClientState = ClientState.UNINITIALIZED
        private set

    var currentKeyPair: KeyPair? = null
        private set

    var currentIdentityIsEphemeral: Boolean = true
        private set

    var process: Process? = null
        private set

    var hydrationStatus: HydrationState = HydrationState.NOT_STARTED
        private set

    suspend fun init() {
        try {
            setState(ClientState.INITIALIZING)

            setStep(InitializationStep.STARTING)
            setStep(InitializationStep.INITIALIZING_FFI)
            this.ffiService.init()

            setStep(InitializationStep.LOADING_PROCESS_ID)
            loadProcessId()

            setStep(InitializationStep.HYDRATING_EVENTS)
            hydrate()

            setStep(InitializationStep.CREATING_EPHEMERAL_IDENTITY)
            identityManager.createIdentity(
                IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = true, ephemeral = true)
            )

            setStep(InitializationStep.COMPLETE)
            setState(ClientState.READY)
        } catch (e: Exception) {
            state = ClientState.ERROR
            events.emitError(e)
            throw e
        }
    }

    private fun setState(newState: ClientState) {
        state = newState
        events.emitStateChanged(newState)
    }

    private fun setStep(step: InitializationStep) {
        events.emitProgress(step)
    }

    private fun loadProcessId() {
        process = processIdRepository.getProcessId()

        if (process == null) {
            setStep(InitializationStep.CREATING_PROCESS_ID)
            process = createAndStoreProcessId()
        }
    }

    private fun createAndStoreProcessId(): Process {
        val processId = crypto.generateProcessId()
        val newProcess = Process(process = processId.toByteString())
        processIdRepository.setProcessId(newProcess)
        return newProcess
    }

    private suspend fun hydrate() {
        setHydrationStatus(HydrationState.IN_PROGRESS)
        try {
            when (hydrationConfig.strategy) {
                HydrationStrategy.FULL -> hydrateFull()
                HydrationStrategy.ASYNC -> hydrateAsync()
            }
        } catch (e: Exception) {
            setHydrationStatus(HydrationState.FAILED)
            throw e
        }
    }

    private suspend fun hydrateFull() {
        val events = eventRepository.getAllEvents()

        for (event in events) {
            ffiService.ingestEvent(event.encode())
        }

        setHydrationStatus(HydrationState.COMPLETED)
    }

    private suspend fun hydrateAsync() {
        val initialOffset = loadBatch(hydrationConfig.batchSize, null)

        CoroutineScope(Dispatchers.IO).launch {
            try {
                loadBatchesStartingFrom(hydrationConfig.batchSize, initialOffset)
            } catch (e: Exception) {
                setHydrationStatus(HydrationState.FAILED)
                events.emitError(e)
            }
        }
    }

    private suspend fun loadBatchesStartingFrom(batchSize: Int, offset: Int?) {
        var currentOffset = offset

        while (currentOffset != null) {
            currentOffset = loadBatch(batchSize, currentOffset)
            kotlinx.coroutines.yield()
        }

        setHydrationStatus(HydrationState.COMPLETED)
    }

    private suspend fun loadBatch(batchSize: Int, offset: Int?): Int? {
        val result = eventRepository.getEventsBatch(batchSize, offset)

        if (result.events.isEmpty()) return null

        for (event in result.events) {
            ffiService.ingestEvent(event.encode())
        }

        return result.offset
    }

    private fun setHydrationStatus(status: HydrationState) {
        hydrationStatus = status
        events.emitHydrationStatus(status)
    }

    suspend fun isInitialized(): Boolean {
        val result = this.ffiService.isInitialized()

        if(result.isNotEmpty())
            return result[0] == 1.toByte()

        throw PolycentricException("Invalid response received from is_initialized")
    }

    val isReady: Boolean
        get() = state == ClientState.READY

    val currentIdentity: Identity
        get() {
            val keyPair = currentKeyPair
                ?: throw PolycentricException("Key pair not initialized")
            val process = process
                ?: throw PolycentricException("Process not initialized")
            return Identity(keyPair = keyPair, process = process)
        }

    suspend fun sync(): List<ServerError> =
        syncService.sync()

    suspend fun createEventRaw(eventData: EventCreationData): SignedEvent =
        contentManager.createEvent(eventData)

    fun createIdentity(options: IdentityOptions): KeyPair =
        identityManager.createIdentity(options)

    fun importIdentity(privateKey: PrivateKey, setAsCurrent: Boolean = true): KeyPair =
        identityManager.importIdentity(privateKey, setAsCurrent)

    fun getAllIdentities(): List<KeyPair> =
        identityManager.getAllIdentities()

    fun removeIdentity(publicKey: PublicKey) =
        identityManager.removeIdentity(publicKey)

    fun switchIdentity(publicKey: PublicKey): KeyPair =
        identityManager.switchIdentity(publicKey)

    fun queryExploreFeed(perServerLimit: Long? = null, moderationFilters: String? = null): FeedQuery =
        queryManager.queryExploreFeed(perServerLimit, moderationFilters)

    fun querySearchFeed(
        searchQuery: String,
        searchType: String? = null,
        perServerLimit: Long? = null,
        moderationFilters: String? = null,
    ): FeedQuery =
        queryManager.querySearchFeed(searchQuery, searchType, perServerLimit, moderationFilters)

    fun queryFollowingFeed(limit: Int): FeedQuery =
        queryManager.queryFollowingFeed(limit)

    fun queryAuthorFeed(profile: PublicKey, limit: Int): FeedQuery =
        queryManager.queryAuthorFeed(profile, limit)

    fun queryReferencesFeed(reference: Reference, moderationFilters: String? = null): FeedQuery =
        queryManager.queryReferencesFeed(reference, moderationFilters)

    fun queryLikesFeed(limit: Int): FeedQuery =
        queryManager.queryLikesFeed(limit)

    fun queryCommentsFeed(moderationFilters: String? = null): FeedQuery =
        queryManager.queryCommentsFeed(moderationFilters)

    suspend fun queryCurrentOpinion(targetPointer: Pointer): LWWElement? =
        queryManager.queryCurrentOpinion(targetPointer)

    suspend fun queryIsDeleted(targetPointer: Pointer): Boolean =
        queryManager.queryIsDeleted(targetPointer)

    suspend fun queryFeed(
        system: PublicKey,
        startTime: Long? = null,
        endTime: Long? = null,
        limit: Long? = null,
        cursor: ByteArray? = null,
    ): FeedResult =
        queryManager.queryFeed(system, startTime, endTime, limit, cursor)

    suspend fun queryUsername(system: PublicKey): String? =
        queryManager.queryUsername(system)

    suspend fun queryDescription(system: PublicKey): String? =
        queryManager.queryDescription(system)

    suspend fun queryAvatar(system: PublicKey): ImageManifest? =
        queryManager.queryAvatar(system)

    suspend fun queryBanner(system: PublicKey): ImageManifest? =
        queryManager.queryBanner(system)

    suspend fun queryFollows(system: PublicKey): List<PublicKey> =
        queryManager.queryFollows(system)

    suspend fun queryBlocks(system: PublicKey): List<PublicKey> =
        queryManager.queryBlocks(system)

    suspend fun queryServers(system: PublicKey): List<String> =
        queryManager.queryServers(system)

    suspend fun queryAuthorities(system: PublicKey): List<String> =
        queryManager.queryAuthorities(system)

    suspend fun queryTopics(system: PublicKey): List<String> =
        queryManager.queryTopics(system)

    suspend fun eventPointer(event: Event): Pointer =
        queryManager.eventPointer(event)

    suspend fun eventKey(event: Event): EventKey =
        queryManager.eventKey(event)

    suspend fun createClaim(claimType: Long, fields: List<ClaimFieldEntry>): SignedEvent =
        contentManager.createClaim(claimType, fields)

    suspend fun createVerifyClaim(targetPointer: Pointer): SignedEvent =
        contentManager.createVerifyClaim(targetPointer)

    suspend fun createPost(content: String, image: ImageManifest? = null, reference: Reference? = null): SignedEvent =
        contentManager.createPost(content, image, reference)

    suspend fun createLike(subjectPointer: Pointer): SignedEvent =
        contentManager.createLike(subjectPointer)

    suspend fun createDislike(subjectPointer: Pointer): SignedEvent =
        contentManager.createDislike(subjectPointer)

    suspend fun createNeutral(subjectPointer: Pointer): SignedEvent =
        contentManager.createNeutral(subjectPointer)

    suspend fun createUsername(username: String): SignedEvent =
        contentManager.createUsername(username)

    suspend fun createDescription(description: String): SignedEvent =
        contentManager.createDescription(description)

    suspend fun createAvatar(avatar: ImageManifest): SignedEvent =
        contentManager.createAvatar(avatar)

    suspend fun createBanner(banner: ImageManifest): SignedEvent =
        contentManager.createBanner(banner)

    suspend fun createFollow(system: PublicKey): SignedEvent =
        contentManager.createFollow(system)

    suspend fun createUnfollow(system: PublicKey): SignedEvent =
        contentManager.createUnfollow(system)

    suspend fun createBlock(system: PublicKey): SignedEvent =
        contentManager.createBlock(system)

    suspend fun createUnblock(system: PublicKey): SignedEvent =
        contentManager.createUnblock(system)

    suspend fun createAddServer(server: String): SignedEvent =
        contentManager.createAddServer(server)

    suspend fun createRemoveServer(server: String): SignedEvent =
        contentManager.createRemoveServer(server)

    suspend fun createAddAuthority(authority: String): SignedEvent =
        contentManager.createAddAuthority(authority)

    suspend fun createRemoveAuthority(authority: String): SignedEvent =
        contentManager.createRemoveAuthority(authority)

    suspend fun createJoinTopic(topic: String): SignedEvent =
        contentManager.createJoinTopic(topic)

    suspend fun createLeaveTopic(topic: String): SignedEvent =
        contentManager.createLeaveTopic(topic)

    suspend fun deletePost(postPointer: Pointer): SignedEvent =
        contentManager.deletePost(postPointer)

    fun setCurrentKeyPair(keyPair: KeyPair, ephemeral: Boolean = false) {
        currentKeyPair = keyPair
        currentIdentityIsEphemeral = ephemeral
        events.emitIdentityChanged(currentIdentity)
    }
}
