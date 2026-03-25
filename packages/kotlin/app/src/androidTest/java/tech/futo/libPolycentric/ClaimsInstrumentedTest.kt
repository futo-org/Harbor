package tech.futo.libPolycentric

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import polycentric.ClaimFieldEntry
import polycentric.Event
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.drivers.HTTPNetworkManager
import tech.futo.libPolycentric.drivers.storage.sqlite.SQLiteStorageDriver
import tech.futo.libPolycentric.services.IdentityOptions

@RunWith(AndroidJUnit4::class)
class ClaimsInstrumentedTest {

    private lateinit var client1: PolycentricClient
    private lateinit var client2: PolycentricClient

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        client1 = PolycentricClient(PolycentricClientConfig(
            Ed25519CryptoManager(),
            SQLiteStorageDriver(context,"test-claims-1.db"),
            HTTPNetworkManager()
        ))
        client2 = PolycentricClient(PolycentricClientConfig(
            Ed25519CryptoManager(),
            SQLiteStorageDriver(context, "test-claims-2.db"),
            HTTPNetworkManager()
        ))
        runBlocking {
            client1.init()
            client2.init()
            client1.identityManager.createIdentity(
                IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
            )
            client2.identityManager.createIdentity(
                IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
            )
        }
    }

    @After
    fun tearDown() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.deleteDatabase("test-claims-1.db")
        context.deleteDatabase("test-claims-2.db")
    }

    @Test
    fun shouldCreateAClaimOnAnIdentity() = runBlocking {
        val claimEvent = client1.contentManager.createClaim(
            claimType = 1L,
            fields = listOf(
                ClaimFieldEntry(key = 1L, value_ = "user@example.com"),
                ClaimFieldEntry(key = 2L, value_ = "email_verification"),
            )
        )

        assertNotNull(claimEvent)
        assertNotNull(claimEvent.signature)
        assertNotNull(claimEvent.event)

        val feedResult = client1.queryManager.queryFeed(
            client1.currentIdentity.keyPair.publicKey,
            limit = 10L,
        )
        assertTrue(feedResult.events.isNotEmpty())
    }

    @Test
    fun shouldCreateAVouchForAnotherIdentityClaim() = runBlocking {
        val claimSignedEvent = client1.contentManager.createClaim(
            claimType = 1L,
            fields = listOf(
                ClaimFieldEntry(key = 1L, value_ = "user@example.com"),
                ClaimFieldEntry(key = 2L, value_ = "email_verification"),
            )
        )
        assertNotNull(claimSignedEvent)

        val client1FeedAfterClaim = client1.queryManager.queryFeed(
            client1.currentIdentity.keyPair.publicKey,
            limit = 10L,
        )
        assertTrue(client1FeedAfterClaim.events.isNotEmpty())

        val claimEvent = Event.ADAPTER.decode(claimSignedEvent.event.toByteArray())
        val claimPointer = client1.queryManager.eventPointer(claimEvent)

        val vouchEvent = client2.contentManager.createVerifyClaim(claimPointer)
        assertNotNull(vouchEvent)
        assertNotNull(vouchEvent.signature)
        assertNotNull(vouchEvent.event)
    }

    @Test
    fun shouldCreateMultipleClaimsAndVouches() = runBlocking {
        data class ClaimSpec(val type: Long, val fields: List<ClaimFieldEntry>)

        val claims = listOf(
            ClaimSpec(1L, listOf(
                ClaimFieldEntry(key = 1L, value_ = "user@example.com"),
                ClaimFieldEntry(key = 2L, value_ = "email_verification"),
            )),
            ClaimSpec(2L, listOf(
                ClaimFieldEntry(key = 1L, value_ = "John Doe"),
                ClaimFieldEntry(key = 2L, value_ = "legal_name"),
            )),
            ClaimSpec(3L, listOf(
                ClaimFieldEntry(key = 1L, value_ = "Software Engineer"),
                ClaimFieldEntry(key = 2L, value_ = "occupation"),
            )),
        )

        val claimSignedEvents = claims.map { claim ->
            val event = client1.contentManager.createClaim(claim.type, claim.fields)
            assertNotNull(event)
            event
        }

        val client1Feed = client1.queryManager.queryFeed(
            client1.currentIdentity.keyPair.publicKey,
            limit = 20L,
        )
        assertTrue(client1Feed.events.size >= claims.size)

        for (claimSignedEvent in claimSignedEvents) {
            val claimEvent = Event.ADAPTER.decode(claimSignedEvent.event.toByteArray())
            val claimPointer = client1.queryManager.eventPointer(claimEvent)
            val vouchEvent = client2.contentManager.createVerifyClaim(claimPointer)
            assertNotNull(vouchEvent)
        }

        assertEquals(claims.size, claimSignedEvents.size)
    }

    @Test
    fun shouldHandleClaimWithComplexFieldData() = runBlocking {
        val claimSignedEvent = client1.contentManager.createClaim(
            claimType = 100L,
            fields = listOf(
                ClaimFieldEntry(key = 1L, value_ = "https://github.com/username"),
                ClaimFieldEntry(key = 2L, value_ = "github_verification"),
                ClaimFieldEntry(key = 3L, value_ = "2024-01-01T00:00:00Z"),
                ClaimFieldEntry(key = 4L, value_ = "verified_by_github_api"),
            )
        )
        assertNotNull(claimSignedEvent)

        val client1Feed = client1.queryManager.queryFeed(
            client1.currentIdentity.keyPair.publicKey,
            limit = 10L,
        )
        assertTrue(client1Feed.events.isNotEmpty())

        val claimEvent = Event.ADAPTER.decode(claimSignedEvent.event.toByteArray())
        val claimPointer = client1.queryManager.eventPointer(claimEvent)

        val vouchEvent = client2.contentManager.createVerifyClaim(claimPointer)
        assertNotNull(vouchEvent)
        assertNotNull(claimSignedEvent)
        assertNotNull(vouchEvent)
    }
}
