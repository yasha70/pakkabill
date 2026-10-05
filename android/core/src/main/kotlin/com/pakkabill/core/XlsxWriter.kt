package com.pakkabill.core

import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Writes a simple Excel (.xlsx) file: several sheets, a bold first row, column widths, frozen
 * header and numbers that stay numbers (so the seller can add them up in Excel).
 */
class XlsxWriter {
    /** A cell: text, a number, or rupees (shown as ₹1,23,456.78 in Excel). */
    sealed interface Cell
    data class Text(val v: String, val bold: Boolean = false) : Cell
    data class Num(val v: Double, val bold: Boolean = false) : Cell
    data class Rupees(val paise: Long, val bold: Boolean = false) : Cell
    data class Percent(val v: Double, val bold: Boolean = false) : Cell

    class SheetSpec(val name: String, val rows: List<List<Cell?>>, val widths: List<Int>, val freezeRows: Int = 1, val freezeCols: Int = 0)

    private val sheets = mutableListOf<SheetSpec>()

    fun sheet(name: String, rows: List<List<Cell?>>, widths: List<Int> = emptyList(), freezeRows: Int = 1, freezeCols: Int = 0) {
        // Excel sheet names: at most 31 characters, none of : \ / ? * [ ]
        var n = name.replace(Regex("[:\\\\/?*\\[\\]]"), " ").take(31).ifBlank { "Sheet" }
        var i = 2
        while (sheets.any { it.name.equals(n, true) }) n = name.take(28) + " " + i++
        sheets += SheetSpec(n, rows, widths, freezeRows, freezeCols)
    }

    fun bytes(): ByteArray {
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z ->
            fun put(path: String, text: String) { z.putNextEntry(ZipEntry(path)); z.write(text.toByteArray(Charsets.UTF_8)); z.closeEntry() }
            put("[Content_Types].xml", contentTypes())
            put("_rels/.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>""")
            put("xl/workbook.xml", workbook())
            put("xl/_rels/workbook.xml.rels", workbookRels())
            put("xl/styles.xml", STYLES)
            sheets.forEachIndexed { i, s -> put("xl/worksheets/sheet${i + 1}.xml", sheetXml(s)) }
        }
        return out.toByteArray()
    }

    private fun contentTypes() = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">""")
        append("""<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>""")
        append("""<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>""")
        append("""<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>""")
        sheets.indices.forEach { append("""<Override PartName="/xl/worksheets/sheet${it + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>""") }
        append("</Types>")
    }

    private fun workbook() = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>""")
        sheets.forEachIndexed { i, s -> append("""<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>""") }
        append("</sheets></workbook>")
    }

    private fun workbookRels() = buildString {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">""")
        sheets.indices.forEach { append("""<Relationship Id="rId${it + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${it + 1}.xml"/>""") }
        append("""<Relationship Id="rId${sheets.size + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>""")
        append("</Relationships>")
    }

    private fun sheetXml(s: SheetSpec) = buildString(4096) {
        append("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">""")
        if (s.freezeRows > 0 || s.freezeCols > 0) {
            val tl = colName(s.freezeCols) + (s.freezeRows + 1)
            append("<sheetViews><sheetView workbookViewId=\"0\"><pane")
            if (s.freezeCols > 0) append(" xSplit=\"${s.freezeCols}\"")
            if (s.freezeRows > 0) append(" ySplit=\"${s.freezeRows}\"")
            append(" topLeftCell=\"$tl\" activePane=\"bottomRight\" state=\"frozen\"/></sheetView></sheetViews>")
        }
        if (s.widths.isNotEmpty()) {
            append("<cols>")
            s.widths.forEachIndexed { i, w -> append("<col min=\"${i + 1}\" max=\"${i + 1}\" width=\"$w\" customWidth=\"1\"/>") }
            append("</cols>")
        }
        append("<sheetData>")
        s.rows.forEachIndexed { r, row ->
            append("<row r=\"${r + 1}\">")
            row.forEachIndexed { c, cell ->
                if (cell == null) return@forEachIndexed
                val ref = colName(c) + (r + 1)
                val header = r == 0 && s.freezeRows > 0
                when (cell) {
                    is Text -> if (cell.v.isNotEmpty()) append("<c r=\"$ref\" t=\"inlineStr\" s=\"${if (cell.bold || header) 1 else 0}\"><is><t xml:space=\"preserve\">${esc(cell.v)}</t></is></c>")
                    is Num -> append("<c r=\"$ref\" s=\"${if (cell.bold) 1 else 0}\"><v>${num(cell.v)}</v></c>")
                    is Rupees -> append("<c r=\"$ref\" s=\"${if (cell.bold) 3 else 2}\"><v>${cell.paise / 100}.${(kotlin.math.abs(cell.paise) % 100).toString().padStart(2, '0')}</v></c>"
                        .let { if (cell.paise < 0 && cell.paise > -100) it.replace("<v>0.", "<v>-0.") else it })
                    is Percent -> append("<c r=\"$ref\" s=\"${if (cell.bold) 5 else 4}\"><v>${num(cell.v)}</v></c>")
                }
            }
            append("</row>")
        }
        append("</sheetData></worksheet>")
    }

    private fun num(v: Double) = if (!v.isFinite()) "0" else if (v == Math.rint(v) && kotlin.math.abs(v) < 1e15) v.toLong().toString() else v.toString()

    companion object {
        fun colName(i: Int): String {
            var n = i + 1
            val sb = StringBuilder()
            while (n > 0) { val m = (n - 1) % 26; sb.insert(0, ('A' + m)); n = (n - 1) / 26 }
            return sb.toString()
        }

        fun esc(s: String) = buildString(s.length) {
            for (ch in s) when {
                ch == '&' -> append("&amp;")
                ch == '<' -> append("&lt;")
                ch == '>' -> append("&gt;")
                ch == '"' -> append("&quot;")
                ch < ' ' && ch != '\n' && ch != '\t' -> {}
                else -> append(ch)
            }
        }

        // 0 normal, 1 bold, 2 rupees, 3 bold rupees, 4 percent, 5 bold percent
        private const val STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;₹&quot;#,##,##0.00;[Red]&quot;-₹&quot;#,##,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>"""
    }
}
