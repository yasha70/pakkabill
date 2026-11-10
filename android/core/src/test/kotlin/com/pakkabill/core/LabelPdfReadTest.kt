package com.pakkabill.core

import com.pakkabill.core.labels.Glyph
import com.pakkabill.core.labels.LabelOpts
import com.pakkabill.core.labels.LabelsEngine
import com.pakkabill.core.labels.PdfPageText
import com.pakkabill.core.labels.Words
import java.io.File
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.text.PDFTextStripper
import org.apache.pdfbox.text.TextPosition

/**
 * The sample Meesho label and manifest PDFs (android/ci, the emulator test's files) read the way the
 * app reads PDFs (PdfBox glyphs to words), then through the website's label engine.
 */
class LabelPdfReadTest {
    private val ci = File(System.getProperty("pakkabill.root") ?: "../..", "android/ci")

    private fun read(f: File): List<PdfPageText> = PDDocument.load(f).use { doc ->
        val glyphs = ArrayList<TextPosition>()
        val s = object : PDFTextStripper() { override fun processTextPosition(text: TextPosition) { glyphs += text } }
        (0 until doc.numberOfPages).map { i ->
            glyphs.clear(); s.startPage = i + 1; s.endPage = i + 1; s.getText(doc)
            val b = doc.getPage(i).cropBox
            PdfPageText(
                Words.of(glyphs.map { g -> Glyph(g.unicode, g.textMatrix.translateX.toDouble(), g.textMatrix.translateY.toDouble(), abs(g.textMatrix.scalingFactorY.toDouble()), g.widthDirAdj.toDouble()) }),
                listOf(b.lowerLeftX.toDouble(), b.lowerLeftY.toDouble(), b.upperRightX.toDouble(), b.upperRightY.toDouble()),
            )
        }
    }

    @Test fun samplePdfsAreRead() {
        val e = LabelsEngine()
        val lab = e.addFile(1, "Meesho-labels-sample.pdf", read(File(ci, "Meesho-labels-sample.pdf")))
        assertEquals(6, lab.labels, lab.toString())
        val man = e.addFile(2, "Meesho-manifest-sample.pdf", read(File(ci, "Meesho-manifest-sample.pdf")))
        assertEquals(3, man.man, man.toString())

        val v = e.view(LabelOpts(), "10 Nov 2026")
        assertEquals(listOf("Labels" to "6", "Pieces" to "8", "SKUs" to "4", "Couriers" to "2"), v.tileList)
        val c = v.check!!
        assertEquals(6, c.on, c.toString())
        assertTrue(c.off.isEmpty() && c.extra.isEmpty(), c.toString())
        val ch = v.chart!!
        assertEquals("man", ch.from)
        assertEquals(8, ch.chart.grand)
        assertTrue(ch.pick!!.same, ch.pick.toString())
        // the order with two products goes last; Valmo's labels first
        assertEquals(2, v.order.last().rows.size)
        assertEquals("Valmo", v.order.first().courier)
        val plan = e.plan(LabelOpts())
        assertTrue(plan.labels.all { it.cutY != null }, plan.labels.toString())
        assertEquals(3, plan.man.size)
    }
}
