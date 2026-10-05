package com.pakkabill.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json as KJson

/* The P&L report as the engine gives it (facade.js). All money is integer paise. */

val json = KJson { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; encodeDefaults = true }

@Serializable data class Report(
    val empty: Boolean = false,
    val files: List<FileInfo> = emptyList(),
    val months: List<MonthRef> = emptyList(),
    val per: Period = Period(),
    val sel: Sel = Sel(),
    val health: Health = Health(),
    val sum: Summary = Summary(),
    val vs: Vs? = null,
    val lines: List<Line> = emptyList(),
    val bridge: List<Line> = emptyList(),
    val gst: Gst? = null,
    val returns: Returns? = null,
    val categories: List<Category> = emptyList(),
    val skus: List<SkuRow> = emptyList(),
    val monthly: List<MonthRow> = emptyList(),
    val costs: List<CostRow> = emptyList(),
    val catList: List<String> = emptyList(),
    val checks: Checks = Checks(),
)

@Serializable data class FileInfo(val id: String = "", val name: String = "", val size: Long = 0, val at: Long = 0, val sheets: List<SheetInfo> = emptyList(), val cats: Int = 0)
@Serializable data class SheetInfo(val name: String = "", val type: String = "", val n: Int = 0, val from: String? = null, val to: String? = null, val cats: Int? = null)
@Serializable data class MonthRef(val m: String, val label: String)
@Serializable data class Period(val from: String = "", val to: String = "", val basis: String = "pay", val mode: String = "all", val label: String = "", val m: String? = null)
@Serializable data class Sel(val mode: String = "all", val basis: String = "pay", val m: String? = null, val from: String? = null, val to: String? = null)
@Serializable data class Health(val legs: Int = 0, val ordRows: Int = 0)
@Serializable data class Missing(val sku: String = "", val units: Int = 0, val pn: String = "")
@Serializable data class Summary(
    val NP: Long = 0, val NS: Long = 0, val NR: Long = 0, val margin: Double = 0.0, val payout: Long = 0, val COGS: Long = 0,
    val sales: Int = 0, val del: Int = 0, val perDel: Long = 0, val pieces: Int = 0, val rdef: Int = 0, val revPend: Int = 0,
    val revPendV: Long = 0, val unexpl: Int = 0, val O: Long = 0, val T: Long = 0, val D: Long = 0, val rlu: Int = 0, val rlv: Long = 0,
    val REGD: Boolean = true, val claim: Boolean = true, val missing: List<Missing> = emptyList(), val unalloc: Long = 0,
)
@Serializable data class Vs(val prev: String = "", val prevLabel: String = "", val diff: Long = 0)
@Serializable data class Line(val k: String? = null, val l: String = "", val v: Long = 0)
@Serializable data class Gst(val out: Long = 0, val itcCh: Long = 0, val itcAds: Long = 0, val itc: Long = 0, val net: Long = 0, val tcs: Long = 0, val cash: Long = 0)
@Serializable data class Group(val n: Int = 0, val pcs: Int = 0, val retFee: Long = 0, val fwdShip: Long = 0, val fees: Long = 0, val back: Long = 0, val pack: Long = 0, val stock: Long = 0, val pending: Int = 0, val noPay: Int = 0, val loss: Long = 0)
@Serializable data class Groups(val rto: Group = Group(), val ret: Group = Group(), val exch: Group = Group(), val lost: Group = Group())
@Serializable data class RetSku(val sku: String = "", val pn: String = "", val done: Int = 0, val rto: Int = 0, val lost: Int = 0, val ret: Int = 0, val exch: Int = 0, val rtoRate: Double = 0.0, val retRate: Double = 0.0, val exchRate: Double = 0.0, val loss: Long = 0)
@Serializable data class Returns(
    val done: Int = 0, val delivered: Int = 0, val transit: Int = 0, val loss: Long = 0,
    val rtoRate: Double = 0.0, val retRate: Double = 0.0, val exchRate: Double = 0.0, val lostRate: Double = 0.0,
    val G: Groups = Groups(), val skus: List<RetSku> = emptyList(),
)
@Serializable data class Category(val cat: String = "", val skus: Int = 0, val sold: Int = 0, val NS: Long = 0, val profit: Long = 0, val delivered: Int = 0, val rto: Int = 0, val ret: Int = 0, val loss: Long = 0)
@Serializable data class SkuRow(
    val sku: String = "", val pn: String = "", val pcs: Int = 1, val sold: Int = 0, val units: Int = 0, val retRto: Int = 0, val delivered: Int = 0,
    val NS: Long = 0, val contrib: Long = 0, val perOrder: Long = 0, val avgPrice: Long = 0, val breakEven: Long = 0, val cat: String = "",
)
@Serializable data class MonthRow(val m: String = "", val label: String = "", val NS: Long = 0, val GP: Long = 0, val NP: Long = 0, val payout: Long = 0, val MCx: Long = 0)
@Serializable data class CostRow(
    val sku: String = "", val pn: String = "", val orders: Int = 0, val units: Int = 0, val pcs: Int = 1, val auto: Int = 1,
    val autoCat: String = "", val cat: String = "", val price: Long = 0, val cost: Long? = null,
)
@Serializable data class Checks(val bridge: Boolean = true, val sku: Boolean = true)

/** What the seller keeps per SKU: cost per piece (paise), pieces per order, note, category. */
@Serializable data class Cost(val c: Long? = null, val p: Int? = null, val n: String? = null, val k: String? = null)

/** An expense outside Meesho: amount in paise, when = "monthly" or a month like "2026-08" (one time). */
@Serializable data class Expense(val id: String = "", val name: String = "", val amt: Long = 0, val `when`: String = "monthly")

/** Money in rupees for display: ₹1,15,741 (Indian grouping), paise dropped unless asked. */
object Money {
    fun rs(paise: Long, withPaise: Boolean = false): String {
        val neg = paise < 0
        val a = kotlin.math.abs(paise)
        val rupees = a / 100
        val s = indian(rupees) + if (withPaise) "." + (a % 100).toString().padStart(2, '0') else ""
        return (if (neg) "−₹" else "₹") + s
    }

    fun indian(n: Long): String {
        val s = n.toString()
        if (s.length <= 3) return s
        val last3 = s.takeLast(3)
        val rest = s.dropLast(3)
        return rest.reversed().chunked(2).joinToString(",").reversed() + "," + last3
    }

    fun pct(x: Double) = String.format("%.1f%%", x * 100)
}
