package tech.futo.libPolycentric.platform

import polycentric_ffi.NetworkRequestResponses

interface INetworkManager {
    suspend fun fulfillRequests(requests: NetworkRequestResponses): NetworkRequestResponses
}