package com.pakkabill.app.labels

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import com.pakkabill.core.labels.Chart
import com.pakkabill.core.labels.ChartDoc
import java.io.ByteArrayOutputStream
import kotlinx.serialization.json.JsonPrimitive

/**
 * The packing chart as PDF pages, drawn natively (the website draws the same chart with pdf-lib in
 * labels-pdf.js): a coloured band, the pieces and size cards, notes, the SKU × size table with totals,
 * then one table per courier. A4, or 4 × 6 inch to go in front of 4 × 6 labels.
 */
object ChartPdf {
    private val BRAND = Color.rgb(0x5B, 0x3F, 0xE6)
    private val BRAND2 = Color.rgb(0x9A, 0x3F, 0xF0)
    private val INK = Color.rgb(0x21, 0x1C, 0x40)
    private val MUTE = Color.rgb(0x6B, 0x66, 0x85)
    private val FAINT = Color.rgb(0xBD, 0xB8, 0xD1)
    private val TINT = Color.rgb(0xEC, 0xE7, 0xFF)
    private val ZEBRA = Color.rgb(0xF9, 0xF7, 0xFF)
    private val RULE = Color.rgb(0xDB, 0xD4, 0xF0)
    private val OK = Color.rgb(0x12, 0x71, 0x4B)
    private val WARN = Color.rgb(0x99, 0x33, 0x1A)

