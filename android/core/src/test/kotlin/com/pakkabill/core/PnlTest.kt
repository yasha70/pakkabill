package com.pakkabill.core

import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.jsonObject

/** The sample store's files (made from the website's sample data) give the audited numbers. */
class PnlTest {
    private val engine = PnlEngine()
    private fun res(n: String) = PnlTest::class.java.getResourceAsStream("/meesho/$n")!!.readBytes()

    private fun storeWithSampleFiles(vararg picked: Pair<String, ByteArray>): PnlStore {
        val dir = Files.createTempDirectory("pnl").toFile()
        val store = PnlStore(dir, engine)
        // the sample store's costs, expenses and settings
        store.startSample()
        val st = store.sample!!.state
        store.endSample()
        store.update { st }
        val r = store.addFiles(picked.toList())
        assertEquals(picked.size, r.added, r.messages.joinToString())
        return store
    }

    @Test fun sampleReportMatchesAudit() {
        val store = PnlStore(Files.createTempDirectory("pnl").toFile(), engine)
        store.startSample()
        val (r, _) = store.report(Sel())
        assertEquals(1795139, r.sum.NP)
        assertEquals(11574100, r.sum.NS)
        assertEquals(8756110, r.sum.payout)
        assertEquals(272, r.sum.sales)
        assertEquals(239, r.sum.del)
        assertEquals(7511, r.sum.perDel)
        assertTrue(r.checks.bridge && r.checks.sku)
        val sep = store.report(Sel(mode = "month", m = "2026-09")).first
        assertEquals(775499, sep.vs!!.diff)
    }

    @Test fun excelAndCsvFilesGiveTheSameReport() {
        val store = storeWithSampleFiles("Meesho payment report.xlsx" to res("pay.xlsx"), "orders.csv" to res("orders.csv"))
        val (r, _) = store.report(Sel())
        assertEquals(1795139, r.sum.NP)
        assertEquals(11574100, r.sum.NS)
        assertEquals(8756110, r.sum.payout)
        assertEquals(239, r.sum.del)
        assertEquals(7511, r.sum.perDel)
        assertEquals(r.skus.sumOf { it.delivered }, r.sum.del)
        assertEquals(2, r.files.size)
        // the same files again are not added twice
        val again = store.addFiles(listOf("orders.csv" to res("orders.csv")))
        assertEquals(0, again.added)
    }

    @Test fun keptFilesGiveTheSameReport() {
        val dir = Files.createTempDirectory("pnl").toFile()
        val store = PnlStore(dir, engine)
        store.addFiles(listOf("Meesho payment report.xlsx" to res("pay.xlsx"), "orders.csv" to res("orders.csv")))
        val (r, unchanged) = store.report(Sel(mode = "month", m = "2026-09"))
        // the engine keeps the files between reports: after a cost, a return mark and a setting
        // change the numbers must be exactly what a fresh engine works out from the files
        store.setCost(r.costs[0].sku) { it.copy(c = 15000, b = 12) }
        store.setMark(r.orders.first { it.cond.isNotBlank() }.id, "loss")
        store.update { it.copy(settings = it.settings.copy(pack = 700, buyGst = 5)) }
        val sel = Sel(mode = "month", m = "2026-09")
        val kept = store.report(sel).second
        assertEquals(PnlStore(dir, PnlEngine()).report(sel).second, kept)
        assertTrue(kept != unchanged)
        // a removed file is noticed
        val before = store.report(Sel()).first
        store.removeFile(before.files.first { it.name == "orders.csv" }.id)
        val after = store.report(Sel()).first
        assertEquals(1, after.files.size)
        assertEquals(PnlStore(dir, PnlEngine()).report(Sel()).second, store.report(Sel()).second)
    }

