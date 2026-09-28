package com.pakkabill.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.store: DataStore<Preferences> by preferencesDataStore(name = "settings")

/** The app's own settings (the bills themselves live in the web app's storage). */
class AppSettings(private val context: Context) {
    private object Keys {
        val LOCK = booleanPreferencesKey("app_lock")
        val LAUNCHES = intPreferencesKey("launches")
        val FIRST_OPEN = longPreferencesKey("first_open")
        val REVIEW_ASKED = booleanPreferencesKey("review_asked")
    }

    val lockEnabled: Flow<Boolean> = context.store.data.map { it[Keys.LOCK] ?: false }

    suspend fun setLock(on: Boolean) {
        context.store.edit { it[Keys.LOCK] = on }
    }

    /** Counts this launch; returns (launches so far, first open time). */
    suspend fun countLaunch(): Pair<Int, Long> {
        var out = 0 to 0L
        context.store.edit { p ->
            val n = (p[Keys.LAUNCHES] ?: 0) + 1
            p[Keys.LAUNCHES] = n
            val first = p[Keys.FIRST_OPEN] ?: System.currentTimeMillis().also { p[Keys.FIRST_OPEN] = it }
            out = n to first
        }
        return out
    }

    suspend fun reviewAsked(): Boolean = context.store.data.first()[Keys.REVIEW_ASKED] ?: false

    suspend fun markReviewAsked() {
        context.store.edit { it[Keys.REVIEW_ASKED] = true }
    }
}
