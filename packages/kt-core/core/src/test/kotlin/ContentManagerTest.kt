package org.futo.polycentric.core

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import polycentric.v2.Blob
import polycentric.v2.Content
import polycentric.v2.ContentDigest
import polycentric.v2.ContentDigestType
import polycentric.v2.Image
import polycentric.v2.ImageSet
import polycentric.v2.Post
import polycentric.v2.ProfileUpdate

/**
 * Client-local content logic: digest construction, blob collection, and the
 * best-effort blob pull (`pullBlobs`). Uses the MockWebServer.
 */
class ContentManagerTest {
    private val signerA = makeSigner(1)
    private val identityA = makeIdentity(listOf(signerA), listOf(makeSigner(2)))

    @Test
    fun `collectBlobs gathers post images and profile avatar banner`() {
        val blob1 = makeBlob(byteArrayOf(1))
        val blob2 = makeBlob(byteArrayOf(2))
        val blob3 = makeBlob(byteArrayOf(3))

        val post =
            Content(
                post =
                    Post(
                        text = "with images",
                        images =
                            listOf(
                                ImageSet(images = listOf(Image(blob = blob1), Image())), // image without blob
                                ImageSet(images = listOf(Image(blob = blob2))),
                            ),
                    ),
            )
        assertEquals(listOf(blob1, blob2), ContentManager.collectBlobs(post))

        val profile =
            Content(
                profile_update =
                    ProfileUpdate(
                        avatar = ImageSet(images = listOf(Image(blob = blob3))),
                        banner = ImageSet(images = listOf(Image(blob = blob2))),
                    ),
            )
        assertEquals(listOf(blob3, blob2), ContentManager.collectBlobs(profile))

        // Null-safety: no post / no profile / empty content.
        assertEquals(emptyList<Blob>(), ContentManager.collectBlobs(Content()))
        assertEquals(emptyList<Blob>(), ContentManager.collectBlobs(makeContent("text only")))
    }

    @Test
    fun `buildDigest is sha256 over the serialized content and deterministic`() {
        val content = makeContent("digest me")

        val f =
            makeClient {
                identity = identityA
                signer = signerA
            }
        val digest = f.client.contentManager.buildDigest(content)
        assertEquals(ContentDigestType.CONTENT_DIGEST_TYPE_SHA256, digest.type)
        assertArrayEquals(sha256(Content.ADAPTER.encode(content)), digest.value_.toByteArray())
        assertEquals(digest, f.client.contentManager.buildDigest(content))
        assertEquals(digest, buildDigest(content))
    }

    @Test
    fun `pullBlobs skips present blobs fetches and stores missing ones`() =
        runTest {
            val presentBlob = makeBlob(byteArrayOf(1, 1))
            val missingBlob = makeBlob(byteArrayOf(2, 2))
            val server =
                MockWebServer().apply {
                    dispatcher =
                        object : Dispatcher() {
                            override fun dispatch(request: RecordedRequest): MockResponse {
                                val path = request.path?.removePrefix("/") ?: ""
                                return if (path.endsWith(presentBlob.digest!!.value_.hex())) {
                                    MockResponse().apply { setResponseCode(500) } // must never be hit
                                } else {
                                    MockResponse().apply {
                                        setResponseCode(200)
                                        setBody(okio.Buffer().write(byteArrayOf(9, 9)))
                                    }
                                }
                            }
                        }
                    start()
                }
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                    fileStore = FakeFileStore(listOf(requireNotNull(presentBlob.digest) to byteArrayOf(1, 1)))
                    servers = listOf(server.url("/").toString().trimEnd('/'))
                }

            f.client.contentManager.pullBlobs(listOf(presentBlob, missingBlob))

            assertEquals(1, server.requestCount)
            assertTrue(f.fileStore.has(requireNotNull(missingBlob.digest)))
            server.shutdown()
        }

    @Test
    fun `pullBlobs absorbs per blob failures and fetches the rest`() =
        runTest {
            val goodBlob = makeBlob(byteArrayOf(1))
            val badBlob = makeBlob(byteArrayOf(2))
            val server =
                MockWebServer().apply {
                    dispatcher =
                        object : Dispatcher() {
                            override fun dispatch(request: RecordedRequest): MockResponse =
                                if (request.path?.contains(badBlob.digest!!.value_.hex()) == true) {
                                    MockResponse().apply { setResponseCode(500) }
                                } else {
                                    MockResponse().apply {
                                        setResponseCode(200)
                                        setBody(okio.Buffer().write(byteArrayOf(7)))
                                    }
                                }
                        }
                    start()
                }
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                    servers = listOf(server.url("/").toString().trimEnd('/'))
                }

            f.client.contentManager.pullBlobs(listOf(badBlob, goodBlob))

            // The remaining blob still landed despite the failing sibling.
            assertTrue(f.fileStore.has(requireNotNull(goodBlob.digest)))
            assertFalse(f.fileStore.has(requireNotNull(badBlob.digest)))
            server.shutdown()
        }

    @Test
    fun `pullBlobs rethrows cancellation instead of absorbing it`() =
        runTest {
            val fastBlob = makeBlob(byteArrayOf(1))
            val poisonBlob = makeBlob(byteArrayOf(2))
            val poisonDigest = requireNotNull(poisonBlob.digest)
            val server =
                MockWebServer().apply {
                    dispatcher =
                        object : Dispatcher() {
                            override fun dispatch(request: RecordedRequest): MockResponse =
                                MockResponse().apply {
                                    setResponseCode(200)
                                    setBody(okio.Buffer().write(byteArrayOf(3)))
                                }
                        }
                    start()
                }
            // The file store throws CancellationException only when saving the
            // poisoned blob — the one CancellationException sibling runCatching
            // must NOT absorb (audit-P2 pin).
            val fileStore =
                object : FakeFileStore() {
                    override suspend fun put(
                        digest: ContentDigest,
                        bytes: ByteArray,
                    ) {
                        if (digestKey(digest) == digestKey(poisonDigest)) throw CancellationException("cancelled")
                        super.put(digest, bytes)
                    }
                }
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                    this.fileStore = fileStore
                    servers = listOf(server.url("/").toString().trimEnd('/'))
                }

            val thrown = runCatching { f.client.contentManager.pullBlobs(listOf(fastBlob, poisonBlob)) }.exceptionOrNull()

            assertTrue("expected CancellationException, got $thrown", thrown is CancellationException)
            // awaitAll waited for the sibling too, so the fast blob landed.
            assertTrue(f.fileStore.has(requireNotNull(fastBlob.digest)))
            server.shutdown()
        }

    @Test
    fun `keyPairChanged payload carries no private key material`() =
        runTest {
            val f = makeClient { signer = signerA }
            val emissions = mutableListOf<KeyPairChangedPayload?>()
            val collector =
                launch {
                    f.client.eventService.keyPairChanged
                        .collect { emissions.add(it) }
                }
            yield()

            f.client.eventService.emitKeyPairChanged(
                StoredKeyPair(KeyTypes.ED25519, signerA.publicKey.key.toByteArray(), signerA.privateKey),
                identityA.key,
            )
            yield()
            collector.cancelAndJoin()

            val payload = emissions.last()
            assertNotNull(payload)
            // Only keyType / publicKey / identityKey — the secret-stripping pin.
            assertEquals(KeyTypes.ED25519, payload!!.keyType)
            assertEquals(
                signerA.publicKey.key
                    .toByteArray()
                    .toList(),
                payload.publicKey.toList(),
            )
            assertEquals(identityA.key, payload.identityKey)
        }
}
