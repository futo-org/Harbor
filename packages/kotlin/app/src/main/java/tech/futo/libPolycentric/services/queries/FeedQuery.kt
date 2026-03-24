package tech.futo.libPolycentric.services.queries

import PolycentricException
import android.util.Base64
import polycentric.Events
import polycentric_ffi.Cursor
import polycentric_ffi.InternalFeedResult
import polycentric_ffi.ServerError
import tech.futo.libPolycentric.PolycentricClient

data class ResultEventsAndServerErrors(
    val events: Events,
    val errors: List<ServerError>,
)

class FeedQuery(
    private val client: PolycentricClient,
    private val feedCallback: suspend (cursor: ByteArray) -> ByteArray
) {
    private var cursor: Cursor = Cursor()
    private var result: MutableSet<String> = mutableSetOf()

    public suspend fun read(): ResultEventsAndServerErrors {
        val resultBytes = this.feedCallback(this.cursor.encode())
        val result = InternalFeedResult.ADAPTER.decode(resultBytes)

        if(result.cursor != null) this.cursor = result.cursor

        if(result.result == null) throw PolycentricException("rs-core did not return a valid feed result")
        val eventsUnfiltered = Events.ADAPTER.decode(result.result.result)

        val events = eventsUnfiltered.events.filter { signedEvent ->
            !this.result.contains(Base64.encodeToString(signedEvent.event.toByteArray(), Base64.NO_WRAP))
        }

        this.result.addAll(events.map { signedEvent -> Base64.encodeToString(signedEvent.event.toByteArray(), Base64.NO_WRAP) })

        return ResultEventsAndServerErrors(Events(events), errors = result.result.errors)
    }
}
