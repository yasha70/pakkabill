package com.pakkabill.core.lens

import com.pakkabill.core.ToolsJs
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/* Meesho Lens: the website's Lens core (lens/core.js, shared with the Lens extension) run in Rhino. */

/** The seller's numbers for the estimates (the website's settings, same names). */
@Serializable data class LensSettings(
    val shipping: Double = 70.0, val gst: Double = 5.0, val ratingRatio: Double = 8.0, val myCost: String = "", val returnPct: Double = 20.0,
    val returnLoss: Double = 70.0, val myPrice: String = "",
)

/** What one order at this price brings (lens/core.js money). */
@Serializable data class Money(
    val sellerPrice: Double? = null, val taxable: Double? = null, val gstAmt: Double? = null, val tcs: Double? = null, val tds: Double? = null,
    val settlement: Double? = null, val earning: Double? = null, val perPiece: Double? = null, val myMargin: Double? = null, val expected: Double? = null,
)
@Serializable data class SizePrice(val size: String? = null, val price: Double? = null)

/** One competitor on the Lens page. */
@Serializable data class LensRow(
    val id: String, val name: String = "", val url: String = "", val image: String? = null, val seller: String? = null, val packText: String? = null, val pack: Int = 1,
    val lastSeen: Long = 0, val firstSeen: Long = 0, val readings: Int = 0, val price: Double? = null, val firstPrice: Double? = null, val mrp: Double? = null,
    val onwards: Boolean = false, val rating: Double? = null, val ratings: Double? = null, val reviews: Double? = null, val speed: Double? = null, val days: Double? = null,
    val dropped: Boolean = false, val overall: Double? = null, val money: Money = Money(), val lowShare: Double? = null, val poorShare: Double? = null, val risk: String? = null,
    val freeDelivery: Boolean? = null, val deliveryCharge: Double? = null, val fabric: String? = null, val brand: String? = null, val sizes: List<SizePrice>? = null,
    val sizeList: List<String>? = null, val sellerFollowers: Double? = null, val sellerProducts: Double? = null, val sellerRating: Double? = null, val off: Double? = null,
)
@Serializable data class Fastest(val speed: Double, val name: String)
@Serializable data class Mine(val price: Double, val cheaper: Int, val of: Int)
@Serializable data class LensTiles(val count: Int = 0, val multi: Int = 0, val low: Double? = null, val high: Double? = null, val middle: Double? = null, val fastest: Fastest? = null, val mine: Mine? = null)
@Serializable data class LensView(val rows: List<LensRow> = emptyList(), val tiles: LensTiles = LensTiles())

/** Speed of sales from how fast ratings grow (lens/core.js velocity). */
@Serializable data class Velocity(val days: Double = 0.0, val gained: Double = 0.0, val dropped: Boolean = false, val ratingsPerDay: Double? = null, val ordersPerDay: Double? = null)
/** What a product page read in the app's Meesho view shows: the reading, its history, the estimates. */
@Serializable data class Panel(val h: JsonObject? = null, val money: Money = Money(), val v: Velocity? = null, val risk: String? = null, val d: JsonObject? = null)

class LensEngine(private val js: ToolsJs = ToolsJs()) {
    init { js.use("lenscore", "lens-facade") }

    /** A page read (PBLensCore.extract, done in the Meesho view) with the product's history so far. */
    fun panel(d: JsonObject, prev: JsonObject?, s: LensSettings, now: Long): Panel =
        J.decodeFromString(Panel.serializer(), js.call("PBLens.panel", d.toString(), prev?.toString() ?: "null", J.encodeToString(LensSettings.serializer(), s), now.toString()))

    fun view(products: JsonObject, s: LensSettings, sort: String, now: Long): LensView =
        J.decodeFromString(LensView.serializer(), js.call("PBLens.view", products.toString(), J.encodeToString(LensSettings.serializer(), s), JsonPrimitive(sort).toString(), now.toString()))

    fun csv(products: JsonObject, s: LensSettings, now: Long): String =
        J.decodeFromString(String.serializer(), js.call("PBLens.csv", products.toString(), J.encodeToString(LensSettings.serializer(), s), now.toString()))

    /** The Meesho product id in a link (…/p/abc123), or null. */
    fun productId(url: String): String? = Regex("/p/([a-z0-9]+)", RegexOption.IGNORE_CASE).find(url)?.groupValues?.get(1)

    companion object {
        val J = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false; coerceInputValues = true }
    }
}
