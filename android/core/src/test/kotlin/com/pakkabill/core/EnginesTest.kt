package com.pakkabill.core

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The website's own tests of each tool engine (the test folder's audit files), run inside the app's JavaScript
 * engine (Rhino) on the engines the app ships. Every check the website passes, the app passes too.
 */
class EnginesTest {
    private val root = File(System.getProperty("pakkabill.root") ?: "../..")

    private fun audit(name: String, vararg engines: String): List<String> {
        val js = ToolsJs().use(*engines)
        val out = mutableListOf<String>()
        js.define("__log") { a -> out += a.joinToString(" ") { it.toString() }; null }
        js.define("__read") { a -> File(a[0].toString()).readText() }
        js.eval(
            """
            var console = { log: function () { __log(Array.prototype.join.call(arguments, ' ')); }, warn: function () {}, error: function () { __log(Array.prototype.join.call(arguments, ' ')); } };
            var __exit = null, process = { exit: function (c) { __exit = c; }, env: {} };
            var __dirname = ${q(File(root, "test").absolutePath)};
            var Buffer = { from: function (b) { return { toString: function () { var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i] & 255); return s; } }; } };
            function require(m) {
              if (m === 'fs') return { readFileSync: function (p) { return String(__read(p)); } };
              if (m === 'path') return { join: function () { return Array.prototype.join.call(arguments, '/'); } };
              var mods = { '../gstr1check.js': 'PBG1', '../gstr1view.js': 'PBG1V', '../lens/listcore.js': 'PBListCore', '../lowship.js': 'PBShip' };
              if (mods[m]) return this[mods[m]] || eval(mods[m]);
              throw new Error('no module ' + m);
            }
            """.trimIndent(),
        )
        js.eval(ToolsJs.resource("audits/$name"), name)
        val code = js.eval("String(__exit)")
        val fails = out.filter { it.startsWith("FAIL") }
        assertTrue(fails.isEmpty(), "$name in Rhino:\n" + fails.joinToString("\n"))
        // the audits end with process.exit(1) on a failure; some only exit then
        assertTrue(code == "0" || code == "null", "$name exit code $code; output:\n" + out.takeLast(5).joinToString("\n"))
        return out
    }

    private fun q(s: String) = "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"

    @Test fun labelsEngineMatchesWebsite() { audit("labels-audit.js", "labels") }
    @Test fun gstr1CheckerMatchesWebsite() { audit("gstr1-audit.js", "g1check") }
    @Test fun gstr1PageMatchesWebsite() { audit("gstr1view-audit.js", "g1check", "g1view") }
    @Test fun autoListingMatchesWebsite() { audit("autolist-audit.js", "listcore") }

    @Test fun everyEngineLoads() {
        val js = ToolsJs().use("labels", "g1check", "g1view", "g1build", "lowship", "lenscore", "listcore")
        assertEquals("function", js.eval("typeof PBL.packChart"))
        assertEquals("function", js.eval("typeof PBG1B.build"))
        assertEquals("function", js.eval("typeof PBG1B.parseBook"))
        assertEquals("function", js.eval("typeof PBShip.tweaks"))
        assertEquals("function", js.eval("typeof PBLensCore.money"))
        assertEquals("1,23,456.50", js.eval("new Intl.NumberFormat('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(123456.5)"))
    }
}