    @Test fun zipOfBothFiles() {
        val zip = ByteArrayOutputStream().also { o ->
            ZipOutputStream(o).use { z ->
                z.putNextEntry(ZipEntry("reports/pay.xlsx")); z.write(res("pay.xlsx")); z.closeEntry()
                z.putNextEntry(ZipEntry("__MACOSX/._pay.xlsx")); z.write(byteArrayOf(1, 2)); z.closeEntry()
                z.putNextEntry(ZipEntry("orders.csv")); z.write(res("orders.csv")); z.closeEntry()
            }
        }.toByteArray()
        val read = SheetReader.read("meesho.zip", zip)
        assertEquals(listOf("pay.xlsx", "orders.csv"), read.files.map { it.name })
        val dir = Files.createTempDirectory("pnl").toFile()
        val store = PnlStore(dir, engine)
        val r = store.addFiles(listOf("meesho.zip" to zip))
        assertEquals(2, r.added)
        assertTrue(r.fromZip)
        // nested ZIPs (a ZIP inside a ZIP) are read too
        assertTrue(SheetReader.read("nested.zip", res("nested.zip")).files.isNotEmpty())
    }

    @Test fun categoriesFromCatalogFile() {
        val store = storeWithSampleFiles("pay.xlsx" to res("pay.xlsx"), "catalog.csv" to res("catalog.csv"))
        val cost = store.report(Sel()).first.costs.first { it.sku == "BPYG05" }
        assertTrue(cost.autoCat.contains("saree", ignoreCase = true), cost.autoCat)
    }

    @Test fun goodsBoughtWithGstBill() {
        val store = PnlStore(Files.createTempDirectory("pnl").toFile(), engine)
        store.startSample()
        store.update { it.copy(settings = it.settings.copy(buyGst = 5)) }
        val r = store.report(Sel()).first
        // input credit only pays GST on sales: the gain is the GST no longer paid in cash, never more
        // and TCS only pays GST: with no GST left to pay, it is not profit either (TDS still is)
        assertEquals(1866808, r.sum.NP)
        assertEquals(146516, r.gst!!.unusable)
        assertEquals(55113, r.gst!!.tcsUnused)
        assertEquals(273298, r.gst!!.itcGoods)
        assertTrue(r.checks.bridge && r.checks.sku)
        assertTrue(r.gstRows.any { it.l.startsWith("GST credit carried forward") })
        // one SKU without a bill, another at 12%
        store.setCost("MN08") { it.copy(b = 12) }
        store.setCost("BG32") { it.copy(b = 0) }
        val r2 = store.report(Sel()).first
        assertEquals(1866808, r2.sum.NP)
        assertEquals(12, r2.costs.first { it.sku == "MN08" }.rate)
        assertEquals(0, r2.costs.first { it.sku == "BG32" }.rate)
        // orders and payouts for the Orders tab
        assertEquals(433, r2.orders.size)
        assertEquals(5, r2.reconcile["issues"]!!.n)
        assertTrue(r2.payouts.isNotEmpty())
    }

    @Test fun oldSavedCostsDoNotWipeEverything() {
        val dir = Files.createTempDirectory("pnl").toFile()
        dir.resolve("state.json").writeText("""{"costs":{"A1":{"c":9500,"p":2,"n":"note"},"B2":{"c":100}},"expenses":[{"id":"x","name":"Rent","amt":500000,"when":"monthly"}],"settings":{"biz":"Kavya"}}""")
        val st = PnlStore(dir, engine).state
        assertEquals("Kavya", st.settings.biz)
        assertEquals(1, st.expenses.size)
        assertEquals(100L, st.costs["B2"]!!.c)
    }

