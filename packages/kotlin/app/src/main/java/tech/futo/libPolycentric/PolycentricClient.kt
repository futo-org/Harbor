package tech.futo.libPolycentric

import PolycentricException
import tech.futo.libPolycentric.platform.ICryptoManager
import tech.futo.libPolycentric.platform.IStorageDriver
import tech.futo.libPolycentric.queries.QueryManager
import tech.futo.libPolycentric.services.ContentManager
import tech.futo.libPolycentric.services.FFIService
import tech.futo.libPolycentric.services.IdentityManager
import tech.futo.libPolycentric.services.Identity
import tech.futo.libPolycentric.services.KeyPair
import okio.ByteString.Companion.toByteString
import polycentric.Process

class PolycentricClient(
    val crypto: ICryptoManager,
    val storage: IStorageDriver,
) {
    internal val ffiService = FFIService(this)
    internal val contentManager = ContentManager(this)
    internal val identityManager = IdentityManager(this)
    internal val queryManager = QueryManager(this)

    val keysRepository by lazy { storage.createKeysRepository() }
    val processIdRepository by lazy { storage.createProcessIdRepository() }
    val processStateRepository by lazy { storage.createProcessStateRepository() }
    val eventRepository by lazy { storage.createEventRepository() }
    val eventAckRepository by lazy { storage.createEventAckRepository() }

    var currentKeyPair: KeyPair? = null
        private set

    var currentIdentityIsEphemeral: Boolean = true
        private set

    var process: Process? = null
        private set

    fun setProcess(process: Process) {
        this.process = process
    }

    fun init() {
        this.ffiService.init()
        loadProcessId()
    }

    private fun loadProcessId() {
        process = processIdRepository.getProcessId()

        if (process == null) {
            process = createAndStoreProcessId()
        }
    }

    private fun createAndStoreProcessId(): Process {
        val processId = crypto.generateProcessId()
        val newProcess = Process(process = processId.toByteString())
        processIdRepository.setProcessId(newProcess)
        return newProcess
    }

    fun isInitialized(): Boolean {
        val result = this.ffiService.isInitialized()

        if(result.isNotEmpty())
            return result[0] == 1.toByte()

        throw PolycentricException("Invalid response received from is_initialized")
    }

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
    }
}
