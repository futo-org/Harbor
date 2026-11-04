package org.futo.polycentric.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.futo.polycentric.ffi.BackupCheck
import org.futo.polycentric.ffi.ClientEvent
import org.futo.polycentric.ffi.ClientState
import org.futo.polycentric.ffi.ContentBody
import org.futo.polycentric.ffi.HarborClientConfig
import org.futo.polycentric.ffi.KeyCipher
import org.futo.polycentric.ffi.Post
import org.futo.polycentric.ffi.SdkException
import org.futo.polycentric.ffi.StorageConfig
import org.futo.polycentric.ffi.VerificationClaim
import org.futo.polycentric.ffi.aeadKeyCipher
import org.futo.polycentric.ffi.backupInfo
import org.futo.polycentric.ffi.eventKeyId
import org.futo.polycentric.ffi.generateWrappingKey
import org.futo.polycentric.ffi.parseEventKeyId
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The Kotlin wrapper against the real rs-core, built for the host and
 * loaded through JNA (see `jna.library.path` in build.gradle.kts).
 */
class PolycentricClientTest {
    @get:Rule
    val dir = TemporaryFolder()

    /** Nothing listens here, so network calls fail fast. */
    private val deadServer = "http://127.0.0.1:9"

    private fun post(text: String) = ContentBody.Post(Post(text = text)).toContent()

    private suspend fun openOnDisk(cipher: KeyCipher) =
        PolycentricClient.open(
            databasePath = dir.root.resolve("db.sqlite").path,
            keyCipher = cipher,
            blobDirectory = dir.root.resolve("blobs").path,
            seedServers = listOf(deadServer),
        )

    @Test
    fun publishesAndReadsBackInMemory() =
        runBlocking {
            PolycentricClient.inMemory(seedServers = listOf(deadServer)).use { client ->
                assertEquals(ClientState.READY, client.snapshot.value.state)
                assertFalse(client.snapshot.value.persistent)
                assertNull(client.login)

                val login = client.createIdentity()
                assertTrue(login.contentEquals(client.login?.id))
                val identity = login.identity
                assertEquals(identity, client.resolveIdentity()?.identityKey)

                val posted = client.publish(post("hello"), Collections.FEED)
                assertEquals("hello", (posted.body as ContentBody.Post).post.text)
                val key = checkNotNull(posted.key)
                assertEquals(identity, key.identity)
                assertTrue(key.contentEquals(parseEventKeyId(eventKeyId(key))))

                val fields =
                    mapOf(
                        "platform" to "youtube".toByteArray(),
                        "channel" to "UC123".toByteArray(),
                        "handle" to "@someone".toByteArray(),
                    )
                client.publish(
                    ContentBody.VerificationClaim(VerificationClaim(fields = fields)).toContent(),
                    Collections.VERIFICATIONS,
                )

                val feed = client.listValidEvents(identity, Collections.FEED)
                assertEquals(listOf("hello"), feed.map { (it.body as ContentBody.Post).post.text })

                val claims = client.listValidEvents(identity, Collections.VERIFICATIONS)
                assertEquals(1, claims.size)
                val claim = (claims.single().body as ContentBody.VerificationClaim).verificationClaim
                assertEquals(fields.keys, claim.fields.keys)
                fields.forEach { (k, v) -> assertArrayEquals(v, claim.fields[k]) }
            }
        }

    @Test
    fun preparesThenCommits() =
        runBlocking {
            PolycentricClient.inMemory(seedServers = listOf(deadServer)).use { client ->
                val identity = client.createIdentity().identity
                val pending = client.prepareEvent(post("draft"), Collections.FEED)
                // Prepared, not stored.
                assertEquals("draft", (pending.bundle().body as ContentBody.Post).post.text)
                assertTrue(client.listValidEvents(identity, Collections.FEED).isEmpty())

                val committed = client.commitEvent(pending)
                assertTrue(pending.key().contentEquals(committed.key))
                assertEquals(1, client.listValidEvents(identity, Collections.FEED).size)
            }
        }

    @Test
    fun emitsSnapshotsAndCommittedEvents() =
        runBlocking {
            PolycentricClient.inMemory(seedServers = listOf(deadServer)).use { client ->
                val committed =
                    async(Dispatchers.Unconfined) {
                        withTimeout(10_000) { client.committed.first { (it.body as? ContentBody.Post)?.post?.text == "seen" } }
                    }
                val signedIn =
                    async(Dispatchers.Unconfined) {
                        withTimeout(10_000) {
                            client.events
                                .filterIsInstance<ClientEvent.Snapshot>()
                                .first { it.snapshot.login != null }
                        }
                    }

                val login = client.createIdentity()
                // The snapshot flow follows the login.
                withTimeout(10_000) { client.snapshot.first { login.contentEquals(it.login?.id) } }

                client.publish(post("seen"), Collections.FEED)
                assertEquals(login.identity, committed.await().key?.identity)
                assertTrue(
                    login.contentEquals(
                        signedIn
                            .await()
                            .snapshot.login
                            ?.id,
                    ),
                )
            }
        }

    @Test
    fun persistsAcrossReopenWithTheSameCipher() =
        runBlocking {
            val wrappingKey = generateWrappingKey()
            val login =
                openOnDisk(aeadKeyCipher(wrappingKey)).use { client ->
                    assertTrue(client.snapshot.value.persistent)
                    client.createIdentity().also { client.publish(post("kept"), Collections.FEED) }
                }

            openOnDisk(aeadKeyCipher(wrappingKey)).use { client ->
                assertTrue(login.contentEquals(client.login?.id))
                val feed = client.listValidEvents(login.identity, Collections.FEED)
                assertEquals(listOf("kept"), feed.map { (it.body as ContentBody.Post).post.text })
                // The restored key still signs.
                client.publish(post("again"), Collections.FEED)
            }

            // Another cipher can't open the stored key, so nobody signs in.
            openOnDisk(aeadKeyCipher(generateWrappingKey())).use { client ->
                assertNull(client.login)
            }
        }

    @Test
    fun persistentStorageRequiresAKeyCipher() =
        runBlocking {
            val config =
                HarborClientConfig(
                    StorageConfig.Sqlite(dir.root.resolve("db.sqlite").path, null),
                    listOf(deadServer),
                )
            val failure = runCatching { PolycentricClient.open(config, keyCipher = null).close() }.exceptionOrNull()
            assertTrue("$failure", failure is SdkException)
        }

    @Test
    fun createsAndChecksBackups() =
        runBlocking {
            PolycentricClient.inMemory(seedServers = listOf(deadServer)).use { client ->
                val identity = client.createIdentity().identity
                val backup = client.createBackup()
                assertEquals(identity, backupInfo(backup).identityKey)
                assertEquals(BackupCheck.VALID, client.checkBackup(backup))
                assertEquals(BackupCheck.INVALID, client.checkBackup("not a backup"))

                // A newer backup rotates the recovery key.
                client.createBackup()
                assertEquals(BackupCheck.STALE, client.checkBackup(backup))
            }
        }
}
