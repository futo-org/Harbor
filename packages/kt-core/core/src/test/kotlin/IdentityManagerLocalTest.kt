package org.futo.polycentric.core

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import polycentric.v2.Content
import polycentric.v2.Event
import polycentric.v2.Identity
import polycentric.v2.ServerList

/**
 * `IdentityManager.getCurrent()` reads the core's resolved head (stubbed by
 * the fake core), and `publish()` validates its bootstrap arguments before
 * any core call — both testable with the sync fakes.
 */
class IdentityManagerLocalTest {
    private val signerA = makeSigner(1)
    private val identityA = makeIdentity(listOf(signerA), listOf(makeSigner(2)))

    private fun clientResolving(doc: Identity?) =
        makeClient {
            identity = identityA
            signer = signerA
            core = FakeCore { resolveIdentityResponse = doc?.let { Identity.ADAPTER.encode(it) } }
        }

    @Test
    fun `getCurrent returns the core's resolved head for the active identity`() =
        runTest {
            val head = Identity(rotation_keys = listOf(signerA.publicKey), servers = ServerList(urls = listOf("https://late")))
            val f = clientResolving(head)

            val state = f.client.identityManager.getCurrent()

            assertEquals(identityA.key, state.identityKey)
            assertEquals(head.rotation_keys, state.rotationKeys)
            assertEquals(listOf("https://late"), state.servers)
        }

    @Test
    fun `getCurrent without a valid chain returns an empty state`() =
        runTest {
            // The local store has identityA's genesis, but the core resolves no valid chain.
            val f = clientResolving(null)

            val state = f.client.identityManager.getCurrent()

            assertNull(state.identityKey)
            assertEquals(emptyList<Any>(), state.rotationKeys)
        }

    @Test
    fun `getCurrent with no active identity returns an empty state`() =
        runTest {
            val doc = Identity.ADAPTER.encode(Identity(rotation_keys = listOf(signerA.publicKey)))
            val f =
                makeClient {
                    otherIdentities = listOf(identityA) // seeded but NOT active
                    core = FakeCore { resolveIdentityResponse = doc }
                }

            val state = f.client.identityManager.getCurrent()

            assertNull(state.identityKey)
            assertEquals(emptyList<Any>(), state.rotationKeys)
            assertEquals(emptyList<Any>(), state.signingKeys)
            assertNull(state.servers)
        }

    @Test
    fun `servers null vs intentionally empty are preserved as distinct`() =
        runTest {
            val unset = clientResolving(Identity(rotation_keys = listOf(signerA.publicKey)))
            val empty = clientResolving(Identity(rotation_keys = listOf(signerA.publicKey), servers = ServerList(urls = emptyList())))

            val unsetState = unset.client.identityManager.getCurrent()
            val emptyState = empty.client.identityManager.getCurrent()

            // "never configured" (null) vs "intentionally empty".
            assertNull(unsetState.servers)
            assertNotNull(emptyState.servers)
            assertEquals(emptyList<String>(), emptyState.servers)
        }

    @Test
    fun `bootstrap publish validation rejects bad key configurations`() =
        runTest {
            val f = makeClient { signer = signerA }

            // Signing keys present:
            val e1 =
                runCatching {
                    f.client.identityManager.publish(null, listOf(signerA.publicKey), listOf(makeSigner(7).publicKey))
                }.exceptionOrNull()
            assertTrue("expected PolycentricException, got $e1", e1 is PolycentricException)

            // Rotation key != current key:
            val e2 = runCatching { f.client.identityManager.publish(null, listOf(makeSigner(7).publicKey), emptyList()) }.exceptionOrNull()
            assertTrue("expected PolycentricException, got $e2", e2 is PolycentricException)

            // != 1 rotation key:
            val e3 =
                runCatching {
                    f.client.identityManager.publish(null, listOf(signerA.publicKey, makeSigner(7).publicKey), emptyList())
                }.exceptionOrNull()
            assertTrue("expected PolycentricException, got $e3", e3 is PolycentricException)
        }

    @Test
    fun `bootstrap publish derives the identity key as hex sha256 of the doc`() =
        runTest {
            val f = makeClient { signer = signerA }

            val result = f.client.identityManager.publish(null, listOf(signerA.publicKey), emptyList())

            val doc = Identity(rotation_keys = listOf(signerA.publicKey))
            assertEquals(
                sha256Hex(
                    polycentric.v2.Identity.ADAPTER
                        .encode(doc),
                ),
                result.identityKey,
            )
            assertEquals(result.identityKey, f.client.activeIdentityKey)
        }

    @Test
    fun `bootstrap publish saves the document and adopts its servers`() =
        runTest {
            val f = makeClient { signer = signerA }

            val result = f.client.identityManager.publish(null, listOf(signerA.publicKey), emptyList(), servers = listOf("https://home"))

            assertEquals(listOf("https://home"), f.client.servers)
            // The published event and its document round-tripped through the local repos.
            val saved = f.eventRepository.saved.single()
            assertEquals(result.signedEvent, saved)
            val digest = Event.ADAPTER.decode(saved.event_bytes).content_digest!!
            val doc = Content.ADAPTER.decode(f.contentRepository.get(digest)!!).identity!!
            assertEquals(listOf("https://home"), doc.servers?.urls)
        }
}
