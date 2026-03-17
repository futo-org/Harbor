package tech.futo.libPolycentric.drivers.storage.memory

import tech.futo.libPolycentric.platform.IEventAckRepository
import tech.futo.libPolycentric.platform.IEventRepository
import tech.futo.libPolycentric.platform.IKeysRepository
import tech.futo.libPolycentric.platform.IProcessIdRepository
import tech.futo.libPolycentric.platform.IProcessStateRepository
import tech.futo.libPolycentric.platform.IStorageDriver

class InMemoryStorageDriver : IStorageDriver {
    override fun createEventRepository(): IEventRepository = InMemoryEventRepository()
    override fun createProcessStateRepository(): IProcessStateRepository = InMemoryProcessStateRepository()
    override fun createKeysRepository(): IKeysRepository = InMemoryKeysRepository()
    override fun createEventAckRepository(): IEventAckRepository = InMemoryEventAckRepository()
    override fun createProcessIdRepository(): IProcessIdRepository = InMemoryProcessIdRepository()
}
