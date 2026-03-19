package tech.futo.libPolycentric.drivers

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.http.HttpMethod
import io.ktor.http.appendPathSegments
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import okio.ByteString.Companion.toByteString
import polycentric_ffi.NetworkRequestResponse
import polycentric_ffi.NetworkRequestResponses
import polycentric_ffi.NetworkResponse
import tech.futo.libPolycentric.platform.INetworkManager

class HTTPNetworkManager(private val scope: CoroutineScope) : INetworkManager {
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
        val httpRequests = requests.pairs.map { pair ->
            this.scope.async { fulfillRequest(pair) }
        }

        val newPairs = httpRequests.map{ request -> request.await() }

        return NetworkRequestResponses(newPairs)
    }
}