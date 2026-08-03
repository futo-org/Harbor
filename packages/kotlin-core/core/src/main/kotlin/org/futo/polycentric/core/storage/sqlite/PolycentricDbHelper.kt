package org.futo.polycentric.core.storage.sqlite

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Creates and versions the SQLite database backing the v2 storage driver.
 * Schema lives in [SqliteSchema]; future changes bump `SqliteSchema.VERSION`
 * and add branches to [onUpgrade].
 */
class PolycentricDbHelper(
    context: Context,
    name: String = "polycentric-v2.db",
) : SQLiteOpenHelper(context, name, null, SqliteSchema.VERSION) {

    override fun onConfigure(db: SQLiteDatabase) {
        // Enforce the FK/CHECK constraints declared in the schema.
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.beginTransaction()
        try {
            for (table in SqliteSchema.tables) db.execSQL(table)
            for (index in SqliteSchema.indexes) db.execSQL(index)
            db.insert(
                "schema_version",
                null,
                ContentValues().apply {
                    put("version", SqliteSchema.VERSION)
                    put("upgraded_on", "onCreate")
                },
            )
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // No migrations yet — v1 is the initial schema.
    }
}
