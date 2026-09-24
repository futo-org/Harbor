package org.futo.polycentric.core

import android.content.Context
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
import polycentric.v2.KeyType
import polycentric.v2.PublicKey
import polycentric.v2.SignedEvent

/**
 * Robolectric tests for the SQL event repository — the only coverage of the
 * hand-rolled correlated MAX() heads subquery and the `hex() = ?` BLOB
 * matching convention (audit §4.4 item 4). Robolectric backs
 * `android.database.sqlite` with real native SQLite.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class SqlEventRepositoryTest {
    private lateinit var helper: PolycentricDbHelper
    private lateinit var repo: SqlEventRepository

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        helper = PolycentricDbHelper(context, "events-test.db")
        repo = SqlEventRepository(helper.writableDatabase)
    }

    // Shared fixtures.
    private val identityA = makeIdentity(listOf(makeSigner(1)), listOf(makeSigner(2)))
    private val identityB = makeIdentity(listOf(makeSigner(9)))
    private val signerA = makeSigner(1)
    private val signerB = makeSigner(2)
    private val signerOther = makeSigner(9)

    private fun storedEvent(
        identity: String = identityA.key,
        signer: PublicKey = signerA.publicKey,
        collection: Int = Collections.FEED,
        sequence: Long,
        text: String = "event-$sequence",
    ): SignedEvent {
        val event =
            polycentric.v2.Event(
                key =
                    polycentric.v2.EventKey(
                        collection = collection,
                        identity = identity,
                        signed_by = signer,
                        sequence = sequence,
                    ),
                identity_sequence = 1L,
                content_digest = buildDigest(makeContent(text)),
                created_at = 1_700_000_000_000L,
            )
        val bytes =
            polycentric.v2.Event.ADAPTER
                .encode(event)
        return SignedEvent(
            signature = ed25519Sign(bytes, signerA.privateKey).toByteString(),
            event_bytes = bytes.toByteString(),
        )
    }

    @Test
    fun `save and getByEventKey round trip byte equal`() =
        runTest {
            val remote = storedEvent(sequence = 1)
            repo.save(remote)

            val loaded =
                repo.getByEventKey(
                    requireNotNull(
                        polycentric.v2.Event.ADAPTER
                            .decode(remote.event_bytes)
                            .key,
                    ),
                )
            // Signature and event bytes live in separate columns and are recombined.
            assertEquals(remote.signature, requireNotNull(loaded).signature)
            assertEquals(remote.event_bytes, loaded.event_bytes)
        }

    @Test
    fun `getAll returns everything`() =
        runTest {
            val events =
                listOf(
                    storedEvent(sequence = 1),
                    storedEvent(signer = signerB.publicKey, sequence = 1),
                    storedEvent(collection = Collections.PROFILE, sequence = 1),
                )
            events.forEach { repo.save(it) }

            assertEquals(events.size, repo.getAll().size)
        }

    @Test
    fun `saving the same event twice yields one row`() =
        runTest {
            val event = storedEvent(sequence = 1)
            repo.save(event)
            repo.save(event)

            assertEquals(1, repo.getAll().size)
        }

    @Test
    fun `save with no event key throws`() =
        runTest {
            val event =
                SignedEvent(
                    signature = byteArrayOf(1).toByteString(),
                    event_bytes =
                        polycentric.v2.Event.ADAPTER
                            .encode(polycentric.v2.Event())
                            .toByteString(),
                )

            val thrown = runCatching { repo.save(event) }.exceptionOrNull()
            assertTrue("expected IllegalStateException, got $thrown", thrown is IllegalStateException)
            assertEquals("Event missing key", thrown!!.message)
        }

    @Test
    fun `save with a key missing signedBy throws`() =
        runTest {
            val event =
                polycentric.v2.Event(
                    key = polycentric.v2.EventKey(collection = Collections.FEED, identity = identityA.key, sequence = 1L),
                )
            val signed =
                SignedEvent(
                    signature = byteArrayOf(1).toByteString(),
                    event_bytes =
                        polycentric.v2.Event.ADAPTER
                            .encode(event)
                            .toByteString(),
                )

            val thrown = runCatching { repo.save(signed) }.exceptionOrNull()
            assertTrue("expected IllegalStateException, got $thrown", thrown is IllegalStateException)
            assertEquals("Event key missing signedBy", thrown!!.message)
        }

    @Test
    fun `getByEventKey with a key missing signedBy returns null`() =
        runTest {
            val key = polycentric.v2.EventKey(collection = Collections.FEED, identity = identityA.key, sequence = 1L)

            assertNull(repo.getByEventKey(key))
        }

    /** Pin hex() matching with bytes that differ only past the first byte. */
    private val key00FF =
        PublicKey(key_type = KeyType.KEY_TYPE_ED25519, key = byteArrayOf(0x00, 0x55, 0xFF.toByte()).toByteString())
    private val key00FE =
        PublicKey(key_type = KeyType.KEY_TYPE_ED25519, key = byteArrayOf(0x00, 0x55, 0xFE.toByte()).toByteString())

    @Test
    fun `same sequence different signer disambiguates by exact public key bytes`() =
        runTest {
            val a = storedEvent(signer = key00FF, sequence = 1)
            val b = storedEvent(signer = key00FE, sequence = 1)
            repo.save(a)
            repo.save(b)

            val keyOf = { e: SignedEvent ->
                requireNotNull(
                    polycentric.v2.Event.ADAPTER
                        .decode(e.event_bytes)
                        .key,
                )
            }
            assertEquals(a, repo.getByEventKey(keyOf(a)))
            assertEquals(b, repo.getByEventKey(keyOf(b)))
            assertEquals(2, repo.getAll().size)
        }

    @Test
    fun `getByIdentity filters by identity only`() =
        runTest {
            val ours = storedEvent(sequence = 1)
            val other = storedEvent(identity = identityB.key, signer = signerOther.publicKey, sequence = 1)
            repo.save(ours)
            repo.save(other)

            val loaded = repo.getByIdentity(identityA.key)
            assertEquals(listOf(ours), loaded)
        }

    @Test
    fun `getByIdentity with signer filter`() =
        runTest {
            val fromA = storedEvent(signer = signerA.publicKey, sequence = 1)
            val fromB = storedEvent(signer = signerB.publicKey, sequence = 1)
            repo.save(fromA)
            repo.save(fromB)

            assertEquals(listOf(fromA), repo.getByIdentity(identityA.key, signer = signerA.publicKey))
        }

    @Test
    fun `getByIdentity with collection filter`() =
        runTest {
            val feed = storedEvent(collection = Collections.FEED, sequence = 1)
            val profile = storedEvent(collection = Collections.PROFILE, sequence = 1)
            repo.save(feed)
            repo.save(profile)

            assertEquals(listOf(feed), repo.getByIdentity(identityA.key, collection = Collections.FEED))
        }

    @Test
    fun `getByIdentity with signer and collection combined`() =
        runTest {
            val aFeed = storedEvent(signer = signerA.publicKey, collection = Collections.FEED, sequence = 1)
            val bFeed = storedEvent(signer = signerB.publicKey, collection = Collections.FEED, sequence = 1)
            val aProfile = storedEvent(signer = signerA.publicKey, collection = Collections.PROFILE, sequence = 1)
            listOf(aFeed, bFeed, aProfile).forEach { repo.save(it) }

            assertEquals(listOf(aFeed), repo.getByIdentity(identityA.key, signer = signerA.publicKey, collection = Collections.FEED))
        }

    @Test
    fun `headsOnly returns exactly the max sequence per signer collection stream`() =
        runTest {
            // Interleaved sequences across two signers x two collections.
            val aFeed3 = storedEvent(signer = signerA.publicKey, collection = Collections.FEED, sequence = 3)
            val aFeed1 = storedEvent(signer = signerA.publicKey, collection = Collections.FEED, sequence = 1)
            val aProfile7 = storedEvent(signer = signerA.publicKey, collection = Collections.PROFILE, sequence = 7)
            val bFeed2 = storedEvent(signer = signerB.publicKey, collection = Collections.FEED, sequence = 2)
            val bProfile1 = storedEvent(signer = signerB.publicKey, collection = Collections.PROFILE, sequence = 1)
            val bProfile2 = storedEvent(signer = signerB.publicKey, collection = Collections.PROFILE, sequence = 2)
            listOf(aFeed3, aFeed1, aProfile7, bFeed2, bProfile1, bProfile2).forEach { repo.save(it) }

            val heads = repo.getByIdentity(identityA.key, headsOnly = true)

            // One head per (signer, collection) stream, always the max sequence.
            assertEquals(4, heads.size)
            val byStream =
                heads.associate {
                    val key =
                        requireNotNull(
                            polycentric.v2.Event.ADAPTER
                                .decode(it.event_bytes)
                                .key,
                        )
                    "${requireNotNull(key.signed_by).key.hex()}|${key.collection}" to key.sequence
                }
            assertEquals(3L, byStream["${signerA.publicKey.key.hex()}|${Collections.FEED}"])
            assertEquals(7L, byStream["${signerA.publicKey.key.hex()}|${Collections.PROFILE}"])
            assertEquals(2L, byStream["${signerB.publicKey.key.hex()}|${Collections.FEED}"])
            assertEquals(2L, byStream["${signerB.publicKey.key.hex()}|${Collections.PROFILE}"])
        }

    @Test
    fun `headsOnly with signer and collection filters combined`() =
        runTest {
            val aFeed1 = storedEvent(signer = signerA.publicKey, collection = Collections.FEED, sequence = 1)
            val aFeed3 = storedEvent(signer = signerA.publicKey, collection = Collections.FEED, sequence = 3)
            val aProfile = storedEvent(signer = signerA.publicKey, collection = Collections.PROFILE, sequence = 7)
            val bFeed2 = storedEvent(signer = signerB.publicKey, collection = Collections.FEED, sequence = 2)
            listOf(aFeed1, aFeed3, aProfile, bFeed2).forEach { repo.save(it) }

            val heads = repo.getByIdentity(identityA.key, signer = signerA.publicKey, collection = Collections.FEED, headsOnly = true)

            assertEquals(1, heads.size)
            assertEquals(aFeed3, heads.single())
        }

    @Test
    fun `getByIdentity returns an unspecified order compare as sets`() =
        runTest {
            // The contract is order-unspecified (neither implementation orders);
            // sort both sides so the test doesn't depend on SQLite behavior.
            val seq5 = storedEvent(sequence = 5)
            val seq1 = storedEvent(sequence = 1)
            val seq3 = storedEvent(sequence = 3)
            listOf(seq5, seq1, seq3).forEach { repo.save(it) }

            val loaded = repo.getByIdentity(identityA.key)
            val expected = listOf(seq1, seq3, seq5)
            assertEquals(
                expected
                    .map {
                        requireNotNull(
                            polycentric.v2.Event.ADAPTER
                                .decode(it.event_bytes)
                                .key,
                        ).sequence
                    }.sorted(),
                loaded
                    .map {
                        requireNotNull(
                            polycentric.v2.Event.ADAPTER
                                .decode(it.event_bytes)
                                .key,
                        ).sequence
                    }.sorted(),
            )
            // And the exact set of events:
            val expectedBySeq =
                expected.associateBy {
                    polycentric.v2.Event.ADAPTER
                        .decode(it.event_bytes)
                        .key!!
                        .sequence
                }
            val loadedBySeq =
                loaded.associateBy {
                    polycentric.v2.Event.ADAPTER
                        .decode(it.event_bytes)
                        .key!!
                        .sequence
                }
            assertEquals(expectedBySeq.keys, loadedBySeq.keys)
            for ((seq, event) in expectedBySeq) assertEquals(event, loadedBySeq[seq])
        }

    @Test
    fun `empty store returns empty list and null`() =
        runTest {
            assertTrue(repo.getAll().isEmpty())
            assertNull(
                repo.getByEventKey(
                    polycentric.v2.EventKey(
                        collection = Collections.FEED,
                        identity = identityA.key,
                        sequence = 1L,
                        signed_by = signerA.publicKey,
                    ),
                ),
            )
            assertTrue(repo.getByIdentity(identityA.key).isEmpty())
            assertTrue(repo.getByIdentity(identityA.key, headsOnly = true).isEmpty())
            assertNull(repo.getByEventKey(polycentric.v2.EventKey()))
        }

    @Test
    fun `byte fidelity with 0x00 and 0xFF payload bytes`() =
        runTest {
            val event = storedEvent(sequence = 1, text = "\u0000\u00FF\u0100 tail")
            repo.save(event)

            val loaded =
                repo.getByEventKey(
                    requireNotNull(
                        polycentric.v2.Event.ADAPTER
                            .decode(event.event_bytes)
                            .key,
                    ),
                )
            assertNotNull(loaded)
            assertArrayEquals(event.signature.toByteArray(), requireNotNull(loaded).signature.toByteArray())
        }
}
