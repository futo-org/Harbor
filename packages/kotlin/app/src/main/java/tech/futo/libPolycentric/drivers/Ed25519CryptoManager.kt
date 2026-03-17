package tech.futo.libPolycentric.drivers

import org.bouncycastle.crypto.generators.Ed25519KeyPairGenerator
import org.bouncycastle.crypto.params.Ed25519KeyGenerationParameters
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import tech.futo.libPolycentric.platform.ICryptoManager
import tech.futo.libPolycentric.platform.RawKeyPair
import java.security.SecureRandom

class Ed25519CryptoManager : ICryptoManager {
    companion object {
        const val KEY_TYPE_ED25519 = 1L
        private const val PRIVATE_KEY_LENGTH = 32
        private const val PUBLIC_KEY_LENGTH = 32
        private const val SIGNATURE_LENGTH = 64
    }

    private val secureRandom = SecureRandom()

    override fun generateKeyPair(keyType: Long): RawKeyPair {
        requireEd25519(keyType)

        val generator = Ed25519KeyPairGenerator()
        generator.init(Ed25519KeyGenerationParameters(secureRandom))
        val pair = generator.generateKeyPair()

        val privateParams = pair.private as Ed25519PrivateKeyParameters
        val publicParams = pair.public as Ed25519PublicKeyParameters

        return RawKeyPair(
            privateKey = privateParams.encoded,
            publicKey = publicParams.encoded,
        )
    }

    override fun derivePublicKey(privateKey: ByteArray, keyType: Long): ByteArray {
        requireEd25519(keyType)
        require(privateKey.size == PRIVATE_KEY_LENGTH) {
            "Private key must be $PRIVATE_KEY_LENGTH bytes, got ${privateKey.size}"
        }

        val privateParams = Ed25519PrivateKeyParameters(privateKey, 0)
        return privateParams.generatePublicKey().encoded
    }

    override fun sign(privateKey: ByteArray, message: ByteArray, keyType: Long): ByteArray {
        requireEd25519(keyType)
        require(privateKey.size == PRIVATE_KEY_LENGTH) {
            "Private key must be $PRIVATE_KEY_LENGTH bytes, got ${privateKey.size}"
        }

        val privateParams = Ed25519PrivateKeyParameters(privateKey, 0)
        val signer = Ed25519Signer()
        signer.init(true, privateParams)
        signer.update(message, 0, message.size)

        val signature = signer.generateSignature()
        require(signature.size == SIGNATURE_LENGTH) {
            "Expected $SIGNATURE_LENGTH byte signature, got ${signature.size}"
        }
        return signature
    }

    override fun verify(
        publicKey: ByteArray,
        message: ByteArray,
        signature: ByteArray,
        keyType: Long,
    ): Boolean {
        requireEd25519(keyType)
        require(publicKey.size == PUBLIC_KEY_LENGTH) {
            "Public key must be $PUBLIC_KEY_LENGTH bytes, got ${publicKey.size}"
        }
        require(signature.size == SIGNATURE_LENGTH) {
            "Signature must be $SIGNATURE_LENGTH bytes, got ${signature.size}"
        }

        val publicParams = Ed25519PublicKeyParameters(publicKey, 0)
        val verifier = Ed25519Signer()
        verifier.init(false, publicParams)
        verifier.update(message, 0, message.size)
        return verifier.verifySignature(signature)
    }

    override fun generateProcessId(): ByteArray {
        val bytes = ByteArray(16)
        secureRandom.nextBytes(bytes)
        return bytes
    }

    override fun getSupportedKeyTypes(): List<Long> {
        return listOf(KEY_TYPE_ED25519)
    }

    private fun requireEd25519(keyType: Long) {
        require(keyType == KEY_TYPE_ED25519) {
            "Unsupported key type: $keyType. Only ED25519 ($KEY_TYPE_ED25519) is supported."
        }
    }
}