    @Test fun hindiAndGuideFromTheWebsite() {
        val hi = Hindi()
        assertEquals("मुनाफ़ा-नुकसान", hi.tr("P&L"))
        assertEquals("डिफ़ॉल्ट जैसा (5% GST बिल)", hi.tr("Same as default (5% GST bill)"))
        assertEquals("ABC-12", hi.tr("ABC-12"))
        // whole labels come straight from the dictionary, spaces kept; the rest still use the website's rules
        assertEquals("  लागत ", hi.tr("  Costs "))
        assertEquals("₹1,234", hi.tr("₹1,234"))
        assertEquals("मुनाफ़ा-नुकसान", hi.tr("P&L"))
        assertTrue(hi.tr("Cost is missing for 3 SKUs (12 pieces). Profit is overstated until you add them.").contains("3"))
        assertTrue(hi.tr("Cost is missing for 3 SKUs (12 pieces). Profit is overstated until you add them.").any { it in '\u0900'..'\u097F' })
        val g = Guide.parse(engine.guide())
        assertEquals(10, g.steps.size)
        assertTrue(g.art["welcome"]!!.startsWith("<svg"))
        assertTrue(g.terms.isNotEmpty())
        // the website's background doodles, light and dark
        assertTrue(Art.doodle(false).contains("xlink:href=\"#bag\"") || Art.doodle(false).contains("<use xlink:href="))
        assertTrue(Art.doodle(true).startsWith("<svg") && Art.doodle(true) != Art.doodle(false))
        assertTrue(g.ui["hi"]!!["title"]!!.isNotBlank())
        val r = PnlStore(Files.createTempDirectory("pnl").toFile(), engine).apply { startSample() }.report(Sel()).first
        assertTrue(r.health.pd0.isNotBlank() && r.packNote.isNotBlank() && r.returns!!.cols.isNotEmpty())
    }

    @Test fun badFilesGiveClearMessages() {
        assertTrue(SheetReader.read("old.xls", byteArrayOf(0xd0.toByte(), 0xcf.toByte(), 0x11, 0xe0.toByte(), 0, 0)).problems.single().contains(".xls"))
        assertTrue(SheetReader.read("broken.zip", byteArrayOf(0x50, 0x4b, 3, 4, 9, 9)).problems.single().contains("damaged"))
        assertTrue(SheetReader.read("photo.jpg", byteArrayOf(-1, -40, -1, 0)).problems.single().contains("not an Excel"))
    }

    @Test fun csvQuotesAndSemicolons() {
        val rows = Csv.parse("a;b;c\n\"x;1\";\"say \"\"hi\"\"\";3\r\n")
        assertEquals(listOf<Any>("x;1", "say \"hi\"", "3"), rows[1])
    }

    @Test fun excelExportReadsBack() {
        val store = PnlStore(Files.createTempDirectory("pnl").toFile(), engine)
        store.startSample()
        val (r, _) = store.report(Sel())
        val bytes = ReportExcel.build(r, "Sample", store.sample!!.state.expenses)
        val sheets = Xlsx.read(SheetReader.unzip(bytes))
        assertEquals("P&L", sheets[0].name)
        assertTrue(sheets.any { it.name == "SKU wise" && it.rows.size == r.skus.size + 2 })
        assertTrue(sheets.any { it.name == "Orders" && it.rows.size == r.orders.size + 1 })
        assertTrue(sheets.any { it.name == "GST" })
        val np = sheets[0].rows.first { it[0] == "Net profit" }[1] as Double
        assertEquals(17951.39, np, 0.001)
    }

    @Test fun moneyAndAccess() {
        assertEquals("₹1,15,741", Money.rs(11574100))
        assertEquals("−₹5.50", Money.rs(-550, true))
        assertEquals("9876543210", Api.normPhone("+91 98765 43210"))
        assertEquals(null, Api.normPhone("12345"))
        val cfgOn = ServerConfig(enabled = true, enforce = true)
        val u = User(phone = "9876543210", paidUntil = 0)
        assertEquals(false, Access.of(null, null).full)
        assertEquals(true, Access.of(Session("t", u), ServerConfig()).full)
        assertEquals(false, Access.of(Session("t", u), cfgOn).full)
        assertEquals(true, Access.of(Session("t", u.copy(paidUntil = System.currentTimeMillis() + 1000_000)), cfgOn).full)
    }
}
