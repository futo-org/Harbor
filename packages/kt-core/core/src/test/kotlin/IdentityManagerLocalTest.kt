package org.futo.polycentric.core

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import polycentric.v2.Content
import polycentric.v2.Identity
import polycentric.v2.ServerList

/**
 * `IdentityManager.getCurrent()` is pure local logic over the local repos
 * (no core calls), and `publish()` validates its bootstrap arguments before
 * any core call — both testable with the sync fakes.
 */
class IdentityManagerLocalTest {
    private val signerA = makeSigner(1)
    private val identityA = makeIdentity(listOf(signerA), listOf(makeSigner(2)))

    @Test
    fun `getCurrent picks the highest sequence identity document`() =
        runTest {
            // Two identity docs for identityA: seq 1 (no servers) and seq 2 (servers).
            val doc2 = Identity(rotation_keys = listOf(signerA.publicKey), servers = ServerList(urls = listOf("https://late")))
            val content2 = Content(identity = doc2)
            val event2 =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.IDENTITY,
                        sequence = 2,
                        content = content2,
                    ),
                )
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                    contents = listOf(buildDigest(content2) to content2)
                    events = listOf(event2)
                }

            val state = f.client.identityManager.getCurrent()

            assertEquals(identityA.key, state.identityKey)
            assertEquals(listOf("https://late"), state.servers)
        }

    @Test
    fun `getCurrent ignores other collections other identities and contentless events`() =
        runTest {
            // A FEED event (wrong collection) and an identity doc whose content
            // has no identity body are both ignored.
            val feedEvent =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = makeContent("not identity"),
                    ),
                )
            val noDigestSigned =
                makeIdentityDocEvent(identityA.key, signerA, sequence = 5, content = Content()) // content without identity

            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                    events = listOf(feedEvent, noDigestSigned)
                }

            val state = f.client.identityManager.getCurrent()

            // Only the seeded identity doc (identityContents) resolves.
            assertEquals(identityA.key, state.identityKey)
            assertNull(state.servers)
            assertTrue(state.rotationKeys.isNotEmpty())
        }

    @Test
    fun `getCurrent with no active identity returns an empty state`() =
        runTest {
            val f = makeClient { otherIdentities = listOf(identityA) } // seeded but NOT active

            val state = f.client.identityManager.getCurrent()

            assertNull(state.identityKey)
            assertEquals(emptyList<Any>(), state.rotationKeys)
            assertEquals(emptyList<Any>(), state.signingKeys)
            assertNull(state.servers)
        }

    @Test
    fun `servers null vs intentionally empty are preserved as distinct`() =
        runTest {
            val emptyDoc = Identity(rotation_keys = listOf(signerA.publicKey), servers = ServerList(urls = emptyList()))
            val emptyContent = Content(identity = emptyDoc)
            val emptyEvent =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.IDENTITY,
                        sequence = 3,
                        content = emptyContent,
                    ),
                )
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                    contents = listOf(buildDigest(emptyContent) to emptyContent)
                    events = listOf(emptyEvent)
                }

            val state = f.client.identityManager.getCurrent()

            // "intentionally empty", NOT "never configured" (null).
            assertNotNull(state.servers)
            assertEquals(emptyList<String>(), state.servers)
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
    fun `after publish getCurrent sees the new document`() =
        runTest {
            val f = makeClient { signer = signerA }

            f.client.identityManager.publish(null, listOf(signerA.publicKey), emptyList(), servers = listOf("https://home"))

            val state = f.client.identityManager.getCurrent()
            assertEquals(f.client.activeIdentityKey, state.identityKey)
            assertEquals(listOf("https://home"), state.servers)
            // The published event round-tripped through the local repos.
            assertTrue(f.eventRepository.saved.isNotEmpty())
        }

    private fun makeIdentityDocEvent(
        identityKey: String,
        signer: TestSigner,
        sequence: Long,
        content: Content,
    ): polycentric.v2.SignedEvent =
        makeSignedEvent(
            MakeEventArgs(
                signer = signer,
                identity = identityKey,
                collection = Collections.IDENTITY,
                sequence = sequence,
                content = content,
            ),
        )
}
