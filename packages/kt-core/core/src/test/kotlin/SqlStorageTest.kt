package org.futo.polycentric.core

import android.content.Context
import android.database.sqlite.SQLiteConstraintException
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.test.runTest
import okio.ByteString.Companion.toByteString
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import polycentric.v2.ContentDigest
import polycentric.v2.ContentDigestType

/** Robolectric tests for the SQL content repository (audit §4.4). */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class SqlContentRepositoryTest {
    private lateinit var helper: PolycentricDbHelper
    private lateinit var repo: SqlContentRepository

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        helper = PolycentricDbHelper(context, "content-test.db")
        repo = SqlContentRepository(helper.writableDatabase)
    }

    private fun digest(value: ByteArray): ContentDigest =
        ContentDigest(type = ContentDigestType.CONTENT_DIGEST_TYPE_SHA256, value_ = value.toByteString())

    @Test
    fun `save and get round trip raw bytes`() =
        runTest {
            val d = digest(byteArrayOf(1, 2, 3))
            repo.save(d, "hello".toByteArray())

            assertArrayEquals("hello".toByteArray(), repo.get(d))
        }

    @Test
    fun `unknown digest returns null`() =
        runTest {
            assertNull(repo.get(digest(byteArrayOf(9, 9))))
        }

    @Test
    fun `getAll decodes digests`() =
        runTest {
            val d1 = digest(byteArrayOf(1))
            val d2 = digest(byteArrayOf(2))
            repo.save(d1, byteArrayOf(10))
            repo.save(d2, byteArrayOf(20))

            val all = repo.getAll()
            assertEquals(2, all.size)
            assertEquals(listOf(d1, d2).map { it.value_ }, all.map { it.first.value_ })
        }

    @Test
    fun `same digest replace second write wins`() =
        runTest {
            val d = digest(byteArrayOf(1))
            repo.save(d, byteArrayOf(10))
            repo.save(d, byteArrayOf(11))

            assertArrayEquals(byteArrayOf(11), repo.get(d))
            assertEquals(1, repo.getAll().size)
        }

    @Test
    fun `byte fidelity with 0x00 and 0xFF payloads`() =
        runTest {
            val d = digest(byteArrayOf(0x00, 0xFF.toByte()))
            val payload = byteArrayOf(0x00, 0x01, 0xFF.toByte(), 0x7F)
            repo.save(d, payload)

            assertArrayEquals(payload, repo.get(d))
        }
}

