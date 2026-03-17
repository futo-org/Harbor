package tech.futo.libPolycentric.platform

interface IStorageDriver {
    fun createEventRepository(): IEventRepository
    fun createProcessStateRepository(): IProcessStateRepository
    fun createKeysRepository(): IKeysRepository
    fun createEventAckRepository(): IEventAckRepository
    fun createProcessIdRepository(): IProcessIdRepository
}
