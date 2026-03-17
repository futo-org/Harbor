package tech.futo.libPolycentric.drivers.storage.memory

import polycentric.Process
import tech.futo.libPolycentric.platform.IProcessIdRepository

class InMemoryProcessIdRepository : IProcessIdRepository {
    private var processId: Process? = null

    override fun getProcessId(): Process? = processId

    override fun setProcessId(processId: Process) {
        this.processId = processId
    }
}
