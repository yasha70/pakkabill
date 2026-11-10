package com.pakkabill.core.bill

import java.net.URLEncoder
import java.time.LocalDate

/** A state or union territory with its GST code. */
data class GstState(val code: String, val name: String, val ut: Boolean = false)

/** One line of a bill, worked out. Amounts in rupees, rounded to the paisa. */
data class Line(
    val qty: Double, val gross: Double, val discountPct: Double, val discountAmt: Double, val value: Double,
    val rate: Double, val unitExcl: Double, val taxable: Double, val cgst: Double, val sgst: Double, val igst: Double,
    val tax: Double, val total: Double,
)

/** Lines grouped by HSN, GST rate and unit (the HSN summary under the items). */
data class HsnRow(val hsn: String, val unit: String, val rate: Double, val qty: Double, val taxable: Double, val cgst: Double, val sgst: Double, val igst: Double, val tax: Double, val total: Double)

/** A bill worked out. [inter] is true when IGST applies (seller and buyer in different states). */
data class Calc(
    val inter: Boolean, val lines: List<Line>, val qty: Double, val taxable: Double, val cgst: Double, val sgst: Double, val igst: Double,
    val tax: Double, val beforeRound: Double, val roundOff: Double, val total: Double, val byHsnRate: List<HsnRow>,
) {
    val totals get() = Totals(taxable, cgst, sgst, igst, tax, roundOff, total)
}

/** GSTIN check result: [state] is empty, typing, invalid, checksum (a mistyped character) or valid. */
data class GstinCheck(val state: String, val message: String, val stateCode: String = "") {
    val ok get() = state == "valid"
}

/**
 * GST rules for bills, line for line the same as the website's billing (index.html): rounding,
 * CGST/SGST or IGST by place of supply, prices that include GST (calcV 2: CGST equal to SGST and the
 * total exactly the price typed), the garment 5% / 18% slab, bill numbers by financial year.
 */
object Gst {
    val STATES = listOf(
        GstState("01", "Jammu and Kashmir"), GstState("02", "Himachal Pradesh"), GstState("03", "Punjab"), GstState("04", "Chandigarh", true),
        GstState("05", "Uttarakhand"), GstState("06", "Haryana"), GstState("07", "Delhi"), GstState("08", "Rajasthan"), GstState("09", "Uttar Pradesh"),
        GstState("10", "Bihar"), GstState("11", "Sikkim"), GstState("12", "Arunachal Pradesh"), GstState("13", "Nagaland"), GstState("14", "Manipur"),
        GstState("15", "Mizoram"), GstState("16", "Tripura"), GstState("17", "Meghalaya"), GstState("18", "Assam"), GstState("19", "West Bengal"),
        GstState("20", "Jharkhand"), GstState("21", "Odisha"), GstState("22", "Chhattisgarh"), GstState("23", "Madhya Pradesh"), GstState("24", "Gujarat"),
        GstState("25", "Daman and Diu (old code)", true), GstState("26", "Dadra and Nagar Haveli and Daman and Diu", true), GstState("27", "Maharashtra"),
        GstState("29", "Karnataka"), GstState("30", "Goa"), GstState("31", "Lakshadweep", true), GstState("32", "Kerala"), GstState("33", "Tamil Nadu"),
        GstState("34", "Puducherry"), GstState("35", "Andaman and Nicobar Islands", true), GstState("36", "Telangana"), GstState("37", "Andhra Pradesh"),
        GstState("38", "Ladakh", true), GstState("97", "Other Territory", true),
    )
    private val byCode = STATES.associateBy { it.code }
    fun stateName(code: String?) = code?.let { byCode[it]?.name }.orEmpty()
    /** "27-Maharashtra" */
    fun stateLabel(code: String?) = if (code != null && code in byCode) "$code-${stateName(code)}" else ""

    val RATES = listOf(0.0, 0.25, 3.0, 5.0, 12.0, 18.0, 28.0, 40.0)
    val UNITS = listOf("PCS", "NOS", "SET", "PRS", "MTR", "KGS", "DOZ", "BOX", "BDL", "OTH")

    /** Rounds to the paisa exactly like the website (Number.EPSILON nudge, half up). */
    fun r2(v: Double): Double {
        val a = Math.round((v + if (v >= 0) EPS else -EPS) * 100) / 100.0
        return if (a == 0.0) 0.0 else a
    }
    private val EPS = Math.ulp(1.0)

