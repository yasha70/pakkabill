package com.pakkabill.core.labels

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/**
 * The Label cropper's engine, the website's (cropper.js PBCrop) in Kotlin, line for line: a page is
 * drawn, the box that holds its content is found, and the page is cut just below it (or on all four
 * sides), or fitted on an exact 4 x 4 or 4 x 6 inch label. Only boxes and one matrix change, so text
 * and barcodes stay sharp. Plain Kotlin: tested on any computer.
 */
object Crop {
    /** a pixel darker than this in any channel is content */
    const val WHITE = 235
    /** a row or column needs this many dark pixels (ignores single specks of noise) */
    const val MIN_DOTS = 2
    /** never cut a page smaller than this many points on a side */
    const val MIN_SIZE = 18.0

    /** Pixel edges of the content (right and bottom exclusive). */
    data class PxBox(val top: Int, val bottom: Int, val left: Int, val right: Int)
    /** A box in visual points: the page as shown, origin top-left, y down. */
    data class VBox(val x0: Double, val y0: Double, val x1: Double, val y1: Double)
    /** Content in visual points. */
    data class Content(val top: Double, val bottom: Double, val left: Double, val right: Double)
    class Fit(val m: DoubleArray, val turned: Boolean, val scale: Double)

    /** Label sizes for thermal printers, in points (72 = 1 inch); "any" keeps the page's own size and only cuts. */
    val SIZES: Map<String, Pair<Double, Double>?> = linkedMapOf("4x4" to (288.0 to 288.0), "4x6" to (288.0 to 432.0), "any" to null)

    /** Scans ARGB pixels (the first [height] rows of a [width]-wide picture) for the box that holds content; null for a blank page. */
    fun contentBox(px: IntArray, width: Int, height: Int, white: Int = WHITE, minDots: Int = MIN_DOTS): PxBox? {
        val rows = IntArray(height)
        val cols = IntArray(width)
        for (y in 0 until height) {
            var i = y * width
            var n = 0
            for (x in 0 until width) {
                val c = px[i++]
                if (((c shr 16) and 255) < white || ((c shr 8) and 255) < white || (c and 255) < white) { n++; cols[x]++ }
            }
            rows[y] = n
        }
        var top = 0
        var bottom = height - 1
        var left = 0
        var right = width - 1
        while (top < height && rows[top] < minDots) top++
        if (top >= height) return null
        while (bottom > top && rows[bottom] < minDots) bottom--
        while (left < width && cols[left] < minDots) left++
        while (right > left && cols[right] < minDots) right--
        if (left >= width) { left = 0; right = width - 1 }
        return PxBox(top, bottom + 1, left, right + 1)
    }

    /** The new box in visual points: cut under the content with [gap] points kept, on all four sides when [all]. */
    fun cutBox(vw: Double, vh: Double, box: Content, gap: Double, all: Boolean): VBox {
        var x0 = 0.0
        var y0 = 0.0
        var x1 = vw
        var y1 = min(vh, box.bottom + gap)
        if (all) {
            x0 = max(0.0, box.left - gap)
            x1 = min(vw, box.right + gap)
            y0 = max(0.0, box.top - gap)
        }
        if (x1 - x0 < MIN_SIZE) { val c = (x0 + x1) / 2; x0 = max(0.0, c - MIN_SIZE / 2); x1 = min(vw, x0 + MIN_SIZE) }
        if (y1 - y0 < MIN_SIZE) { y1 = min(vh, y0 + MIN_SIZE); if (y1 - y0 < MIN_SIZE) y0 = max(0.0, y1 - MIN_SIZE) }
        return VBox(x0, y0, x1, y1)
    }

    private fun turn(rot: Int) = ((rot % 360) + 360) % 360

    /** A visual point to PDF user space, for a page whose visible box is [view] = [x0, y0, x1, y1] and whose /Rotate is [rot]. */
    fun toPdf(view: List<Double>, rot: Int, x: Double, y: Double): DoubleArray {
        val a = view[0]; val b = view[1]
        val w = view[2] - a; val h = view[3] - b
        return when (turn(rot)) {
            90 -> doubleArrayOf(a + y, b + x)
            180 -> doubleArrayOf(a + (w - x), b + y)
            270 -> doubleArrayOf(a + (w - y), b + (h - x))
            else -> doubleArrayOf(a + x, b + (h - y))
        }
    }

    /** The page's size as shown. */
    fun visualSize(view: List<Double>, rot: Int): Pair<Double, Double> {
        val w = view[2] - view[0]; val h = view[3] - view[1]
        return if (turn(rot) % 180 != 0) h to w else w to h
    }

