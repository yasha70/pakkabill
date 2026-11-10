package com.pakkabill.core.lowship

import com.pakkabill.core.ToolsJs
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject

/** What the shipping check in Meesho's page says about itself (the bookmark's "lens" state). */
@Serializable data class ShipLens(val learned: Boolean = false, val confirmed: Boolean = false, val ship: Double? = null, val verified: Boolean? = null)

/**
 * A message from the shipping check: "results" (Meesho's shipping per version and category), "state"
 * (what it has learned), "cats" (Meesho's categories seen in the page) or "hello".
 */
class ShipMessage(
    val type: String,
    /** version id ("photo|key") -> category key -> rupees */
    val results: Map<String, Map<String, Double>> = emptyMap(),
    /** category key -> its name */
    val cats: Map<String, String> = emptyMap(),
    /** the version being priced now */
    val current: String? = null,
    val lens: ShipLens? = null,
)

/**
 * Meesho's real shipping for every photo version, in Meesho's supplier panel inside the app: the
 * website's shipping bookmark (lens/shipcore.js, shiphook.js, shipbm.js), with the app as the
 * PakkaBill tab it talks to. Versions load from an address on the same site that the app answers.
 */
object ShipWeb {
    const val ORIGIN = "https://supplier.meesho.com"
    const val PATH = "/__pakkabill__/ship/"
    /** PakkaBill's address, which the bookmark accepts messages from. */
    const val PAKKABILL = "https://pakkabill1.vercel.app"
    private val J = Json { ignoreUnknownKeys = true; isLenient = true }

    fun url(token: String) = ORIGIN + PATH + token + ".jpg"
    /** The version token in an address from [url], or null. */
    fun token(url: String): String? = Regex("^" + Regex.escape(ORIGIN + PATH) + "([A-Za-z0-9_-]{1,40})\\.jpg$").find(url)?.groupValues?.get(1)

    /** The script for Meesho's page: the website's bookmark code, with the app as its PakkaBill tab. */
    fun bundle(): String = ToolsJs.resource("ship-web.js")
        .replace("/*@shipcore@*/", ToolsJs.resource("web/shipcore.js"))
        .replace("/*@shiphook@*/", ToolsJs.resource("web/shiphook.js"))
        .replace("/*@shipbm@*/", ToolsJs.resource("web/shipbm.js").replace("__PB_ORIGIN__", PAKKABILL))

    /** A message from the page ({ op: "ship", m: { pbsb: 1, type, ... } }), or null when it is not one. */
    fun read(text: String): ShipMessage? {
        val o = runCatching { J.parseToJsonElement(text).jsonObject }.getOrNull() ?: return null
        if ((o["op"] as? JsonPrimitive)?.contentOrNull != "ship") return null
        val m = o["m"] as? JsonObject ?: return null
        if ((m["pbsb"] as? JsonPrimitive)?.contentOrNull != "1") return null
        val type = (m["type"] as? JsonPrimitive)?.contentOrNull ?: return null
        // as the website reads them: a number is the category picked in Meesho (Lens 2), else { category: rupees }
        val results = (m["results"] as? JsonObject)?.mapNotNull { (id, v) ->
            val per = when (v) {
                is JsonPrimitive -> v.doubleOrNull?.let { mapOf("picked" to it) } ?: emptyMap()
                is JsonObject -> v.mapNotNull { (k, x) -> (x as? JsonPrimitive)?.doubleOrNull?.let { k to it } }.toMap()
                else -> emptyMap()
            }.filter { (k, r) -> Regex("^[\\w-]{1,20}$").matches(k) && r > 0 && r < 5000 }
            if (per.isEmpty()) null else id to per
        }?.toMap() ?: emptyMap()
        val cats = (m["cats"] as? JsonObject)?.mapNotNull { (k, v) -> (v as? JsonPrimitive)?.contentOrNull?.takeIf { v.isString }?.let { k to it.take(80) } }?.toMap() ?: emptyMap()
        val current = (m["current"] as? JsonPrimitive)?.contentOrNull
        val lens = (m["lens"] as? JsonObject)?.let { runCatching { J.decodeFromJsonElement(ShipLens.serializer(), it) }.getOrNull() }
        return ShipMessage(type, results, cats, current, lens)
    }
}
