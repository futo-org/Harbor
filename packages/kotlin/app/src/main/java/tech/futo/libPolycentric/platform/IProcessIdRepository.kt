package tech.futo.libPolycentric.platform

import polycentric.Process

interface IProcessIdRepository {
    fun getProcessId(): Process?
    fun setProcessId(processId: Process)
}
