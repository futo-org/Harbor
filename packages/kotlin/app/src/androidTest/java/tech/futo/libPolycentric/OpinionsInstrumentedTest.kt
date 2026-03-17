package tech.futo.libPolycentric

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import polycentric.Event
import polycentric.Opinion
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.drivers.storage.memory.InMemoryStorageDriver
import tech.futo.libPolycentric.services.IdentityOptions

@RunWith(AndroidJUnit4::class)
class OpinionsInstrumentedTest {

    private lateinit var client: PolycentricClient

    @Before
    fun setUp() {
        client = PolycentricClient(Ed25519CryptoManager(), InMemoryStorageDriver())
        client.init()
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
    }

    private fun opinionByte(lwwValue: okio.ByteString) = lwwValue.toByteArray()[0]

    @Test
    fun shouldCreatePostAndLikeIt() {
        val signedEvent = client.contentManager.createPost("Test post for opinion testing")
        assertNotNull(signedEvent)

        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
        val postPointer = client.queryManager.eventPointer(event)

        val likeEvent = client.contentManager.createLike(postPointer)
        assertNotNull(likeEvent)

        val currentOpinion = client.queryManager.queryCurrentOpinion(postPointer)
        assertNotNull(currentOpinion)
        assertEquals(1, currentOpinion!!.value_.size)
        assertEquals(Opinion.LIKE.value.toByte(), opinionByte(currentOpinion.value_))
    }

    @Test
    fun shouldCreatePostAndDislikeIt() {
        val signedEvent = client.contentManager.createPost("Test post for dislike testing")
        assertNotNull(signedEvent)

        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
        val postPointer = client.queryManager.eventPointer(event)

        val dislikeEvent = client.contentManager.createDislike(postPointer)
        assertNotNull(dislikeEvent)

        val currentOpinion = client.queryManager.queryCurrentOpinion(postPointer)
        assertNotNull(currentOpinion)
        assertEquals(Opinion.DISLIKE.value.toByte(), opinionByte(currentOpinion!!.value_))
    }

    @Test
    fun shouldCreatePostAndSetNeutralOpinion() {
        val signedEvent = client.contentManager.createPost("Test post for neutral testing")
        assertNotNull(signedEvent)

        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
        val postPointer = client.queryManager.eventPointer(event)

        val neutralEvent = client.contentManager.createNeutral(postPointer)
        assertNotNull(neutralEvent)

        val currentOpinion = client.queryManager.queryCurrentOpinion(postPointer)
        assertNotNull(currentOpinion)
        assertEquals(Opinion.NEUTRAL.value.toByte(), opinionByte(currentOpinion!!.value_))
    }

    @Test
    fun shouldHandleMultipleOpinionsWithLWWSemantics() {
        val signedEvent = client.contentManager.createPost("Test post for multiple opinions")
        assertNotNull(signedEvent)

        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
        val postPointer = client.queryManager.eventPointer(event)

        client.contentManager.createLike(postPointer)
        client.contentManager.createDislike(postPointer)
        client.contentManager.createNeutral(postPointer)

        val currentOpinion = client.queryManager.queryCurrentOpinion(postPointer)
        assertNotNull(currentOpinion)
        assertEquals(Opinion.NEUTRAL.value.toByte(), opinionByte(currentOpinion!!.value_))

        client.contentManager.createLike(postPointer)

        val updatedOpinion = client.queryManager.queryCurrentOpinion(postPointer)
        assertNotNull(updatedOpinion)
        assertEquals(Opinion.LIKE.value.toByte(), opinionByte(updatedOpinion!!.value_))
    }

    @Test
    fun shouldReturnNullWhenQueryingOpinionForPostWithNoOpinions() {
        val signedEvent = client.contentManager.createPost("Test post with no opinions")
        assertNotNull(signedEvent)

        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
        val postPointer = client.queryManager.eventPointer(event)

        val currentOpinion = client.queryManager.queryCurrentOpinion(postPointer)
        assertNull(currentOpinion)
    }

    @Test
    fun shouldHandleOpinionsAcrossDifferentIdentities() {
        val signedEvent = client.contentManager.createPost("Test post for cross-identity opinion testing")
        assertNotNull(signedEvent)

        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
        val postPointer = client.queryManager.eventPointer(event)
        val firstIdentityPublicKey = client.currentIdentity.keyPair.publicKey

        val secondIdentity = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )
        client.identityManager.switchIdentity(secondIdentity.publicKey)

        val likeEvent = client.contentManager.createLike(postPointer)
        assertNotNull(likeEvent)

        val currentOpinion = client.queryManager.queryCurrentOpinion(postPointer)
        assertNotNull(currentOpinion)
        assertEquals(1, currentOpinion!!.value_.size)
        assertEquals(Opinion.LIKE.value.toByte(), opinionByte(currentOpinion.value_))

        client.identityManager.switchIdentity(firstIdentityPublicKey)

        val firstIdentityOpinion = client.queryManager.queryCurrentOpinion(postPointer)
        assertNull(firstIdentityOpinion)
    }
}
