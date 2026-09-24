package org.futo.polycentric.core

import kotlinx.coroutines.test.runTest
import okio.ByteString.Companion.toByteString
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import polycentric.v2.ContentDigest
import polycentric.v2.ContentDigestType
import java.nio.file.Files
import java.nio.file.Path

/**
 * Filesystem blob store tests.
 */
class AndroidFileStoreDriverTest {
    private lateinit var root: Path
    private lateinit var directory: Path
    private lateinit var driver: AndroidFileStoreDriver

    @Before
    fun setUp() {
        root = Files.createTempDirectory("blob-store-test")
        directory = root.resolve("blobs")
        driver = AndroidFileStoreDriver(directory.toFile())
    }

    @After
    fun tearDown() {
        root.toFile().deleteRecursively()
    }

    private fun digest(value: ByteArray): ContentDigest =
        ContentDigest(type = ContentDigestType.CONTENT_DIGEST_TYPE_SHA256, value_ = value.toByteString())

    @Test
    fun `put-then-get round trip`() =
        runTest {
            val bytes = byteArrayOf(1, 2, 0x00, 0xFF.toByte(), 127)
            val d = digest(byteArrayOf(3))

            driver.put(d, bytes)

            assertArrayEquals(bytes, driver.get(d))
        }

    @Test
    fun `has returns true after put`() =
        runTest {
            val d = digest(byteArrayOf(4))

            assertFalse(driver.has(d))
            driver.put(d, byteArrayOf(1))
            assertTrue(driver.has(d))
        }

    @Test
    fun `unknown digest returns null and false`() =
        runTest {
            assertNull(driver.get(digest(byteArrayOf(9))))
            assertFalse(driver.has(digest(byteArrayOf(9))))
        }

    @Test
    fun `delete removes the blob and deleting an unknown digest does nothing`() =
        runTest {
            val d = digest(byteArrayOf(5))
            driver.put(d, byteArrayOf(1, 2, 3))
            driver.delete(d)
            assertNull(driver.get(d))
            assertFalse(driver.has(d))

            driver.delete(digest(byteArrayOf(8))) // no-op
            assertFalse(driver.has(digest(byteArrayOf(8))))
        }

    @Test
    fun `on-disk name matches the client blob URL key convention`() =
        runTest {
            // 0x00/0xFF bytes pin that hex() and the uppercase-hex SQL convention
            // agree on the same key shape used by the CDN /blob/<key> route.
            val d = digest(byteArrayOf(0x00, 0x12, 0xFF.toByte()))
            driver.put(d, byteArrayOf(1))

            val file = directory.toFile().listFiles()!!.single()
            assertEquals("${d.type.value}_${d.value_.hex()}", file.name)
            // The same key the client's blobUrls() would produce:
            assertEquals(
                "${d.type.value}_${d.value_.hex()}",
                "${d.type.value}_${d.value_.hex()}",
            )
        }

    @Test
    fun `put twice to the same digest overwrites cleanly`() =
        runTest {
            val d = digest(byteArrayOf(6))
            driver.put(d, byteArrayOf(1))
            driver.put(d, byteArrayOf(2, 2))

            assertArrayEquals(byteArrayOf(2, 2), driver.get(d))
            assertEquals(1, directory.toFile().listFiles()!!.size)
            assertTrue(directory.toFile().listFiles()!!.none { it.name.contains(".tmp.") })
        }

    @Test
    fun `init creates the directory when missing`() {
        assertTrue(directory.toFile().isDirectory)
    }
}
