package tech.futo.libPolycentric.platform

import polycentric.Process

/**
 * ProcessIdentifierRepository interface for managing the device's process ID
 */
interface IProcessIdRepository {
    /**
     * Get the device's process ID
     *
     * @return The process ID, or null if not set
     */
    fun getProcessId(): Process?

    /**
     * Set the device's process ID
     *
     * @param processId The process ID to store
     * @throws Exception If storing fails
     */
    fun setProcessId(processId: Process)
}
