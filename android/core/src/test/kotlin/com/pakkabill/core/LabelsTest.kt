package com.pakkabill.core

import com.pakkabill.core.labels.LabelOpts
import com.pakkabill.core.labels.LabelsEngine
import com.pakkabill.core.labels.PdfPageText
import com.pakkabill.core.labels.TextItem
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The Labels screen's engine calls, on labels laid out like Meesho's (as the website's test makes them). */
class LabelsTest {
    // rough Helvetica widths, as in test/labels-audit.js
    private fun w(s: String, z: Double) = s.sumOf { c -> if (c == ' ') 0.28 else if (c.isUpperCase()) 0.68 else if (c.isDigit()) 0.56 else 0.5 } * z
    private fun it(str: String, x: Double, y: Double, z: Double = 8.0) = TextItem(str, listOf(z, 0.0, 0.0, z, x, y), w(str, z))

    private fun label(courier: String, awb: String, vararg rows: List<String>): PdfPageText {
        val items = mutableListOf(
            it("Customer Address", 28.0, 805.0, 9.0), it("COD: Check the payable amount on the app", 230.0, 805.0), it("Ramesh Kumar", 28.0, 792.0),
            it("If undelivered, return to:", 28.0, 752.0), it(courier, 260.0, 760.0, 14.0), it("Pickup", 360.0, 760.0), it(awb, 270.0, 678.0, 10.0),
            it("Product Details", 28.0, 650.0, 9.0),
            it("SKU", 28.0, 636.0), it("Size", 160.0, 636.0), it("Qty", 220.0, 636.0), it("Color", 255.0, 636.0), it("Order No.", 310.0, 636.0),
        )
        rows.forEachIndexed { i, r ->
            val y = 622.0 - i * 14
            items += listOf(it(r[0], 28.0, y), it(r[1], 160.0, y), it(r[2], 224.0, y), it(r[3], 255.0, y), it(r[4], 310.0, y))
        }
        items += listOf(it("TAX INVOICE", 250.0, 435.0, 11.0), it("BILL TO / SHIP TO", 28.0, 415.0), it("Description", 28.0, 350.0))
        return PdfPageText(items, listOf(0.0, 0.0, 595.0, 842.0))
    }

    @Test fun sortsLabelsAndMakesTheChart() {
        val e = LabelsEngine()
        val f = e.addFile(
            1, "labels.pdf",
            listOf(
                label("Valmo", "VL0081234567", listOf("KURTI-RED-10", "XL", "1", "Red", "260000000000001_1")),
                label("Delhivery", "1490000000001", listOf("KURTI-RED-2", "M", "2", "Red", "260000000000002_1")),
                label("Valmo", "VL0081234568", listOf("KURTI-RED-2", "XL", "1", "Red", "260000000000003_1")),
                PdfPageText(emptyList(), listOf(0.0, 0.0, 595.0, 842.0)),
            ),
        )
        assertEquals(3, f.labels)
        assertEquals(1, f.bad)

        val v = e.view(LabelOpts(courier = false), "10 Nov 2026")
        assertEquals(listOf("Labels" to "3", "Pieces" to "4", "SKUs" to "2", "Couriers" to "2"), v.tileList)
        // SKU then size, with numbers in SKUs in number order (2 before 10)
        assertEquals(listOf("KURTI-RED-2 M", "KURTI-RED-2 XL", "KURTI-RED-10 XL"), v.order.map { it.rows[0].sku + " " + it.rows[0].size })
        assertEquals("image", v.bad.single().why)
        val ch = v.chart!!
        assertEquals("labels", ch.from)
        assertEquals(4, ch.chart.grand)
        assertEquals(listOf("M", "XL"), ch.chart.cols)
        assertTrue(ch.text.startsWith("*Packing chart*"), ch.text)

        // each courier's labels together: Valmo (2) first
        val byCourier = e.view(LabelOpts(courier = true), "10 Nov 2026")
        assertEquals(listOf("Valmo", "Valmo", "Delhivery"), byCourier.order.map { it.courier })

        val plan = e.plan(LabelOpts())
        assertEquals(3, plan.labels.size)
        assertEquals(1, plan.bad.size)
        assertTrue(plan.labels.all { it.cutY != null && it.cutY!! > 435 && it.cutY!! < 450 }, plan.labels.toString())
        assertEquals("Packing chart", plan.chart!!.title)
        assertEquals(4, plan.chart!!.main.grand)
        assertTrue(e.csv(LabelOpts())!!.text.contains("GRAND TOTAL"))

        e.removeFile(1)
        assertEquals(0, e.view(LabelOpts(), "").labels)
    }
}
