package tech.futo.libPolycentric.drivers.storage.sqlite

import android.content.Context
import tech.futo.libPolycentric.platform.IEventAckRepository
import tech.futo.libPolycentric.platform.IEventRepository
import tech.futo.libPolycentric.platform.IKeysRepository
import tech.futo.libPolycentric.platform.IProcessIdRepository
import tech.futo.libPolycentric.platform.IProcessStateRepository
import tech.futo.libPolycentric.platform.IStorageDriver

class SQLiteStorageDriver(context: Context, databaseName: String = "polycentric.db") : IStorageDriver {
    private val dbHelper = PolycentricDatabaseHelper(context, databaseName)
    private val db = dbHelper.writableDatabase

    override fun createEventRepository(): IEventRepository = SQLEventRepository(db)
    override fun createKeysRepository(): IKeysRepository = SQLKeysRepository(db)
    override fun createProcessStateRepository(): IProcessStateRepository = SQLProcessStateRepository(db)
    override fun createEventAckRepository(): IEventAckRepository = SQLEventAckRepository(db)
    override fun createProcessIdRepository(): IProcessIdRepository = SQLProcessIdRepository(db)

    fun close() {
        dbHelper.close()
    }
}
