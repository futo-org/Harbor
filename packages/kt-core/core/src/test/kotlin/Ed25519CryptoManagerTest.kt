package org.futo.polycentric.core

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Plain-JVM tests for the Ed25519 crypto manager. The RFC 8032 known-answer
 * test pins BouncyCastle to the same behavior js-core's @noble/curves
 * manager has — the cross-stack signature compatibility claim.
 */
class Ed25519CryptoManagerTest {
    private val crypto = Ed25519CryptoManager()

    @Test
    fun `generateKeyPair produces a 32 32 ed25519 pair`() {
        val keyPair = crypto.generateKeyPair(KeyTypes.ED25519)

        assertEquals(KeyTypes.ED25519, keyPair.keyType)
        assertEquals(32, keyPair.publicKey.size)
        assertEquals(32, keyPair.privateKey.size)
        assertArrayEquals(keyPair.publicKey, crypto.derivePublicKey(keyPair.privateKey, KeyTypes.ED25519))
    }

    @Test
    fun `sign and verify round trip over real message bytes`() =
        runTest {
            val keyPair = crypto.generateKeyPair(KeyTypes.ED25519)
            val message = "polycentric".toByteArray()

            val signature = crypto.sign(keyPair.privateKey, message, KeyTypes.ED25519)

            assertEquals(64, signature.size)
            assertTrue(crypto.verify(keyPair.publicKey, message, signature, KeyTypes.ED25519))
        }

    @Test
    fun `tampered message or signature fails verification`() =
        runTest {
            val keyPair = crypto.generateKeyPair(KeyTypes.ED25519)
            val message = "payload".toByteArray()
            val signature = crypto.sign(keyPair.privateKey, message, KeyTypes.ED25519)

            val tamperedMessage = "payloaD".toByteArray()
            assertFalse(crypto.verify(keyPair.publicKey, tamperedMessage, signature, KeyTypes.ED25519))

            val tamperedSignature = signature.copyOf().also { it[0] = (it[0].toInt() xor 0x01).toByte() }
            assertFalse(crypto.verify(keyPair.publicKey, message, tamperedSignature, KeyTypes.ED25519))
        }

    @Test
    fun `wrong signature length throws InvalidSignatureException`() =
        runTest {
            val keyPair = crypto.generateKeyPair(KeyTypes.ED25519)
            val message = byteArrayOf(1)

            val thrown = runCatching { crypto.verify(keyPair.publicKey, message, ByteArray(63), KeyTypes.ED25519) }.exceptionOrNull()
            assertTrue("expected InvalidSignatureException, got $thrown", thrown is InvalidSignatureException)
        }

    @Test
    fun `wrong key lengths throw InvalidKeyLengthException`() =
        runTest {
            val keyPair = crypto.generateKeyPair(KeyTypes.ED25519)
            val message = byteArrayOf(1)

            val shortPrivate = runCatching { crypto.sign(ByteArray(31), message, KeyTypes.ED25519) }.exceptionOrNull()
            val shortPublicVerify =
                runCatching {
                    crypto.verify(ByteArray(31), message, crypto.sign(keyPair.privateKey, message, KeyTypes.ED25519), KeyTypes.ED25519)
                }.exceptionOrNull()
            val shortPrivateDerive = runCatching { crypto.derivePublicKey(ByteArray(31), KeyTypes.ED25519) }.exceptionOrNull()

            assertTrue("expected InvalidKeyLengthException, got $shortPrivate", shortPrivate is InvalidKeyLengthException)
            assertTrue("expected InvalidKeyLengthException, got $shortPublicVerify", shortPublicVerify is InvalidKeyLengthException)
            assertTrue("expected InvalidKeyLengthException, got $shortPrivateDerive", shortPrivateDerive is InvalidKeyLengthException)
        }

    @Test
    fun `unsupported key type is rejected by every method`() =
        runTest {
            val unsupported = 99
            val keyPair = crypto.generateKeyPair(KeyTypes.ED25519)

            assertTrue(runCatching { crypto.generateKeyPair(unsupported) }.exceptionOrNull() is IllegalArgumentException)
            assertTrue(
                runCatching { crypto.derivePublicKey(keyPair.privateKey, unsupported) }.exceptionOrNull() is IllegalArgumentException,
            )
            assertTrue(
                runCatching { crypto.sign(keyPair.privateKey, byteArrayOf(1), unsupported) }.exceptionOrNull() is IllegalArgumentException,
            )
            assertTrue(
                runCatching {
                    crypto.verify(keyPair.publicKey, byteArrayOf(1), ByteArray(64), unsupported)
                }.exceptionOrNull() is IllegalArgumentException,
            )
        }

    @Test
    fun `RFC 8032 TEST 1 known answer`() =
        runTest {
            // RFC 8032 §7.1 TEST 1 (Ed25519, empty message).
            val privateKey =
                hex(
                    "9d61b19deffd5a60ba844af492ec2cc4" +
                        "4449c5697b326919703bac031cae7f60",
                )
            val expectedPublic =
                hex(
                    "d75a980182b10ab7d54bfed3c964073a" +
                        "0ee172f3daa62325af021a68f707511a",
                )
            val expectedSignature =
                hex(
                    "e5564300c360ac729086e2cc806e828a" +
                        "84877f1eb8e5d974d873e06522490155" +
                        "5fb8821590a33bacc61e39701cf9b46b" +
                        "d25bf5f0595bbe24655141438e7a100b",
                )

            assertArrayEquals(expectedPublic, crypto.derivePublicKey(privateKey, KeyTypes.ED25519))
            val signature = crypto.sign(privateKey, ByteArray(0), KeyTypes.ED25519)
            assertArrayEquals(expectedSignature, signature)
            assertTrue(crypto.verify(expectedPublic, ByteArray(0), signature, KeyTypes.ED25519))
        }

    @Test
    fun `only ED25519 is supported`() {
        assertEquals(listOf(KeyTypes.ED25519), crypto.getSupportedKeyTypes())
    }

    private fun hex(s: String): ByteArray =
        ByteArray(s.length / 2) {
            (
                (Character.digit(s[it * 2], 16) shl 4) +
                    Character.digit(s[it * 2 + 1], 16)
            ).toByte()
        }
}
