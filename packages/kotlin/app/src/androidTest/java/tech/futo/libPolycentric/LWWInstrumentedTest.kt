package tech.futo.libPolycentric

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import polycentric.ContentType
import polycentric.Event
import polycentric.ImageManifest
import okio.ByteString.Companion.toByteString
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.drivers.storage.memory.InMemoryStorageDriver
import tech.futo.libPolycentric.services.IdentityOptions

@RunWith(AndroidJUnit4::class)
class LWWInstrumentedTest {

    private lateinit var client: PolycentricClient

    @Before
    fun setUp() {
        client = PolycentricClient(Ed25519CryptoManager(), InMemoryStorageDriver())
        client.init()
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
    }

    @Test
    fun shouldCreateUsernameEvent() {
        val username = "testuser123"
        val signedEvent = client.contentManager.createUsername(username)

        assertNotNull(signedEvent)
        assertNotNull(signedEvent.event)

        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
        assertEquals(ContentType.USERNAME.value, event.content_type)
        assertNotNull(event.lww_element)
        assertEquals(username, event.lww_element!!.value_.toByteArray().decodeToString())
    }

    @Test
    fun shouldCreateDescriptionEvent() {
        val description = "This is a test description for the user profile"
        val signedEvent = client.contentManager.createDescription(description)

        assertNotNull(signedEvent)
        assertNotNull(signedEvent.event)

        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
        assertEquals(ContentType.DESCRIPTION.value, event.content_type)
        assertNotNull(event.lww_element)
        assertEquals(description, event.lww_element!!.value_.toByteArray().decodeToString())
    }

    @Test
    fun shouldCreateAvatarEvent() {
        val avatar = ImageManifest(
            mime = "image/png",
            width = 256,
            height = 256,
            digest = byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8).toByteString(),
        )
        val signedEvent = client.contentManager.createAvatar(avatar)

        assertNotNull(signedEvent)
        assertNotNull(signedEvent.event)

        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
        assertEquals(ContentType.AVATAR.value, event.content_type)
        assertNotNull(event.lww_element)

        val decodedAvatar = ImageManifest.ADAPTER.decode(event.lww_element!!.value_.toByteArray())
        assertEquals(avatar.mime, decodedAvatar.mime)
        assertEquals(avatar.width, decodedAvatar.width)
        assertEquals(avatar.height, decodedAvatar.height)
    }

    @Test
    fun shouldCreateBannerEvent() {
        val banner = ImageManifest(
            mime = "image/jpeg",
            width = 1200,
            height = 300,
            digest = byteArrayOf(9, 10, 11, 12, 13, 14, 15, 16).toByteString(),
        )
        val signedEvent = client.contentManager.createBanner(banner)

        assertNotNull(signedEvent)
        assertNotNull(signedEvent.event)

        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
        assertEquals(ContentType.BANNER.value, event.content_type)
        assertNotNull(event.lww_element)

        val decodedBanner = ImageManifest.ADAPTER.decode(event.lww_element!!.value_.toByteArray())
        assertEquals(banner.mime, decodedBanner.mime)
        assertEquals(banner.width, decodedBanner.width)
        assertEquals(banner.height, decodedBanner.height)
    }

    @Test
    fun shouldHandleMultipleDescriptionsWithLWWSemantics() {
        client.contentManager.createDescription("First description")
        client.contentManager.createDescription("Second description")
        client.contentManager.createDescription("Third description")

        val currentDescription = client.queryManager.queryDescription(
            client.currentIdentity.keyPair.publicKey
        )
        assertEquals("Third description", currentDescription)

        client.contentManager.createDescription("Fourth description")

        val updatedDescription = client.queryManager.queryDescription(
            client.currentIdentity.keyPair.publicKey
        )
        assertEquals("Fourth description", updatedDescription)
    }

    @Test
    fun shouldHandleSystemSpecificLWWElementsAcrossIdentities() {
        val firstIdentity = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = true)
        )
        client.contentManager.createUsername("first_user")

        assertEquals("first_user", client.queryManager.queryUsername(firstIdentity.publicKey))

        val secondIdentity = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )
        client.identityManager.switchIdentity(secondIdentity.publicKey)

        assertNull(client.queryManager.queryUsername(secondIdentity.publicKey))

        client.contentManager.createUsername("second_user")
        assertEquals("second_user", client.queryManager.queryUsername(secondIdentity.publicKey))

        client.contentManager.createUsername("third_user")
        assertEquals("third_user", client.queryManager.queryUsername(secondIdentity.publicKey))

        client.identityManager.switchIdentity(firstIdentity.publicKey)
        assertEquals("first_user", client.queryManager.queryUsername(firstIdentity.publicKey))
    }
}
