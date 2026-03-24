package tech.futo.libPolycentric

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.drivers.HTTPNetworkManager
import tech.futo.libPolycentric.drivers.storage.sqlite.SQLiteStorageDriver
import tech.futo.libPolycentric.services.IdentityOptions

@RunWith(AndroidJUnit4::class)
class HydrationInstrumentedTest {

    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @After
    fun tearDown() {
        context.deleteDatabase("test-hydration.db")
    }

    private fun createClient(
        storage: SQLiteStorageDriver,
        strategy: HydrationStrategy = HydrationStrategy.FULL,
        batchSize: Int = 100,
    ): PolycentricClient {
        return PolycentricClient(PolycentricClientConfig(
            Ed25519CryptoManager(),
            storage,
            HTTPNetworkManager(),
            HydrationConfig(strategy = strategy, batchSize = batchSize),
        ))
    }

    @Test
    fun fullHydrationShouldCompleteOnInit() = runBlocking {
        val storage = SQLiteStorageDriver(context, "test-hydration.db")
        val client = createClient(storage)
        client.init()

        assertEquals(HydrationState.COMPLETED, client.hydrationStatus)

        Unit
    }

    @Test
    fun fullHydrationShouldEmitStatusEvents() = runBlocking {
        val storage = SQLiteStorageDriver(context, "test-hydration.db")
        val statuses = mutableListOf<HydrationState>()

        val client = createClient(storage)
        client.events.onHydrationStatus { statuses.add(it) }
        client.init()

        assertTrue(statuses.contains(HydrationState.IN_PROGRESS))
        assertTrue(statuses.contains(HydrationState.COMPLETED))
        assertEquals(HydrationState.IN_PROGRESS, statuses.first())
        assertEquals(HydrationState.COMPLETED, statuses.last())

        Unit
    }

    @Test
    fun fullHydrationShouldRestoreEventsFromStorage() = runBlocking {
        val storage = SQLiteStorageDriver(context, "test-hydration.db")

        val client1 = createClient(storage)
        client1.init()
        client1.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
        val publicKey = client1.currentIdentity.keyPair.publicKey

        client1.contentManager.createUsername("hydration_test_user")
        val username1 = client1.queryManager.queryUsername(publicKey)
        assertEquals("hydration_test_user", username1)

        val client2 = createClient(storage)
        client2.init()

        val username2 = client2.queryManager.queryUsername(publicKey)
        assertEquals("hydration_test_user", username2)

        Unit
    }

    @Test
    fun fullHydrationShouldRestoreMultipleEvents() = runBlocking {
        val storage = SQLiteStorageDriver(context, "test-hydration.db")

        val client1 = createClient(storage)
        client1.init()
        client1.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
        val publicKey = client1.currentIdentity.keyPair.publicKey

        client1.contentManager.createUsername("test_user")
        client1.contentManager.createDescription("test description")
        client1.contentManager.createPost("test post")

        val client2 = createClient(storage)
        client2.init()

        assertEquals("test_user", client2.queryManager.queryUsername(publicKey))
        assertEquals("test description", client2.queryManager.queryDescription(publicKey))

        Unit
    }

    @Test
    fun asyncHydrationShouldCompleteOnInit() = runBlocking {
        val storage = SQLiteStorageDriver(context, "test-hydration.db")
        val client = createClient(storage, strategy = HydrationStrategy.ASYNC)
        client.init()

        assertEquals(ClientState.READY, client.state)

        Unit
    }

    @Test
    fun asyncHydrationShouldEmitInProgressDuringInit() = runBlocking {
        val storage = SQLiteStorageDriver(context, "test-hydration.db")
        val statuses = mutableListOf<HydrationState>()

        val client = createClient(storage, strategy = HydrationStrategy.ASYNC)
        client.events.onHydrationStatus { statuses.add(it) }
        client.init()

        assertTrue(statuses.contains(HydrationState.IN_PROGRESS))

        Unit
    }

    @Test
    fun asyncHydrationShouldRestoreFirstBatchBeforeReturning() = runBlocking {
        val storage = SQLiteStorageDriver(context, "test-hydration.db")

        val client1 = createClient(storage)
        client1.init()
        client1.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
        val publicKey = client1.currentIdentity.keyPair.publicKey
        client1.contentManager.createUsername("async_user")

        val client2 = createClient(storage, strategy = HydrationStrategy.ASYNC, batchSize = 100)
        client2.init()

        val username = client2.queryManager.queryUsername(publicKey)
        assertEquals("async_user", username)

        Unit
    }

    @Test
    fun asyncHydrationShouldHandleSmallBatchSize() = runBlocking {
        val storage = SQLiteStorageDriver(context, "test-hydration.db")

        val client1 = createClient(storage)
        client1.init()
        client1.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
        val publicKey = client1.currentIdentity.keyPair.publicKey

        client1.contentManager.createUsername("batch_user")
        client1.contentManager.createDescription("batch description")
        client1.contentManager.createPost("post 1")
        client1.contentManager.createPost("post 2")
        client1.contentManager.createPost("post 3")

        val statuses = mutableListOf<HydrationState>()
        val client2 = createClient(storage, strategy = HydrationStrategy.ASYNC, batchSize = 2)
        client2.events.onHydrationStatus { statuses.add(it) }
        client2.init()

        // First batch should have been loaded synchronously
        assertTrue(statuses.contains(HydrationState.IN_PROGRESS))

        // Wait for background batches to complete
        Thread.sleep(1000)

        assertEquals(HydrationState.COMPLETED, client2.hydrationStatus)
        assertEquals("batch_user", client2.queryManager.queryUsername(publicKey))
        assertEquals("batch description", client2.queryManager.queryDescription(publicKey))

        Unit
    }

    @Test
    fun fullHydrationShouldHandleEmptyStorage() = runBlocking {
        val storage = SQLiteStorageDriver(context, "test-hydration.db")
        val client = createClient(storage)
        client.init()

        assertEquals(HydrationState.COMPLETED, client.hydrationStatus)
        assertEquals(ClientState.READY, client.state)

        Unit
    }

    @Test
    fun asyncHydrationShouldHandleEmptyStorage() = runBlocking {
        val storage = SQLiteStorageDriver(context, "test-hydration.db")
        val statuses = mutableListOf<HydrationState>()

        val client = createClient(storage, strategy = HydrationStrategy.ASYNC)
        client.events.onHydrationStatus { statuses.add(it) }
        client.init()

        Thread.sleep(500)

        assertEquals(HydrationState.COMPLETED, client.hydrationStatus)
        assertEquals(ClientState.READY, client.state)

        Unit
    }

    @Test
    fun fullHydrationShouldPreserveLWWSemantics() = runBlocking {
        val storage = SQLiteStorageDriver(context, "test-hydration.db")

        val client1 = createClient(storage)
        client1.init()
        client1.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
        val publicKey = client1.currentIdentity.keyPair.publicKey

        client1.contentManager.createUsername("first_name")
        client1.contentManager.createUsername("second_name")
        client1.contentManager.createUsername("final_name")

        val client2 = createClient(storage)
        client2.init()

        assertEquals("final_name", client2.queryManager.queryUsername(publicKey))

        Unit
    }
}
