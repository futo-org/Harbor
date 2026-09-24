package org.futo.polycentric.core

import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okio.Buffer
import okio.ByteString.Companion.toByteString
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import polycentric.v2.Blob
import polycentric.v2.Content
import polycentric.v2.Event
import polycentric.v2.EventBundle
import polycentric.v2.EventKey
import polycentric.v2.PutEventError
import polycentric.v2.SerializedContent
import polycentric.v2.SignedEvent
import polycentric.v2.UploadBlobRequest

/**
 * Port of js-core `polycentric-client.sync.test.ts` (the 37 `it` cases in 8
 * describe groups; vitest → JUnit 4 + runTest).
 *
 * Known divergences honored while porting (divergences.md):
 *  - a failed pull throws [CoreFailureException] (the core's `awaitQuery`
 *    reports an all-servers-Error status as `CoreException.Network`, folded
 *    by `coreCall`) instead of js-core's first-per-server-error rejection;
 *  - `trySaveBundle` runs `core.verifySignedEvent` before persisting (the
 *    fake no-ops it); the structural guards are what these tests exercise;
 *  - `sync()` swallows per-server push failures (log-only, js-parity) — the
 *    tests pin that behavior rather than "improve" it;
 *  - blob tests drive the client's REAL OkHttp path through MockWebServer
 *    (js-core mocked `client.fetchBlobBytes` directly); response bodies are
 *    selected per request path via a Dispatcher so fetch order is
 *    irrelevant, and the on-disk/URL digest-key convention
 *    (`"${type.value}_${hex}"`) is pinned by asserting request paths.
 */
class PolycentricClientSyncTest {
    // ── Shared fixtures (js-core:564-568) ──────────────────────────────

    private val signerA = makeSigner(1)
    private val signerB = makeSigner(2)
    private val signerOther = makeSigner(9)

    // signerA rotates, signerB signs.
    private val identityA = makeIdentity(listOf(signerA), listOf(signerB))
    private val identityB = makeIdentity(listOf(signerOther))

    /** The `ListEventsArgs` the client passed to its Nth pull query. */
    private fun pullQueryArgs(
        core: FakeCore,
        callIndex: Int = 0,
    ): org.futo.polycentric.ffi.ListEventsArgs = core.pullQueryArgs[callIndex]

    /** Signer public-key hex, for grouping heads by stream. */
    private val TestSigner.hexKey: String
        get() = publicKey.key.hex()

    private fun headStream(head: org.futo.polycentric.ffi.EventKey): String = "${head.collection}|${head.signedBy.key.hex()}"

    /** Serve GET /blob/<key> bodies keyed by path, so fetch order never matters. A null body models a server error (500). */
    private fun blobServer(routes: Map<String, ByteArray?>): MockWebServer =
        MockWebServer().apply {
            dispatcher =
                object : Dispatcher() {
                    override fun dispatch(request: RecordedRequest): MockResponse {
                        val path = request.path?.removePrefix("/") ?: ""
                        val bytes = routes[path]
                        return if (bytes == null) {
                            MockResponse().apply { setResponseCode(500) }
                        } else {
                            MockResponse().apply {
                                setResponseCode(200)
                                setBody(Buffer().write(bytes))
                            }
                        }
                    }
                }
            start()
        }

    // ── simple scope (one server, one identity, one signer) ────────────

