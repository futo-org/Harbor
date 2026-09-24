package org.futo.polycentric.core

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

/**
 * Robolectric tests for the schema lifecycle: fresh create, the deliberate
 * v1 → v2 migration (active_session split out, seeded from the existing
 * binding so an upgrading user isn't silently logged out), and the v2 → v2
 * no-op.
 */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class PolycentricDbHelperTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun openV1Database(name: String): SQLiteDatabase {
        // Pre-seed a version-1 database: the v2 schema WITHOUT active_session,
        // PRAGMA user_version = 1.
        val db = context.openOrCreateDatabase(name, Context.MODE_PRIVATE, null)
        for (table in SqliteSchema.tables.filter { !it.contains("active_session") }) db.execSQL(table)
        for (index in SqliteSchema.indexes) db.execSQL(index)
        db.insert(
            "active_identity_for_key",
            null,
            android.content.ContentValues().apply {
                put("public_key", ByteArray(32) { 9 })
                put("identity_key", "bound-identity")
            },
        )
        db.version = 1
        db.close()
        return db
    }

    @Test
    fun `onCreate seeds schema version and all tables and indexes`() {
        val helper = PolycentricDbHelper(context, "fresh.db")
        val db = helper.writableDatabase

        assertEquals(SqliteSchema.VERSION, db.version)
        val versionRows =
            db.rawQuery("SELECT version, upgraded_on FROM schema_version", null).use { c ->
                c.moveToFirst()
                c.getInt(0) to c.getString(1)
            }
        assertEquals(2, versionRows.first)
        assertEquals("onCreate", versionRows.second)

        val tables =
            db
                .rawQuery(
                    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
                    null,
                ).use { c ->
                    buildList {
                        while (c.moveToNext()) add(c.getString(0))
                    }
                }
        for (required in listOf("schema_version", "active_identity_for_key", "active_session", "keys", "events", "content")) {
            assertTrue("missing table $required", required in tables)
        }

        val indexes =
            db
                .rawQuery(
                    "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
                    null,
                ).use { c ->
                    buildList {
                        while (c.moveToNext()) add(c.getString(0))
                    }
                }
        assertEquals(3, indexes.size)
        helper.close()
    }

    @Test
    fun `v1 to v2 migration creates and seeds active_session without logout`() {
        openV1Database("upgrade-v1.db")

        val helper = PolycentricDbHelper(context, "upgrade-v1.db")
        val db = helper.writableDatabase

        assertEquals(2, db.version)
        // The upgrading user's binding is carried into the session row —
        // they are not silently logged out.
        val session =
            db
                .rawQuery("SELECT identity_key FROM active_session WHERE id = 0", null)
                .use { c -> if (c.moveToFirst()) c.getString(0) else null }
        assertEquals("bound-identity", session)
        helper.close()
    }

    @Test
    fun `v2 to v2 upgrade is a no-op`() {
        val helper = PolycentricDbHelper(context, "already-v2.db")
        helper.writableDatabase.execSQL(
            "INSERT OR REPLACE INTO active_session (id, identity_key) VALUES (0, 'session-kept')",
        )
        helper.close()

        // Reopen: onUpgrade must not re-seed or clobber anything.
        val helper2 = PolycentricDbHelper(context, "already-v2.db")
        val db = helper2.writableDatabase
        assertEquals(2, db.version)
        val session =
            db
                .rawQuery("SELECT identity_key FROM active_session WHERE id = 0", null)
                .use { c -> if (c.moveToFirst()) c.getString(0) else null }
        assertEquals("session-kept", session)
        helper2.close()
    }
}
