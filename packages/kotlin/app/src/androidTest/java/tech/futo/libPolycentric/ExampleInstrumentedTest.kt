package tech.futo.libPolycentric

import androidx.test.ext.junit.runners.AndroidJUnit4

import org.junit.Test
import org.junit.runner.RunWith

import org.junit.Assert.*
import org.junit.Before
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.drivers.storage.memory.InMemoryStorageDriver

/**
 * Instrumented test, which will execute on an Android device.
 *
 * See [testing documentation](http://d.android.com/tools/testing).
 */
@RunWith(AndroidJUnit4::class)
class ExampleInstrumentedTest {
    private lateinit var client: PolycentricClient

    @Before
    fun setUp() {
        client = PolycentricClient(Ed25519CryptoManager(), InMemoryStorageDriver())
    }

    @Test
    fun testInitialization() {
        assertFalse(client.isInitialized())
        client.init()
        assertTrue(client.isInitialized())
    }
}
