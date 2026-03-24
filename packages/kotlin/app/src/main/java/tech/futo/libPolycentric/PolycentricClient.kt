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
import polycentric.Process
import tech.futo.libPolycentric.platform.INetworkManager
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.services.IdentityOptions
import tech.futo.libPolycentric.services.SyncService

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

    fun setCurrentKeyPair(keyPair: KeyPair, ephemeral: Boolean = false) {
        currentKeyPair = keyPair
        currentIdentityIsEphemeral = ephemeral
        events.emitIdentityChanged(currentIdentity)
    }
}
