package tech.futo.libPolycentric.platform

interface IEventAckRepository {
    fun storeEventAck(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
        serverUrl: String,
    )

    fun getEventAcks(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
    ): List<String>

    fun hasEventAck(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
        serverUrl: String,
    ): Boolean

    fun removeEventAcks(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
    )
}
