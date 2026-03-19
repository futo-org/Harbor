package tech.futo.libPolycentric.services

import polycentric.Events
import polycentric_ffi.ResultAndServerErrors
import polycentric_ffi.ServerError
import tech.futo.libPolycentric.PolycentricClient

class SyncService(private val client: PolycentricClient)  {
    suspend fun sync(): List<ServerError> {
        val resultBytes = this.client.ffiService.syncEventsForSystem(
            this.client.currentIdentity.keyPair.publicKey.encode()
        )

        val resultAndErrors = ResultAndServerErrors.ADAPTER.decode(resultBytes)
        val resultEvents = Events.ADAPTER.decode(resultAndErrors.result)

        this.client.eventRepository.persistEvents(resultEvents.events)

        return resultAndErrors.errors
    }
}