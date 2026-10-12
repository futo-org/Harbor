package org.futo.polycentric.core

import kotlinx.coroutines.test.runTest
import okio.ByteString.Companion.toByteString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import polycentric.v2.Content
import polycentric.v2.Event
import polycentric.v2.EventProofTarget
import polycentric.v2.Identity
import polycentric.v2.RevocationBound
import polycentric.v2.ServerList
import polycentric.v2.SignedEvent

/**
 * Identity updates (key/server changes and claims) tests
 */
class IdentityManagerUpdateTest {
    private val rotationSigner = makeSigner(1)
    private val signingSigner = makeSigner(2)
    private val revokedSigner = makeSigner(3)
    private val recoverySigner = makeSigner(4)
    private val identityA = makeIdentity(listOf(rotationSigner), listOf(signingSigner))

    /** A later head document with a recovery key and a revocation bound. */
    private val head =
        Identity(
            rotation_keys = listOf(rotationSigner.publicKey),
            signing_keys = listOf(signingSigner.publicKey),
            revocation_bounds =
                listOf(
                    RevocationBound(
                        revoked_key = revokedSigner.publicKey,
                        targets =
                            listOf(
                                EventProofTarget(
                                    collection = Collections.FEED,
                                    signature = ByteArray(64) { 9 }.toByteString(),
                                    root = ByteArray(32) { 8 }.toByteString(),
                                    leaf_count = 3,
                                ),
                            ),
                    ),
                ),
            servers = ServerList(urls = listOf("https://issuer")),
            recovery_key = recoverySigner.publicKey,
        )
    private val headContent = Content(identity = head)
    private val headEvent =
        makeSignedEvent(
            MakeEventArgs(
                signer = rotationSigner,
                identity = identityA.key,
                collection = Collections.IDENTITY,
                sequence = 2,
                content = headContent,
            ),
        )

    /** A client signed in to identityA as [signer], with [head] as its head. */
    private fun activeClient(signer: TestSigner = rotationSigner) =
        makeClient {
            identity = identityA
            this.signer = signer
            core = FakeCore { resolveIdentityResponse = Identity.ADAPTER.encode(head) }
            contents = listOf(buildDigest(headContent) to headContent)
            events = listOf(headEvent)
        }

    /** A client with no active identity, signed in as [signer]. */
    private fun claimerClient(
        signer: TestSigner,
        configure: FakeCoreOptions.() -> Unit,
    ) = makeClient {
        this.signer = signer
        core = FakeCore(configure)
        servers = listOf("https://default")
    }

    private suspend fun ClientFixture.publishedDocument(signedEvent: SignedEvent): Identity {
        val digest = Event.ADAPTER.decode(signedEvent.event_bytes).content_digest!!
        return Content.ADAPTER.decode(contentRepository.get(digest)!!).identity!!
    }

    private fun assertCarriedForward(doc: Identity) {
        assertEquals(head.revocation_bounds, doc.revocation_bounds)
        assertEquals(head.recovery_key, doc.recovery_key)
    }

    @Test
    fun `getCurrent includes revocation bounds and recovery key`() =
        runTest {
            val state = activeClient().client.identityManager.getCurrent()

            assertEquals(head.revocation_bounds, state.revocationBounds)
            assertEquals(head.recovery_key, state.recoveryKey)
        }

    @Test
    fun `addSigningKey keeps revocation bounds and recovery key`() =
        runTest {
            val f = activeClient()
            val newKey = makeSigner(7).publicKey

            val doc = f.publishedDocument(f.client.identityManager.addSigningKey(newKey))

            assertEquals(head.signing_keys + newKey, doc.signing_keys)
            assertCarriedForward(doc)
        }

    @Test
    fun `addRotationKey keeps revocation bounds and recovery key`() =
        runTest {
            val f = activeClient()
            val newKey = makeSigner(7).publicKey

            val doc = f.publishedDocument(f.client.identityManager.addRotationKey(newKey))

            assertEquals(head.rotation_keys + newKey, doc.rotation_keys)
            assertCarriedForward(doc)
        }

