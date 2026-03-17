package tech.futo.libPolycentric.queries

import android.util.Base64
import polycentric.Event
import polycentric.Events
import polycentric.SignedEvent
import tech.futo.libPolycentric.PolycentricClient

data class ServerError(
    val server: String,
    val error: String,
)

data class ResultEventsAndServerErrors(
    val events: Events,
    val errors: List<ServerError>,
)

class FeedQuery(
    private val client: PolycentricClient,
    private val feedCallback: (cursors: MutableMap<String, ByteArray>, latestEvent: Event?) -> ResultEventsAndServerErrors,
) {
    private val cursors: MutableMap<String, ByteArray> = mutableMapOf()
    private var latestEvent: Event? = null
    private val result: MutableSet<String> = mutableSetOf()

    fun read(): ResultEventsAndServerErrors {
        val callbackResult = feedCallback(cursors, latestEvent)

        val newEvents = callbackResult.events.events.filter { signedEvent ->
            val encoded = Base64.encodeToString(signedEvent.event.toByteArray(), Base64.NO_WRAP)
            !result.contains(encoded)
        }

        for (signedEvent in newEvents) {
            val encoded = Base64.encodeToString(signedEvent.event.toByteArray(), Base64.NO_WRAP)
            result.add(encoded)
        }

        if (newEvents.isNotEmpty()) {
            val latestSignedEvent = newEvents.last()
            latestEvent = Event.ADAPTER.decode(latestSignedEvent.event.toByteArray())
        }

        return callbackResult
    }
}
