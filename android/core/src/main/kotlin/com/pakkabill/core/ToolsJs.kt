package com.pakkabill.core

import org.mozilla.javascript.Context
import org.mozilla.javascript.Function
import org.mozilla.javascript.NativeArray
import org.mozilla.javascript.Scriptable
import org.mozilla.javascript.ScriptableObject
import org.mozilla.javascript.typedarrays.NativeTypedArrayView

/**
 * The website's tool engines, run on the phone in Rhino (no browser or WebView), so every tool works
 * out exactly what the website does: Labels (PBL), GSTR-1 (PBG1B, PBG1, PBG1V), Low shipping image
 * (PBShip), Meesho Lens (PBLensCore) and Auto listing (PBListCore). The engines are taken from the
 * website's files when the app is built (android/engines/build.mjs). Everything goes in and out as
 * JSON text. Calls must come from one thread at a time (each tool uses one worker).
 */
class ToolsJs(private val source: (String) -> String = ::resource) {
    private val scope: ScriptableObject
    private val loaded = HashSet<String>()

    init {
        val cx = enter()
        try {
            scope = cx.initStandardObjects()
            cx.evaluateString(scope, source("tools-prelude.js"), "tools-prelude.js", 1, null)
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

    /**
     * Loads engines ("labels", "g1check", "g1view", "g1build", "lowship", "lenscore", "listcore", "listing",
     * "xmldom") and the app's glue for them ("labels-facade" ...) once each.
     */
    fun use(vararg engines: String): ToolsJs {
        val cx = enter()
        try {
            for (e in engines) {
                if (!loaded.add(e)) continue
                // GSTR-1's builder and page use the checker's document series
                if (e == "g1build" || e == "g1view") use("g1check")
                // "labels-facade" and the like are the app's own glue; the rest are the website's engines
                val file = if (e.endsWith("-facade")) "$e.js" else "tools/$e.js"
                cx.evaluateString(scope, source(file), "$e.js", 1, null)
            }
        } finally {
            Context.exit()
        }
        return this
    }

    /** Calls an engine function, such as "PBL.packChart", with arguments given as JSON texts. */
    fun call(fn: String, vararg jsonArgs: String): String {
        val cx = enter()
        try {
            val f = scope.get("__pbCall", scope) as Function
            return Context.toString(f.call(cx, scope, scope, arrayOf(fn, "[" + jsonArgs.joinToString(",") + "]")))
        } finally {
            Context.exit()
        }
    }

    /**
     * Calls an engine function that gives a Promise, and waits for it (the promise's work runs here,
     * on this thread). Gives its value as JSON text; a rejected promise throws with its message.
     */
    fun callAsync(fn: String, vararg jsonArgs: String): String {
        val cx = enter()
        try {
            (scope.get("__pbAsync", scope) as Function).call(cx, scope, scope, arrayOf(fn, "[" + jsonArgs.joinToString(",") + "]"))
            cx.processMicrotasks()
            val out = Context.toString((scope.get("__pbTake", scope) as Function).call(cx, scope, scope, emptyArray()))
            val o = kotlinx.serialization.json.Json.parseToJsonElement(out)
            if (o !is kotlinx.serialization.json.JsonObject) error("$fn did not finish")
            if ((o["ok"] as? kotlinx.serialization.json.JsonPrimitive)?.content != "true") throw IllegalStateException((o["e"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: "$fn failed")
            return o["v"].toString()
        } finally {
            Context.exit()
        }
    }

    /** Calls an engine function that gives file bytes (an Excel workbook or a zip). */
    fun bytes(fn: String, vararg jsonArgs: String): ByteArray {
        val cx = enter()
        try {
            val f = scope.get("__pbBytes", scope) as Function
            return toBytes(f.call(cx, scope, scope, arrayOf(fn, "[" + jsonArgs.joinToString(",") + "]")))
        } finally {
            Context.exit()
        }
    }

    /** Runs some JavaScript in the engines' scope (tests and small glue); gives its value as text. */
    fun eval(code: String, name: String = "eval"): String {
        val cx = enter()
        try {
            return Context.toString(cx.evaluateString(scope, code, name, 1, null))
        } finally {
            Context.exit()
        }
    }

    /** A Kotlin function the JavaScript can call by [name] with text arguments (tests: files, output). */
    fun define(name: String, fn: (List<Any?>) -> Any?) {
        val cx = enter()
        try {
            ScriptableObject.putProperty(scope, name, object : org.mozilla.javascript.BaseFunction() {
                override fun call(cx: Context, scope: Scriptable, thisObj: Scriptable?, args: Array<out Any?>): Any? =
                    Context.javaToJS(fn(args.map { if (it is org.mozilla.javascript.Wrapper) it.unwrap() else it }), scope)
            })
        } finally {
            Context.exit()
        }
    }

    companion object {
        fun resource(name: String): String = ToolsJs::class.java.getResourceAsStream("/pakkabill/$name")?.readBytes()?.toString(Charsets.UTF_8)
            ?: error("$name missing from the app")

        /** A typed array or plain array of numbers from JavaScript, as bytes. */
        fun toBytes(v: Any?): ByteArray = when (v) {
            is NativeTypedArrayView<*> -> ByteArray(v.size) { i -> (v[i] as Number).toInt().toByte() }
            is NativeArray -> ByteArray(v.size) { i -> (v[i] as Number).toInt().toByte() }
            is ByteArray -> v
            null -> ByteArray(0)
            else -> error("not bytes: ${v.javaClass.simpleName}")
        }
    }
}
