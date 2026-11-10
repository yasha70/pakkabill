package com.pakkabill.core.labels

import kotlin.math.abs

/** One glyph of a PDF page: its text, where it starts (PDF points, y up), its size and width. */
data class Glyph(val text: String, val x: Double, val y: Double, val size: Double, val width: Double)

/**
 * Glyphs in the order the page draws them -> words, the way pdf.js gives the website its text: one
 * item per word on the same line, with no space between its letters and the letters close together.
 */
object Words {
    fun of(gs: List<Glyph>): List<TextItem> {
        val out = ArrayList<TextItem>()
        var sb = StringBuilder()
        var x0 = 0.0; var y0 = 0.0; var size = 0.0; var right = 0.0
        fun flush() {
            if (sb.isNotBlank()) out += TextItem(sb.toString(), listOf(size, 0.0, 0.0, size, x0, y0), (right - x0).coerceAtLeast(0.1))
            sb = StringBuilder()
        }
        for (g in gs) {
            val u = g.text
            if (u.isEmpty()) continue
            if (u.isBlank()) { flush(); continue }
            val z = g.size
            if (sb.isNotEmpty() && (abs(g.y - y0) > 0.3 * maxOf(z, size) || g.x < right - 0.5 * z || g.x - right > 0.18 * maxOf(z, size))) flush()
            if (sb.isEmpty()) { x0 = g.x; y0 = g.y; size = z; right = g.x + g.width } else right = maxOf(right, g.x + g.width)
            sb.append(u)
        }
        flush()
        return out
    }
}
