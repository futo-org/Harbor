package tech.futo.libPolycentric.platform

interface IProcessStateRepository {
    fun persistCurrentLogicalClock(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
    )

    fun getCurrentLogicalClock(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
    ): Long

    fun getNextLogicalClock(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
    ): Long
}
