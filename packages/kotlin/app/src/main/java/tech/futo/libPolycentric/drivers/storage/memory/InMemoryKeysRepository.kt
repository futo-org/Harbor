package tech.futo.libPolycentric.drivers.storage.memory

import polycentric.PublicKey
import tech.futo.libPolycentric.platform.IKeysRepository
import tech.futo.libPolycentric.platform.StoredKeyPair

class InMemoryKeysRepository : IKeysRepository {
    private val store = mutableMapOf<String, StoredKeyPair>()

    private fun keyFor(publicKey: PublicKey): String = publicKey.key.hex()

    override fun storeKeys(keys: StoredKeyPair) {
        store[keyFor(keys.publicKey)] = keys
    }

    override fun retrieveKeysByPublicKey(publicKey: PublicKey): StoredKeyPair? {
        return store[keyFor(publicKey)]
    }

    override fun removeKeys(publicKey: PublicKey) {
        store.remove(keyFor(publicKey))
    }

    override fun getAllKeys(): List<StoredKeyPair> = store.values.toList()
}
