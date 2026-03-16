package tech.futo.libPolycentric

import PolycentricException
import polycentric_ffi.NetworkRequestResponses
import tech.futo.libPolycentric.services.FFIService
import polycentric_ffi.Result as ProtobufResult

class PolycentricClient {
    private val ffiService = FFIService()

    private fun fulfillRequests(requests: NetworkRequestResponses) {
        for(pair in requests.pairs) {
            if(pair.response !== null) continue

            
        }
    }

    private fun ffiResult(callback: (networkRequests: ByteArray) -> ByteArray): ByteArray {
        var requests = NetworkRequestResponses()

        for(i in 0..100) {
            val resultBytes = callback(NetworkRequestResponses.ADAPTER.encode(requests))
            val resultProtobuf = ProtobufResult.ADAPTER.decode(resultBytes)

            if (resultProtobuf.requests !== null) {
                requests = resultProtobuf.requests
                fulfillRequests(requests)
                continue
            }

            if (resultProtobuf.error !== null) {
                throw PolycentricException(resultProtobuf.error)
            }

            if (resultProtobuf.value_ !== null) {
                return resultProtobuf.value_.toByteArray()
            }
        }


        throw PolycentricException("FFI Boundary network request limit exceeded")
    }


    fun init() {
        ffiResult { this.ffiService.initialize() }
    }

    fun isInitialized(): Boolean {
        val result = ffiResult { this.ffiService.is_initialized() }

        if(result.isNotEmpty())
            return result[0] == 1.toByte()

        throw PolycentricException("Invalid response recieved from is_initialized")
    }
}