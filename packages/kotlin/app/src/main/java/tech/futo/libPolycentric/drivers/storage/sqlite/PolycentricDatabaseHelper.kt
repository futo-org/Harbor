package tech.futo.libPolycentric.drivers.storage.sqlite

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class PolycentricDatabaseHelper(
    context: Context,
    name: String = "polycentric.db",
) : SQLiteOpenHelper(context, name, null, SchemaV1.VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        for (table in SchemaV1.tables) {
            db.execSQL(table)
        }
        for (view in SchemaV1.views) {
            db.execSQL(view)
        }
        for (index in SchemaV1.indexes) {
            db.execSQL(index)
        }
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Future migrations go here
    }
}
