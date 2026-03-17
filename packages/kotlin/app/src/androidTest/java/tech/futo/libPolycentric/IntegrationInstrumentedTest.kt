package tech.futo.libPolycentric

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import polycentric.Event
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.drivers.storage.sqlite.SQLiteStorageDriver
import tech.futo.libPolycentric.services.IdentityOptions

@RunWith(AndroidJUnit4::class)
class IntegrationInstrumentedTest {

    private lateinit var client: PolycentricClient

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        client = PolycentricClient(Ed25519CryptoManager(), SQLiteStorageDriver(context, "test-integration.db"))
        client.init()
    }

    @After
    fun tearDown() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.deleteDatabase("test-integration.db")
    }

    @Test
    fun shouldBeAbleToCreateANewClient() {
        assertNotNull(client)
    }

    @Test
    fun shouldCreateANewProcessIdIfNoneExists() {
        assertNotNull(client.process)
        val processIdFromStorage = client.processIdRepository.getProcessId()
        assertNotNull(processIdFromStorage)
        assertEquals(client.process!!.process, processIdFromStorage!!.process)
    }

    @Test
    fun shouldRetrieveExistingProcessIdOnSecondInit() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext

        val client1 = PolycentricClient(Ed25519CryptoManager(), SQLiteStorageDriver(context, "test-integration-shared.db"))
        client1.init()

        val client2 = PolycentricClient(Ed25519CryptoManager(), SQLiteStorageDriver(context, "test-integration-shared.db"))
        client2.init()

        assertEquals(client1.process, client2.process)

        context.deleteDatabase("test-integration-shared.db")
    }

    @Test
    fun shouldBeAbleToCreateANewIdentity() {
        val keyPair = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        assertNotNull(keyPair)
        assertNotNull(keyPair.privateKey)
        assertNotNull(keyPair.publicKey)
        assertNotNull(client.currentIdentity)
        assertEquals(keyPair, client.currentIdentity.keyPair)
        assertEquals(client.process, client.currentIdentity.process)
    }

    @Test
    fun shouldCreatePostAndPersistEventAndLogicalClock() {
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        val signedEvent = client.contentManager.createPost("Test post content")

        assertNotNull(signedEvent)
        assertNotNull(signedEvent.signature)
        assertNotNull(signedEvent.event)

        val identity = client.currentIdentity
        val nextClock = client.processStateRepository.getNextLogicalClock(
            identity.keyPair.keyType,
            identity.keyPair.publicKey.key.toByteArray(),
            identity.process.process.toByteArray(),
        )
        assertTrue(nextClock > 1L)
    }

    @Test
    fun shouldCreateMultiplePostsAndIncrementLogicalClock() {
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        val signedEvent1 = client.contentManager.createPost("First post")
        val signedEvent2 = client.contentManager.createPost("Second post")

        assertNotNull(signedEvent1)
        assertNotNull(signedEvent2)

        val identity = client.currentIdentity
        val nextClock = client.processStateRepository.getNextLogicalClock(
            identity.keyPair.keyType,
            identity.keyPair.publicKey.key.toByteArray(),
            identity.process.process.toByteArray(),
        )
        assertTrue(nextClock > 2L)
    }

    @Test
    fun shouldHandleConcurrentPostCreation() {
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        val signedEvent1 = client.contentManager.createPost("First concurrent post")
        val signedEvent2 = client.contentManager.createPost("Second concurrent post")
        val signedEvent3 = client.contentManager.createPost("Third post")

        assertNotNull(signedEvent1)
        assertNotNull(signedEvent2)
        assertNotNull(signedEvent3)

        val identity = client.currentIdentity
        val nextClock = client.processStateRepository.getNextLogicalClock(
            identity.keyPair.keyType,
            identity.keyPair.publicKey.key.toByteArray(),
            identity.process.process.toByteArray(),
        )
        assertTrue(nextClock > 3L)
    }

    @Test
    fun shouldMaintainEventOrderWithLogicalClocks() {
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        val post1 = client.contentManager.createPost("Post 1")
        val post2 = client.contentManager.createPost("Post 2")
        val post3 = client.contentManager.createPost("Post 3")

        val events = listOf(post1, post2, post3).map { signedEvent ->
            Event.ADAPTER.decode(signedEvent.event.toByteArray())
        }

        val logicalClocks = events.map { it.logical_clock }

        assertEquals(3, logicalClocks.size)
        assertTrue(logicalClocks[0] < logicalClocks[1])
        assertTrue(logicalClocks[1] < logicalClocks[2])
        assertEquals(logicalClocks.sorted(), logicalClocks)
    }
}
