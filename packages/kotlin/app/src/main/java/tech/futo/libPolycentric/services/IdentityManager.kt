package tech.futo.libPolycentric.services

import PolycentricException
import okio.ByteString
import okio.ByteString.Companion.toByteString
import polycentric.PrivateKey
import polycentric.Process
import polycentric.PublicKey
import tech.futo.libPolycentric.PolycentricClient

data class KeyPair(
    val keyType: Long,
    val privateKey: PrivateKey,
    val publicKey: PublicKey,
)

data class Identity(
    val keyPair: KeyPair,
    val process: Process,
)

data class IdentityOptions(
    val keyType: Long,
    val setAsCurrent: Boolean = true,
    val ephemeral: Boolean = false,
)

class IdentityManager(private val client: PolycentricClient) {

    private fun constructKeyPair(keyType: Long): KeyPair {
        val rawKeyPair = client.crypto.generateKeyPair(keyType)

        val privateKey = PrivateKey(
            key_type = keyType,
            key = rawKeyPair.privateKey.toByteString(),
        )
        val publicKey = PublicKey(
            key_type = keyType,
            key = rawKeyPair.publicKey.toByteString(),
        )

        return KeyPair(keyType, privateKey, publicKey)
    }

    suspend fun createIdentity(options: IdentityOptions): KeyPair {
        val keyPair = constructKeyPair(options.keyType)

        if (!options.ephemeral) {
            client.keysRepository.storeKeys(
                tech.futo.libPolycentric.platform.StoredKeyPair(
                    privateKey = keyPair.privateKey,
                    publicKey = keyPair.publicKey,
                )
            )
        }

        if (options.setAsCurrent) {
            setCurrentIdentity(keyPair, options.ephemeral)
        }

        return keyPair
    }

    suspend fun importIdentity(
        privateKey: PrivateKey,
        setAsCurrent: Boolean = true,
    ): KeyPair {
        val keyType = privateKey.key_type

        val publicKeyBytes = client.crypto.derivePublicKey(
            privateKey.key.toByteArray(),
            keyType,
        )
        val publicKey = PublicKey(
            key_type = keyType,
            key = publicKeyBytes.toByteString(),
        )

        client.keysRepository.storeKeys(
            tech.futo.libPolycentric.platform.StoredKeyPair(
                privateKey = privateKey,
                publicKey = publicKey,
            )
        )

        val keyPair = KeyPair(keyType, privateKey, publicKey)

        if (setAsCurrent) {
            setCurrentIdentity(keyPair)
        }

        return keyPair
    }

    suspend fun getAllIdentities(): List<KeyPair> {
        return client.keysRepository.getAllKeys().map { stored ->
            KeyPair(
                keyType = stored.privateKey.key_type,
                privateKey = stored.privateKey,
                publicKey = stored.publicKey,
            )
        }
    }

    suspend fun removeIdentity(publicKey: PublicKey) {
        client.keysRepository.removeKeys(publicKey)
    }

    suspend fun switchIdentity(publicKey: PublicKey): KeyPair {
        val stored = client.keysRepository.retrieveKeysByPublicKey(publicKey)
            ?: throw PolycentricException("Identity with public key not found")

        val keyPair = KeyPair(
            keyType = stored.privateKey.key_type,
            privateKey = stored.privateKey,
            publicKey = stored.publicKey,
        )

        setCurrentIdentity(keyPair)

        return client.currentKeyPair
            ?: throw PolycentricException("Key pair not initialized")
    }

    internal fun sign(bytes: ByteString): ByteString {
        val identity = client.currentIdentity
        val signature = client.crypto.sign(
            privateKey = identity.keyPair.privateKey.key.toByteArray(),
            message = bytes.toByteArray(),
            keyType = identity.keyPair.keyType,
        )
        return signature.toByteString()
    }

    private suspend fun setCurrentIdentity(keyPair: KeyPair, ephemeral: Boolean = false) {
        client.setCurrentKeyPair(keyPair, ephemeral)
    }
}
