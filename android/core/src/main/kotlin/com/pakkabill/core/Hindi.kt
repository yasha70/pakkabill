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
        } finally {
            Context.exit()
        }
    }

    @Synchronized
    fun tr(s: String): String {
        if (s.isBlank()) return s
        memo[s]?.let { return it }
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
}
