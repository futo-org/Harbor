package org.futo.polycentric.core

import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import polycentric.v2.SignedEvent

/**
 * The `initialize()` hydration guard (audit priority #1): what a fresh
 * install restores, what a signed-in / logged-out restart restores, and how
 * hydration failures are distinguished from later-step failures.
 */
class PolycentricClientInitializeTest {
    private val signer = makeSigner(3)
    private val signerA = makeSigner(1)
    private val identityA = makeIdentity(listOf(signerA), listOf(makeSigner(2)))

    private fun storedKeyPair() =
        StoredKeyPair(
            keyType = KeyTypes.ED25519,
            publicKey = signer.publicKey.key.toByteArray(),
            privateKey = signer.privateKey,
        )

    @Test
    fun `fresh install creates an ephemeral keypair and emits keyPairChanged with no identity`() =
        runTest {
            val f = makeClient()
            val emissions = mutableListOf<KeyPairChangedPayload?>()
            val collector =
                launch {
                    f.client.eventService.keyPairChanged
                        .collect { emissions.add(it) }
                }
            yield()

            f.client.initialize()
            yield()
            collector.cancelAndJoin()

            assertEquals(ClientState.READY, f.client.eventService.state.value)
            assertNotNull(f.client.currentKeyPair)
            assertNull(f.client.activeIdentityKey) // not signed in
            assertEquals(
                1,
                f.storageDriver.keysRepository
                    .getAll()
                    .size,
            ) // key persisted
            // No binding was saved for the ephemeral key.
            assertNull(f.storageDriver.loadActiveIdentityKey(f.client.currentKeyPair!!.publicKey))
            assertEquals(1, emissions.size)
            assertEquals(f.client.currentKeyPair!!.publicKey, emissions[0]!!.publicKey)
            assertNull(emissions[0]!!.identityKey)
        }

    @Test
    fun `signed in restore brings back the bound keypair and session`() =
        runTest {
            val f = makeClient()
            // Seed the hydrated state: a stored key bound to an identity, session set.
            val keyPair = storedKeyPair()
            f.storageDriver.keysRepository.save(keyPair.publicKey, keyPair.keyType, keyPair.privateKey)
            f.storageDriver.saveActiveIdentityKey(keyPair.publicKey, "identity-hex")
            f.storageDriver.saveActiveSession("identity-hex")

            f.client.initialize()

            assertEquals(ClientState.READY, f.client.eventService.state.value)
            assertEquals(keyPair.publicKey, f.client.currentKeyPair!!.publicKey)
            assertEquals("identity-hex", f.client.activeIdentityKey)
        }

    @Test
    fun `logged out restore picks the first stored key with no active identity`() =
        runTest {
            val f = makeClient()
            val keyPair = storedKeyPair()
            f.storageDriver.keysRepository.save(keyPair.publicKey, keyPair.keyType, keyPair.privateKey)
            // No session (logged out), but the key remains listable.
            f.storageDriver.saveActiveSession(null)

            f.client.initialize()

            assertEquals(ClientState.READY, f.client.eventService.state.value)
            assertEquals(keyPair.publicKey, f.client.currentKeyPair!!.publicKey)
            assertNull(f.client.activeIdentityKey)
        }

    @Test
    fun `session naming an identity whose binding is gone falls back to the first key`() =
        runTest {
            val f = makeClient()
            val keyPair = storedKeyPair()
            f.storageDriver.keysRepository.save(keyPair.publicKey, keyPair.keyType, keyPair.privateKey)
            // Session points at an identity no stored key is bound to.
            f.storageDriver.saveActiveSession("deleted-identity")

            f.client.initialize()

            assertEquals(ClientState.READY, f.client.eventService.state.value)
            assertEquals(keyPair.publicKey, f.client.currentKeyPair!!.publicKey)
            // sessionKey is null -> activeIdentityKey null, no crash.
            assertNull(f.client.activeIdentityKey)
        }

    @Test
    fun `hydration failure fails hydration and rethrows from initialize`() =
        runTest {
            val core = FakeCore { copyEventsError = RuntimeException("hydration exploded") }
            val f = makeClient { this.core = core }

            val thrown = runCatching { f.client.initialize() }.exceptionOrNull()

            assertEquals(ClientState.ERROR, f.client.eventService.state.value)
            assertEquals(HydrationStatus.FAILED, f.client.eventService.hydrationStatus.value)
            assertTrue("expected the hydration error, got $thrown", thrown?.message == "hydration exploded")
        }

    @Test
    fun `later step failure leaves hydration COMPLETED and fails the client`() =
        runTest {
            val core = FakeCore { setServersError = RuntimeException("server refresh exploded") }
            val f = makeClient { this.core = core }

            val thrown = runCatching { f.client.initialize() }.exceptionOrNull()

            assertEquals(ClientState.ERROR, f.client.eventService.state.value)
            // The distinction is deliberate: hydration itself finished.
            assertEquals(HydrationStatus.COMPLETED, f.client.eventService.hydrationStatus.value)
            assertTrue("expected the refresh error, got $thrown", thrown?.message == "server refresh exploded")
        }

    @Test
    fun `awaitReady resolves on READY and throws the init failure on ERROR`() =
        runTest {
            val ready = makeClient()
            ready.client.initialize()
            withTimeout(1_000) { ready.client.awaitReady() } // returns instead of suspending forever

            val failed = makeClient { core = FakeCore { copyEventsError = RuntimeException("boom") } }
            val thrown = runCatching { failed.client.initialize() }.exceptionOrNull()
            val awaitThrown = runCatching { failed.client.awaitReady() }.exceptionOrNull()
            // Throws the init failure instead of suspending forever.
            assertTrue("expected the init failure, got $awaitThrown", awaitThrown?.message == "boom")
            assertTrue(thrown != null)
        }

    @Test
    fun `initialize replays stored events and contents into the core`() =
        runTest {
            val events = makeStream(signerA, identityA, Collections.FEED, count = 2, label = "seeded")
            val content = makeContent("stored")
            val f =
                makeClient {
                    this.events = events
                    this.contents = listOf(buildDigest(content) to content)
                }
            f.client.initialize()

            // Every stored event was replayed (1 call with all events).
            assertEquals(1, f.core.copyEventsCalls.size)
            assertEquals(events.map { SignedEvent.ADAPTER.encode(it) }.map { it.toList() }, f.core.copyEventsCalls[0].map { it.toList() })
            // Every stored content was replayed with its digest bytes.
            assertEquals(1, f.core.copyContentsCalls.size)
            assertEquals(
                f.storageDriver.contentRepository
                    .getAll()
                    .size,
                f.core.copyContentsCalls[0].size,
            )
        }

    @Test
    fun `state flows deliver current values to late subscribers`() =
        runTest {
            val f = makeClient()
            f.client.initialize()

            // A subscriber that arrives after initialize still sees the final values.
            assertEquals(
                ClientState.READY,
                f.client.eventService.state
                    .first { it == ClientState.READY },
            )
            assertEquals(
                InitializationStep.COMPLETE,
                f.client.eventService.progress
                    .first { it == InitializationStep.COMPLETE },
            )
            assertEquals(
                HydrationStatus.COMPLETED,
                f.client.eventService.hydrationStatus
                    .first { it == HydrationStatus.COMPLETED },
            )
            assertFalse(f.client.eventService.state.value == ClientState.UNINITIALIZED)
        }
}
