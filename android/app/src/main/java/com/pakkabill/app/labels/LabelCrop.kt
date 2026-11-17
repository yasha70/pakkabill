package com.pakkabill.app.labels

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.pakkabill.core.labels.Crop
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.util.Matrix
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** A page drawn as the phone shows it (turned pages too): ARGB pixels, [w] x [h]. */
class PagePixels(val w: Int, val h: Int, val px: IntArray)

/** Draws page [pi] of a PDF [w] x [h] pixels on white, and gives its pixels. */
fun PdfRenderer.pixels(pi: Int, scale: (pageW: Int, pageH: Int) -> Double): PagePixels = synchronized(this) {
    openPage(pi).use { page ->
        val sc = scale(page.width, page.height)
        val w = ceil(page.width * sc).toInt().coerceAtLeast(1)
        val h = ceil(page.height * sc).toInt().coerceAtLeast(1)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        try {
            bmp.eraseColor(Color.WHITE)
            page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            val px = IntArray(w * h)
            bmp.getPixels(px, 0, w, 0, 0, w, h)
            PagePixels(w, h, px)
        } finally {
            bmp.recycle()
        }
    }
}

/** How the Label cropper cuts (the website's settings, same names). */
@kotlinx.serialization.Serializable
data class CropOpts(
    /** "4x4" or "4x6" (every page exactly that many inches) or "any" (keep the page's size, only cut) */
    val size: String = "4x4",
    /** leave out the invoice under a Meesho label */
    val inv: Boolean = true,
    /** points kept around the label (exact sizes: the margin inside the label) */
    val gap: Int = 8,
    /** "any" size: also cut the top and the sides */
    val all: Boolean = false,
)

class Cropped(val bytes: ByteArray, val pages: Int, val cut: Int, val saved: Int)

/**
 * The Label cropper's PDF work, done the way the website does it (cropper.js cropOne): every page is
 * drawn, the lowest ink is found and the page is cut just below it, or the label is fitted on an exact
 * 4 x 4 or 4 x 6 inch page. Only the page's boxes and one matrix change, so text and barcodes stay
 * sharp. Nothing leaves the phone.
 */
object LabelCrop {
    /** longest side of the check picture in pixels (keeps phones from running out of memory) */
    private const val MAX_SIDE = 2000.0

    private fun boxes(pg: PDPage, r: DoubleArray) {
        val b = PDRectangle(r[0].toFloat(), r[1].toFloat(), r[2].toFloat(), r[3].toFloat())
        pg.mediaBox = b; pg.cropBox = b; pg.bleedBox = b; pg.trimBox = b; pg.artBox = b
    }

    /** The page's visible box [x0, y0, x1, y1] and its turn. */
    fun viewOf(pg: PDPage): List<Double> {
        val b = pg.cropBox ?: pg.mediaBox
        return listOf(b.lowerLeftX.toDouble(), b.lowerLeftY.toDouble(), b.upperRightX.toDouble(), b.upperRightY.toDouble())
    }

    /**
     * Puts the visual box [vcut] of a page on a new [ow] x [oh] page: the page's drawing is moved and
     * scaled with one matrix and clipped to the label, so nothing outside it prints (cropper.js fitPage).
     */
    fun fitPage(doc: PDDocument, pg: PDPage, view: List<Double>, rot: Int, vcut: Crop.VBox, ow: Double, oh: Double, pad: Double) {
        val m = Crop.fitMatrix(view, rot, vcut, ow, oh, pad).m
        val r = Crop.pdfRect(view, rot, vcut)
        PDPageContentStream(doc, pg, PDPageContentStream.AppendMode.PREPEND, true).use { cs ->
            cs.saveGraphicsState()
            cs.transform(Matrix(m[0].toFloat(), m[1].toFloat(), m[2].toFloat(), m[3].toFloat(), m[4].toFloat(), m[5].toFloat()))
            cs.addRect(r[0].toFloat(), r[1].toFloat(), r[2].toFloat(), r[3].toFloat())
            cs.clip()
        }
        PDPageContentStream(doc, pg, PDPageContentStream.AppendMode.APPEND, true).use { cs -> cs.restoreGraphicsState() }
        val d = pg.cosObject
        listOf(COSName.ANNOTS, COSName.TRIM_BOX, COSName.BLEED_BOX, COSName.ART_BOX, COSName.getPDFName("UserUnit")).forEach { d.removeItem(it) }
        pg.rotation = 0
        val b = PDRectangle(0f, 0f, ow.toFloat(), oh.toFloat())
        pg.mediaBox = b; pg.cropBox = b
    }

