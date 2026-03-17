package tech.futo.libPolycentric

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.drivers.storage.sqlite.SQLiteStorageDriver
import tech.futo.libPolycentric.services.ClientState
import tech.futo.libPolycentric.services.Identity
import tech.futo.libPolycentric.services.IdentityOptions
import tech.futo.libPolycentric.services.InitializationStep

@RunWith(AndroidJUnit4::class)
class EventServiceInstrumentedTest {

    private lateinit var client: PolycentricClient

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        client = PolycentricClient(Ed25519CryptoManager(), SQLiteStorageDriver(context, "test-eventservice.db"))
        client.init()
    }

    @After
    fun tearDown() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.deleteDatabase("test-eventservice.db")
    }

    @Test
    fun shouldHaveCorrectInitialStateAfterInit() {
        assertEquals(ClientState.READY, client.state)
        assertTrue(client.isReady)
    }

    @Test
    fun shouldEmitProgressEvents() {
        val steps = mutableListOf<InitializationStep>()
        client.events.onProgress { steps.add(it) }

        client.events.emitProgress(InitializationStep.STARTING)

        assertTrue(steps.contains(InitializationStep.STARTING))
    }

    @Test
    fun shouldEmitIdentityChangedWhenCreatingIdentity() {
        var identityChanged = false
        var receivedIdentity: Identity? = null

        client.events.onIdentityChanged { identity ->
            identityChanged = true
            receivedIdentity = identity
        }

        val keyPair = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        assertTrue(identityChanged)
        assertNotNull(receivedIdentity)
        assertEquals(keyPair, receivedIdentity!!.keyPair)
        assertEquals(client.process, receivedIdentity!!.process)
    }

    @Test
    fun shouldEmitIdentityChangedWhenSwitchingIdentity() {
        val keyPair1 = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )

        var identityChanged = false
        var switchedIdentity: Identity? = null

        client.events.onIdentityChanged { identity ->
            identityChanged = true
            switchedIdentity = identity
        }

        client.identityManager.switchIdentity(keyPair1.publicKey)

        assertTrue(identityChanged)
        assertNotNull(switchedIdentity)
        assertEquals(keyPair1, switchedIdentity!!.keyPair)
    }

    @Test
    fun shouldEmitStateChangeEvents() {
        var stateChanged = false
        var emittedState: ClientState? = null

        client.events.onStateChanged { state ->
            stateChanged = true
            emittedState = state
        }

        client.events.emitStateChanged(ClientState.INITIALIZING)

        assertTrue(stateChanged)
        assertEquals(ClientState.INITIALIZING, emittedState)
    }

    @Test
    fun shouldEmitErrorEvents() {
        var errorEmitted = false
        var emittedError: Exception? = null

        client.events.onError { error ->
            errorEmitted = true
            emittedError = error
        }

        val testError = Exception("Test error")
        client.events.emitError(testError)

        assertTrue(errorEmitted)
        assertEquals(testError, emittedError)
    }

    @Test
    fun shouldTrackCurrentIdentityState() {
        val keyPair = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        assertNotNull(client.currentIdentity)
        assertEquals(keyPair, client.currentIdentity.keyPair)
        assertEquals(client.process, client.currentIdentity.process)
    }

    @Test
    fun shouldEmitMultipleEventsInSequence() {
        val emitted = mutableListOf<String>()

        client.events.onStateChanged { emitted.add("stateChanged") }
        client.events.onProgress { emitted.add("progress") }
        client.events.onIdentityChanged { emitted.add("identityChanged") }
        client.events.onError { emitted.add("error") }

        client.events.emitProgress(InitializationStep.STARTING)
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
        client.events.emitError(Exception("Test"))

        assertTrue(emitted.contains("progress"))
        assertTrue(emitted.contains("identityChanged"))
        assertTrue(emitted.contains("error"))
    }

    @Test
    fun shouldCallMultipleListenersForSameEvent() {
        var listener1Called = false
        var listener2Called = false

        client.events.onIdentityChanged { listener1Called = true }
        client.events.onIdentityChanged { listener2Called = true }

        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        assertTrue(listener1Called)
        assertTrue(listener2Called)
    }

    @Test
    fun shouldAllowRemovingListeners() {
        var listenerCalled = false
        val listener: (Identity?) -> Unit = { listenerCalled = true }

        client.events.onIdentityChanged(listener)
        client.events.offIdentityChanged(listener)

        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        assertFalse(listenerCalled)
    }

    @Test
    fun shouldAllowRemovingAllListeners() {
        var listenerCalled = false
        client.events.onIdentityChanged { listenerCalled = true }

        client.events.removeAllListeners()

        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        assertFalse(listenerCalled)
    }
}