    @Test
    fun `addServer keeps revocation bounds and recovery key`() =
        runTest {
            val f = activeClient()

            val doc = f.publishedDocument(f.client.identityManager.addServer("https://new"))

            assertEquals(listOf("https://issuer", "https://new"), doc.servers?.urls)
            assertCarriedForward(doc)
        }

    @Test
    fun `removeServer keeps revocation bounds and recovery key`() =
        runTest {
            val f = activeClient()

            val doc = f.publishedDocument(f.client.identityManager.removeServer("https://issuer"))

            assertEquals(emptyList<String>(), doc.servers?.urls)
            assertCarriedForward(doc)
        }

    @Test
    fun `updates signed by a non-rotation key are rejected`() =
        runTest {
            val f = activeClient(signer = signingSigner)

            val e = runCatching { f.client.identityManager.addSigningKey(makeSigner(7).publicKey) }.exceptionOrNull()

            assertTrue("expected UnauthorizedKeyException, got $e", e is UnauthorizedKeyException)
            assertTrue(f.eventRepository.saved.isEmpty())
        }

    @Test
    fun `bootstrap publish rejects revocation bounds`() =
        runTest {
            val f = makeClient { signer = rotationSigner }

            val e =
                runCatching {
                    f.client.identityManager.publish(
                        null,
                        listOf(rotationSigner.publicKey),
                        emptyList(),
                        revocationBounds = head.revocation_bounds,
                    )
                }.exceptionOrNull()

            assertTrue("expected PolycentricException, got $e", e is PolycentricException)
        }

    @Test
    fun `claim as a signing key republishes the head document unchanged`() =
        runTest {
            val f = claimerClient(signingSigner) { resolveIdentityResponse = Identity.ADAPTER.encode(head) }

            val state = f.client.identityManager.claim(identityA.key, servers = listOf("https://issuer"))

            assertEquals(identityA.key, f.client.activeIdentityKey)
            assertEquals(head.recovery_key, state.recoveryKey)
            assertEquals(listOf("https://issuer"), f.client.servers)
            // The given servers were adopted before hydrating the identity chain.
            assertEquals(listOf("https://issuer"), f.core.setServersCalls.first())
            val hydration = f.core.pullQueryArgs.first()
            assertEquals(Collections.IDENTITY, hydration.collection)

            val published = f.eventRepository.saved.single()
            val event = Event.ADAPTER.decode(published.event_bytes)
            assertEquals(signingSigner.publicKey, event.key?.signed_by)
            assertEquals(head, f.publishedDocument(published))
        }

    @Test
    fun `claim without authorization leaves the active identity and servers unchanged`() =
        runTest {
            val other = head.copy(signing_keys = emptyList())
            val f = claimerClient(signingSigner) { resolveIdentityResponse = Identity.ADAPTER.encode(other) }

            val e = runCatching { f.client.identityManager.claim(identityA.key, servers = listOf("https://issuer")) }.exceptionOrNull()

            assertTrue("expected UnauthorizedKeyException, got $e", e is UnauthorizedKeyException)
            assertNull(f.client.activeIdentityKey)
            assertEquals(listOf("https://default"), f.client.servers)
            assertEquals(listOf("https://default"), f.core.setServersCalls.last())
            assertTrue(f.eventRepository.saved.isEmpty())
        }

    @Test
    fun `claim that loses authorization after adopting rolls back`() =
        runTest {
            val revoked = Identity.ADAPTER.encode(head.copy(signing_keys = emptyList()))
            lateinit var core: FakeCore
            val f =
                claimerClient(signingSigner) {
                    resolveIdentityResponse = Identity.ADAPTER.encode(head)
                    // The pull after adopting brings in a document that drops our key.
                    pullBundles = { args ->
                        if (args.collection == null) core.options.resolveIdentityResponse = revoked
                        emptyList()
                    }
                }
            core = f.core

            val e = runCatching { f.client.identityManager.claim(identityA.key, servers = listOf("https://issuer")) }.exceptionOrNull()

            assertTrue("expected UnauthorizedKeyException, got $e", e is UnauthorizedKeyException)
            assertNull(f.client.activeIdentityKey)
            assertEquals(listOf("https://default"), f.client.servers)
            assertTrue(f.eventRepository.saved.isEmpty())
        }
}