    /**
     * "Cut empty space" for one page (labels.html inkRect): where the page's ink ends, as a PDF rectangle
     * [x, y, w, h] cut along the bottom as the page is shown, with a small gap. null: leave the page.
     */
    fun inkRect(r: PdfRenderer, pi: Int, view: List<Double>, rot: Int): DoubleArray? {
        val (vw, vh) = Crop.visualSize(view, rot)
        val p = r.pixels(pi) { w, h -> max(0.5, min(2.0, 1800.0 / max(w, h))) }
        val sc = p.h / vh
        var bottom = -1
        var y = p.h - 1
        while (y >= 0 && bottom < 0) {
            var n = 0
            val o = y * p.w
            for (x in 0 until p.w) {
                val c = p.px[o + x]
                if (((c shr 16) and 255) < 235 || ((c shr 8) and 255) < 235 || (c and 255) < 235) { if (++n >= 2) { bottom = y; break } }
            }
            y--
        }
        if (bottom < 0) return null
        val cut = max(18.0, min(vh, (bottom + 1) / sc + 8))
        if (vh - cut < 2) return null
        val q = Crop.pdfRect(view, rot, Crop.VBox(0.0, 0.0, vw, cut))
        return if (q[2] < 1 || q[3] < 1) null else q
    }

    /** Sets a page's boxes to a cut rectangle (labels.html cropPage). */
    fun cropPage(pg: PDPage, r: DoubleArray?) {
        r ?: return
        val d = pg.cosObject
        listOf(COSName.TRIM_BOX, COSName.BLEED_BOX, COSName.ART_BOX).forEach { d.removeItem(it) }
        val b = PDRectangle(r[0].toFloat(), r[1].toFloat(), r[2].toFloat(), r[3].toFloat())
        pg.mediaBox = b; pg.cropBox = b
    }

    /** Crops every page of a PDF. [progress] gets (page, pages); [live] says whether to go on (false: stop, null). */
    fun crop(bytes: ByteArray, cache: File, o: CropOpts, live: () -> Boolean, progress: (Int, Int) -> Unit): Cropped? {
        val doc = runCatching { PdfText.open(bytes) }.getOrElse {
            throw IllegalStateException(if (it.javaClass.simpleName.contains("Password")) "This PDF has a password. Open it, save a copy without the password, and try again." else "This is not a PDF that can be read.")
        }
        val file = File(cache, "crop-${System.nanoTime()}.pdf")
        try {
            file.writeBytes(bytes)
            val fixed = Crop.SIZES[o.size]
            // the words of each page, to find where a Meesho invoice starts under the label
            val text = if (o.inv) runCatching { PdfText.read(doc) }.getOrNull() else null
            var cut = 0
            var before = 0.0
            var after = 0.0
            val n = doc.numberOfPages
            ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                PdfRenderer(fd).use { r ->
                    if (r.pageCount != n) throw IllegalStateException("This PDF has a damaged page list.")
                    for (i in 0 until n) {
                        if (!live()) return null
                        progress(i + 1, n)
                        val pg = doc.getPage(i)
                        val view = viewOf(pg)
                        val rot = pg.rotation
                        val (vw, vh) = Crop.visualSize(view, rot)
                        val area = (view[2] - view[0]) * (view[3] - view[1])
                        before += area
                        // an invoice is only looked for on an upright page (a turned page's invoice is not "below")
                        val limit = if (text != null && ((rot % 360) + 360) % 360 == 0) Crop.invoiceTop(text.getOrNull(i)?.items.orEmpty(), view, vh) else vh
                        val p = r.pixels(i) { w, h -> max(0.5, min(2.5, MAX_SIDE / max(w, h))) }
                        val sx = p.w / vw
                        val sy = p.h / vh
                        val rows = floor(limit * sy).toInt().coerceIn(1, p.h)
                        val b = Crop.contentBox(p.px, p.w, rows)
                        if (b == null) {
                            // a blank page is left as it is (an exact size still gets the exact page, empty)
                            if (fixed != null) {
                                pg.rotation = 0
                                boxes(pg, doubleArrayOf(0.0, 0.0, fixed.first, fixed.second))
                                pg.cosObject.removeItem(COSName.CONTENTS)
                                cut++
                            }
                            after += area
                            continue
                        }
                        val box = Crop.Content(b.top / sy, b.bottom / sy, b.left / sx, b.right / sx)
                        if (fixed != null) {
                            // exact label size: the label alone (all sides cut), scaled to fit with the margin
                            fitPage(doc, pg, view, rot, Crop.cutBox(vw, vh, box, 1.0, true), fixed.first, fixed.second, min(o.gap, 20).toDouble())
                            after += fixed.first * fixed.second
                            cut++
                            continue
                        }
                        var vc = Crop.cutBox(vw, vh, box, o.gap.toDouble(), o.all)
                        if (limit < vh) vc = vc.copy(y1 = min(vc.y1, box.bottom + min(o.gap, 4))) // never into the invoice
                        val q = Crop.pdfRect(view, rot, vc)
                        after += q[2] * q[3]
                        if (Crop.same(view, q)) continue
                        boxes(pg, q)
                        cut++
                    }
                }
            }
            if (!live()) return null
            val out = ByteArrayOutputStream().also { doc.save(it) }.toByteArray()
            return Cropped(out, n, cut, if (before > 0) Math.round((1 - after / before) * 100).toInt() else 0)
        } finally {
            runCatching { doc.close() }
            file.delete()
        }
    }
}
