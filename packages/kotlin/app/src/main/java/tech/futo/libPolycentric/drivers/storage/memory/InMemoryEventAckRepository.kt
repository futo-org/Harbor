package tech.futo.libPolycentric.drivers.storage.memory

import okio.ByteString
import okio.ByteString.Companion.toByteString
import tech.futo.libPolycentric.platform.IEventAckRepository

class InMemoryEventAckRepository : IEventAckRepository {
    private data class Key(
        val systemKeyType: Long,
        val systemKey: ByteString,
        val process: ByteString,
        val logicalClock: Long,
    )

    private val acks = mutableMapOf<Key, MutableSet<String>>()

    override fun storeEventAck(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
        serverUrl: String,
    ) {
        val key = Key(systemKeyType, systemKey.toByteString(), process.toByteString(), logicalClock)
        acks.getOrPut(key) { mutableSetOf() }.add(serverUrl)
    }

    override fun getEventAcks(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
    ): List<String> {
        val key = Key(systemKeyType, systemKey.toByteString(), process.toByteString(), logicalClock)
        return acks[key]?.toList() ?: emptyList()
    }

    override fun hasEventAck(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
        serverUrl: String,
    ): Boolean {
        val key = Key(systemKeyType, systemKey.toByteString(), process.toByteString(), logicalClock)
        return acks[key]?.contains(serverUrl) ?: false
    }

    override fun removeEventAcks(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
    ) {
        val key = Key(systemKeyType, systemKey.toByteString(), process.toByteString(), logicalClock)
        acks.remove(key)
    }
}
