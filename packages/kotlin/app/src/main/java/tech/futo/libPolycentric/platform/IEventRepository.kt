package tech.futo.libPolycentric.platform

import polycentric.SignedEvent

/**
 * EventRepository interface for storing and retrieving signed events in a database
 */
interface IEventRepository {
    /**
     * Persist a single event
     *
     * @param signedEvent A signed event to persist
     * @throws Exception If the event is invalid or persisting fails
     */
    fun persistEvent(signedEvent: SignedEvent)

    /**
     * Persist multiple events in a single database transaction.
     *
     * @param signedEvents A list of signed events to persist
     * @throws Exception If any event is invalid or the transaction fails
     */
    fun persistEvents(signedEvents: List<SignedEvent>)

    /**
     * Get all events from the repository
     *
     * @return A list of signed events
     */
    fun getAllEvents(): List<SignedEvent>

    /**
     * Get events in batches, ordered by id
     *
     * @param batchSize The number of events to retrieve
     * @param offset The offset from which to start retrieving events
     * @return An [EventBatchResult] containing a list of signed events and the new offset
     */
    fun getEventsBatch(batchSize: Int, offset: Int? = null): EventBatchResult
}

data class EventBatchResult(
    val events: List<SignedEvent>,
    val offset: Int,
)
