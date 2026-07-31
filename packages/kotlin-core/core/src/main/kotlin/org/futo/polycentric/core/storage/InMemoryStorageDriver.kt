package org.futo.polycentric.core.storage

import java.util.concurrent.ConcurrentHashMap
import org.futo.polycentric.core.platform.IContentRepository
import org.futo.polycentric.core.platform.IEventAckRepository
import org.futo.polycentric.core.platform.IEventRepository
import org.futo.polycentric.core.platform.IFileStoreDriver
import org.futo.polycentric.core.platform.IKeysRepository
import org.futo.polycentric.core.platform.IStorageDriver
import org.futo.polycentric.core.platform.StoredKeyPair
import polycentric.v2.ContentDigest
import polycentric.v2.Event
import polycentric.v2.EventKey
import polycentric.v2.SignedEvent

/**
 * In-memory driver for unit tests, mirroring js-core's memory driver and
 * the kotlin-wrapper branch's InMemory* repositories. The production
 * SQLite driver should be salvaged from origin/kotlin-wrapper
 * packages/kotlin/.../drivers/storage/sqlite/ and adapted to these
 * interfaces (schema there is v1-shaped; the event table needs v2's
 * (collection, identity, signed_by, sequence) key).
 */
class InMemoryStorageDriver : IStorageDriver, IFileStoreDriver {
    private val events = ConcurrentHashMap<String, SignedEvent>()
    private val contents = ConcurrentHashMap<String, Pair<ContentDigest, ByteArray>>()
    private val keys = ConcurrentHashMap<String, StoredKeyPair>()
    private val acks = ConcurrentHashMap.newKeySet<String>()
    private val activeIdentity = ConcurrentHashMap<String, String>()
    private val blobs = ConcurrentHashMap<String, ByteArray>()

    private fun keyOf(k: EventKey) = "${k.collection}/${k.identity}/${k.signed_by?.key?.hex()}/${k.sequence}"
    private fun keyOf(d: ContentDigest) = "${d.type.value}_${d.value_.hex()}"

    override fun createEventRepository() = object : IEventRepository {
        override suspend fun save(signedEvent: SignedEvent) {
            Event.ADAPTER.decode(signedEvent.event_bytes).key?.let { events[keyOf(it)] = signedEvent }
        }

        override suspend fun getAll() = events.values.toList()

        override suspend fun getByEventKey(key: EventKey) = events[keyOf(key)]

        override suspend fun getByIdentity(identity: String, headsOnly: Boolean): List<SignedEvent> {
            val mine = events.values
                .map { it to Event.ADAPTER.decode(it.event_bytes).key!! }
                .filter { (_, k) -> k.identity == identity }
            if (!headsOnly) return mine.map { it.first }
            return mine
                .groupBy { (_, k) -> "${k.collection}/${k.signed_by?.key?.hex()}" }
                .values
                .map { stream -> stream.maxBy { (_, k) -> k.sequence }.first }
        }
    }

    override fun createContentRepository() = object : IContentRepository {
        override suspend fun save(digest: ContentDigest, contentBytes: ByteArray) {
            contents[keyOf(digest)] = digest to contentBytes
        }

        override suspend fun get(digest: ContentDigest) = contents[keyOf(digest)]?.second

        override suspend fun getAll() = contents.values.toList()
    }

    override fun createKeysRepository() = object : IKeysRepository {
        override suspend fun save(publicKey: ByteArray, keyType: Int, privateKey: ByteArray) {
            keys[publicKey.toHexKey()] = StoredKeyPair(keyType, publicKey, privateKey)
        }

        override suspend fun getAll() = keys.values.toList()

        override suspend fun getByPublicKey(publicKey: ByteArray) = keys[publicKey.toHexKey()]

        override suspend fun delete(publicKey: ByteArray) {
            keys.remove(publicKey.toHexKey())
        }
    }

    override fun createEventAckRepository() = object : IEventAckRepository {
        override suspend fun recordAck(server: String, key: EventKey) {
            acks.add("$server|${keyOf(key)}")
        }

        override suspend fun isAcked(server: String, key: EventKey) =
            acks.contains("$server|${keyOf(key)}")
    }

    override suspend fun saveActiveIdentityKey(publicKey: ByteArray, identityKey: String?) {
        if (identityKey == null) activeIdentity.remove(publicKey.toHexKey())
        else activeIdentity[publicKey.toHexKey()] = identityKey
    }

    override suspend fun loadActiveIdentityKey(publicKey: ByteArray) =
        activeIdentity[publicKey.toHexKey()]

    override suspend fun put(digest: ContentDigest, bytes: ByteArray) {
        blobs[keyOf(digest)] = bytes
    }

    override suspend fun get(digest: ContentDigest) = blobs[keyOf(digest)]

    private fun ByteArray.toHexKey() = joinToString("") { "%02x".format(it) }
}
