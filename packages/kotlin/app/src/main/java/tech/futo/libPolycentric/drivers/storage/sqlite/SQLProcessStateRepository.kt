package tech.futo.libPolycentric.drivers.storage.sqlite

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import tech.futo.libPolycentric.platform.IProcessStateRepository

class SQLProcessStateRepository(private val db: SQLiteDatabase) : IProcessStateRepository {

    override fun persistCurrentLogicalClock(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
        logicalClock: Long,
    ) {
        val values = ContentValues().apply {
            put("system_key_type", systemKeyType)
            put("system_key", systemKey)
            put("process", process)
            put("logical_clock", logicalClock)
        }
        db.insertWithOnConflict("process_state", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    override fun getCurrentLogicalClock(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
    ): Long {
        val cursor = db.rawQuery(
            "SELECT logical_clock FROM process_state WHERE system_key_type = ? AND hex(system_key) = ? AND hex(process) = ?",
            arrayOf(
                systemKeyType.toString(),
                systemKey.toUpperHex(),
                process.toUpperHex(),
            ),
        )
        cursor.use {
            if (!it.moveToFirst()) return 0L
            return it.getLong(0)
        }
    }

    override fun getNextLogicalClock(
        systemKeyType: Long,
        systemKey: ByteArray,
        process: ByteArray,
    ): Long {
        return getCurrentLogicalClock(systemKeyType, systemKey, process) + 1
    }
}

internal fun ByteArray.toUpperHex(): String =
    joinToString("") { "%02X".format(it) }
