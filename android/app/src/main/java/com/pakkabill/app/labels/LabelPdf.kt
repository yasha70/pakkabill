package com.pakkabill.app.labels

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.pakkabill.core.labels.LabelOpts
import com.pakkabill.core.labels.LabelPlan
import com.pakkabill.core.labels.PlanPage
import com.tom_roush.pdfbox.multipdf.LayerUtility
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.util.Matrix
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.File
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** A box on a PDF page in points: left, bottom, right, top. */
data class Box(val x0: Double, val y0: Double, val x1: Double, val y1: Double)

/**
 * The sorted label PDF, made on the phone the way the website makes it (labels.html build): the packing
 * chart first, the manifest at the start or the end, the labels in order, unread pages last. In
 * "label only" mode each label is cut out above its invoice and fitted on a 4 x 6 inch page.
 */
object LabelPdf {
    private const val LW = 288.0
    private const val LH = 432.0

    /** One added PDF: its bytes, opened for copying pages and, when cutting labels, for drawing them. */
    class Source(val bytes: ByteArray, cache: File, id: Int) : Closeable {
        val doc: PDDocument = PdfText.open(bytes)
        private val file = File(cache, "labels-$id.pdf").apply { writeBytes(bytes) }
        private var fd: ParcelFileDescriptor? = null
        private var renderer: PdfRenderer? = null
        fun renderer(): PdfRenderer? = renderer ?: runCatching {
            val f = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
            fd = f
            PdfRenderer(f).also { renderer = it }
        }.getOrNull()
        override fun close() {
            runCatching { renderer?.close() }; runCatching { fd?.close() }; runCatching { doc.close() }; file.delete()
        }
    }

    /**
     * Where the label is on its page: the page is drawn small and the ink above the invoice is found
     * (labels.html labelBox). The cut goes through the widest blank band between the product table and
     * the TAX INVOICE line.
     */
    fun labelBox(src: Source, p: PlanPage): Box {
        val v = p.view
        val full = Box(v[0], v[1], v[2], v[3])
        if (p.rot % 360 != 0) return full
        val r = src.renderer() ?: return full
        val sc = 0.5
        val (w, h, px) = synchronized(r) {
            r.openPage(p.pi).use { page ->
                val w = ceil(page.width * sc).toInt().coerceAtLeast(1)
                val h = ceil(page.height * sc).toInt().coerceAtLeast(1)
                val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                bmp.eraseColor(Color.WHITE)
                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                val px = IntArray(w * h)
                bmp.getPixels(px, 0, w, 0, 0, w, h)
                bmp.recycle()
                Triple(w, h, px)
            }
        }
        fun ink(i: Int): Boolean {
            val c = px[i]
            if ((c ushr 24) < 40) return false
            return ((c shr 16) and 255) < 225 || ((c shr 8) and 255) < 225 || (c and 255) < 225
        }
        fun inkRow(y: Int): Boolean { val o = y * w; for (x in 0 until w) if (ink(o + x)) return true; return false }
        fun py(yPt: Double) = ((v[3] - yPt) * sc).roundToInt().coerceIn(0, h)
        var stop = h
        if (p.cutY != null) {
            val from = py(if (p.lastY != null) p.lastY!! - 2 else p.cutY!! + 40)
            val to = py(p.cutY!!)
            var best: IntArray? = null
            var run: IntArray? = null
            for (y in from until to) {
                if (!inkRow(y)) { if (run == null) run = intArrayOf(y, y); run[1] = y }
                else if (run != null) { if (best == null || run[1] - run[0] > best[1] - best[0]) best = run; run = null }
            }
            if (run != null && (best == null || run[1] - run[0] > best[1] - best[0])) best = run
            stop = if (best != null) best[0] + min(3, (best[1] - best[0]) / 2) else to
        }
        var x0 = w; var x1 = -1; var y0 = h; var y1 = -1
        for (yy in 0 until stop) {
            val o = yy * w
            for (x in 0 until w) if (ink(o + x)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (yy < y0) y0 = yy; y1 = yy }
        }
        val pad = 6.0
        var box = if (x1 < 0) full else Box(
            max(v[0], v[0] + x0 / sc - pad), max(v[1], v[3] - (y1 + 1) / sc - pad),
            min(v[2], v[0] + (x1 + 1) / sc + pad), min(v[3], v[3] - y0 / sc + pad),
        )
        if (p.cutY != null) box = box.copy(y0 = max(box.y0, p.cutY!! + 1))
        return box
    }