    private fun paint(size: Float, bold: Boolean = false, color: Int = INK, align: Paint.Align = Paint.Align.LEFT) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = size; this.color = color; textAlign = align
        typeface = Typeface.create(Typeface.SANS_SERIF, if (bold) Typeface.BOLD else Typeface.NORMAL)
    }

    private fun fitText(s: String, p: Paint, max: Float): String {
        if (p.measureText(s) <= max) return s
        var t = s
        while (t.length > 1 && p.measureText("$t…") > max) t = t.dropLast(1)
        return "$t…"
    }

    private fun wrap(text: String, p: Paint, width: Float): List<String> {
        val out = mutableListOf<String>()
        var line = ""
        text.split(' ').forEach { w ->
            val t = if (line.isEmpty()) w else "$line $w"
            if (p.measureText(t) <= width || line.isEmpty()) line = t else { out += line; line = w }
        }
        if (line.isNotEmpty()) out += line
        return out
    }

    private class Writer(val doc: PdfDocument, val w: Float, val h: Float, val d: ChartDoc) {
        val small = w < 400
        val m = if (small) 14f else 36f
        val fs = if (small) 7.5f else 10f
        val rh = if (small) 13f else 20f
        val bottom = if (small) 20f else 40f
        val tw = w - 2 * m
        val pages = mutableListOf<PdfDocument.Page>()
        var page: PdfDocument.Page? = null
        lateinit var cv: Canvas
        var y = 0f

        private fun footer() {
            cv.drawText(d.footer + "  ·  page " + pages.size, m, h - (if (small) 8f else 18f), paint(if (small) 5.5f else 7.5f, color = MUTE))
        }

        fun newPage() {
            page?.let { footer(); doc.finishPage(it) }
            val pg = doc.startPage(PdfDocument.PageInfo.Builder(w.toInt(), h.toInt(), pages.size + 1).create())
            pages += pg; page = pg; cv = pg.canvas
            val band = if (small) 40f else 74f
            if (pages.size == 1) {
                val bp = Paint().apply { shader = LinearGradient(0f, 0f, w, band, BRAND, BRAND2, Shader.TileMode.CLAMP) }
                cv.drawRect(0f, 0f, w, band, bp)
                cv.drawText(d.kicker, m, if (small) 13f else 24f, paint(if (small) 7f else 10f, color = Color.argb(220, 255, 255, 255)))
                cv.drawText(d.title, m, if (small) 30f else 54f, paint(if (small) 15f else 26f, true, Color.WHITE))
                val pill = paint(if (small) 6f else 8.5f, true, BRAND)
                val pw = pill.measureText(d.pill) + (if (small) 10f else 16f)
                val ph = if (small) 11f else 16f
                val px = w - m - pw
                val py = if (small) 7f else 16f
                cv.drawRoundRect(RectF(px, py, px + pw, py + ph), ph / 2, ph / 2, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE })
                cv.drawText(d.pill, px + pw / 2, py + ph * 0.7f, pill.apply { textAlign = Paint.Align.CENTER })
                cv.drawText(d.date, w - m, if (small) 31f else 54f, paint(if (small) 7f else 10f, color = Color.WHITE, align = Paint.Align.RIGHT))
                y = band + (if (small) 14f else 24f)
            } else {
                val band2 = if (small) 22f else 34f
                cv.drawRect(0f, 0f, w, band2, Paint().apply { color = BRAND })
                cv.drawText(d.title + " (continued)", m, band2 * 0.68f, paint(if (small) 9f else 13f, true, Color.WHITE))
                y = band2 + (if (small) 12f else 20f)
            }
        }

        fun need(hh: Float) { if (page == null || y + hh > h - bottom) newPage() }

        /** Text that wraps; [right] keeps room free on the right (for the stamp). */
        fun line(text: String, bold: Boolean = false, color: Int = INK, size: Float = fs, right: Float = 0f) {
            val p = paint(size, bold, color)
            wrap(text, p, tw - right).forEach { need(size * 1.5f); cv.drawText(it, m, y + size, p); y += size * 1.45f }
        }

        fun kpis() {
            val k = d.kpis
            if (k.isEmpty()) return
            val gap = if (small) 4f else 8f
            val cw = (tw - gap * (k.size - 1)) / k.size
            val ch = if (small) 34f else 58f
            need(ch + 6)
            k.forEachIndexed { i, kp ->
                val x = m + i * (cw + gap)
                val r = RectF(x, y, x + cw, y + ch)
                cv.drawRoundRect(r, 6f, 6f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = if (i == 0) TINT else Color.WHITE })
                cv.drawRoundRect(r, 6f, 6f, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = RULE; strokeWidth = 0.8f })
                val pad = if (small) 4f else 8f
                cv.drawText(fitText(kp.label, paint(if (small) 5.5f else 7.5f, true, MUTE), cw - 2 * pad), x + pad, y + (if (small) 9f else 15f), paint(if (small) 5.5f else 7.5f, true, MUTE))
                val v = (kp.value as? JsonPrimitive)?.content ?: ""
                cv.drawText(v, x + pad, y + (if (small) 23f else 39f), paint(if (small) 13f else 22f, true, if (i == 0) BRAND else INK))
                if (kp.note.isNotBlank()) cv.drawText(fitText(kp.note, paint(if (small) 5f else 7f, color = MUTE), cw - 2 * pad), x + pad, y + ch - (if (small) 4f else 8f), paint(if (small) 5f else 7f, color = MUTE))
            }
            y += ch + (if (small) 8f else 14f)
        }

        /** One packing table; a plain list when there are too many sizes to fit across. */
        fun table(c: Chart, title: String?, sub: String?) {
            val n = c.cols.size
            val numW = minOf(if (small) 30f else 52f, tw * 0.64f / (n + 1))
            val skuW = tw - numW * (n + 1)
            if (skuW < tw * 0.28f) { list(c, title, sub); return }
            need(rh * (3 + minOf(3, c.rows.size)))
            if (title != null) { cv.drawText(fitText(title, paint(fs + 2, true), tw), m, y + fs + 2, paint(fs + 2, true)); y += rh * 0.95f }
            if (sub != null) { cv.drawText(fitText(sub, paint(fs - 1, color = MUTE), tw), m, y + fs - 1, paint(fs - 1, color = MUTE)); y += rh * 0.85f }
            val headP = paint(fs - 1, true, MUTE)
            fun cellX(i: Int) = m + skuW + numW * i + numW / 2
            fun head() {
                cv.drawRect(m, y, m + tw, y + rh, Paint().apply { color = TINT })
                cv.drawText("SKU", m + 6, y + rh * 0.68f, headP)
                (c.cols + "Total").forEachIndexed { i, col ->
                    val t = fitText(if (col == "Free Size" && headP.measureText(col) > numW - 4) "Free" else col, headP, numW - 4)
                    cv.drawText(t, cellX(i), y + rh * 0.68f, headP.apply { textAlign = Paint.Align.CENTER })
                    headP.textAlign = Paint.Align.LEFT
                }
                y += rh
            }
            fun row(label: String, cells: List<Int>, total: Int, i: Int, grand: Boolean) {
                if (y + rh > h - bottom) { newPage(); head() }
                if (grand) cv.drawRect(m, y, m + tw, y + rh, Paint().apply { color = TINT })
                else if (i % 2 == 1) cv.drawRect(m, y, m + tw, y + rh, Paint().apply { color = ZEBRA })
                val b = paint(fs, true)
                cv.drawText(fitText(label, b, skuW - 10), m + 6, y + rh * 0.68f, b)
                (cells + total).forEachIndexed { k, v ->
                    val last = k == cells.size
                    val p = paint(fs, last || grand, if (v == 0) FAINT else INK, Paint.Align.CENTER)
                    cv.drawText(v.toString(), cellX(k), y + rh * 0.68f, p)
                }
                y += rh
                cv.drawLine(m, y, m + tw, y, Paint().apply { color = RULE; strokeWidth = if (grand) 0.9f else 0.4f })
            }
            head()
            c.rows.forEachIndexed { i, r -> row(r.sku, c.cols.map { r.cells[it] ?: 0 }, r.total, i, false) }
            row("GRAND TOTAL", c.cols.map { c.totals[it] ?: 0 }, c.grand, 0, true)
            y += rh * 0.7f
        }

        /** SKU | Size | Pcs, with a tick box: when a table would be too narrow (labels.html drawPick). */
        fun list(c: Chart, title: String?, sub: String?) {
            need(rh * 4)
            if (title != null) { cv.drawText(fitText(title, paint(fs + 2, true), tw), m, y + fs + 2, paint(fs + 2, true)); y += rh * 0.95f }
            if (sub != null) { cv.drawText(fitText(sub, paint(fs - 1, color = MUTE), tw), m, y + fs - 1, paint(fs - 1, color = MUTE)); y += rh * 0.85f }
            val cols = floatArrayOf(0.52f, 0.2f, 0.14f, 0.14f).map { it * tw }
            fun head() {
                cv.drawRect(m, y, m + tw, y + rh, Paint().apply { color = TINT })
                val p = paint(fs - 1, true, MUTE)
                var x = m
                listOf("SKU", "Size", "Pcs", "Packed").forEachIndexed { i, s -> cv.drawText(s, if (i == 2) x + cols[i] - 4 - p.measureText(s) else x + 4, y + rh * 0.68f, p); x += cols[i] }
                y += rh
            }
            head()
            c.rows.forEach { r ->
                c.cols.filter { (r.cells[it] ?: 0) > 0 }.forEachIndexed { j, size ->
                    if (y + rh > h - bottom) { newPage(); head() }
                    var x = m
                    val b = paint(fs, true)
                    if (j == 0) cv.drawText(fitText(r.sku, b, cols[0] - 8), x + 4, y + rh * 0.68f, b)
                    x += cols[0]
                    cv.drawText(fitText(size, paint(fs), cols[1] - 8), x + 4, y + rh * 0.68f, paint(fs)); x += cols[1]
                    val q = (r.cells[size] ?: 0).toString()
                    cv.drawText(q, x + cols[2] - 4 - b.measureText(q), y + rh * 0.68f, b); x += cols[2]
                    cv.drawRect(x + 6, y + rh * 0.2f, x + 6 + fs + 1, y + rh * 0.2f + fs + 1, Paint().apply { style = Paint.Style.STROKE; color = INK; strokeWidth = 0.8f })
                    y += rh
                    cv.drawLine(m, y, m + tw, y, Paint().apply { color = RULE; strokeWidth = 0.4f })
                }
            }
            need(rh)
            cv.drawText("Total pieces", m + 4, y + rh * 0.68f, paint(fs, true))
            val g = c.grand.toString()
            cv.drawText(g, m + cols[0] + cols[1] + cols[2] - 4 - paint(fs + 1, true).measureText(g), y + rh * 0.68f, paint(fs + 1, true))
            y += rh * 1.2f
        }

        /** "MATCHED WITH MEESHO": on the first page, to the right under the band (A4 only). */
        fun stamp(top: Float) {
            val s = d.stamp ?: return
            if (small || pages.size != 1) return
            val c = cv
            val sw = 150f
            val sh = 40f
            val cx = w - m - sw / 2 - 4
            val cy = top + sh / 2
            c.save()
            c.rotate(-8f, cx, cy)
            val r = RectF(cx - sw / 2, cy - sh / 2, cx + sw / 2, cy + sh / 2)
            c.drawRoundRect(r, 5f, 5f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(235, 255, 255, 255) })
            c.drawRoundRect(r, 5f, 5f, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = OK; strokeWidth = if (small) 1.2f else 1.8f })
            c.drawText(s.top, cx, cy - (if (small) 1f else 3f), paint(if (small) 5.5f else 8.5f, true, OK, Paint.Align.CENTER))
            c.drawText(s.bottom, cx, cy + (if (small) 7f else 11f), paint(if (small) 6.5f else 10f, true, OK, Paint.Align.CENTER))
            c.restore()
        }

        fun finish() {
            page?.let { footer(); doc.finishPage(it) }
        }
    }

    /** The chart as a PDF of [w] × [h] points. */
    fun draw(d: ChartDoc, w: Double, h: Double): ByteArray {
        val doc = PdfDocument()
        val wr = Writer(doc, w.toFloat(), h.toFloat(), d)
        wr.newPage()
        val stampTop = wr.y - 6f
        wr.stamp(stampTop)
        val narrow = if (d.stamp != null && !wr.small) 170f else 0f
        if (d.forName.isNotBlank()) wr.line(d.forName, bold = true, size = wr.fs + 2, right = narrow)
        if (d.forLine.isNotBlank()) wr.line(d.forLine, color = MUTE, right = narrow)
        if (narrow > 0) wr.y = maxOf(wr.y, stampTop + 46f)
        wr.y += if (wr.small) 4f else 8f
        wr.kpis()
        d.notes.forEach { n -> wr.line(n.text, bold = n.kind != "muted", color = when (n.kind) { "ok" -> OK; "warn" -> WARN; else -> MUTE }, size = wr.fs - 1) }
        wr.y += if (wr.small) 4f else 8f
        wr.table(d.main, null, d.tableSub.ifBlank { null })
        d.sections.forEach { s -> wr.table(s.chart, s.title, s.sub) }
        if (d.end.isNotBlank()) wr.line(d.end, bold = true, color = BRAND, size = wr.fs + 1)
        wr.finish()
        val out = ByteArrayOutputStream()
        doc.writeTo(out)
        doc.close()
        return out.toByteArray()
    }
}