    /** A visual cut box as a PDF rectangle [x, y, w, h], kept inside the visible box. */
    fun pdfRect(view: List<Double>, rot: Int, cut: VBox): DoubleArray {
        val p = toPdf(view, rot, cut.x0, cut.y0)
        val q = toPdf(view, rot, cut.x1, cut.y1)
        val x0 = max(view[0], min(p[0], q[0])); val x1 = min(view[2], max(p[0], q[0]))
        val y0 = max(view[1], min(p[1], q[1])); val y1 = min(view[3], max(p[1], q[1]))
        fun r(v: Double) = (v * 100).roundToLong() / 100.0
        return doubleArrayOf(r(x0), r(y0), r(x1 - x0), r(y1 - y0))
    }

    /** Matrices in PDF order [a, b, c, d, e, f]; [m2] after [m1]. */
    fun mul(m2: DoubleArray, m1: DoubleArray) = doubleArrayOf(
        m2[0] * m1[0] + m2[2] * m1[1], m2[1] * m1[0] + m2[3] * m1[1], m2[0] * m1[2] + m2[2] * m1[3],
        m2[1] * m1[2] + m2[3] * m1[3], m2[0] * m1[4] + m2[2] * m1[5] + m2[4], m2[1] * m1[4] + m2[3] * m1[5] + m2[5],
    )
    fun apply(m: DoubleArray, x: Double, y: Double) = doubleArrayOf(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])

    /** PDF user space to visual points: the inverse of [toPdf]. */
    fun userToVisual(view: List<Double>, rot: Int): DoubleArray {
        val a = view[0]; val b = view[1]
        val w = view[2] - a; val h = view[3] - b
        return when (turn(rot)) {
            90 -> doubleArrayOf(0.0, 1.0, 1.0, 0.0, -b, -a)
            180 -> doubleArrayOf(-1.0, 0.0, 0.0, 1.0, a + w, -b)
            270 -> doubleArrayOf(0.0, -1.0, -1.0, 0.0, b + h, a + w)
            else -> doubleArrayOf(1.0, 0.0, 0.0, -1.0, -a, b + h)
        }
    }

    /**
     * Fits the visual box [cut] on an [ow] x [oh] page with [pad0] points of margin on every side,
     * centred, turned a quarter when that makes the label at least 8% bigger. The matrix takes PDF user
     * space to the new page.
     */
    fun fitMatrix(view: List<Double>, rot: Int, cut: VBox, ow: Double, oh: Double, pad0: Double): Fit {
        val w = max(1.0, cut.x1 - cut.x0)
        val h = max(1.0, cut.y1 - cut.y0)
        val pad = max(0.0, min(pad0, min(ow / 4, oh / 4)))
        val aw = ow - 2 * pad; val ah = oh - 2 * pad
        val s1 = min(aw / w, ah / h)
        val s2 = min(aw / h, ah / w)
        val turned = s2 > s1 * 1.08
        val v2o = if (!turned) {
            val ox = (ow - w * s1) / 2; val oy = (oh - h * s1) / 2
            doubleArrayOf(s1, 0.0, 0.0, -s1, ox - s1 * cut.x0, oh - oy + s1 * cut.y0)
        } else {
            val ox = (ow - h * s2) / 2; val oy = (oh - w * s2) / 2
            doubleArrayOf(0.0, -s2, -s2, 0.0, ox + s2 * (h + cut.y0), oh - oy + s2 * cut.x0)
        }
        return Fit(mul(v2o, userToVisual(view, rot)), turned, if (turned) s2 else s1)
    }

    /** Where a Meesho invoice starts under the label (the same words the label sorter stops at). */
    val STOP = Regex("tax\\s*invoice|\\binvoice\\b|bill\\s*to|ship\\s*to|sold\\s*by|original\\s*for|bill\\s*of\\s*supply", RegexOption.IGNORE_CASE)

    /**
     * The top of the invoice on an upright page, in visual points: content below it is left out. [vh] when
     * the page has no invoice, or no label above it (an invoice-only page).
     */
    fun invoiceTop(items: List<TextItem>, view: List<Double>, vh: Double): Double {
        var limit = vh
        for (t in items) {
            if (!STOP.containsMatchIn(t.str)) continue
            val z = abs(t.transform[3]).takeIf { it > 0 } ?: 10.0
            val top = view[3] - (t.transform[5] + z) - 2
            if (top > vh * 0.15 && top < limit) limit = top
        }
        return limit
    }

    /** True when a cut rectangle is the page's own box (nothing to cut). */
    fun same(view: List<Double>, r: DoubleArray) =
        abs(r[0] - view[0]) < 0.5 && abs(r[1] - view[1]) < 0.5 && abs(r[2] - (view[2] - view[0])) < 0.5 && abs(r[3] - (view[3] - view[1])) < 0.5
}
