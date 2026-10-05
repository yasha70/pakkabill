package com.pakkabill.core

import org.mozilla.javascript.Context
import org.mozilla.javascript.Function
import org.mozilla.javascript.Scriptable
import org.mozilla.javascript.ScriptableObject

/**
 * Runs the Meesho P&L engine from the PakkaBill website (engine.js, copied from pnl.html when the
 * app is built) in Rhino, a JavaScript engine written in Java: no browser or WebView is involved,
 * and every number is calculated exactly as on the website. Rhino runs in interpreted mode,
 * which works on Android. Calls must come from one thread at a time (the app uses one worker).
 */
class PnlEngine {
    private val scope: ScriptableObject
    private val pb: Scriptable

    init {
        val cx = enter()
        try {
            scope = cx.initStandardObjects()
            for (file in listOf("engine.js", "guide.js", "facade.js")) {
                val src = PnlEngine::class.java.getResourceAsStream("/pakkabill/$file")?.readBytes()?.toString(Charsets.UTF_8)
                    ?: error("$file missing from the app")
                cx.evaluateString(scope, src, file, 1, null)
            }
            pb = scope.get("PB", scope) as Scriptable
        } finally {
            Context.exit()
        }
    }

    private fun enter(): Context {
        val cx = Context.enter()
        cx.setInterpretedMode(true) // no bytecode generation: works on Android
        cx.languageVersion = Context.VERSION_ES6
        return cx
    }

    private fun call(name: String, vararg args: Any?): String {
        val cx = enter()
        try {
            val f = pb.get(name, pb) as Function
            return Context.toString(f.call(cx, scope, pb, args))
        } finally {
            Context.exit()
        }
    }

    /** Reads one spreadsheet into the engine's file format (JSON text kept by [PnlStore]). */
    fun ingest(file: SheetFile, settingsJson: String): String =
        call("ingest", file.name, file.size.toDouble(), Json.sheets(file.sheets), settingsJson)

    /** The full report for a period (see [Report]). */
    fun report(stateJson: String): String = call("report", stateJson)

    /** Which files the engine keeps from the last report ("" when none): they need not be sent again. */
    fun filesKey(): String = call("filesKey").let { if (it == "null" || it == "undefined") "" else it }

    /** The "How to use" guide of the website (see [Guide]). */
    fun guide(): String = call("guide")

    /** Sample data: files, costs, expenses and settings of the sample store. */
    fun demo(): String = call("demo")
}