    @Test
    fun `full pull persists new events plus content and returns the new count`() =
        runTest {
            val content = makeContent("hello")
            val remote =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = content,
                    ),
                )
            val core = FakeCore { pullBundles = { listOf(makeBundle(remote, content)) } }
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                }

            val count = f.client.pull(false)

            assertEquals(1, count)
            // The exact event is persisted under its key.
            val event = Event.ADAPTER.decode(remote.event_bytes)
            assertEquals(remote, f.eventRepository.getByEventKey(requireNotNull(event.key)))
            // The exact content is persisted under the event's content digest.
            assertArrayEquals(
                Content.ADAPTER.encode(content),
                f.contentRepository.get(requireNotNull(event.content_digest)),
            )
            // Full pull => no heads filter (the client sends null when empty).
            assertNull(pullQueryArgs(core).heads)
            assertEquals(identityA.key, pullQueryArgs(core).identity)
        }

    @Test
    fun `partial pull sends the stored heads as a filter`() =
        runTest {
            // Contiguous sequences 1..3; the head is the highest (3).
            val seeded =
                makeStream(signerA, identityA, Collections.FEED, count = 3, label = "seeded")
            val core = FakeCore { pullBundles = { emptyList() } }
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                    events = seeded
                }

            f.client.pull(true)

            val heads = requireNotNull(pullQueryArgs(core).heads)
            // The FEED stream head (seq 3) plus the seeded IDENTITY stream head (seq 1).
            assertEquals(2, heads.size)
            val byStream = heads.associateBy({ headStream(it) }, { it })
            val feedHead = byStream.getValue("${Collections.FEED}|${signerA.hexKey}")
            assertEquals(identityA.key, feedHead.identity)
            assertEquals(3L, feedHead.sequence.toLong())
            val identityHead = byStream.getValue("${Collections.IDENTITY}|${signerA.hexKey}")
            assertEquals(1L, identityHead.sequence.toLong())
        }

    @Test
    fun `full push calls pushLocalEvents once with partial false and pulls nothing`() =
        runTest {
            val core = FakeCore()
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                }

            val count = f.client.sync(SyncStrategy.FULL_PUSH)

            assertEquals(0, count)
            assertTrue(core.pullQueryArgs.isEmpty())
            assertEquals(1, core.pushCalls.size)
            assertEquals(Triple(identityA.key, "http://server-1", false), core.pushCalls[0])
        }

    @Test
    fun `partial push calls pushLocalEvents with partial true`() =
        runTest {
            val core = FakeCore()
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                }

            f.client.sync(SyncStrategy.PARTIAL_PUSH)

            assertEquals(Triple(identityA.key, "http://server-1", true), core.pushCalls[0])
        }

    @Test
    fun `trySaveContent dedups by digest`() =
        runTest {
            val content = makeContent("dup")
            val digest = buildDigest(content)
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                    contents = listOf(digest to content)
                }
            val event = Event(content_digest = digest)
            val bundle =
                makeBundle(
                    makeSignedEvent(
                        MakeEventArgs(
                            signer = signerA,
                            identity = identityA,
                            collection = Collections.FEED,
                            sequence = 1,
                            content = content,
                        ),
                    ),
                    content,
                )

            val blobs = mutableMapOf<String, Blob>()
            val added = f.client.trySaveContent(event, bundle, blobs)

            assertFalse(added)
            assertTrue(f.contentRepository.saved.isEmpty())
        }

    @Test
    fun `a failed pull propagates out of sync`() =
        runTest {
            // Divergence: the core's awaitQuery throws CoreException when every
            // server reports Error (folded into CoreFailureException by
            // coreCall), instead of js-core's first-server rejection.
            val core = FakeCore { pullError = "server exploded" }
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                }

            val thrown = runCatching { f.client.sync(SyncStrategy.FULL_PULL) }.exceptionOrNull()

            assertTrue("expected CoreFailureException, got $thrown", thrown is CoreFailureException)
            assertTrue(thrown!!.message!!.contains("server exploded"))
        }

    // ── combined push + pull (PARTIAL and FULL do both) ────────────────

    @Test
    fun `sync FULL pushes with partial false and pulls with no heads returning the pull count`() =
        runTest {
            val content = makeContent("full-combined")
            val pulled =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = content,
                    ),
                )
            val core = FakeCore { pullBundles = { listOf(makeBundle(pulled, content)) } }
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                }

            val count = f.client.sync(SyncStrategy.FULL)

            assertEquals(1, count)
            assertEquals(Triple(identityA.key, "http://server-1", false), core.pushCalls[0])
            assertEquals(1, core.pullQueryArgs.size)
            assertNull(pullQueryArgs(core).heads)
        }

    @Test
    fun `sync PARTIAL pushes with partial true and pulls with stored heads`() =
        runTest {
            // Contiguous sequences 1..5; the head is the highest (5).
            val seeded =
                makeStream(signerA, identityA, Collections.FEED, count = 5, label = "seeded")
            val core = FakeCore { pullBundles = { emptyList() } }
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                    events = seeded
                }

            f.client.sync(SyncStrategy.PARTIAL)

            assertEquals(Triple(identityA.key, "http://server-1", true), core.pushCalls[0])
            val heads = requireNotNull(pullQueryArgs(core).heads)
            // The FEED stream head (seq 5) plus the seeded IDENTITY stream head (seq 1).
            assertEquals(2, heads.size)
            val feedHead = heads.first { it.collection == Collections.FEED && it.signedBy.key.hex() == signerA.hexKey }
            assertEquals(5L, feedHead.sequence.toLong())
        }

    /** js-core swallows per-server push failures; Kotlin `sync` captures them and
     *  rethrows the first one AFTER the pull completes (PolycentricClient.sync).
     *  This test pins that: the pull is not cancelled and its events persist,
     *  but the push failure still surfaces. */
    @Test
    fun `a push failure is rethrown after the pull completes`() =
        runTest {
            val content = makeContent("survives")
            val pulled =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = content,
                    ),
                )
            val core =
                FakeCore {
                    pullBundles = { listOf(makeBundle(pulled, content)) }
                    pushResponse = { _, _, _ -> throw RuntimeException("push down") }
                }
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                }

            val thrown = runCatching { f.client.sync(SyncStrategy.FULL) }.exceptionOrNull()

            // The pull completed and persisted its events before the push error surfaced.
            assertTrue(f.eventRepository.getByEventKey(requireNotNull(Event.ADAPTER.decode(pulled.event_bytes).key)) != null)
            assertEquals("push down", (thrown as? RuntimeException)?.message)
        }

    @Test
    fun `a pull failure throws even when the push succeeds`() =
        runTest {
            val core =
                FakeCore {
                    pullError = "pull down"
                    pushResponse = { _, _, _ -> putEventsResponse() }
                }
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                }

            val thrown = runCatching { f.client.sync(SyncStrategy.FULL) }.exceptionOrNull()

            assertTrue("expected CoreFailureException, got $thrown", thrown is CoreFailureException)
            assertTrue(thrown!!.message!!.contains("pull down"))
        }

    // ── multi scope (multiple servers / signers / identities) ──────────

    private val multiServers =
        listOf("http://server-1", "http://server-2", "http://server-3")

    /**
     * Active identity (A) with deliberately uneven stream depths:
     *   (FEED, signerA)    -> 2 events  (seq 1,2)
     *   (PROFILE, signerA) -> 1 event   (seq 1)
     *   (FEED, signerB)    -> 3 events  (seq 1,2,3)
     *   (GRAPH, signerB)   -> 0 events  (empty stream)
     * Plus an unrelated identity B that must never be touched.
     */
    private fun seedMultiStore(): List<SignedEvent> =
        makeStream(signerA, identityA, Collections.FEED, count = 2, label = "a-feed") +
            makeStream(signerA, identityA, Collections.PROFILE, count = 1, label = "a-profile") +
            makeStream(signerB, identityA, Collections.FEED, count = 3, label = "b-feed") +
            // Unrelated identity B — different identity AND different signer.
            makeStream(signerOther, identityB, Collections.FEED, count = 2, label = "other")

    private fun makeMultiClient(core: FakeCore): ClientFixture =
        makeClient {
            this.core = core
            servers = multiServers
            identity = identityA
            otherIdentities = listOf(identityB)
            signer = signerA
            events = seedMultiStore()
        }

    @Test
    fun `full push targets every server with the active identity only`() =
        runTest {
            val core = FakeCore()
            val f = makeMultiClient(core)

            f.client.sync(SyncStrategy.FULL_PUSH)

            assertEquals(multiServers.size, core.pushCalls.size)
            for (server in multiServers) {
                assertTrue(
                    Triple(identityA.key, server, false) in core.pushCalls,
                )
            }
            // Never pushed for another identity.
            for (call in core.pushCalls) {
                assertEquals(identityA.key, call.first)
            }
        }

    @Test
    fun `pull requests only the active identity`() =
        runTest {
            val core = FakeCore { pullBundles = { emptyList() } }
            val f = makeMultiClient(core)

            f.client.sync(SyncStrategy.FULL_PULL)

            assertEquals(identityA.key, pullQueryArgs(core).identity)
        }

    @Test
    fun `partial pull derives exactly one head per non empty stream never cross wired`() =
        runTest {
            val core = FakeCore { pullBundles = { emptyList() } }
            val f = makeMultiClient(core)

            f.client.pull(true)

            val heads = requireNotNull(pullQueryArgs(core).heads)
            // 4 non-empty streams -> 4 heads: the 3 content streams plus the seeded
            // IDENTITY stream (GRAPH/signerB is empty and contributes none).
            assertEquals(4, heads.size)

            val byStream = heads.associateBy({ headStream(it) }, { it.sequence.toLong() })
            // Correct max sequence per stream, no cross-wiring.
            assertEquals(2L, byStream["${Collections.FEED}|${signerA.hexKey}"])
            assertEquals(1L, byStream["${Collections.PROFILE}|${signerA.hexKey}"])
            assertEquals(3L, byStream["${Collections.FEED}|${signerB.hexKey}"])
            assertEquals(1L, byStream["${Collections.IDENTITY}|${signerA.hexKey}"])
            // Empty stream contributes no head.
            assertFalse(byStream.containsKey("${Collections.GRAPH}|${signerB.hexKey}"))
            // Every head belongs to the active identity.
            for (head in heads) assertEquals(identityA.key, head.identity)
        }

    @Test
    fun `push only sync does not mutate the event store`() =
        runTest {
            val core = FakeCore()
            val f = makeMultiClient(core)
            val before = f.eventRepository.getAll().size

            f.client.sync(SyncStrategy.FULL_PUSH)

            assertTrue(f.eventRepository.saved.isEmpty())
            assertEquals(before, f.eventRepository.getAll().size)
        }

    @Test
    fun `newCount counts only genuinely new events existing ones are not re saved`() =
        runTest {
            val existingContent = makeContent("already-here")
            val existing =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = existingContent,
                    ),
                )
            val freshContent = makeContent("brand-new")
            val fresh =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerB,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = freshContent,
                    ),
                )
            val core =
                FakeCore {
                    pullBundles = { listOf(makeBundle(existing, existingContent), makeBundle(fresh, freshContent)) }
                }
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                    events = listOf(existing)
                }

            val count = f.client.pull(false)

            assertEquals(1, count) // only `fresh` is new
            // Only `fresh` is saved, and it is exactly `fresh`.
            assertEquals(listOf(fresh), f.eventRepository.saved)

            // `fresh` landed under its own key, paired with its own content — no swap.
            val freshEvent = Event.ADAPTER.decode(fresh.event_bytes)
            assertEquals(fresh, f.eventRepository.getByEventKey(requireNotNull(freshEvent.key)))
            assertArrayEquals(
                Content.ADAPTER.encode(freshContent),
                f.contentRepository.get(requireNotNull(freshEvent.content_digest)),
            )
            // `existing` is untouched (not overwritten with the wrong data).
            val existingEvent = Event.ADAPTER.decode(existing.event_bytes)
            assertEquals(existing, f.eventRepository.getByEventKey(requireNotNull(existingEvent.key)))
        }

    @Test
    fun `strategy matrix pull only never pushes push only never pulls`() =
        runTest {
            for (strategy in listOf(SyncStrategy.FULL_PULL, SyncStrategy.PARTIAL_PULL)) {
                val core = FakeCore { pullBundles = { emptyList() } }
                val f =
                    makeClient {
                        this.core = core
                        servers = multiServers
                        identity = identityA
                        signer = signerA
                    }
                f.client.sync(strategy)
                assertTrue(core.pushCalls.isEmpty())
                assertEquals(1, core.pullQueryArgs.size)
            }

            for (strategy in listOf(SyncStrategy.FULL_PUSH, SyncStrategy.PARTIAL_PUSH)) {
                val core = FakeCore { pullBundles = { emptyList() } }
                val f =
                    makeClient {
                        this.core = core
                        servers = multiServers
                        identity = identityA
                        signer = signerA
                    }
                val count = f.client.sync(strategy)
                assertEquals(0, count)
                assertTrue(core.pullQueryArgs.isEmpty())
                assertEquals(multiServers.size, core.pushCalls.size)
            }
        }

    // ── blobs ──────────────────────────────────────────────────────────

    @Test
    fun `full pull fetches missing referenced blobs skipping ones already present`() =
        runTest {
            val presentBytes = byteArrayOf(1, 1, 1, 1)
            val missingBytes = byteArrayOf(2, 2, 2, 2)
            val presentBlob = makeBlob(presentBytes, "image/png")
            val missingBlob = makeBlob(missingBytes, "image/jpeg")

            val content = makeContent("with-blobs", listOf(presentBlob, missingBlob))
            val event =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = content,
                    ),
                )
            val core = FakeCore { pullBundles = { listOf(makeBundle(event, content)) } }

            // The present blob is already in the local filestore.
            val fileStore = FakeFileStore(listOf(requireNotNull(presentBlob.digest) to presentBytes))
            val server =
                blobServer(
                    mapOf("blob/${digestKey(requireNotNull(missingBlob.digest))}" to missingBytes),
                )
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                    this.fileStore = fileStore
                    servers = listOf(server.url("/").toString().trimEnd('/'))
                }

            val count = f.client.pull(false)
            val path = server.takeRequest().path!!.removePrefix("/")

            assertEquals(1, count)
            // The only request is the missing blob's URL key (URL convention pinned)
            // and it is the one blob that got stored.
            assertEquals("blob/${digestKey(requireNotNull(missingBlob.digest))}", path)
            assertTrue(fileStore.has(requireNotNull(missingBlob.digest)))
            assertEquals(1, fileStore.puts.size)
            assertEquals(missingBlob.digest, fileStore.puts[0].first)
            server.shutdown()
        }

    @Test
    fun `a blob referenced by multiple events is fetched only once`() =
        runTest {
            val sharedBytes = byteArrayOf(7, 7, 7)
            val uniqueBytes = byteArrayOf(8, 8, 8, 8)
            val sharedBlob = makeBlob(sharedBytes)
            val uniqueBlob = makeBlob(uniqueBytes)

            val content1 = makeContent("post-1", listOf(sharedBlob))
            val content2 = makeContent("post-2", listOf(sharedBlob, uniqueBlob))
            val event1 =
                makeSignedEvent(
                    MakeEventArgs(signer = signerA, identity = identityA, collection = Collections.FEED, sequence = 1, content = content1),
                )
            val event2 =
                makeSignedEvent(
                    MakeEventArgs(signer = signerA, identity = identityA, collection = Collections.FEED, sequence = 2, content = content2),
                )
            val core =
                FakeCore { pullBundles = { listOf(makeBundle(event1, content1), makeBundle(event2, content2)) } }

            val sharedKey = "blob/${digestKey(requireNotNull(sharedBlob.digest))}"
            val uniqueKey = "blob/${digestKey(requireNotNull(uniqueBlob.digest))}"
            val server =
                blobServer(
                    mapOf(
                        sharedKey to sharedBytes,
                        uniqueKey to uniqueBytes,
                    ),
                )
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                    servers = listOf(server.url("/").toString().trimEnd('/'))
                }

            val count = f.client.pull(false)
            val paths = List(2) { server.takeRequest().path!!.removePrefix("/") }

            assertEquals(2, count)
            // Shared blob fetched once; unique blob fetched once.
            assertEquals(1, paths.count { it == sharedKey })
            assertEquals(1, paths.count { it == uniqueKey })
            assertEquals(2, paths.size)
            // Each content persisted under its own digest — not swapped.
            assertArrayEquals(Content.ADAPTER.encode(content1), f.contentRepository.get(buildDigest(content1)))
            assertArrayEquals(Content.ADAPTER.encode(content2), f.contentRepository.get(buildDigest(content2)))
            server.shutdown()
        }

    @Test
    fun `uploads each server requested blob to the requesting server only`() =
        runTest {
            val blob1Bytes = byteArrayOf(10, 10)
            val blob2Bytes = byteArrayOf(20, 20, 20)
            val blob1 = makeBlob(blob1Bytes)
            val blob2 = makeBlob(blob2Bytes)
            val servers = listOf("http://server-1", "http://server-2")

            // server-1 requests blob1, server-2 requests blob2.
            val core =
                FakeCore {
                    pullBundles = { emptyList() }
                    pushResponse = { _, server, _ ->
                        if (server == "http://server-1") {
                            putEventsResponse(requestedBlobs = listOf(blob1))
                        } else {
                            putEventsResponse(requestedBlobs = listOf(blob2))
                        }
                    }
                }
            val fileStore =
                FakeFileStore(
                    listOf(
                        requireNotNull(blob1.digest) to blob1Bytes,
                        requireNotNull(blob2.digest) to blob2Bytes,
                    ),
                )
            val f =
                makeClient {
                    this.core = core
                    this.servers = servers
                    identity = identityA
                    signer = signerA
                    this.fileStore = fileStore
                }

            f.client.sync(SyncStrategy.FULL)

            assertEquals(2, core.uploadCalls.size)
            val byBlob =
                core.uploadCalls.associate { (serverUrl, requestBytes) ->
                    val request = UploadBlobRequest.ADAPTER.decode(requestBytes)
                    digestKey(requireNotNull(request.blob!!.digest)) to (serverUrl to request.body.toByteArray())
                }
            assertEquals("http://server-1", byBlob.getValue(digestKey(requireNotNull(blob1.digest))).first)
            assertArrayEquals(blob1Bytes, byBlob.getValue(digestKey(requireNotNull(blob1.digest))).second)
            assertEquals("http://server-2", byBlob.getValue(digestKey(requireNotNull(blob2.digest))).first)
            assertArrayEquals(blob2Bytes, byBlob.getValue(digestKey(requireNotNull(blob2.digest))).second)
        }

    @Test
    fun `skips a requested blob that is missing from the local filestore`() =
        runTest {
            val blob = makeBlob(byteArrayOf(5, 5, 5))
            val core =
                FakeCore {
                    pullBundles = { emptyList() }
                    pushResponse = { _, _, _ -> putEventsResponse(requestedBlobs = listOf(blob)) }
                }
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                    fileStore = FakeFileStore() // empty
                }

            f.client.sync(SyncStrategy.FULL)

            assertTrue(core.uploadCalls.isEmpty())
        }

    @Test
    fun `saves new content for an event we already have`() =
        runTest {
            val content = makeContent("content-for-known-event")
            val event =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = content,
                    ),
                )
            val core = FakeCore { pullBundles = { listOf(makeBundle(event, content)) } }
            // Seed the event but NOT its content.
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                    events = listOf(event)
                }

            val count = f.client.pull(false)

            assertEquals(0, count) // the event is not new
            assertTrue(f.eventRepository.saved.isEmpty()) // event not re-saved
            // ...but the previously-missing content is now persisted.
            val decoded = Event.ADAPTER.decode(event.event_bytes)
            assertArrayEquals(
                Content.ADAPTER.encode(content),
                f.contentRepository.get(requireNotNull(decoded.content_digest)),
            )
            // ByteArray lacks structural equality; compare the pair fields separately.
            assertEquals(listOf(requireNotNull(decoded.content_digest)), f.contentRepository.saved.map { it.first })
            assertArrayEquals(
                Content.ADAPTER.encode(content),
                f.contentRepository.saved
                    .single()
                    .second,
            )
        }

    @Test
    fun `requests a missing blob referenced by content we already have`() =
        runTest {
            val blobBytes = byteArrayOf(42, 42, 42)
            val blob = makeBlob(blobBytes)
            val content = makeContent("known-content", listOf(blob))
            val event =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = content,
                    ),
                )
            val core = FakeCore { pullBundles = { listOf(makeBundle(event, content)) } }
            // Seed BOTH the event and its content; the blob is absent from the
            // (empty) filestore.
            val blobKey = "blob/${digestKey(requireNotNull(blob.digest))}"
            val server = blobServer(mapOf(blobKey to blobBytes))
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                    events = listOf(event)
                    contents = listOf(buildDigest(content) to content)
                    servers = listOf(server.url("/").toString().trimEnd('/'))
                }

            val count = f.client.pull(false)
            val path = server.takeRequest().path!!.removePrefix("/")

            // Nothing new, yet the missing blob is still requested and stored.
            assertEquals(0, count)
            assertEquals(blobKey, path)
            assertEquals(1, f.fileStore.puts.size)
            assertTrue(f.fileStore.has(requireNotNull(blob.digest)))
            server.shutdown()
        }

    // ── failure paths and error logging ────────────────────────────────

    @Test
    fun `skips a malformed bundle but still saves valid siblings`() =
        runTest {
            val goodContent = makeContent("good")
            val good =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = goodContent,
                    ),
                )
            val badBundle =
                EventBundle(
                    signed_event =
                        polycentric.v2.SignedEvent(
                            signature = byteArrayOf(9).toByteString(),
                            event_bytes = byteArrayOf(0xff.toByte(), 0xff.toByte(), 0xff.toByte(), 0xff.toByte()).toByteString(),
                        ),
                    event_proofs = emptyList(),
                )
            val core = FakeCore { pullBundles = { listOf(badBundle, makeBundle(good, goodContent)) } }
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                }

            val count = f.client.pull(false)

            assertEquals(1, count) // only the good event counted
            // The good sibling, with its own content, is what landed.
            assertEquals(listOf(good), f.eventRepository.saved)
            val goodEvent = Event.ADAPTER.decode(good.event_bytes)
            assertArrayEquals(
                Content.ADAPTER.encode(goodContent),
                f.contentRepository.get(requireNotNull(goodEvent.content_digest)),
            )
        }

    @Test
    fun `skips undecodable content but still saves the event`() =
        runTest {
            val content = makeContent("real")
            val event =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = content,
                    ),
                )
            val bundle =
                EventBundle(
                    signed_event = event,
                    serialized_content =
                        polycentric.v2.SerializedContent(
                            content_bytes = byteArrayOf(0xff.toByte(), 0xff.toByte(), 0xff.toByte()).toByteString(),
                        ),
                    event_proofs = emptyList(),
                )
            val core = FakeCore { pullBundles = { listOf(bundle) } }
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                }

            val count = f.client.pull(false)

            assertEquals(1, count)
            // The event itself is saved exactly; its content is genuinely absent.
            assertEquals(listOf(event), f.eventRepository.saved)
            assertTrue(f.contentRepository.saved.isEmpty())
            val savedEvent = Event.ADAPTER.decode(event.event_bytes)
            assertNull(f.contentRepository.get(requireNotNull(savedEvent.content_digest)))
        }

    @Test
    fun `logs server reported push errors but still uploads requested blobs`() =
        runTest {
            val blobBytes = byteArrayOf(3, 3, 3)
            val blob = makeBlob(blobBytes)
            val core =
                FakeCore {
                    pullBundles = { emptyList() }
                    pushResponse = { _, _, _ ->
                        putEventsResponse(errors = listOf(PutEventError()), requestedBlobs = listOf(blob))
                    }
                }
            val fileStore = FakeFileStore(listOf(requireNotNull(blob.digest) to blobBytes))
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                    this.fileStore = fileStore
                }

            f.client.sync(SyncStrategy.FULL)

            assertEquals(1, core.uploadCalls.size)
        }

    @Test
    fun `logs a blob pull failure and stores nothing for it`() =
        runTest {
            val blob = makeBlob(byteArrayOf(4, 4, 4, 4))
            val content = makeContent("blobby", listOf(blob))
            val event =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = content,
                    ),
                )
            val core = FakeCore { pullBundles = { listOf(makeBundle(event, content)) } }
            val server =
                blobServer(
                    mapOf("blob/${digestKey(requireNotNull(blob.digest))}" to null),
                )
            val f =
                makeClient {
                    this.core = core
                    identity = identityA
                    signer = signerA
                    servers = listOf(server.url("/").toString().trimEnd('/'))
                }

            val count = f.client.pull(false)
            server.takeRequest()

            assertEquals(1, count) // event still counted
            assertTrue(f.fileStore.puts.isEmpty()) // nothing stored
            server.shutdown()
        }

    // ── edge cases ─────────────────────────────────────────────────────

    @Test
    fun `sync with no active identity returns 0 and does nothing`() =
        runTest {
            val core = FakeCore()
            val f =
                makeClient {
                    this.core = core
                    signer = signerA
                } // no identity

            val count = f.client.sync(SyncStrategy.FULL)

            assertEquals(0, count)
            assertTrue(core.pullQueryArgs.isEmpty())
            assertTrue(core.pushCalls.isEmpty())
        }

    @Test
    fun `pull throws when there is no active identity`() =
        runTest {
            val f = makeClient { signer = signerA } // no identity

            val thrown = runCatching { f.client.pull(false) }.exceptionOrNull()
            assertTrue("expected NoActiveIdentityException, got $thrown", thrown is NoActiveIdentityException)
        }

    @Test
    fun `sync with no servers does not push`() =
        runTest {
            val core = FakeCore { pullBundles = { emptyList() } }
            val f =
                makeClient {
                    this.core = core
                    servers = emptyList()
                    identity = identityA
                    signer = signerA
                    events = makeStream(signerA, identityA, Collections.FEED, count = 2, label = "unpushed")
                }

            val count = f.client.sync(SyncStrategy.FULL)

            assertEquals(0, count)
            assertTrue(core.pushCalls.isEmpty())
        }

    // ── trySaveBundle guards ───────────────────────────────────────────

    @Test
    fun `trySaveBundle returns false and saves nothing when the bundle has no signedEvent`() =
        runTest {
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                }
            val bundle = EventBundle(event_proofs = emptyList())

            val saved = f.client.trySaveBundle(bundle, mutableMapOf<String, Blob>())

            assertFalse(saved)
            assertTrue(f.eventRepository.saved.isEmpty())
        }

    @Test
    fun `trySaveBundle returns false and saves nothing when the event has no key`() =
        runTest {
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                }
            val bundle =
                EventBundle(
                    signed_event =
                        polycentric.v2.SignedEvent(
                            signature = byteArrayOf(1).toByteString(),
                            event_bytes = Event.ADAPTER.encode(Event()).toByteString(),
                        ),
                    event_proofs = emptyList(),
                )

            val saved = f.client.trySaveBundle(bundle, mutableMapOf<String, Blob>())

            assertFalse(saved)
            assertTrue(f.eventRepository.saved.isEmpty())
        }

    @Test
    fun `trySaveBundle returns false and saves nothing when the event key has no signedBy`() =
        runTest {
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                }
            val event =
                Event(
                    key =
                        EventKey(
                            collection = Collections.FEED,
                            identity = identityA.key,
                            sequence = 1L,
                        ),
                ) // no signedBy
            val bundle =
                EventBundle(
                    signed_event =
                        polycentric.v2.SignedEvent(
                            signature = byteArrayOf(1).toByteString(),
                            event_bytes = Event.ADAPTER.encode(event).toByteString(),
                        ),
                    event_proofs = emptyList(),
                )

            val saved = f.client.trySaveBundle(bundle, mutableMapOf<String, Blob>())

            assertFalse(saved)
            assertTrue(f.eventRepository.saved.isEmpty())
        }

    @Test
    fun `trySaveBundle returns false and does not re save an already present event`() =
        runTest {
            val existing =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = makeContent("already-here"),
                    ),
                )
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                    events = listOf(existing)
                }
            // No serializedContent, so the content path is a no-op; isolate the
            // event dedup-by-key guard.
            val bundle = EventBundle(signed_event = existing, event_proofs = emptyList())

            val saved = f.client.trySaveBundle(bundle, mutableMapOf<String, Blob>())

            assertFalse(saved)
            assertTrue(f.eventRepository.saved.isEmpty())
        }

    // ── trySaveContent guards ──────────────────────────────────────────

    @Test
    fun `trySaveContent returns false and collects no blobs when the bundle has no content`() =
        runTest {
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                }
            val event =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = makeContent("x"),
                    ),
                )
            val decodedEvent = Event.ADAPTER.decode(event.event_bytes)
            val bundle = EventBundle(signed_event = event, event_proofs = emptyList()) // no serializedContent

            val blobs = mutableMapOf<String, Blob>()
            val saved = f.client.trySaveContent(decodedEvent, bundle, blobs)

            assertFalse(saved)
            assertTrue(blobs.isEmpty())
            assertTrue(f.contentRepository.saved.isEmpty())
        }

    @Test
    fun `trySaveContent returns false and collects no blobs when the event has no contentDigest`() =
        runTest {
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                }
            val content = makeContent("with-blob", listOf(makeBlob(byteArrayOf(1, 2, 3))))
            val bundle =
                makeBundle(
                    makeSignedEvent(
                        MakeEventArgs(
                            signer = signerA,
                            identity = identityA,
                            collection = Collections.FEED,
                            sequence = 1,
                            content = content,
                        ),
                    ),
                    content,
                )
            val eventWithoutDigest = Event() // no contentDigest

            val blobs = mutableMapOf<String, Blob>()
            val saved = f.client.trySaveContent(eventWithoutDigest, bundle, blobs)

            assertFalse(saved)
            assertTrue(blobs.isEmpty())
            assertTrue(f.contentRepository.saved.isEmpty())
        }

    @Test
    fun `trySaveContent collects referenced blobs even when the content already exists`() =
        runTest {
            val blob = makeBlob(byteArrayOf(4, 5, 6))
            val content = makeContent("seen", listOf(blob))
            val digest = buildDigest(content)
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                    contents = listOf(digest to content) // content already present
                }
            val event = Event(content_digest = digest)
            val bundle =
                makeBundle(
                    makeSignedEvent(
                        MakeEventArgs(
                            signer = signerA,
                            identity = identityA,
                            collection = Collections.FEED,
                            sequence = 1,
                            content = content,
                        ),
                    ),
                    content,
                )

            val blobs = mutableMapOf<String, Blob>()
            val saved = f.client.trySaveContent(event, bundle, blobs)

            // Already present, so not re-saved...
            assertFalse(saved)
            assertTrue(f.contentRepository.saved.isEmpty())
            // ...but its blob is still collected so the pull can fetch it.
            assertEquals(listOf(blob), blobs.values.toList())
        }

    @Test
    fun `trySaveContent returns false and collects no blobs when content bytes do not hash to the event digest`() =
        runTest {
            val f =
                makeClient {
                    identity = identityA
                    signer = signerA
                }
            val content = makeContent("valid")
            val event =
                makeSignedEvent(
                    MakeEventArgs(
                        signer = signerA,
                        identity = identityA,
                        collection = Collections.FEED,
                        sequence = 1,
                        content = content,
                    ),
                )
            // Swap in different content bytes whose sha256 differs from the
            // event's contentDigest.
            val tampered = makeContent("tampered")
            val bundle =
                EventBundle(
                    signed_event = event,
                    serialized_content =
                        polycentric.v2.SerializedContent(
                            content_bytes = Content.ADAPTER.encode(tampered).toByteString(),
                        ),
                    event_proofs = emptyList(),
                )

            val blobs = mutableMapOf<String, Blob>()
            val saved =
                f.client.trySaveContent(
                    Event.ADAPTER.decode(event.event_bytes),
                    bundle,
                    blobs,
                )

            assertFalse(saved)
            assertTrue(blobs.isEmpty())
            assertTrue(f.contentRepository.saved.isEmpty())
        }
}