    /** The matrix that fits [b] on a 4 x 6 inch page, turned sideways when that makes it bigger (labels.html fitPage). */
    fun fit(b: Box): DoubleArray {
        val w = b.x1 - b.x0
        val h = b.y1 - b.y0
        val s1 = min(LW / w, LH / h)
        val s2 = min(LW / h, LH / w)
        return if (s2 > s1 * 1.08) doubleArrayOf(0.0, s2, -s2, 0.0, s2 * b.y0 + (LW + h * s2) / 2, -s2 * b.x0 + (LH - w * s2) / 2)
        else doubleArrayOf(s1, 0.0, 0.0, s1, (LW - w * s1) / 2 - b.x0 * s1, (LH - h * s1) / 2 - b.y0 * s1)
    }

    /**
     * Puts the sorted PDF together. [chart] draws the packing chart pages for a page size (points) as a
     * PDF of its own; [progress] gets (done, of).
     */
    fun build(sources: Map<Int, Source>, plan: LabelPlan, o: LabelOpts, chart: ((Double, Double) -> ByteArray)?, progress: (Int, Int) -> Unit): Pair<ByteArray, Int> {
        val labelOnly = o.mode == "label"
        val out = PDDocument()
        val extra = ArrayList<PDDocument>()
        try {
            out.documentInformation.apply { title = "Meesho labels sorted by SKU and size"; producer = "PakkaBill"; creator = "PakkaBill label sorter" }
            val first = plan.labels.firstOrNull()
            var w = if (labelOnly || first == null) LW else first.view[2] - first.view[0]
            var h = if (labelOnly || first == null) LH else first.view[3] - first.view[1]
            if (!labelOnly && first != null && first.rot % 180 != 0) { val t = w; w = h; h = t }
            if (chart != null && plan.chart != null) {
                val c = PdfText.open(chart(w, h))
                extra += c
                for (pg in c.pages) out.importPage(pg)
            }
            fun copy(p: PlanPage) { sources[p.fid]?.let { out.importPage(it.doc.getPage(p.pi)) } }
            if (o.man == "start") plan.man.forEach(::copy)
            val seq = plan.labels + plan.bad
            val layer = if (labelOnly) LayerUtility(out) else null
            seq.forEachIndexed { i, p ->
                val src = sources[p.fid] ?: return@forEachIndexed
                if (layer == null) { copy(p); return@forEachIndexed }
                val b = if (p.kind == "label") runCatching { labelBox(src, p) }.getOrElse { Box(p.view[0], p.view[1], p.view[2], p.view[3]) }
                else Box(p.view[0], p.view[1], p.view[2], p.view[3])
                val m = fit(b)
                val form = layer.importPageAsForm(src.doc, p.pi)
                val page = PDPage(PDRectangle(LW.toFloat(), LH.toFloat()))
                out.addPage(page)
                PDPageContentStream(out, page).use { cs ->
                    cs.saveGraphicsState()
                    cs.transform(Matrix(m[0].toFloat(), m[1].toFloat(), m[2].toFloat(), m[3].toFloat(), m[4].toFloat(), m[5].toFloat()))
                    cs.addRect(b.x0.toFloat(), b.y0.toFloat(), (b.x1 - b.x0).toFloat(), (b.y1 - b.y0).toFloat())
                    cs.clip()
                    cs.drawForm(form)
                    cs.restoreGraphicsState()
                }
                if (i % 5 == 0) progress(i + 1, seq.size)
            }
            if (o.man == "end") plan.man.forEach(::copy)
            val bytes = ByteArrayOutputStream().also { out.save(it) }.toByteArray()
            return bytes to out.numberOfPages
        } finally {
            runCatching { out.close() }
            extra.forEach { runCatching { it.close() } }
        }
    }
}
