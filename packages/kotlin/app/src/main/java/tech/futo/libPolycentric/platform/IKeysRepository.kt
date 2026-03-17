package tech.futo.libPolycentric.platform

import polycentric.PrivateKey
import polycentric.PublicKey

data class StoredKeyPair(
    val privateKey: PrivateKey,
    val publicKey: PublicKey,
)

interface IKeysRepository {
    fun storeKeys(keys: StoredKeyPair)
    fun retrieveKeysByPublicKey(publicKey: PublicKey): StoredKeyPair?
    fun removeKeys(publicKey: PublicKey)
    fun getAllKeys(): List<StoredKeyPair>
}
