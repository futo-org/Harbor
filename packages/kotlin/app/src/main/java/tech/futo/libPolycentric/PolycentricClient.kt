package tech.futo.libPolycentric

import PolycentricException
import tech.futo.libPolycentric.services.FFIService

class PolycentricClient {
    private val ffiService = FFIService()

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