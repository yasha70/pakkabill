package com.pakkabill.core

import org.mozilla.javascript.Context
import org.mozilla.javascript.Function
import org.mozilla.javascript.Scriptable
import org.mozilla.javascript.ScriptableObject

/**
 * English to Hindi with the website's own dictionary and rules (pnl-hi.js, copied at build
 * time), so every label, note and message reads the same as on the website. Text that is not
 * in the dictionary (SKU codes, product and file names) stays as it is. Results are remembered,
 * so a screen drawn again costs nothing. Safe to call from any thread.
 */
class Hindi {
    private val scope: ScriptableObject
    private val tr: Function
    private val memo = HashMap<String, String>()
    // the website's dictionary, for the common case of a whole label: no script run needed
    private val dict = HashMap<String, String>()

    init {
        val cx = Context.enter()
        try {
            cx.setInterpretedMode(true)
            cx.languageVersion = Context.VERSION_ES6
            scope = cx.initStandardObjects()
            val src = Hindi::class.java.getResourceAsStream("/pakkabill/hi.js")!!.readBytes().toString(Charsets.UTF_8)
            cx.evaluateString(scope, src, "hi.js", 1, null)
            val hi = scope.get("HI18N", scope) as Scriptable
            tr = hi.get("tr", hi) as Function
            val d = hi.get("dict", hi) as Scriptable
            for (id in d.ids) {
                val k = id as? String ?: continue
                val v = d.get(k, d)
                if (v is CharSequence && v.isNotEmpty()) dict[k] = v.toString()
            }
        } finally {
            Context.exit()
        }
    }

    @Synchronized
    fun tr(s: String): String {
        if (s.isBlank()) return s
        memo[s]?.let { return it }
        exact(s)?.let { memo[s] = it; return it }
        val cx = Context.enter()
        val out = try {
            cx.setInterpretedMode(true)
            cx.languageVersion = Context.VERSION_ES6
            Context.toString(tr.call(cx, scope, scope, arrayOf(s)))
        } catch (e: Exception) {
            s
        } finally {
            Context.exit()
        }
        if (memo.size > 5000) memo.clear()
        memo[s] = out
        return out
    }

    /** The same as the website's tr() when the whole text is a dictionary key; null otherwise. */
    private fun exact(s: String): String? {
        if (s.none { it in 'A'..'Z' || it in 'a'..'z' }) return s
        val start = s.indexOfFirst { !it.isWhitespace() }
        val end = s.indexOfLast { !it.isWhitespace() }
        val core = s.substring(start, end + 1).replace(WS, " ")
        val out = dict[core] ?: return null
        return s.substring(0, start) + out + s.substring(end + 1)
    }

    private companion object { val WS = Regex("\\s+") }
}
