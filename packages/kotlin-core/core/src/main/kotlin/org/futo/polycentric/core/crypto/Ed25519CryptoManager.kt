package org.futo.polycentric.core.crypto

import java.security.SecureRandom
import org.bouncycastle.crypto.generators.Ed25519KeyPairGenerator
import org.bouncycastle.crypto.params.Ed25519KeyGenerationParameters
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.futo.polycentric.core.KeyTypes
import org.futo.polycentric.core.platform.ICryptoManager
import org.futo.polycentric.core.platform.StoredKeyPair

/**
 * Ed25519 via BouncyCastle, mirroring js-core's @noble/curves CryptoManager.
 *
 * Keys are raw 32-byte scalars, wire-compatible with both v1 system keys
 * and v2 `PublicKey.key`. Android Keystore cannot hold ed25519 signing
 * keys, so private keys are app-managed (same trade-off polycentricandroid
 * makes today); encrypt-at-rest is the IKeysRepository implementation's job.
 */
class Ed25519CryptoManager : ICryptoManager {
    override fun generateKeyPair(keyType: Int): StoredKeyPair {
        require(keyType == KeyTypes.ED25519) { "Unsupported key type: $keyType" }
        val generator = Ed25519KeyPairGenerator()
        generator.init(Ed25519KeyGenerationParameters(SecureRandom()))
        val pair = generator.generateKeyPair()
        val private = pair.private as Ed25519PrivateKeyParameters
        val public = pair.public as Ed25519PublicKeyParameters
        return StoredKeyPair(
            keyType = keyType,
            publicKey = public.encoded,
            privateKey = private.encoded,
        )
    }

    override suspend fun sign(privateKey: ByteArray, message: ByteArray, keyType: Int): ByteArray {
        require(keyType == KeyTypes.ED25519) { "Unsupported key type: $keyType" }
        val signer = Ed25519Signer()
        signer.init(true, Ed25519PrivateKeyParameters(privateKey, 0))
        signer.update(message, 0, message.size)
        return signer.generateSignature()
    }

    override fun verify(
        publicKey: ByteArray,
        signature: ByteArray,
        message: ByteArray,
        keyType: Int,
    ): Boolean {
        require(keyType == KeyTypes.ED25519) { "Unsupported key type: $keyType" }
        val verifier = Ed25519Signer()
        verifier.init(false, Ed25519PublicKeyParameters(publicKey, 0))
        verifier.update(message, 0, message.size)
        return verifier.verifySignature(signature)
    }
}
