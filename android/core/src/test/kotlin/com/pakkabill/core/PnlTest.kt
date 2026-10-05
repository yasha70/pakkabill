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
        assertTrue(sheets.any { it.name == "SKU wise" && it.rows.size == r.skus.size + 1 })
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
