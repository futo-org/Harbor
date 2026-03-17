package tech.futo.libPolycentric.platform

interface ICryptoManager {
    fun generateKeyPair(keyType: Long): RawKeyPair
    fun derivePublicKey(privateKey: ByteArray, keyType: Long): ByteArray
    fun sign(privateKey: ByteArray, message: ByteArray, keyType: Long): ByteArray
    fun verify(publicKey: ByteArray, message: ByteArray, signature: ByteArray, keyType: Long): Boolean
    fun generateProcessId(): ByteArray
    fun getSupportedKeyTypes(): List<Long>
}

data class RawKeyPair(
    val privateKey: ByteArray,
    val publicKey: ByteArray,
)
