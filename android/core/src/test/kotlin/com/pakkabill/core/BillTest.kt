package com.pakkabill.core

import com.pakkabill.core.bill.BillStore
import com.pakkabill.core.bill.Business
import com.pakkabill.core.bill.Buyer
import com.pakkabill.core.bill.Gst
import com.pakkabill.core.bill.Invoice
import com.pakkabill.core.bill.Item
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The expected numbers come from the website's own bill calculation (index.html, function Ac) run
 * in Node on the same bills, so the app and the website always print the same totals.
 */
class BillTest {
    private fun bill(seller: String, pos: String, inclusive: Boolean, roundOff: Boolean, composition: Boolean, vararg items: Item) =
        Invoice(seller = Business(stateCode = seller), pos = pos, inclusive = inclusive, roundOff = roundOff, composition = composition, items = items.toList())

    @Test fun sameStateCgstSgstWithDiscountAndRoundOff() {
        val c = Gst.calc(bill("27", "27", false, true, false, Item(qty = 3.0, rate = 499.5, discount = 10.0, gstRate = 5.0, hsn = "6206"), Item(qty = 2.0, rate = 1299.0, gstRate = 12.0, hsn = "6204")))
        assertFalse(c.inter)
        assertEquals(3946.65, c.taxable); assertEquals(189.6, c.cgst); assertEquals(189.6, c.sgst); assertEquals(0.0, c.igst)
        assertEquals(379.2, c.tax); assertEquals(0.15, c.roundOff); assertEquals(4326.0, c.total)
        assertEquals(1348.65, c.lines[0].taxable); assertEquals(67.44, c.lines[0].tax)
        assertEquals(2598.0, c.lines[1].taxable); assertEquals(311.76, c.lines[1].tax)
        assertEquals(2, c.byHsnRate.size)
    }

    @Test fun otherStateIgstPricesWithGstAndGarmentSlab() {
        val c = Gst.calc(bill("27", "09", true, true, false, Item(qty = 7.0, rate = 349.0, gstRate = 5.0), Item(qty = 1.0, rate = 2999.0, taxMode = "apparel")))
        assertTrue(c.inter)
        assertEquals(4868.2, c.taxable); assertEquals(573.8, c.igst); assertEquals(0.0, c.cgst); assertEquals(5442.0, c.total); assertEquals(0.0, c.roundOff)
        assertEquals(5.0, c.lines[0].rate); assertEquals(18.0, c.lines[1].rate)
        assertEquals(2326.67, c.lines[0].taxable); assertEquals(116.33, c.lines[0].tax)
        assertEquals(2541.53, c.lines[1].taxable); assertEquals(457.47, c.lines[1].tax)
    }

    @Test fun pricesWithGstKeepTheTypedTotal() {
        val c = Gst.calc(bill("24", "24", true, false, false, Item(qty = 3.0, rate = 333.33, gstRate = 18.0), Item(qty = 5.0, rate = 2700.0, taxMode = "apparel")))
        assertEquals(12288.13, c.taxable); assertEquals(1105.93, c.cgst); assertEquals(1105.93, c.sgst); assertEquals(2211.86, c.tax); assertEquals(14499.99, c.total)
        assertEquals(847.45, c.lines[0].taxable); assertEquals(152.54, c.lines[0].tax)
        assertEquals(11440.68, c.lines[1].taxable); assertEquals(2059.32, c.lines[1].tax)
    }

    @Test fun compositionHasNoGst() {
        val c = Gst.calc(bill("07", "07", false, true, true, Item(qty = 4.0, rate = 250.75, gstRate = 5.0)))
        assertEquals(1003.0, c.taxable); assertEquals(0.0, c.tax); assertEquals(1003.0, c.total); assertEquals(0.0, c.lines[0].rate)
    }

    @Test fun gstinCheck() {
        assertTrue(Gst.checkGstin("27AAPFU0939F1ZV").ok)
        assertEquals("27", Gst.checkGstin("27aapfu0939f1zv").stateCode)
        assertEquals("checksum", Gst.checkGstin("27AAPFU0939F1ZA").state)
        assertEquals("typing", Gst.checkGstin("27AAPF").state)
        assertEquals("invalid", Gst.checkGstin("28AAPFU0939F1ZV").state) // 28 is no longer a state code
    }

    @Test fun numbersAndWords() {
        assertEquals("26-27", Gst.fyShort("2026-11-09"))
        assertEquals("25-26", Gst.fyShort("2026-03-31"))
        assertEquals("INV/26-27/0007", Gst.number("inv", "26-27", 7))
        assertEquals("One Lakh Twenty Five Thousand Three Hundred Forty Five", Gst.words(125345))
        assertEquals("Two Crore Five Lakh", Gst.words(20500000))
        assertEquals("Rupees One Thousand Two Hundred Fifty and Fifty Paise Only", Gst.amountInWords(1250.5))
    }

    @Test fun storeNumbersSavesPartiesAndRestores() {
        val dir = Files.createTempDirectory("bills").toFile()
        val s = BillStore(dir)
        s.saveBusiness(Business(name = "Shree Fashion", stateCode = "27", prefix = "SF"))
        val d = s.draft(date = "2026-11-09")
        assertEquals("SF/26-27/0001", d.number)
        val saved = s.saveInvoice(d.copy(buyer = Buyer(name = "Ravi Traders", stateCode = "27"), pos = "27", items = listOf(Item(name = "Kurti", qty = 2.0, rate = 500.0, gstRate = 5.0), Item())))
        assertEquals(1, saved.items.size)
        assertEquals(1050.0, saved.totals.total)
        assertEquals(1, s.data.parties.size)
        assertEquals(1, s.data.products.size)
        assertEquals("SF/26-27/0002", s.draft(date = "2026-12-01").number)
        assertEquals("SF/27-28/0001", s.draft(date = "2027-04-01").number)
        s.setPaid(saved.id, true)
        assertTrue(BillStore(dir).data.invoices.single().paid) // read back from the file

        // a website backup (numbers saved as text) adds its bills
        val web = """{"business":{"name":"x"},"parties":[],"products":[],"invoices":[{"id":"w1","docType":"invoice","number":"INV/26-27/0001","date":"2026-10-02",
            "seller":{"stateCode":"27"},"pos":"09","items":[{"name":"Saree","qty":"2","rate":"1,000","gstRate":"5"}],"extra":true}]}"""
        assertEquals(1, s.restore(web))
        val w = s.data.invoices.first { it.id == "w1" }
        assertEquals(2100.0, w.totals.total)
        assertEquals(100.0, w.totals.igst)
        assertEquals(2, BillStore.gstSummary(s.data.invoices).size)

        // a bills file written without totals gets them when it is opened
        val dir2 = Files.createTempDirectory("bills2").toFile()
        java.io.File(dir2, "bills.json").writeText(web)
        assertEquals(2100.0, BillStore(dir2).data.invoices.single().totals.total)
    }
}
