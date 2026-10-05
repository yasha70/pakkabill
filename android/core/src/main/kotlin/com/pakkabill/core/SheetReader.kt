package com.pakkabill.core

import java.io.ByteArrayInputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import javax.xml.parsers.SAXParserFactory
import org.xml.sax.Attributes
import org.xml.sax.helpers.DefaultHandler

/** One sheet of a spreadsheet: rows of cells (String, Double, Boolean or "" for empty). */
class Sheet(val name: String, val rows: List<List<Any>>)

/** A spreadsheet found in what the seller picked (a ZIP can hold several). */
class SheetFile(val name: String, val size: Long, val sheets: List<Sheet>)

class ReadResult(val files: List<SheetFile>, val problems: List<String>)

/**
 * Reads Meesho downloads: Excel (.xlsx), CSV and ZIP files, also a ZIP inside a ZIP. Files are
 * recognised by their content, so a download saved without its extension still works.
 * Old .xls (Excel 97) files are not read; the seller is asked to save them as .xlsx.
 */
object SheetReader {

    fun read(name: String, bytes: ByteArray): ReadResult {
        val files = mutableListOf<SheetFile>()
        val problems = mutableListOf<String>()
        take(name, bytes, files, problems, 0)
        return ReadResult(files, problems)
    }

    private fun base(n: String) = n.substringAfterLast('/')

    private fun take(name: String, bytes: ByteArray, files: MutableList<SheetFile>, problems: MutableList<String>, depth: Int) {
        val b = base(name)
        if (junk(name)) return
        when {
            isZip(bytes) -> {
                val entries = try { unzip(bytes) } catch (e: Exception) {
                    problems += "$b is damaged or not a real ZIP file. Download it again from Meesho."
                    return
                }
                if (entries.containsKey("[Content_Types].xml") && entries.keys.any { it.startsWith("xl/") }) {
                    try { files += SheetFile(b, bytes.size.toLong(), Xlsx.read(entries)) }
                    catch (e: Exception) { problems += "$b could not be opened. If it has a password, open it in Excel and save a copy without one." }
                    return
                }
                if (depth > 2) return
                val before = files.size
                for ((path, data) in entries) {
                    if (junk(path) || !Regex("\\.(xlsx|xlsm|csv|txt|zip|xls)$", RegexOption.IGNORE_CASE).containsMatchIn(path)) continue
                    take(path, data, files, problems, depth + 1)
                }
                if (files.size == before) problems += "$b has no Excel or CSV files inside."
            }
            isOle(bytes) -> problems += "$b is an old Excel (.xls) file. Open it in Excel or Google Sheets and save it as .xlsx, then upload again."
            Regex("\\.(csv|txt|tsv)$", RegexOption.IGNORE_CASE).containsMatchIn(b) || looksLikeText(bytes) -> {
                val text = String(bytes, Charsets.UTF_8).removePrefix("﻿")
                files += SheetFile(if (b.contains('.')) b else "$b.csv", bytes.size.toLong(), listOf(Sheet("Sheet1", Csv.parse(text))))
            }
            else -> problems += "$b is not an Excel, CSV or ZIP file."
        }
    }

    private fun junk(path: String) = Regex("(^|/)(__MACOSX|\\._)|\\.DS_Store$|(^|/)~\\$").containsMatchIn(path)
    private fun isZip(b: ByteArray) = b.size >= 4 && b[0] == 0x50.toByte() && b[1] == 0x4b.toByte() && (b[2] == 3.toByte() || b[2] == 5.toByte())
    private fun isOle(b: ByteArray) = b.size >= 4 && b[0] == 0xd0.toByte() && b[1] == 0xcf.toByte() && b[2] == 0x11.toByte() && b[3] == 0xe0.toByte()
    private fun looksLikeText(b: ByteArray): Boolean {
        val head = String(b, 0, minOf(b.size, 2000), Charsets.UTF_8)
        return head.none { it.code in 0..8 } && Regex("[,\\t;].*\\n").containsMatchIn(head)
    }

    fun unzip(bytes: ByteArray): Map<String, ByteArray> {
        val out = LinkedHashMap<String, ByteArray>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { z ->
            var e: ZipEntry? = z.nextEntry
            while (e != null) {
                if (!e.isDirectory) out[e.name] = z.readBytes()
                e = z.nextEntry
            }
        }
        if (out.isEmpty()) throw IllegalArgumentException("empty zip")
        return out
    }
}

/** Minimal Excel (.xlsx) reader: workbook sheet names, shared strings and cell values. */
object Xlsx {
    fun read(entries: Map<String, ByteArray>): List<Sheet> {
        val shared = entries["xl/sharedStrings.xml"]?.let { sharedStrings(it) } ?: emptyList()
        val rels = entries["xl/_rels/workbook.xml.rels"]?.let { relations(it) } ?: emptyMap()
        val sheets = mutableListOf<Sheet>()
        for ((name, rid) in workbookSheets(entries["xl/workbook.xml"] ?: error("no workbook"))) {
            val target = rels[rid] ?: continue
            val path = if (target.startsWith("/")) target.removePrefix("/") else "xl/" + target.removePrefix("./")
            val data = entries[path] ?: continue
            sheets += Sheet(name, sheetRows(data, shared))
        }
        return sheets
    }

