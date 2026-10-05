package com.pakkabill.app.pnl

import com.pakkabill.core.CostRow
import com.pakkabill.core.XlsxWriter

/** The cost sheet: every SKU with category, price, pieces, cost, packaging and GST bill. */
object CostSheet {
    class Row(val sku: String, val c: Long?, val n: Int?, val p: Long?, val k: String?, val b: Int?)

    private val HEAD = listOf("SKU", "Product", "Category", "Buyer price per order (Rs)", "Pieces in combo", "Cost per piece (Rs)", "Packaging per parcel (Rs, optional)", "GST bill % (0 = no GST bill, blank = default)")

    fun build(rows: List<CostRow>): ByteArray {
        val x = XlsxWriter()
        x.sheet("Costs", listOf(HEAD.map { XlsxWriter.Text(it) }) + rows.map { r ->
            listOf(
                XlsxWriter.Text(r.sku), XlsxWriter.Text(r.pn), XlsxWriter.Text(r.cat),
                if (r.price > 0) XlsxWriter.Num(r.price / 100.0) else null,
                XlsxWriter.Num(r.pcs.toDouble()),
                r.cost?.let { XlsxWriter.Num(it / 100.0) },
                r.pack?.let { XlsxWriter.Num(it / 100.0) },
                r.b?.let { XlsxWriter.Num(it.toDouble()) },
            )
        }, listOf(16, 40, 20, 14, 10, 14, 16, 16))
        return x.bytes()
    }

    private fun h(v: Any?) = v.toString().lowercase().replace(Regex("[^a-z0-9%]+"), " ").trim()
    private fun paise(v: Any?): Long? = when (v) {
        is Double -> Math.round(v * 100)
        is String -> v.replace(",", "").replace("₹", "").replace("Rs", "").trim().toDoubleOrNull()?.let { Math.round(it * 100) }
        else -> null
    }?.takeIf { it >= 0 }
    private fun num(v: Any?): Double? = when (v) { is Double -> v; is String -> v.replace("%", "").trim().toDoubleOrNull(); else -> null }

    /** Same column rules as the website: SKU, then a Cost column (not the buyer price). */
    fun read(rows: List<List<Any>>): List<Row> {
        var hr = -1; var cs = -1; var cc = -1; var cp = -1; var cn = -1; var ck = -1; var cg = -1
        for (i in 0 until minOf(rows.size, 15)) {
            val hh = rows[i].map { h(it) }
            val a = hh.indexOfFirst { "sku" in it }
            var b = hh.indexOfFirst { "cost" in it && "packag" !in it }
            if (b < 0) b = hh.indexOfFirst { Regex("price|rate").containsMatchIn(it) && !Regex("packag|buyer|selling|mrp|gst").containsMatchIn(it) }
            if (a >= 0 && b >= 0) {
                hr = i; cs = a; cc = b
                cp = hh.indexOfFirst { "packag" in it }
                cn = hh.indexOfFirst { Regex("piece|pcs|combo").containsMatchIn(it) && !Regex("cost|price|rate").containsMatchIn(it) }
                ck = hh.indexOfFirst { "categor" in it }
                cg = hh.indexOfFirst { "gst" in it }
                break
            }
        }
        if (hr < 0) return emptyList()
        return rows.drop(hr + 1).mapNotNull { r ->
            val sku = r.getOrNull(cs)?.toString()?.trim().orEmpty()
            if (sku.isEmpty()) return@mapNotNull null
            val c = paise(r.getOrNull(cc))
            val p = if (cp >= 0) paise(r.getOrNull(cp)) else null
            val n = if (cn >= 0) num(r.getOrNull(cn))?.toInt()?.takeIf { it in 1..50 } else null
            val k = if (ck >= 0) r.getOrNull(ck)?.toString()?.trim()?.ifBlank { null } else null
            val gt = if (cg >= 0) r.getOrNull(cg)?.toString()?.trim()?.lowercase().orEmpty() else ""
            val b = when {
                gt.isEmpty() -> null
                Regex("^(no|n|none|without)").containsMatchIn(gt) -> 0
                else -> num(gt)?.toInt()?.coerceIn(0, 40)
            }
            if (c == null && p == null && n == null && k == null && b == null) null else Row(sku, c, n, p, k, b)
        }
    }
}
