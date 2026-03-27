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

    /**
     * Synchronizes the client's events with those of the selected servers
     */
    suspend fun sync(): List<ServerError> =
        syncService.sync()

    /**
     * Creates a new event for the current identity.
     *
     * @param eventData The event data to create.
     * @return The resulting signed event.
     */
    suspend fun createEventRaw(eventData: EventCreationData): SignedEvent =
        contentManager.createEvent(eventData)

    /**
     * Creates a new identity for the current process.
     *
     * @param options The identity creation options including key type and whether to set as current.
     * @return The new key pair.
     */
    suspend fun createIdentity(options: IdentityOptions): KeyPair =
        identityManager.createIdentity(options)

    /**
     * Imports and stores an existing identity using its private key
     *
     * @param privateKey The private key to import
     * @param setAsCurrent Whether to set the imported identity as the current identity. @default true
     */
    suspend fun importIdentity(privateKey: PrivateKey, setAsCurrent: Boolean = true): KeyPair =
        identityManager.importIdentity(privateKey, setAsCurrent)

    /**
     * Gets all stored identities.
     *
     * @return A list containing all stored key pairs.
     */
    suspend fun getAllIdentities(): List<KeyPair> =
        identityManager.getAllIdentities()

    /**
     * Removes an identity from storage
     *
     * @param publicKey The public key of the identity to be removed
     */
    suspend fun removeIdentity(publicKey: PublicKey) =
        identityManager.removeIdentity(publicKey)

    /**
     * Switches the current identity to a new key pair.
     *
     * @param publicKey The public key of the new identity.
     * @return The new key pair.
     */
    suspend fun switchIdentity(publicKey: PublicKey): KeyPair =
        identityManager.switchIdentity(publicKey)

    /**
     * Queries the explore feed from the endpoint from all servers for the current identity
     *
     * @param perServerLimit The limit of how many events should be returned from each server
     * @param moderationFilters The moderation filters to be passed to each server
     */
    suspend fun queryExploreFeed(perServerLimit: Long? = null, moderationFilters: String? = null): FeedQuery =
        queryManager.queryExploreFeed(perServerLimit, moderationFilters)

    /**
     * Queries the search endpoint for all servers
     *
     * @param searchQuery The text to search for
     * @param searchType The type of search to use
     * @param perServerLimit The limit of how many events should be returned from each server
     * @param moderationFilters The moderation filters to be passed to the server
     */
    suspend fun querySearchFeed(
        searchQuery: String,
        searchType: String? = null,
        perServerLimit: Long? = null,
        moderationFilters: String? = null,
    ): FeedQuery =
        queryManager.querySearchFeed(searchQuery, searchType, perServerLimit, moderationFilters)

    /**
     * Queries the following feed for the current system
     *
     * @param limit The number of events that should be returned
     */
    suspend fun queryFollowingFeed(limit: Int): FeedQuery =
        queryManager.queryFollowingFeed(limit)

    /**
     * Queries the feed of events from a specific author
     *
     * @param profile The system whose feed to query
     * @param limit The number of events that should be returned
     */
    suspend fun queryAuthorFeed(profile: PublicKey, limit: Int): FeedQuery =
        queryManager.queryAuthorFeed(profile, limit)

    /**
     * Queries the feed of events with a specific reference
     *
     * @param reference The reference object to query events for
     * @param moderationFilters The moderation filters to be passed to the server
     */
    suspend fun queryReferencesFeed(reference: Reference, moderationFilters: String? = null): FeedQuery =
        queryManager.queryReferencesFeed(reference, moderationFilters)

    /**
     * Queries the feed of events which the current user has liked
     *
     * @param limit The number of events that should be returned
     */
    suspend fun queryLikesFeed(limit: Int): FeedQuery =
        queryManager.queryLikesFeed(limit)

    /**
     * Queries the feed of comments on the current user's posts
     *
     * @param moderationFilters The moderation filters to be passed to the server
     */
    suspend fun queryCommentsFeed(moderationFilters: String? = null): FeedQuery =
        queryManager.queryCommentsFeed(moderationFilters)

    /**
     * Queries the current opinion (like/dislike/neutral) for a given event.
     *
     * @param targetPointer The pointer to query the opinion for.
     * @return The current opinion for the pointer, or null if not found.
     */
    suspend fun queryCurrentOpinion(targetPointer: Pointer): LWWElement? =
        queryManager.queryCurrentOpinion(targetPointer)

    /**
     * Queries the deletion status for a given event
     */
    suspend fun queryIsDeleted(targetPointer: Pointer): Boolean =
        queryManager.queryIsDeleted(targetPointer)

    /**
     * Query feed events for a system with cursor support for pagination
     *
     * @param system The system to query feed events for
     * @param startTime The start of the time range to query
     * @param endTime The end of the time range to query
     * @param limit The maximum number of events to return
     * @param cursor The cursor for pagination from a previous query
     * @return FeedResult containing events and cursor for next page
     */
    suspend fun queryFeed(
        system: PublicKey,
        startTime: Long? = null,
        endTime: Long? = null,
        limit: Long? = null,
        cursor: ByteArray? = null,
    ): FeedResult =
        queryManager.queryFeed(system, startTime, endTime, limit, cursor)

    /**
     * Queries the username for a given system.
     *
     * @param system The system to query the username for.
     * @return The username for the system, or null if not found.
     */
    suspend fun queryUsername(system: PublicKey): String? =
        queryManager.queryUsername(system)

    /**
     * Queries the description for a given system.
     *
     * @param system The system to query the description for.
     * @return The description for the system, or null if not found.
     */
    suspend fun queryDescription(system: PublicKey): String? =
        queryManager.queryDescription(system)

    /**
     * Queries the avatar for a given system.
     *
     * @param system The system to query the avatar for.
     * @return The avatar for the system, or null if not found.
     */
    suspend fun queryAvatar(system: PublicKey): ImageManifest? =
        queryManager.queryAvatar(system)

    /**
     * Queries the banner for a given system.
     *
     * @param system The system to query the banner for.
     * @return The banner for the system, or null if not found.
     */
    suspend fun queryBanner(system: PublicKey): ImageManifest? =
        queryManager.queryBanner(system)

    /**
     * Queries the follows for a given system.
     *
     * @param system The system to query the follows for.
     * @return The follows for the system.
     */
    suspend fun queryFollows(system: PublicKey): List<PublicKey> =
        queryManager.queryFollows(system)

    /**
     * Queries the blocks for a given system.
     *
     * @param system The system to query the blocks for.
     * @return The blocks for the system.
     */
    suspend fun queryBlocks(system: PublicKey): List<PublicKey> =
        queryManager.queryBlocks(system)

    /**
     * Queries the servers for a given system.
     *
     * @param system The system to query the servers for.
     * @return The servers for the system.
     */
    suspend fun queryServers(system: PublicKey): List<String> =
        queryManager.queryServers(system)

    /**
     * Queries the authorities for a given system.
     *
     * @param system The system to query the authorities for.
     * @return The authorities for the system.
     */
    suspend fun queryAuthorities(system: PublicKey): List<String> =
        queryManager.queryAuthorities(system)

    /**
     * Queries the topics for a given system.
     *
     * @param system The system to query the topics for.
     * @return The topics for the system.
     */
    suspend fun queryTopics(system: PublicKey): List<String> =
        queryManager.queryTopics(system)

    /**
     * Returns the pointer to a given event
     */
    suspend fun eventPointer(event: Event): Pointer =
        queryManager.eventPointer(event)

    /**
     * Returns the event key for a given event
     */
    suspend fun eventKey(event: Event): EventKey =
        queryManager.eventKey(event)

    /**
     * Creates a new claim for the current identity.
     *
     * @param claimType The type of claim.
     * @param fields The fields of the claim.
     * @return The resulting signed event.
     */
    suspend fun createClaim(claimType: Long, fields: List<ClaimFieldEntry>): SignedEvent =
        contentManager.createClaim(claimType, fields)

    /**
     * Verifies a claim for the current identity.
     *
     * @param targetPointer The pointer to the claim to verify.
     * @return The resulting signed event.
     */
    suspend fun createVerifyClaim(targetPointer: Pointer): SignedEvent =
        contentManager.createVerifyClaim(targetPointer)

    /**
     * Creates a new post for the current identity.
     *
     * @param content The user supplied text content.
     * @param image Images to be displayed with the post supplied by the user.
     * @param reference A reference to the parent post if this is a reply.
     * @return The resulting signed event.
     */
    suspend fun createPost(content: String, image: ImageManifest? = null, reference: Reference? = null): SignedEvent =
        contentManager.createPost(content, image, reference)

    /**
     * Creates a new like for the current identity.
     *
     * @param subjectPointer The pointer to the subject to like.
     * @return The resulting signed event.
     */
    suspend fun createLike(subjectPointer: Pointer): SignedEvent =
        contentManager.createLike(subjectPointer)

    /**
     * Creates a new dislike for the current identity.
     *
     * @param subjectPointer The pointer to the subject to dislike.
     * @return The resulting signed event.
     */
    suspend fun createDislike(subjectPointer: Pointer): SignedEvent =
        contentManager.createDislike(subjectPointer)

    /**
     * Creates a new neutral for the current identity.
     *
     * @param subjectPointer The pointer to the subject to be neutral.
     * @return The resulting signed event.
     */
    suspend fun createNeutral(subjectPointer: Pointer): SignedEvent =
        contentManager.createNeutral(subjectPointer)

    /**
     * Sets the username for the current identity.
     *
     * @param username A user supplied username.
     * @return The resulting signed event.
     */
    suspend fun createUsername(username: String): SignedEvent =
        contentManager.createUsername(username)

    /**
     * Sets the description for the current identity.
     *
     * @param description A user supplied description.
     * @return The resulting signed event.
     */
    suspend fun createDescription(description: String): SignedEvent =
        contentManager.createDescription(description)

    /**
     * Sets the avatar for the current identity.
     *
     * @param avatar A user supplied avatar image.
     * @return The resulting signed event.
     */
    suspend fun createAvatar(avatar: ImageManifest): SignedEvent =
        contentManager.createAvatar(avatar)

    /**
     * Sets the banner for the current identity.
     *
     * @param banner A user supplied banner image.
     * @return The resulting signed event.
     */
    suspend fun createBanner(banner: ImageManifest): SignedEvent =
        contentManager.createBanner(banner)

    /**
     * Follow another identity.
     *
     * @param system The system to follow.
     * @return The resulting signed event.
     */
    suspend fun createFollow(system: PublicKey): SignedEvent =
        contentManager.createFollow(system)

    /**
     * Unfollows another identity.
     *
     * @param system The system to unfollow.
     * @return The resulting signed event.
     */
    suspend fun createUnfollow(system: PublicKey): SignedEvent =
        contentManager.createUnfollow(system)

    /**
     * Blocks another identity.
     *
     * @param system The system to block.
     * @return The resulting signed event.
     */
    suspend fun createBlock(system: PublicKey): SignedEvent =
        contentManager.createBlock(system)

    /**
     * Unblocks another identity.
     *
     * @param system The system to unblock.
     * @return The resulting signed event.
     */
    suspend fun createUnblock(system: PublicKey): SignedEvent =
        contentManager.createUnblock(system)

    /**
     * Adds a server to the current identity's server list.
     *
     * @param server The server to add.
     * @return The resulting signed event.
     */
    suspend fun createAddServer(server: String): SignedEvent =
        contentManager.createAddServer(server)

    /**
     * Removes a server from the current identity's server list.
     *
     * @param server The server to remove.
     * @return The resulting signed event.
     */
    suspend fun createRemoveServer(server: String): SignedEvent =
        contentManager.createRemoveServer(server)

    /**
     * Adds an authority to the current identity's authority list.
     *
     * @param authority The authority to add.
     * @return The resulting signed event.
     */
    suspend fun createAddAuthority(authority: String): SignedEvent =
        contentManager.createAddAuthority(authority)

    /**
     * Removes an authority from the current identity's authority list.
     *
     * @param authority The authority to remove.
     * @return The resulting signed event.
     */
    suspend fun createRemoveAuthority(authority: String): SignedEvent =
        contentManager.createRemoveAuthority(authority)

    /**
     * Joins a topic for the current identity.
     *
     * @param topic The topic to join.
     * @return The resulting signed event.
     */
    suspend fun createJoinTopic(topic: String): SignedEvent =
        contentManager.createJoinTopic(topic)

    /**
     * Leaves a topic for the current identity.
     *
     * @param topic The topic to leave.
     * @return The resulting signed event.
     */
    suspend fun createLeaveTopic(topic: String): SignedEvent =
        contentManager.createLeaveTopic(topic)

    /**
     * Deletes a post for the current identity.
     *
     * @param postPointer The pointer to the post to delete.
     * @return The resulting signed event.
     */
    suspend fun deletePost(postPointer: Pointer): SignedEvent =
        contentManager.deletePost(postPointer)

    suspend fun setCurrentKeyPair(keyPair: KeyPair, ephemeral: Boolean = false) {
        currentKeyPair = keyPair
        currentIdentityIsEphemeral = ephemeral
        events.emitIdentityChanged(currentIdentity)
    }
}
