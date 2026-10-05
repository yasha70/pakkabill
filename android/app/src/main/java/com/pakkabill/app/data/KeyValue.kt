package com.pakkabill.app.data

/** Small text values kept on the phone (the login, the plan settings, app settings). */
interface KeyValue {
    fun get(key: String): String?
    fun put(key: String, value: String?)
}
