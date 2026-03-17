package tech.futo.libPolycentric.drivers.storage.memory

import okio.ByteString
import okio.ByteString.Companion.toByteString
import tech.futo.libPolycentric.platform.IProcessStateRepository

class InMemoryProcessStateRepository : IProcessStateRepository {
    private data class Key(val systemKeyType: Long, val systemKey: ByteString, val process: ByteString)

    private val clocks = mutableMapOf<Key, Long>()

    override fun persistCurrentLogicalClock(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
    ) {
        clocks[Key(systemKeyType, systemKey.toByteString(), process.toByteString())] = logicalClock
    }

    override fun getCurrentLogicalClock(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
    ): Long {
        return clocks[Key(systemKeyType, systemKey.toByteString(), process.toByteString())] ?: 0L
    }

    override fun getNextLogicalClock(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
    ): Long {
        return getCurrentLogicalClock(systemKeyType, systemKey, process) + 1
    }
}
