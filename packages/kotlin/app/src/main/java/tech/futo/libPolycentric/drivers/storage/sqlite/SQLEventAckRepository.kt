package tech.futo.libPolycentric.drivers.storage.sqlite

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import tech.futo.libPolycentric.platform.IEventAckRepository

class SQLEventAckRepository(private val db: SQLiteDatabase) : IEventAckRepository {

    override fun storeEventAck(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
        serverUrl: String,
    ) {
        val values = ContentValues().apply {
            put("system_key_type", systemKeyType)
            put("system_key", systemKey)
            put("process", process)
            put("logical_clock", logicalClock)
            put("server_url", serverUrl)
        }
        db.insertWithOnConflict("event_acks", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    override fun getEventAcks(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
    ): List<String> {
        val cursor = db.rawQuery(
            """SELECT server_url FROM event_acks
               WHERE system_key_type = ? AND hex(system_key) = ? AND hex(process) = ? AND logical_clock = ?""",
            arrayOf(
                systemKeyType.toString(),
                systemKey.toUpperHex(),
                process.toUpperHex(),
                logicalClock.toString(),
            ),
        )
        val results = mutableListOf<String>()
        cursor.use {
            while (it.moveToNext()) {
                results.add(it.getString(0))
            }
        }
        return results
    }

    override fun hasEventAck(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
        serverUrl: String,
    ): Boolean {
        val cursor = db.rawQuery(
            """SELECT COUNT(*) FROM event_acks
               WHERE system_key_type = ? AND hex(system_key) = ? AND hex(process) = ? AND logical_clock = ? AND server_url = ?""",
            arrayOf(
                systemKeyType.toString(),
                systemKey.toUpperHex(),
                process.toUpperHex(),
                logicalClock.toString(),
                serverUrl,
            ),
        )
        cursor.use {
            if (!it.moveToFirst()) return false
            return it.getLong(0) > 0
        }
    }

    override fun removeEventAcks(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
    ) {
        db.execSQL(
            "DELETE FROM event_acks WHERE system_key_type = ? AND hex(system_key) = ? AND hex(process) = ? AND logical_clock = ?",
            arrayOf(
                systemKeyType.toString(),
                systemKey.toUpperHex(),
                process.toUpperHex(),
                logicalClock.toString(),
            ),
        )
    }
}
