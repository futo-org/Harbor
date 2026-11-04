package org.futo.polycentric.core

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.futo.polycentric.ffi.KeyCipher
import org.futo.polycentric.ffi.SdkException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Seals private keys with an AES-GCM key held in the Android Keystore, so
 * they're encrypted at rest. (The Keystore can't hold ed25519 keys
 * themselves, so they still reach memory to sign.)
 *
 * Sealed form: 12-byte IV, then ciphertext with its tag.
 */
class AndroidKeystoreKeyCipher(
    private val alias: String = "polycentric-key-cipher",
) : KeyCipher {
    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec
                .Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    override suspend fun seal(privateKey: ByteArray): ByteArray =
        try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key())
            cipher.iv + cipher.doFinal(privateKey)
        } catch (e: Exception) {
            throw SdkException.Storage("sealing a private key failed: $e")
        }

    override suspend fun open(sealed: ByteArray): ByteArray =
        try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                key(),
                GCMParameterSpec(TAG_BITS, sealed, 0, IV_BYTES),
            )
            cipher.doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES)
        } catch (e: Exception) {
            throw SdkException.Storage("opening a private key failed: $e")
        }
}
