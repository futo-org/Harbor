package tech.futo.libPolycentric.drivers.storage.sqlite

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import okio.ByteString.Companion.toByteString
import polycentric.Process
import tech.futo.libPolycentric.platform.IProcessIdRepository

class SQLProcessIdRepository(private val db: SQLiteDatabase) : IProcessIdRepository {

    override fun getProcessId(): Process? {
        val cursor = db.rawQuery("SELECT process_id FROM process_id WHERE id = 1", null)
        cursor.use {
            if (!it.moveToFirst()) return null
            val processIdBytes = it.getBlob(0)
            return Process(process = processIdBytes.toByteString())
        }
    }

    override fun setProcessId(processId: Process) {
        val values = ContentValues().apply {
            put("id", 1)
            put("process_id", processId.process.toByteArray())
        }
        db.insertWithOnConflict("process_id", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }
}
