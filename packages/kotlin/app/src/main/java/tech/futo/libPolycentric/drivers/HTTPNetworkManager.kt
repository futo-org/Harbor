package tech.futo.libPolycentric.drivers

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.http.HttpMethod
import io.ktor.http.appendPathSegments
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import okio.ByteString.Companion.toByteString
import polycentric_ffi.NetworkRequestResponse
import polycentric_ffi.NetworkRequestResponses
import polycentric_ffi.NetworkResponse
import tech.futo.libPolycentric.platform.INetworkManager

class HTTPNetworkManager : INetworkManager {
    private val http = HttpClient()

    private suspend fun fulfillRequest(pair: NetworkRequestResponse): NetworkRequestResponse {
        if(pair.response != null) return pair
        if(pair.request == null) return pair

        val body = pair.request.body

        val response = http.request(pair.request.server) {
            method = HttpMethod(pair.request.method)
            url.appendPathSegments(pair.request.endpoint)
            for((key, value) in pair.request.parameters){
                url.parameters.append(key, value)
            }
            if(body != null) setBody(body.toByteArray())
        }

        val responseBody: ByteArray = response.body()

        return NetworkRequestResponse(request = pair.request, response = NetworkResponse(responseBody.toByteString()))
    }

     override suspend fun fulfillRequests(requests: NetworkRequestResponses): NetworkRequestResponses {
         // Run all requests in parallel
         val newPairs = coroutineScope {
             requests.pairs.map { pair -> async { fulfillRequest(pair) } }
         }.map {
             it.await()
         }

         return NetworkRequestResponses(newPairs)
    }
}