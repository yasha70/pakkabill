package com.pakkabill.app.labels

import android.content.Context
import com.pakkabill.core.labels.Glyph
import com.pakkabill.core.labels.PdfPageText
import com.pakkabill.core.labels.Words
import com.pakkabill.core.labels.TextItem
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition
import kotlin.math.abs

/**
 * Reads the text of every page of a PDF with its position, the way the website reads it with pdf.js:
 * one item per word, [size, 0, 0, size, x, y] in PDF points with y going up, and the word's width.
 * The website's label engine then finds the SKU table, courier and order numbers from these.
 */
object PdfText {
    @Volatile private var ready = false

    /** PdfBox needs its font tables once; done the first time a PDF is read. */
    fun init(context: Context) {
        if (ready) return
        synchronized(this) {
            if (!ready) { PDFBoxResourceLoader.init(context.applicationContext); ready = true }
        }
    }

    /** Opens a PDF from its bytes (also one that only stops editing with an owner password). */
    fun open(bytes: ByteArray): PDDocument {
        val d = PDDocument.load(bytes)
        if (d.isEncrypted) d.isAllSecurityToBeRemoved = true
        return d
    }

    /** Every page's words and box. [progress] gets (page done, pages). */
    fun read(doc: PDDocument, progress: (Int, Int) -> Unit = { _, _ -> }): List<PdfPageText> {
        val n = doc.numberOfPages
        val out = ArrayList<PdfPageText>(n)
        val s = Collector()
        for (i in 0 until n) {
            val page = doc.getPage(i)
            s.glyphs.clear()
            s.startPage = i + 1
            s.endPage = i + 1
            runCatching { s.getText(doc) }
            val box = page.cropBox ?: page.mediaBox
            out += PdfPageText(words(s.glyphs), listOf(box.lowerLeftX.toDouble(), box.lowerLeftY.toDouble(), box.upperRightX.toDouble(), box.upperRightY.toDouble()), page.rotation)
            progress(i + 1, n)
        }
        return out
    }

    private class Collector : PDFTextStripper() {
        val glyphs = ArrayList<TextPosition>()
        init { sortByPosition = false }
        override fun processTextPosition(text: TextPosition) { glyphs += text }
    }

    /** PdfBox's glyphs -> words, as the website gets them from pdf.js (see [Words]). */
    private fun words(gs: List<TextPosition>): List<TextItem> = Words.of(
        gs.mapNotNull { g ->
            val u = g.unicode ?: return@mapNotNull null
            val m = g.textMatrix
            val z = abs(m.scalingFactorY.toDouble()).takeIf { it > 0.1 } ?: g.fontSizeInPt.toDouble().coerceAtLeast(1.0)
            Glyph(u, m.translateX.toDouble(), m.translateY.toDouble(), z, g.widthDirAdj.toDouble())
        },
    )
}
