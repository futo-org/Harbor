package tech.futo.libPolycentric.drivers.storage.sqlite

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import okio.ByteString.Companion.toByteString
import polycentric.PrivateKey
import polycentric.PublicKey
import tech.futo.libPolycentric.platform.IKeysRepository
import tech.futo.libPolycentric.platform.StoredKeyPair

class SQLKeysRepository(private val db: SQLiteDatabase) : IKeysRepository {

    override fun storeKeys(keys: StoredKeyPair) {
        val values = ContentValues().apply {
            put("key_type", keys.privateKey.key_type)
            put("private_key", keys.privateKey.key.toByteArray())
            put("public_key", keys.publicKey.key.toByteArray())
        }
        db.insertWithOnConflict("keys", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    override fun retrieveKeysByPublicKey(publicKey: PublicKey): StoredKeyPair? {
        val cursor = db.rawQuery(
            "SELECT key_type, private_key, public_key FROM keys WHERE hex(public_key) = ?",
            arrayOf(publicKey.key.hex().uppercase()),
        )
        cursor.use {
            if (!it.moveToFirst()) return null

            val keyType = it.getLong(0)
            val privateKeyBytes = it.getBlob(1)
            val publicKeyBytes = it.getBlob(2)

            return StoredKeyPair(
                privateKey = PrivateKey(key_type = keyType, key = privateKeyBytes.toByteString()),
                publicKey = PublicKey(key_type = keyType, key = publicKeyBytes.toByteString()),
            )
        }
    }

    override fun removeKeys(publicKey: PublicKey) {
        db.execSQL(
            "DELETE FROM keys WHERE hex(public_key) = ?",
            arrayOf(publicKey.key.hex().uppercase()),
        )
    }

    override fun getAllKeys(): List<StoredKeyPair> {
        val cursor = db.rawQuery("SELECT key_type, private_key, public_key FROM keys", null)
        val results = mutableListOf<StoredKeyPair>()
        cursor.use {
            while (it.moveToNext()) {
                val keyType = it.getLong(0)
                val privateKeyBytes = it.getBlob(1)
                val publicKeyBytes = it.getBlob(2)

                results.add(
                    StoredKeyPair(
                        privateKey = PrivateKey(key_type = keyType, key = privateKeyBytes.toByteString()),
                        publicKey = PublicKey(key_type = keyType, key = publicKeyBytes.toByteString()),
                    )
                )
            }
        }
        return results
    }
}