    private fun parse(bytes: ByteArray, h: DefaultHandler) {
        val f = SAXParserFactory.newInstance()
        f.isNamespaceAware = false
        f.newSAXParser().parse(ByteArrayInputStream(bytes), h)
    }

    private fun sharedStrings(bytes: ByteArray): List<String> {
        val out = mutableListOf<String>()
        val sb = StringBuilder()
        var inT = false
        var inRph = false
        parse(bytes, object : DefaultHandler() {
            override fun startElement(u: String?, l: String?, q: String, a: Attributes) {
                when (q) { "si" -> sb.setLength(0); "t" -> inT = true; "rPh" -> inRph = true }
            }
            override fun endElement(u: String?, l: String?, q: String) {
                when (q) { "si" -> out += sb.toString(); "t" -> inT = false; "rPh" -> inRph = false }
            }
            override fun characters(ch: CharArray, s: Int, n: Int) { if (inT && !inRph) sb.append(ch, s, n) }
        })
        return out
    }

    private fun relations(bytes: ByteArray): Map<String, String> {
        val out = mutableMapOf<String, String>()
        parse(bytes, object : DefaultHandler() {
            override fun startElement(u: String?, l: String?, q: String, a: Attributes) {
                if (q == "Relationship") out[a.getValue("Id") ?: return] = a.getValue("Target") ?: return
            }
        })
        return out
    }

    private fun workbookSheets(bytes: ByteArray): List<Pair<String, String>> {
        val out = mutableListOf<Pair<String, String>>()
        parse(bytes, object : DefaultHandler() {
            override fun startElement(u: String?, l: String?, q: String, a: Attributes) {
                if (q == "sheet") out += (a.getValue("name") ?: "Sheet") to (a.getValue("r:id") ?: return)
            }
        })
        return out
    }

    /** Column letters of a cell reference ("C12" -> 2). */
    private fun colOf(ref: String): Int {
        var c = 0
        for (ch in ref) { if (ch in 'A'..'Z') c = c * 26 + (ch - 'A' + 1) else break }
        return c - 1
    }

    private fun sheetRows(bytes: ByteArray, shared: List<String>): List<List<Any>> {
        val rows = mutableListOf<List<Any>>()
        var row = ArrayList<Any>()
        var type = ""
        var col = -1
        val v = StringBuilder()
        var inV = false
        var inIs = false
        parse(bytes, object : DefaultHandler() {
            override fun startElement(u: String?, l: String?, q: String, a: Attributes) {
                when (q) {
                    "row" -> row = ArrayList()
                    "c" -> { type = a.getValue("t") ?: "n"; col = a.getValue("r")?.let { colOf(it) } ?: row.size; v.setLength(0) }
                    "v" -> inV = true
                    "is" -> inIs = true
                    "t" -> if (inIs) inV = true
                }
            }
            override fun endElement(u: String?, l: String?, q: String) {
                when (q) {
                    "v" -> inV = false
                    "t" -> if (inIs) inV = false
                    "is" -> inIs = false
                    "c" -> {
                        val raw = v.toString()
                        val value: Any = when (type) {
                            "s" -> raw.toIntOrNull()?.let { shared.getOrNull(it) } ?: ""
                            "inlineStr", "str" -> raw
                            "b" -> raw == "1"
                            "e" -> raw
                            else -> if (raw.isEmpty()) "" else raw.toDoubleOrNull() ?: raw
                        }
                        while (row.size < col) row.add("")
                        if (row.size == col) row.add(value) else if (col < row.size) row[col] = value
                    }
                    "row" -> if (row.any { it != "" }) rows += row
                }
            }
            override fun characters(ch: CharArray, s: Int, n: Int) { if (inV) v.append(ch, s, n) }
        })
        // same width for every row, like SheetJS with defval ''
        val w = rows.maxOfOrNull { it.size } ?: 0
        return rows.map { r -> if (r.size < w) r + List(w - r.size) { "" } else r }
    }
}

/** CSV (RFC 4180): commas or semicolons, quotes, line breaks inside quotes. */
object Csv {
    fun parse(text: String): List<List<Any>> {
        val firstLine = text.substringBefore('\n')
        val sep = if (firstLine.count { it == ';' } > firstLine.count { it == ',' }) ';' else if (firstLine.count { it == '\t' } > firstLine.count { it == ',' }) '\t' else ','
        val rows = mutableListOf<List<Any>>()
        var row = ArrayList<Any>()
        val cell = StringBuilder()
        var q = false
        var i = 0
        fun endCell() { row.add(cell.toString()); cell.setLength(0) }
        fun endRow() { endCell(); if (row.any { (it as String).isNotBlank() }) rows += row; row = ArrayList() }
        while (i < text.length) {
            val c = text[i]
            if (q) {
                if (c == '"') { if (i + 1 < text.length && text[i + 1] == '"') { cell.append('"'); i++ } else q = false }
                else cell.append(c)
            } else when (c) {
                '"' -> q = true
                sep -> endCell()
                '\r' -> {}
                '\n' -> endRow()
                else -> cell.append(c)
            }
            i++
        }
        if (cell.isNotEmpty() || row.isNotEmpty()) endRow()
        val w = rows.maxOfOrNull { it.size } ?: 0
        return rows.map { r -> if (r.size < w) r + List(w - r.size) { "" } else r }
    }
}
