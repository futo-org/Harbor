package tech.futo.libPolycentric.drivers.storage.memory

import polycentric.SignedEvent
import tech.futo.libPolycentric.platform.EventBatchResult
import tech.futo.libPolycentric.platform.IEventRepository

class InMemoryEventRepository : IEventRepository {
    private val events = mutableListOf<SignedEvent>()

    override fun persistEvent(signedEvent: SignedEvent) {
        events.add(signedEvent)
    }

    override fun persistEvents(signedEvents: List<SignedEvent>) {
        events.addAll(signedEvents)
    }

    override fun getAllEvents(): List<SignedEvent> = events.toList()

    override fun getEventsBatch(batchSize: Int, offset: Int?): EventBatchResult {
        val start = offset ?: 0
        val batch = events.drop(start).take(batchSize)
        return EventBatchResult(events = batch, offset = start + batch.size)
    }
}
