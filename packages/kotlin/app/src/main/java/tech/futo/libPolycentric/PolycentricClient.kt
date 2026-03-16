package tech.futo.libPolycentric

import PolycentricException
import tech.futo.libPolycentric.services.ContentManager
import tech.futo.libPolycentric.services.FFIService
import tech.futo.libPolycentric.services.IdentityManager

class PolycentricClient {
    internal val ffiService = FFIService(this)
    internal val contentManager = ContentManager(this)
    internal val identityManager = IdentityManager(this)

    fun init() {
        this.ffiService.init()
    }

    fun isInitialized(): Boolean {
        val result = this.ffiService.isInitialized()

        if(result.isNotEmpty())
            return result[0] == 1.toByte()

        throw PolycentricException("Invalid response received from is_initialized")
    }
}