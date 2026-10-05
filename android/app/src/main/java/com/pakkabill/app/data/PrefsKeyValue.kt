package com.pakkabill.app.data

import android.content.Context

/** [KeyValue] in the app's private SharedPreferences (not readable by other apps). */
class PrefsKeyValue(context: Context, name: String) : KeyValue {
    private val prefs = context.getSharedPreferences(name, Context.MODE_PRIVATE)
    override fun get(key: String): String? = prefs.getString(key, null)
    override fun put(key: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    }
}
