package tech.futo.libPolycentric

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import polycentric.ContentType
import polycentric.Event
import polycentric.ImageManifest
import okio.ByteString.Companion.toByteString
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.drivers.storage.sqlite.SQLiteStorageDriver
import tech.futo.libPolycentric.services.IdentityOptions

@RunWith(AndroidJUnit4::class)
class LWWInstrumentedTest {

    private lateinit var client: PolycentricClient
    private lateinit var storage: SQLiteStorageDriver

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        storage = SQLiteStorageDriver(context, "test-lww.db")
        client = PolycentricClient(Ed25519CryptoManager(), storage)
        runBlocking { client.init() }
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
    }

    @After
    fun tearDown() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.deleteDatabase("test-lww.db")
    }

    @Test
    fun shouldCreateUsernameEvent() = runBlocking {
        val username = "testuser123"
        val signedEvent = client.contentManager.createUsername(username)

        assertNotNull(signedEvent)
        assertNotNull(signedEvent.event)

        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
        assertEquals(ContentType.USERNAME, event.content_type)
        assertNotNull(event.lww_element)
        assertEquals(username, event.lww_element!!.value_.toByteArray().decodeToString())
    }

    @Test
    fun shouldCreateDescriptionEvent() = runBlocking {
        val description = "This is a test description for the user profile"
        val signedEvent = client.contentManager.createDescription(description)

        assertNotNull(signedEvent)
        assertNotNull(signedEvent.event)

        val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
        assertEquals(ContentType.DESCRIPTION, event.content_type)
        assertNotNull(event.lww_element)
        assertEquals(description, event.lww_element!!.value_.toByteArray().decodeToString())
    }

    @Test
    fun shouldCreateAvatarEvent() = runBlocking {
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
        assertEquals(ContentType.AVATAR, event.content_type)
        assertNotNull(event.lww_element)

        val decodedAvatar = ImageManifest.ADAPTER.decode(event.lww_element!!.value_.toByteArray())
        assertEquals(avatar.mime, decodedAvatar.mime)
        assertEquals(avatar.width, decodedAvatar.width)
        assertEquals(avatar.height, decodedAvatar.height)
    }

    @Test
    fun shouldCreateBannerEvent() = runBlocking {
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
        assertEquals(ContentType.BANNER, event.content_type)
        assertNotNull(event.lww_element)

        val decodedBanner = ImageManifest.ADAPTER.decode(event.lww_element!!.value_.toByteArray())
        assertEquals(banner.mime, decodedBanner.mime)
        assertEquals(banner.width, decodedBanner.width)
        assertEquals(banner.height, decodedBanner.height)
    }

    @Test
    fun shouldHandleMultipleDescriptionsWithLWWSemantics() = runBlocking {
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
    fun shouldHandleSystemSpecificLWWElementsAcrossIdentities() = runBlocking {
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
