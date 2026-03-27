package tech.futo.libPolycentric.platform

/**
 * ProcessStateRepository interface for managing process state in a database
 */
interface IProcessStateRepository {
    /**
     * Persist the logical clock for a specific process.
     *
     * @param systemKeyType The system key type
     * @param systemKey The system key bytes
     * @param process The process ID bytes
     * @param logicalClock The logical clock value to persist
     * @throws Exception If the operation fails
     */
    fun persistCurrentLogicalClock(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
    )

    /**
     * Get the current logical clock for a given process.
     *
     * @param systemKeyType The system key type
     * @param systemKey The system key bytes
     * @param process The process ID bytes
     * @return The current logical clock or 0 if not found
     * @throws Exception If the query fails
     */
    fun getCurrentLogicalClock(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
    ): Long

    /**
     * Convenience method to determine the next logical clock for a given process.
     *
     * @param systemKeyType The system key type
     * @param systemKey The system key bytes
     * @param process The process ID bytes
     * @return The next logical clock value
     * @throws Exception If the operation fails
     */
    fun getNextLogicalClock(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
    ): Long
}
