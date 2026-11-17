package com.pakkabill.core

import com.pakkabill.core.labels.Crop
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The Label cropper's engine against the website's own checks (test/cropper-audit.js), number for number. */
class CropTest {
    private class R(val x: Int, val y: Int, val w: Int, val h: Int, val c: Int = 0)
    private fun page(w: Int, h: Int, vararg rects: R): IntArray {
        val px = IntArray(w * h) { 0xFFFFFFFF.toInt() }
        for (r in rects) for (y in r.y until r.y + r.h) for (x in r.x until r.x + r.w) px[y * w + x] = (0xFF shl 24) or (r.c shl 16) or (r.c shl 8) or r.c
        return px
    }

    @Test fun contentBox() {
        assertNull(Crop.contentBox(page(100, 200), 100, 200))
        assertEquals(Crop.PxBox(5, 95, 10, 90), Crop.contentBox(page(100, 200, R(10, 5, 80, 90)), 100, 200))
        assertEquals(Crop.PxBox(5, 95, 10, 90), Crop.contentBox(page(100, 200, R(10, 5, 80, 90), R(50, 180, 1, 1)), 100, 200), "single speck below is ignored")
        assertEquals(152, Crop.contentBox(page(100, 200, R(10, 5, 80, 90), R(20, 150, 30, 2)), 100, 200)!!.bottom, "a real line below is kept")
        assertNull(Crop.contentBox(page(100, 200, R(0, 0, 100, 200, 245)), 100, 200), "very light grey counts as white")
        assertEquals(Crop.PxBox(10, 30, 10, 30), Crop.contentBox(page(100, 200, R(10, 10, 20, 20, 200)), 100, 200), "mid grey counts as content")
    }

    @Test fun cutBox() {
        val c = Crop.Content(10.0, 400.0, 20.0, 260.0)
        assertEquals(Crop.VBox(0.0, 0.0, 288.0, 408.0), Crop.cutBox(288.0, 842.0, c, 8.0, false))
        assertEquals(Crop.VBox(12.0, 2.0, 268.0, 408.0), Crop.cutBox(288.0, 842.0, c, 8.0, true))
        assertEquals(842.0, Crop.cutBox(288.0, 842.0, Crop.Content(10.0, 838.0, 20.0, 260.0), 8.0, false).y1)
        assertEquals(Crop.VBox(92.0, 2.0, 110.0, 20.0), Crop.cutBox(288.0, 842.0, Crop.Content(2.0, 4.0, 100.0, 102.0), 0.0, true), "at least the minimum size")
    }

    private val view = listOf(15.0, 30.0, 303.0, 872.0) // offset box, 288 x 842

    @Test fun pdfRect() {
        for (rot in listOf(0, 90, 180, 270)) {
            val (vw, vh) = Crop.visualSize(view, rot)
            assertEquals(listOf(15.0, 30.0, 288.0, 842.0), Crop.pdfRect(view, rot, Crop.VBox(0.0, 0.0, vw, vh)).toList(), "full page rot $rot")
        }
        assertEquals(listOf(15.0, 451.0, 288.0, 421.0), Crop.pdfRect(view, 0, Crop.VBox(0.0, 0.0, 288.0, 421.0)).toList())
        assertEquals(listOf(15.0, 30.0, 100.0, 842.0), Crop.pdfRect(view, 90, Crop.VBox(0.0, 0.0, 842.0, 100.0)).toList())
        assertEquals(listOf(15.0, 30.0, 288.0, 421.0), Crop.pdfRect(view, 180, Crop.VBox(0.0, 0.0, 288.0, 421.0)).toList())
        assertEquals(listOf(203.0, 30.0, 100.0, 842.0), Crop.pdfRect(view, 270, Crop.VBox(0.0, 0.0, 842.0, 100.0)).toList())
    }

    @Test fun exactSizes() {
        fun close(a: Double, b: Double) = abs(a - b) < 1e-6
        for (rot in listOf(0, 90, 180, 270)) {
            val (vw, _) = Crop.visualSize(view, rot)
            val cut = Crop.VBox(10.0, 12.0, minOf(vw, 270.0), 392.0)
            for ((ow, oh) in listOf(288.0 to 288.0, 288.0 to 432.0)) {
                val f = Crop.fitMatrix(view, rot, cut, ow, oh, 6.0)
                val pts = listOf(cut.x0 to cut.y0, cut.x1 to cut.y0, cut.x0 to cut.y1, cut.x1 to cut.y1).map { (x, y) -> val u = Crop.toPdf(view, rot, x, y); Crop.apply(f.m, u[0], u[1]) }
                assertTrue(pts.all { it[0] > 6 - 1e-6 && it[0] < ow - 6 + 1e-6 && it[1] > 6 - 1e-6 && it[1] < oh - 6 + 1e-6 }, "rot $rot: inside the margin")
                val xs = pts.map { it[0] }; val ys = pts.map { it[1] }
                assertTrue(close((xs.min() + xs.max()) / 2, ow / 2) && close((ys.min() + ys.max()) / 2, oh / 2), "rot $rot: centred")
                assertTrue(close(xs.max() - xs.min(), ow - 12) || close(ys.max() - ys.min(), oh - 12), "rot $rot: as big as fits")
                assertEquals(false, f.turned, "rot $rot: tall label is not turned")
                assertTrue(pts[0][0] < pts[3][0] && pts[0][1] > pts[3][1], "rot $rot: upright")
                assertTrue(f.m[0] * f.m[3] - f.m[1] * f.m[2] > 0, "rot $rot: not mirrored")
            }
            val wide = Crop.VBox(0.0, 0.0, minOf(vw, 280.0), 120.0)
            val fw = Crop.fitMatrix(view, rot, wide, 288.0, 432.0, 0.0)
            assertEquals(true, fw.turned, "rot $rot: wide label turned on 4x6")
            assertTrue(fw.m[0] * fw.m[3] - fw.m[1] * fw.m[2] > 0, "rot $rot: turned label not mirrored")
            val c = listOf(wide.x0 to wide.y0, wide.x1 to wide.y1).map { (x, y) -> val u = Crop.toPdf(view, rot, x, y); Crop.apply(fw.m, u[0], u[1]) }
            assertTrue(c.all { it[0] > -1e-6 && it[0] < 288 + 1e-6 && it[1] > -1e-6 && it[1] < 432 + 1e-6 }, "rot $rot: turned label inside the page")
        }
    }
}
