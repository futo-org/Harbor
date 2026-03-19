package tech.futo.libPolycentric

import PolycentricException
import tech.futo.libPolycentric.platform.ICryptoManager
import tech.futo.libPolycentric.platform.IStorageDriver
import tech.futo.libPolycentric.queries.QueryManager
import tech.futo.libPolycentric.services.ContentManager
import tech.futo.libPolycentric.services.EventService
import tech.futo.libPolycentric.services.FFIService
import tech.futo.libPolycentric.services.IdentityManager
import tech.futo.libPolycentric.services.Identity
import tech.futo.libPolycentric.services.KeyPair
import okio.ByteString.Companion.toByteString
import polycentric.Process
import tech.futo.libPolycentric.services.SyncService

enum class ClientState {
    UNINITIALIZED,
    INITIALIZING,
    READY,
    ERROR,
}

enum class InitializationStep(val message: String) {
    STARTING("Starting initialization..."),
    INITIALIZING_FFI("Initializing FFI..."),
    LOADING_PROCESS_ID("Loading process ID..."),
    CREATING_PROCESS_ID("Creating process ID..."),
    COMPLETE("Initialization complete."),
}


class PolycentricClient(
    internal val crypto: ICryptoManager,
    internal val storage: IStorageDriver,
) {
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
    internal val eventAckRepository by lazy { storage.createEventAckRepository() }


    var state: ClientState = ClientState.UNINITIALIZED
        private set

    var currentKeyPair: KeyPair? = null
        private set

    var currentIdentityIsEphemeral: Boolean = true
        private set

    var process: Process? = null
        private set

    suspend fun init() {
        try {
            setState(ClientState.INITIALIZING)

            setStep(InitializationStep.STARTING)
            setStep(InitializationStep.INITIALIZING_FFI)
            this.ffiService.init()

            setStep(InitializationStep.LOADING_PROCESS_ID)
            loadProcessId()

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
