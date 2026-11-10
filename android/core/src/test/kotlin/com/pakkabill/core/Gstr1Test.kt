package com.pakkabill.core

import com.pakkabill.core.gstr1.G1Settings
import com.pakkabill.core.gstr1.Gstr1Engine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json

/**
 * The GSTR-1 the app makes is the website's: random but realistic Meesho and Amazon reports
 * (resources/gstr1, made by make_reports.py) give exactly the JSON the website's GSTR-1 page made
 * from the same files (website-GSTR1.json), as CSV and as Excel.
 */
class Gstr1Test {
    private fun res(n: String) = Gstr1Test::class.java.getResourceAsStream("/gstr1/$n")!!.readBytes()
    private val names = listOf("tcs_sales", "tcs_sales_return", "Tax_invoice_details", "MTR_B2C-MAR-2025", "MTR_B2B-MAR-2025")

    private fun run(ext: String): Pair<Gstr1Engine, String> {
        val e = Gstr1Engine()
        names.forEachIndexed { i, n ->
            val f = SheetReader.read("$n.$ext", res("$n.$ext")).files.single()
            val r = e.addFile(i + 1, f.name, f.sheets)
            assertTrue(r.ok, "$n.$ext: ${r.message}")
        }
        val d = e.defaults("")
        val v = e.compute(G1Settings(gstin = d.gstin, period = d.period, etinBySource = d.etinBySource, hsnDesc = d.hsnDesc))
        assertTrue(v.ready, v.notes.toString())
        assertEquals("March 2025", v.label)
        return e to e.jsonText()!!
    }

    @Test fun csvReportsMakeTheWebsitesReturn() {
        val want = Json.parseToJsonElement(res("website-GSTR1.json").toString(Charsets.UTF_8))
        val (e, got) = run("csv")
        assertEquals(want, Json.parseToJsonElement(got))
        // the files and checks
        assertTrue(e.workbook().let { it.size > 1000 && it[0] == 'P'.code.toByte() && it[1] == 'K'.code.toByte() })
        assertTrue(e.offline().let { it.size > 1000 && it[0] == 'P'.code.toByte() })
        // the checker finds the same in the app's file as in the website's (this random data has negative HSN lines)
        val c = e.ownCheck()!!
        val w = e.check(want.toString())
        assertEquals(w.issues.map { it.msg }, c.issues.map { it.msg })
    }

    @Test fun excelReportsMakeTheWebsitesReturn() {
        val want = Json.parseToJsonElement(res("website-GSTR1.json").toString(Charsets.UTF_8))
        assertEquals(want, Json.parseToJsonElement(run("xlsx").second))
    }

    @Test fun checkerReadsAnyJson() {
        val e = Gstr1Engine()
        val r = e.check(res("website-GSTR1.json").toString(Charsets.UTF_8))
        assertEquals("032025", r.fp)
        assertTrue(r.threeB != null)
        assertTrue(!e.check("not json").ok)
    }
}
