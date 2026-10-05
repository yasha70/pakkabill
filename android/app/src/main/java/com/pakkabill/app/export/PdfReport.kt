package com.pakkabill.app.export

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import com.pakkabill.core.Money
import com.pakkabill.core.Report
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** The Meesho P&L as an A4 PDF: summary, statement, products, returns, months and GST. */
object PdfReport {
    private const val W = 595
    private const val H = 842
    private const val M = 40f
    private val BRAND = Color.rgb(91, 63, 230)
    private val INK = Color.rgb(42, 37, 64)
    private val MUTED = Color.rgb(92, 87, 118)
    private val LINE = Color.rgb(226, 218, 242)
    private val GAIN = Color.rgb(18, 113, 75)
    private val LOSS = Color.rgb(200, 32, 42)

    private fun amt(p: Long) = if (p < 0) "(" + Money.rs(-p, true) + ")" else Money.rs(p, true)

    private class Pen(val doc: PdfDocument, val footer: String) {
        var page: PdfDocument.Page? = null
        var c: Canvas? = null
        var y = 0f
        var n = 0

        fun paint(size: Float, bold: Boolean = false, color: Int = INK, align: Paint.Align = Paint.Align.LEFT) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = size
            this.color = color
            typeface = Typeface.create(Typeface.SANS_SERIF, if (bold) Typeface.BOLD else Typeface.NORMAL)
            textAlign = align
        }

        fun newPage() {
            finish()
            n++
            val p = doc.startPage(PdfDocument.PageInfo.Builder(W, H, n).create())
            page = p
            c = p.canvas
            y = M
        }

        fun finish() {
            val p = page ?: return
            c!!.drawText("$footer · page $n", W / 2f, H - 22f, paint(8f, color = MUTED, align = Paint.Align.CENTER))
            doc.finishPage(p)
            page = null
        }

        fun need(h: Float) { if (page == null || y + h > H - 50f) newPage() }

        /** Wraps text to [width]; returns the lines. */
        fun wrap(text: String, p: Paint, width: Float): List<String> {
            val out = mutableListOf<String>()
            var line = ""
            for (w in text.split(' ')) {
                val t = if (line.isEmpty()) w else "$line $w"
                if (p.measureText(t) <= width || line.isEmpty()) line = t else { out += line; line = w }
            }
            if (line.isNotEmpty()) out += line
            return out
        }

        fun text(t: String, size: Float = 10f, bold: Boolean = false, color: Int = INK, gap: Float = 4f) {
            val p = paint(size, bold, color)
            for (l in wrap(t, p, W - 2 * M)) {
                need(size + gap)
                y += size
                c!!.drawText(l, M, y, p)
                y += gap
            }
        }

        fun row(label: String, value: String, bold: Boolean = false, color: Int = INK, indent: Float = 0f, size: Float = 10f) {
            val lp = paint(size, bold)
            val lines = wrap(label, lp, W - 2 * M - 130f - indent)
            need(lines.size * (size + 4f) + 2f)
            val top = y
            lines.forEachIndexed { i, l -> c!!.drawText(l, M + indent, top + size + i * (size + 4f), lp) }
            c!!.drawText(value, W - M, top + size, paint(size, bold, color, Paint.Align.RIGHT))
            y = top + lines.size * (size + 4f) + 2f
        }

        fun rule(color: Int = LINE) {
            need(6f)
            y += 2f
            c!!.drawLine(M, y, W - M, y, Paint().apply { this.color = color; strokeWidth = 0.8f })
            y += 4f
        }

        fun heading(t: String) {
            need(40f)
            y += 14f
            text(t, 13f, bold = true, color = BRAND, gap = 6f)
        }