    /** "1,250.50" or "₹ 99" to a number; anything else is 0. */
    fun num(s: String?): Double = s?.replace(Regex("[,\\s₹]"), "")?.toDoubleOrNull()?.takeIf { it.isFinite() } ?: 0.0

    private const val CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    private val GSTIN_RE = Regex("^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][A-Z][0-9A-Z]$")
    fun cleanGstin(s: String?) = (s ?: "").uppercase().replace(Regex("[^0-9A-Z]"), "")

    /** The check character the 15th place of a GSTIN must have. */
    fun checkChar(first14: String): Char {
        var sum = 0
        first14.forEachIndexed { i, c ->
            val p = CHARS.indexOf(c) * (if (i % 2 == 0) 1 else 2)
            sum += p / 36 + p % 36
        }
        return CHARS[(36 - sum % 36) % 36]
    }

    fun checkGstin(raw: String?): GstinCheck {
        val g = cleanGstin(raw)
        if (g.isEmpty()) return GstinCheck("empty", "")
        if (g.length < 15) return GstinCheck("typing", "${15 - g.length} more characters")
        if (g.length > 15) return GstinCheck("invalid", "A GSTIN has exactly 15 characters")
        if (!GSTIN_RE.matches(g)) return GstinCheck("invalid", "This is not a GSTIN. It looks like 27ABCDE1234F1Z5.")
        val st = g.substring(0, 2)
        if (st !in byCode) return GstinCheck("invalid", "$st is not a state code")
        if (checkChar(g.substring(0, 14)) != g[14]) return GstinCheck("checksum", "One character looks mistyped (the last one does not match)", st)
        return GstinCheck("valid", stateName(st), st)
    }

    /** Financial year of a yyyy-MM-dd date: "26-27". */
    fun fyShort(date: String): String {
        val p = date.split("-").mapNotNull { it.toIntOrNull() }
        if (p.size < 2) return ""
        val y = if (p[1] >= 4) p[0] else p[0] - 1
        return "%02d-%02d".format(y % 100, (y + 1) % 100)
    }

    private fun cleanPrefix(p: String?) = (p ?: "").uppercase().replace(Regex("[^A-Z0-9-]"), "").take(6)
    /** "INV/26-27/0007" */
    fun number(prefix: String?, fy: String, n: Int): String {
        val p = cleanPrefix(prefix)
        return (if (p.isNotEmpty()) "$p/" else "") + fy + "/" + n.toString().padStart(4, '0')
    }
    private fun tailNumber(s: String?) = Regex("(\\d+)\\s*$").find(s ?: "")?.groupValues?.get(1)?.toIntOrNull() ?: 0

    /** The next number for a bill of [docType] dated [date]: one more than the year's highest. */
    fun nextNumber(bills: List<Invoice>, docType: String, date: String, biz: Business, skipId: String = ""): String {
        val fy = fyShort(date)
        val max = bills.filter { it.id != skipId && it.docType == docType && fyShort(it.date) == fy }.maxOfOrNull { tailNumber(it.number) } ?: 0
        return number(if (docType == "estimate") biz.estPrefix.ifBlank { "EST" } else biz.prefix, fy, max + 1)
    }

    /** Garments: 5% when the price of a piece (without GST) is ₹2,500 or less, otherwise 18%. */
    fun apparelRate(perPiece: Double, inclusive: Boolean): Double =
        if (perPiece > 0) (if (r2(if (inclusive) perPiece / 1.05 else perPiece) <= 2500) 5.0 else 18.0) else 5.0

    fun isInter(sellerState: String, pos: String) = sellerState.isNotBlank() && pos.isNotBlank() && sellerState != pos

