package tech.futo.libPolycentric

import PolycentricException
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import polycentric.PublicKey
import okio.ByteString.Companion.toByteString
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.drivers.HTTPNetworkManager
import tech.futo.libPolycentric.drivers.storage.sqlite.SQLiteStorageDriver
import tech.futo.libPolycentric.services.IdentityOptions

@RunWith(AndroidJUnit4::class)
class IdentityManagerInstrumentedTest {

    private lateinit var client: PolycentricClient

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        client = PolycentricClient(
            Ed25519CryptoManager(),
            SQLiteStorageDriver(context, "test-identitymanager.db"),
            HTTPNetworkManager()
        )
        runBlocking { client.init() }
    }

    @After
    fun tearDown() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.deleteDatabase("test-identitymanager.db")
    }

    @Test
    fun shouldBeAbleToCreateANewIdentity() {
        val keyPair = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        assertNotNull(keyPair)
        assertNotNull(keyPair.privateKey)
        assertNotNull(keyPair.publicKey)
        assertEquals(Ed25519CryptoManager.KEY_TYPE_ED25519, keyPair.keyType)
        assertEquals(32, keyPair.privateKey.key.size)
        assertEquals(32, keyPair.publicKey.key.size)
    }

    @Test
    fun createIdentityShouldSetAsCurrentByDefault() {
        val keyPair = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        assertNotNull(client.currentKeyPair)
        assertEquals(keyPair, client.currentKeyPair)
    }

    @Test
    fun createIdentityWithSetAsCurrentFalseShouldNotChangeCurrent() {
        val first = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        val second = client.identityManager.createIdentity(
            IdentityOptions(
                keyType = Ed25519CryptoManager.KEY_TYPE_ED25519,
                setAsCurrent = false,
            )
        )

        assertEquals(first, client.currentKeyPair)
        assertNotEquals(second, client.currentKeyPair)
    }

    @Test
    fun createEphemeralIdentityShouldNotPersistToStorage() {
        client.identityManager.createIdentity(
            IdentityOptions(
                keyType = Ed25519CryptoManager.KEY_TYPE_ED25519,
                ephemeral = true,
            )
        )

        val allKeys = client.identityManager.getAllIdentities()
        assertTrue(allKeys.isEmpty())
    }

    @Test
    fun createEphemeralIdentityShouldMarkAsEphemeralOnClient() {
        client.identityManager.createIdentity(
            IdentityOptions(
                keyType = Ed25519CryptoManager.KEY_TYPE_ED25519,
                ephemeral = true,
            )
        )

        assertTrue(client.currentIdentityIsEphemeral)
    }

    @Test
    fun createNonEphemeralIdentityShouldPersistToStorage() {
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        val allKeys = client.identityManager.getAllIdentities()
        assertEquals(1, allKeys.size)
    }

    @Test
    fun createNonEphemeralIdentityShouldNotBeMarkedEphemeral() {
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        assertFalse(client.currentIdentityIsEphemeral)
    }

    @Test
    fun shouldBeAbleToImportIdentity() {
        val created = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )

        val keyPair = client.identityManager.importIdentity(created.privateKey)

        assertNotNull(keyPair)
        assertEquals(Ed25519CryptoManager.KEY_TYPE_ED25519, keyPair.keyType)
        assertEquals(created.privateKey, keyPair.privateKey)
        assertEquals(32, keyPair.publicKey.key.size)
        assertArrayEquals(created.publicKey.key.toByteArray(), keyPair.publicKey.key.toByteArray())
    }

    @Test
    fun importIdentityShouldSetAsCurrentByDefault() {
        val created = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )

        val keyPair = client.identityManager.importIdentity(created.privateKey)

        assertEquals(keyPair, client.currentKeyPair)
    }

    @Test
    fun importIdentityWithSetAsCurrentFalseShouldNotChangeCurrent() {
        val first = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        val second = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )
        client.identityManager.importIdentity(second.privateKey, setAsCurrent = false)

        assertEquals(first, client.currentKeyPair)
    }

    @Test
    fun importIdentityShouldPersistToStorage() {
        val created = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )

        val keyPair = client.identityManager.importIdentity(created.privateKey)

        val allKeys = client.identityManager.getAllIdentities()
        assertTrue(allKeys.contains(keyPair))
    }

    @Test
    fun shouldGetAllIdentities() {
        val keyPair1 = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
        val keyPair2 = client.identityManager.createIdentity(
            IdentityOptions(
                keyType = Ed25519CryptoManager.KEY_TYPE_ED25519,
                setAsCurrent = false,
            )
        )

        val all = client.identityManager.getAllIdentities()

        assertEquals(2, all.size)
        assertTrue(all.contains(keyPair1))
        assertTrue(all.contains(keyPair2))
    }

    @Test
    fun shouldRemoveIdentity() {
        val keyPair = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        client.identityManager.removeIdentity(keyPair.publicKey)

        val all = client.identityManager.getAllIdentities()
        assertTrue(all.isEmpty())
    }

    @Test
    fun shouldSwitchIdentity() {
        val keyPair1 = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
        val keyPair2 = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        assertEquals(keyPair2, client.currentKeyPair)

        val switched = client.identityManager.switchIdentity(keyPair1.publicKey)

        assertEquals(keyPair1, switched)
        assertEquals(keyPair1, client.currentKeyPair)
    }

    @Test(expected = PolycentricException::class)
    fun switchToNonExistentIdentityShouldThrow() {
        val fakePublicKey = PublicKey(
            key_type = Ed25519CryptoManager.KEY_TYPE_ED25519,
            key = ByteArray(32) { 0xFF.toByte() }.toByteString(),
        )

        client.identityManager.switchIdentity(fakePublicKey)
    }

    @Test
    fun shouldTrackCurrentIdentityState() {
        assertNull(client.currentKeyPair)

        val keyPair = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        assertNotNull(client.currentKeyPair)
        assertEquals(keyPair, client.currentKeyPair)
    }

    @Test
    fun shouldCreateMultipleIdentitiesAndSwitchBetweenThem() {
        val keyPair1 = client.identityManager.createIdentity(
            IdentityOptions(
                keyType = Ed25519CryptoManager.KEY_TYPE_ED25519,
                setAsCurrent = false,
            )
        )
        val keyPair2 = client.identityManager.createIdentity(
            IdentityOptions(
                keyType = Ed25519CryptoManager.KEY_TYPE_ED25519,
                setAsCurrent = false,
            )
        )

        client.identityManager.switchIdentity(keyPair1.publicKey)
        assertEquals(keyPair1, client.currentKeyPair)

        client.identityManager.switchIdentity(keyPair2.publicKey)
        assertEquals(keyPair2, client.currentKeyPair)

        client.identityManager.switchIdentity(keyPair1.publicKey)
        assertEquals(keyPair1, client.currentKeyPair)
    }

    @Test
    fun removedIdentityShouldNotAppearInGetAll() {
        val keyPair1 = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
        val keyPair2 = client.identityManager.createIdentity(
            IdentityOptions(
                keyType = Ed25519CryptoManager.KEY_TYPE_ED25519,
                setAsCurrent = false,
            )
        )

        client.identityManager.removeIdentity(keyPair1.publicKey)

        val all = client.identityManager.getAllIdentities()
        assertEquals(1, all.size)
        assertEquals(keyPair2, all[0])
    }

    @Test
    fun ephemeralIdentitiesShouldNotAppearInGetAll() {
        client.identityManager.createIdentity(
            IdentityOptions(
                keyType = Ed25519CryptoManager.KEY_TYPE_ED25519,
                ephemeral = true,
            )
        )
        val persisted = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )

        val all = client.identityManager.getAllIdentities()
        assertEquals(1, all.size)
        assertEquals(persisted, all[0])
    }

    @Test
    fun importedIdentityShouldDeriveCorrectPublicKey() {
        val created = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )

        val keyPair = client.identityManager.importIdentity(created.privateKey)

        assertArrayEquals(created.publicKey.key.toByteArray(), keyPair.publicKey.key.toByteArray())
    }
}
