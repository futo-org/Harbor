package tech.futo.libPolycentric.platform

import polycentric.SignedEvent

interface IEventRepository {
    fun persistEvent(signedEvent: SignedEvent)
    fun persistEvents(signedEvents: List<SignedEvent>)
    fun getAllEvents(): List<SignedEvent>
    fun getEventsBatch(batchSize: Int, offset: Int? = null): EventBatchResult
}

data class EventBatchResult(
    val events: List<SignedEvent>,
    val offset: Int,
)