        /** A table with right-aligned number columns after the first. */
        fun table(head: List<String>, widths: List<Float>, rows: List<List<String>>, colors: List<Int?> = emptyList()) {
            val total = widths.sum()
            val xs = widths.runningFold(M) { acc, w -> acc + w / total * (W - 2 * M) }
            fun draw(cells: List<String>, bold: Boolean, color: Int?) {
                need(15f)
                y += 10f
                cells.forEachIndexed { i, s ->
                    val p = paint(8.5f, bold, if (i > 0 && color != null) color else if (bold) MUTED else INK, if (i == 0) Paint.Align.LEFT else Paint.Align.RIGHT)
                    val room = xs[i + 1] - xs[i] - 6f
                    var t = s
                    while (t.length > 3 && p.measureText(t) > room) t = t.dropLast(2) + "…"
                    c!!.drawText(t, if (i == 0) xs[i] else xs[i + 1], y, p)
                }
                y += 5f
            }
            draw(head, true, null)
            rule()
            rows.forEachIndexed { i, r -> draw(r, false, colors.getOrNull(i)) }
        }
    }

    fun build(r: Report, biz: String): ByteArray {
        val doc = PdfDocument()
        val made = SimpleDateFormat("d MMM yyyy", Locale.ENGLISH).format(Date())
        val pen = Pen(doc, "PakkaBill · Meesho P&L · made $made")
        val s = r.sum
        pen.newPage()
        val c = pen.c!!
        // header band
        c.drawRect(0f, 0f, W.toFloat(), 92f, Paint().apply { color = BRAND })
        c.drawText("Meesho Profit & Loss", M, 42f, pen.paint(20f, true, Color.WHITE))
        c.drawText((if (biz.isNotBlank()) "$biz · " else "") + r.per.label + " · by " + (if (r.per.basis == "order") "order date" else "payment date"), M, 66f, pen.paint(10f, color = Color.argb(230, 255, 255, 255)))
        pen.y = 116f
        pen.text(if (s.NP < 0) "Net loss" else "Net profit", 10f, color = MUTED)
        pen.text(Money.rs(s.NP, true), 26f, bold = true, color = if (s.NP < 0) LOSS else GAIN, gap = 6f)
        if (s.NR != 0L) pen.text("${Money.pct(s.margin)} of net revenue", 10f, color = MUTED)
        pen.y += 6f
        pen.row("Net sales", Money.rs(s.NS, true))
        pen.row("Received from Meesho", Money.rs(s.payout, true))
        pen.row("Orders sold", "${s.sales}")
        pen.row("Delivered (no return or RTO)", "${s.del}")
        pen.row("Profit per delivered order", if (s.del > 0) Money.rs(s.perDel, true) else "–")
        r.returns?.let { pen.row("RTO · return · exchange rate", "${Money.pct(it.rtoRate)} · ${Money.pct(it.retRate)} · ${Money.pct(it.exchRate)}") }
        if (s.missing.isNotEmpty()) {
            pen.y += 6f
            pen.text("Cost is missing for ${s.missing.size} SKUs, so profit is overstated until they are added.", 9f, color = LOSS)
        }

        pen.heading("Profit and loss statement")
        for (l in r.lines) when (l.k) {
            "sec" -> { pen.y += 6f; pen.text(l.l.uppercase(), 8.5f, bold = true, color = BRAND, gap = 3f) }
            "row" -> pen.row(l.l, amt(l.v), indent = 10f)
            "np" -> { pen.rule(BRAND); pen.row(l.l, amt(l.v), bold = true, color = if (l.v < 0) LOSS else GAIN, size = 12f) }
            else -> { pen.rule(); pen.row(l.l, amt(l.v), bold = true) }
        }
        pen.y += 4f
        pen.text("Brackets mean a cost or a deduction." + if (s.REGD) " Sales and charges are shown without GST." else "", 8f, color = MUTED)

        if (r.skus.isNotEmpty()) {
            pen.heading("Profit by product")
            val list = r.skus.sortedByDescending { it.contrib }
            pen.table(
                listOf("SKU", "Orders", "Delivered", "Net sales", "Profit", "Per delivered", "Break-even"),
                listOf(3f, 1.2f, 1.4f, 2f, 2f, 2f, 1.8f),
                list.map { k -> listOf(k.sku, "${k.sold}", "${k.delivered}", Money.rs(k.NS), Money.rs(k.contrib), if (k.delivered > 0) Money.rs(k.perOrder) else "–", if (k.breakEven > 0) Money.rs(k.breakEven) else "–") },
                list.map { if (it.contrib < 0) LOSS else null },
            )
        }
        if (r.categories.isNotEmpty()) {
            pen.heading("Profit by category")
            pen.table(
                listOf("Category", "Orders", "Delivered", "Net sales", "Profit"),
                listOf(3.5f, 1.3f, 1.5f, 2f, 2f),
                r.categories.map { k -> listOf(k.cat, "${k.sold}", "${k.delivered}", Money.rs(k.NS), Money.rs(k.profit)) },
                r.categories.map { if (it.profit < 0) LOSS else null },
            )
        }
        r.returns?.let { rv ->
            pen.heading("Returns and RTO")
            pen.row("RTO (not delivered)", "${rv.G.rto.n} · ${Money.pct(rv.rtoRate)} · cost ${Money.rs(rv.G.rto.loss)}")
            pen.row("Customer returns", "${rv.G.ret.n} · ${Money.pct(rv.retRate)} · cost ${Money.rs(rv.G.ret.loss)}")
            pen.row("Exchanges", "${rv.G.exch.n} · ${Money.pct(rv.exchRate)}")
            pen.rule()
            pen.row("Total loss from returns and RTO", Money.rs(rv.loss, true), bold = true)
        }
        if (r.monthly.size > 1) {
            pen.heading("Month by month")
            pen.table(
                listOf("Month", "Net sales", "Gross profit", "Net profit", "Received"),
                listOf(2f, 2f, 2f, 2f, 2f),
                r.monthly.map { m -> listOf(m.label, Money.rs(m.NS), Money.rs(m.GP), Money.rs(m.NP), Money.rs(m.payout)) },
                r.monthly.map { if (it.NP < 0) LOSS else null },
            )
        }
        r.gst?.let { g ->
            pen.heading("GST, TCS and TDS")
            pen.row("GST on sales", amt(g.out))
            pen.row("Input credit on Meesho fees", amt(g.itcCh))
            pen.row("Input credit on ads", amt(g.itcAds))
            pen.row("Net GST to pay", amt(g.net), bold = true)
            pen.row("TCS and TDS deducted by Meesho", amt(g.tcs))
            pen.row("GST to pay in cash", amt(g.cash), bold = true)
        }
        pen.heading("How profit ties to money received")
        r.bridge.forEach { b -> pen.row(b.l, amt(b.v), bold = b.k != null) }

        pen.finish()
        val out = ByteArrayOutputStream()
        doc.writeTo(out)
        doc.close()
        return out.toByteArray()
    }
}
