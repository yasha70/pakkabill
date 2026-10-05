package com.pakkabill.core

/** Fast JSON for spreadsheet rows (they can be large, so no object mapping on the way in). */
internal object Json {
    fun sheets(sheets: List<Sheet>): String {
        val sb = StringBuilder(64 * 1024)
        sb.append('[')
        sheets.forEachIndexed { i, s ->
            if (i > 0) sb.append(',')
            sb.append("{\"name\":"); str(sb, s.name); sb.append(",\"rows\":[")
            s.rows.forEachIndexed { r, row ->
                if (r > 0) sb.append(',')
                sb.append('[')
                row.forEachIndexed { c, v ->
                    if (c > 0) sb.append(',')
                    when (v) {
                        is Double -> if (v.isFinite()) { if (v == Math.rint(v) && kotlin.math.abs(v) < 1e15) sb.append(v.toLong()) else sb.append(v) } else sb.append("null")
                        is Boolean -> sb.append(v)
                        else -> str(sb, v.toString())
                    }
                }
                sb.append(']')
            }
            sb.append("]}")
        }
        sb.append(']')
        return sb.toString()
    }

    fun str(sb: StringBuilder, s: String) {
        sb.append('"')
        for (ch in s) {
            when (ch) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> if (ch < ' ') sb.append(String.format("\\u%04x", ch.code)) else sb.append(ch)
            }
        }
        sb.append('"')
    }
}
