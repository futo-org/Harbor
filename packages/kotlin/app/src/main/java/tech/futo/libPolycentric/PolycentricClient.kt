package tech.futo.libPolycentric

import PolycentricException
import polycentric_ffi.NetworkRequestResponses
import tech.futo.libPolycentric.services.FFIService
import polycentric_ffi.Result as ProtobufResult

class PolycentricClient {
    private val ffiService = FFIService()



    fun init() {
        this.ffiService.ffiResult { this.ffiService.initialize() }
    }

    fun isInitialized(): Boolean {
        val result = this.ffiService.ffiResult { this.ffiService.is_initialized() }

        if(result.isNotEmpty())
            return result[0] == 1.toByte()

        throw PolycentricException("Invalid response recieved from is_initialized")
    }
}