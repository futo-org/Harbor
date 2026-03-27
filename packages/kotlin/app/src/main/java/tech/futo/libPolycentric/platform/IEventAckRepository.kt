package tech.futo.libPolycentric.platform

/**
 * EventAckRepository interface for storing and retrieving event acknowledgments in a database
 */
interface IEventAckRepository {
    /**
     * Store an event acknowledgment
     *
     * @param systemKeyType The system key type
     * @param systemKey The system key bytes
     * @param process The process ID bytes
     * @param logicalClock The logical clock of the acknowledged event
     * @param serverUrl The server URL that acknowledged the event
     * @throws Exception If storing fails
     */
    fun storeEventAck(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
        serverUrl: String,
    )

    /**
     * Retrieve event acknowledgments for a specific event
     *
     * @param systemKeyType The system key type
     * @param systemKey The system key bytes
     * @param process The process ID bytes
     * @param logicalClock The logical clock of the event
     * @return A list of server URLs that acknowledged the event
     */
    fun getEventAcks(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
    ): List<String>

    /**
     * Check if a specific event has been acknowledged by a specific server
     *
     * @param systemKeyType The system key type
     * @param systemKey The system key bytes
     * @param process The process ID bytes
     * @param logicalClock The logical clock of the event
     * @param serverUrl The server URL to check
     * @return true if acknowledged, false otherwise
     */
    fun hasEventAck(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
        serverUrl: String,
    ): Boolean

    /**
     * Remove event acknowledgments for a specific event
     *
     * @param systemKeyType The system key type
     * @param systemKey The system key bytes
     * @param process The process ID bytes
     * @param logicalClock The logical clock of the event
     * @throws Exception If removal fails
     */
    fun removeEventAcks(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
    )
}