/** Robolectric tests for the SQL keys repository, including the CHECK constraints. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class SqlKeysRepositoryTest {
    private lateinit var helper: PolycentricDbHelper
    private lateinit var repo: SqlKeysRepository

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        helper = PolycentricDbHelper(context, "keys-test.db")
        repo = SqlKeysRepository(helper.writableDatabase)
    }

    private val publicKey = ByteArray(32) { 0x11 }
    private val privateKey = ByteArray(32) { 0x22 }

    @Test
    fun `save and getByPublicKey round trip byte equal`() =
        runTest {
            repo.save(publicKey, KeyTypes.ED25519, privateKey)

            val loaded = repo.getByPublicKey(publicKey)
            assertNotNull(loaded)
            assertEquals(KeyTypes.ED25519, requireNotNull(loaded).keyType)
            assertArrayEquals(privateKey, loaded.privateKey)
        }

    @Test
    fun `getAll returns every stored key`() =
        runTest {
            repo.save(ByteArray(32) { 1 }, KeyTypes.ED25519, ByteArray(32) { 2 })
            repo.save(ByteArray(32) { 3 }, KeyTypes.ED25519, ByteArray(32) { 4 })

            assertEquals(2, repo.getAll().size)
        }

    @Test
    fun `same public key replace updates keyType and keeps one row`() =
        runTest {
            repo.save(publicKey, KeyTypes.ED25519, privateKey)
            repo.save(publicKey, KeyTypes.SHA256, privateKey)

            assertEquals(1, repo.getAll().size)
            assertEquals(KeyTypes.SHA256, repo.getByPublicKey(publicKey)!!.keyType)
        }

    @Test
    fun `delete removes the key`() =
        runTest {
            repo.save(publicKey, KeyTypes.ED25519, privateKey)
            repo.delete(publicKey)

            assertNull(repo.getByPublicKey(publicKey))
            assertTrue(repo.getAll().isEmpty())
        }

    @Test
    fun `delete of an unknown key is a no-op`() =
        runTest {
            repo.delete(publicKey)
            assertNull(repo.getByPublicKey(publicKey))
        }

    @Test
    fun `schema CHECK constraints reject keys of the wrong length`() =
        runTest {
            // keys table declares CHECK(LENGTH(private_key) = 32) and
            // CHECK(LENGTH(public_key) = 32); FK/CHECK enforcement is enabled.
            val thrown1 = runCatching { repo.save(publicKey, KeyTypes.ED25519, ByteArray(31)) }.exceptionOrNull()
            val thrown2 = runCatching { repo.save(ByteArray(31), KeyTypes.ED25519, privateKey) }.exceptionOrNull()

            assertTrue("expected SQLiteConstraintException, got $thrown1", thrown1 is SQLiteConstraintException)
            assertTrue("expected SQLiteConstraintException, got $thrown2", thrown2 is SQLiteConstraintException)
            assertTrue(repo.getAll().isEmpty())
        }
}

/** Robolectric tests for the SQLite storage driver wiring and identity/session state. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class SqliteStorageDriverTest {
    private lateinit var context: Context
    private lateinit var driver: SqliteStorageDriver

    // Shared fixtures.
    private val identityA = makeIdentity(listOf(makeSigner(1)), listOf(makeSigner(2)))
    private val signerA = makeSigner(1)

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        driver = SqliteStorageDriver(context, "driver-test.db")
    }

    @Test
    fun `factories return repos wired to the same database`() =
        runTest {
            val eventRepo = driver.createEventRepository()
            val eventRepo2 = driver.createEventRepository()
            val contentRepo = driver.createContentRepository()

            // Write through one instance, read through a second call.
            val signed = makeStream(signerA, identityA, Collections.FEED, count = 1, label = "wired").single()
            eventRepo.save(signed)
            assertEquals(
                signed,
                eventRepo2.getByEventKey(
                    requireNotNull(
                        polycentric.v2.Event.ADAPTER
                            .decode(signed.event_bytes)
                            .key,
                    ),
                ),
            )

            val digest =
                polycentric.v2.ContentDigest(
                    type = polycentric.v2.ContentDigestType.CONTENT_DIGEST_TYPE_SHA256,
                    value_ = byteArrayOf(7).toByteString(),
                )
            contentRepo.save(digest, byteArrayOf(1, 2, 3))
            assertArrayEquals(byteArrayOf(1, 2, 3), contentRepo.get(digest))
        }

    @Test
    fun `active identity key round trip`() =
        runTest {
            val publicKey = ByteArray(32) { 5 }
            driver.saveActiveIdentityKey(publicKey, "identity-hex")

            assertEquals("identity-hex", driver.loadActiveIdentityKey(publicKey))
        }

    @Test
    fun `saving a null identity key deletes the binding`() =
        runTest {
            val publicKey = ByteArray(32) { 5 }
            driver.saveActiveIdentityKey(publicKey, "identity-hex")
            driver.saveActiveIdentityKey(publicKey, null)

            assertNull(driver.loadActiveIdentityKey(publicKey))
        }

    @Test
    fun `bindings are per device key`() =
        runTest {
            val key1 = ByteArray(32) { 5 }
            val key2 = ByteArray(32) { 6 }
            driver.saveActiveIdentityKey(key1, "identity-1")
            driver.saveActiveIdentityKey(key2, "identity-2")

            assertEquals("identity-1", driver.loadActiveIdentityKey(key1))
            assertEquals("identity-2", driver.loadActiveIdentityKey(key2))
        }

    @Test
    fun `saveActiveSession null persists logout`() =
        runTest {
            driver.saveActiveSession("identity-hex")
            assertEquals("identity-hex", driver.loadActiveSession())

            driver.saveActiveSession(null)
            assertNull(driver.loadActiveSession())
        }

    @Test
    fun `session is a singleton row second save overwrites`() =
        runTest {
            driver.saveActiveSession("identity-a")
            driver.saveActiveSession("identity-b")

            assertEquals("identity-b", driver.loadActiveSession())
        }
}