    /** Works out a bill: every line, the totals and the HSN summary. */
    fun calc(inv: Invoice): Calc {
        val inter = isInter(inv.seller.stateCode, inv.pos)
        val v2 = inv.calcV >= 2
        val lines = inv.items.map { it ->
            val n = it.qty
            val a = it.rate
            val s = it.discount.coerceIn(0.0, 100.0)
            val gross = r2(n * a)
            val disc = r2(gross * s / 100)
            val value = r2(gross - disc)
            val rate = when {
                inv.composition -> 0.0
                it.taxMode == "apparel" -> apparelRate(if (n > 0) value / n else a, inv.inclusive)
                else -> it.gstRate
            }
            var cgst = 0.0; var sgst = 0.0; var igst = 0.0
            val taxable: Double
            if (inv.inclusive && v2) {
                if (inter) igst = r2(value * rate / (100 + rate)) else { cgst = r2(value * rate / (200 + 2 * rate)); sgst = cgst }
                taxable = r2(value - cgst - sgst - igst)
            } else {
                taxable = if (inv.inclusive) r2(value / (1 + rate / 100)) else value
                if (inter) igst = r2(taxable * rate / 100) else { cgst = r2(taxable * rate / 200); sgst = cgst }
            }
            val tax = r2(cgst + sgst + igst)
            Line(n, gross, s, disc, value, rate, if (inv.inclusive) r2(a / (1 + rate / 100)) else a, taxable, cgst, sgst, igst, tax, r2(taxable + tax))
        }
        fun sum(f: (Line) -> Double) = r2(lines.fold(0.0) { acc, l -> acc + f(l) })
        val taxable = sum { it.taxable }
        val cgst = sum { it.cgst }
        val sgst = sum { it.sgst }
        val igst = sum { it.igst }
        val tax = r2(cgst + sgst + igst)
        val before = r2(taxable + tax)
        val ro = if (inv.roundOff) r2(Math.round(before) - before) else 0.0
        val total = r2(before + ro)
        val groups = LinkedHashMap<String, HsnRow>()
        inv.items.forEachIndexed { i, it ->
            val l = lines[i]
            if (l.qty == 0.0 && l.value == 0.0) return@forEachIndexed
            val hsn = it.hsn.trim()
            val unit = it.unit.ifBlank { "PCS" }
            val k = "$hsn|${l.rate}|$unit"
            val g = groups[k] ?: HsnRow(hsn, unit, l.rate, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
            groups[k] = g.copy(
                qty = r2(g.qty + l.qty), taxable = r2(g.taxable + l.taxable), cgst = r2(g.cgst + l.cgst), sgst = r2(g.sgst + l.sgst),
                igst = r2(g.igst + l.igst), tax = r2(g.tax + l.tax), total = r2(g.total + l.total),
            )
        }
        return Calc(inter, lines, sum { it.qty }, taxable, cgst, sgst, igst, tax, before, ro, total, groups.values.toList())
    }

    /** The bill with its totals worked out again (done on every save). */
    fun withTotals(inv: Invoice) = inv.copy(totals = calc(inv).totals)

    private val ONES = listOf(
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
        "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
    )
    private val TENS = listOf("", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety")
    private fun two(n: Int) = if (n < 20) ONES[n] else TENS[n / 10] + if (n % 10 > 0) " " + ONES[n % 10] else ""
    private fun three(n: Int): String {
        val h = n / 100
        val r = n % 100
        return listOfNotNull(if (h > 0) ONES[h] + " Hundred" else null, if (r > 0) two(r) else null).joinToString(" ")
    }
    /** Whole number in Indian words: 1,25,000 is "One Lakh Twenty Five Thousand". */
    fun words(n: Long): String {
        if (n == 0L) return "Zero"
        if (n < 0) return "Minus " + words(-n)
        val parts = mutableListOf<String>()
        var x = n
        val crore = x / 10_000_000; x %= 10_000_000
        val lakh = (x / 100_000).toInt(); x %= 100_000
        val th = (x / 1000).toInt(); x %= 1000
        if (crore > 0) parts += words(crore) + " Crore"
        if (lakh > 0) parts += two(lakh) + " Lakh"
        if (th > 0) parts += two(th) + " Thousand"
        if (x > 0) parts += three(x.toInt())
        return parts.joinToString(" ")
    }
    /** "Rupees One Thousand Two Hundred Fifty and Fifty Paise Only" */
    fun amountInWords(v: Double): String {
        val p = Math.round(r2(kotlin.math.abs(v)) * 100)
        val rupees = p / 100
        val paise = (p % 100).toInt()
        return "Rupees " + words(rupees) + (if (paise > 0) " and " + two(paise) + " Paise" else "") + " Only"
    }

    /** UPI payment link for the QR code on a bill. */
    fun upiLink(upi: String, payee: String, amount: Double, note: String): String {
        fun e(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")
        return "upi://pay?pa=" + e(upi.trim()) + "&pn=" + e(payee.ifBlank { upi }.take(40)) + "&am=" + "%.2f".format(java.util.Locale.ENGLISH, amount) +
            "&cu=INR&tn=" + e(note.take(60))
    }
    private val UPI_RE = Regex("^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$")
    fun validUpi(s: String) = UPI_RE.matches(s.trim())
    private val IFSC_RE = Regex("^[A-Z]{4}0[A-Z0-9]{6}$")
    fun validIfsc(s: String) = IFSC_RE.matches(s.trim().uppercase())

    fun today(): String = LocalDate.now().toString()
}
