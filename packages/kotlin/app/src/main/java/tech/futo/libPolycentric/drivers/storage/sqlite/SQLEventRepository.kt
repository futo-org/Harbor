package tech.futo.libPolycentric.drivers.storage.sqlite

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import okio.ByteString.Companion.toByteString
import polycentric.ContentType
import polycentric.Delete
import polycentric.Event
import polycentric.ModerationTag
import polycentric.Pointer
import polycentric.SignedEvent
import tech.futo.libPolycentric.platform.EventBatchResult
import tech.futo.libPolycentric.platform.IEventRepository

class SQLEventRepository(private val db: SQLiteDatabase) : IEventRepository {

    override fun persistEvent(signedEvent: SignedEvent) {
        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())

        val systemKeyType = event.system?.key_type ?: 0L
        val systemKey = event.system?.key?.toByteArray() ?: ByteArray(0)
        val process = event.process?.process?.toByteArray() ?: ByteArray(0)
        val logicalClock = event.logical_clock

        val signature = signedEvent.signature.toByteArray()
        val rawEvent = signedEvent.event.toByteArray()
        val moderationTags = if (signedEvent.moderation_tags.isNotEmpty()) {
            signedEvent.moderation_tags.joinToString(",") { it.name }
        } else null

        val isTombstone = event.content_type == ContentType.DELETE

        var mutationPointerSystemKeyType: Long? = null
        var mutationPointerSystemKey: ByteArray? = null
        var mutationPointerProcess: ByteArray? = null
        var mutationPointerLogicalClock: Long? = null

        if (isTombstone) {
            try {
                val deleteEvent = Delete.ADAPTER.decode(event.content.toByteArray())

                if (deleteEvent.process != null) {
                    mutationPointerProcess = deleteEvent.process.process.toByteArray()
                    mutationPointerLogicalClock = deleteEvent.logical_clock

                    if (event.references.isNotEmpty()) {
                        val targetPointer = Pointer.ADAPTER.decode(
                            event.references[0].reference.toByteArray()
                        )
                        if (targetPointer.system != null) {
                            mutationPointerSystemKeyType = targetPointer.system.key_type
                            mutationPointerSystemKey = targetPointer.system.key.toByteArray()
                        }
                    }
                }
            } catch (_: Exception) {
                // Failed to parse delete event content
            }
        }

        val values = ContentValues().apply {
            put("system_key_type", systemKeyType)
            put("system_key", systemKey)
            put("process", process)
            put("logical_clock", logicalClock)
            put("signature", signature)
            put("raw_event", rawEvent)
            put("moderation_tags", moderationTags)
            put("is_tombstone", if (isTombstone) 1 else 0)
            put("mutation_pointer_system_key_type", mutationPointerSystemKeyType)
            put("mutation_pointer_system_key", mutationPointerSystemKey)
            put("mutation_pointer_process", mutationPointerProcess)
            put("mutation_pointer_logical_clock", mutationPointerLogicalClock)
        }

        db.insert("events", null, values)
    }

    override fun persistEvents(signedEvents: List<SignedEvent>) {
        db.beginTransaction()
        try {
            for (event in signedEvents) {
                persistEvent(event)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    override fun getAllEvents(): List<SignedEvent> {
        val cursor = db.rawQuery(
            "SELECT signature, raw_event, moderation_tags FROM events",
            null,
        )
        val results = mutableListOf<SignedEvent>()
        cursor.use {
            while (it.moveToNext()) {
                val signature = it.getBlob(0)
                val rawEvent = it.getBlob(1)
                val moderationTagsStr = it.getString(2)

                val moderationTags: List<ModerationTag> = if (moderationTagsStr != null) {
                    moderationTagsStr.split(",").mapNotNull { tag ->
                        ModerationTag(level = tag.trim().toIntOrNull() ?: return@mapNotNull null)
                    }
                } else emptyList()

                results.add(
                    SignedEvent(
                        signature = signature.toByteString(),
                        event = rawEvent.toByteString(),
                        moderation_tags = moderationTags,
                    )
                )
            }
        }
        return results
    }

    override fun getEventsBatch(batchSize: Int, offset: Int?): EventBatchResult {
        val startOffset = offset ?: 0
        val cursor = db.rawQuery(
            "SELECT id, signature, raw_event, moderation_tags FROM events ORDER BY id LIMIT ? OFFSET ?",
            arrayOf(batchSize.toString(), startOffset.toString()),
        )
        val results = mutableListOf<SignedEvent>()
        var lastId = startOffset
        cursor.use {
            while (it.moveToNext()) {
                lastId = it.getInt(0)
                val signature = it.getBlob(1)
                val rawEvent = it.getBlob(2)
                val moderationTagsStr = it.getString(3)

                val moderationTags: List<ModerationTag> = if (moderationTagsStr != null) {
                    moderationTagsStr.split(",").mapNotNull { tag ->
                        ModerationTag(level = tag.trim().toIntOrNull() ?: return@mapNotNull null)
                    }
                } else emptyList()

                results.add(
                    SignedEvent(
                        signature = signature.toByteString(),
                        event = rawEvent.toByteString(),
                        moderation_tags = moderationTags,
                    )
                )
            }
        }
        return EventBatchResult(events = results, offset = lastId)
    }
}
