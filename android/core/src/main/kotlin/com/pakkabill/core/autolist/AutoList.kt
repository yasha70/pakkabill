package com.pakkabill.core.autolist

import com.pakkabill.core.ToolsJs
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/* Auto listing, as on the website (autolist.js): templates saved once (Meesho category, details,
   sizes with price and stock, name and description patterns), products with their photos, and
   Meesho's catalogue form filled by the PakkaBill Lens extension's own form filler, which the app
   runs in Meesho's supplier panel. Names follow the website, so saved data moves between them. */

/** A detail of Meesho's form: its label, the value, and Meesho's choices when they were read. */
@Serializable data class ALField(val label: String = "", val value: String = "", val multi: Boolean? = null, val opts: List<String>? = null)
@Serializable data class ALSize(val size: String = "", val price: String = "", val rprice: String = "", val mrp: String = "", val stock: String = "")
@Serializable data class ALTemplate(
    val id: String, val name: String = "", val category: String = "", val fields: List<ALField> = emptyList(), val sizes: List<ALSize> = emptyList(),
    val title: String = "{name}", val desc: String = "", val source: String = "pakkabill", val updatedAt: Long = 0,
    /** Boxes the seller pointed at in Meesho for this template (the extension keeps them). */
    val points: JsonObject? = null,
)
@Serializable data class ALProduct(
    val id: String, val tplId: String = "", val name: String = "", val color: String = "", val sku: String = "", val price: String = "", val mrp: String = "",
    val stock: String = "", val photos: List<String> = emptyList(), val createdAt: Long = 0, val sent: Long = 0,
)
/** The seller's own details, put in every listing (Meesho asks for them each time). */
@Serializable data class ALSeller(val maker: String = "", val packer: String = "", val importer: String = "", val origin: String = "India", val brand: String = "")
/** The page's saved data (the website's "pb-autolist"). */
@Serializable data class ALState(
    val templates: List<ALTemplate> = emptyList(), val products: List<ALProduct> = emptyList(), val removed: List<String> = emptyList(),
    val defTpl: String = "", val perPhoto: Boolean = true, val seller: ALSeller = ALSeller(),
)
/** What the form filler in Meesho says about a product: filled (how many of how many) or submitted. */
@Serializable data class ALStatus(val state: String = "", val filled: Int = 0, val total: Int = 0, val missing: List<String> = emptyList(), val empty: List<String> = emptyList(), val at: Long = 0)
/** A photo of a product, made ready for Meesho. */
data class ALPhoto(val id: String, val name: String)

/** The website's logic for the page (lens/listcore.js and autolist.js's starter templates), in Rhino. */
class AutoListEngine(private val js: ToolsJs = ToolsJs()) {
    init { js.use("listcore", "autolist") }
    private fun t(o: ALTemplate?) = if (o == null) "null" else J.encodeToString(ALTemplate.serializer(), o)
    private fun p(o: ALProduct) = J.encodeToString(ALProduct.serializer(), o)
    private fun str(s: String) = JsonPrimitive(s).toString()

    /** A new template from the website's starters: "blouse", "saree", "kurti" or "blank". */
    fun starter(kind: String): ALTemplate = J.decodeFromString(ALTemplate.serializer(), js.call("PBAutoListPage.starter", str(kind)))
    /** Meesho's usual detail labels, offered while typing a label. */
    val common: List<String> by lazy { J.decodeFromString(ListSerializer(String.serializer()), js.eval("JSON.stringify(PBAutoListPage.COMMON)")) }
    /** "Maroon cotton blouse.jpg" -> "Maroon cotton blouse"; camera names like IMG_2034 -> "". */
    fun nameFromFile(name: String): String = J.decodeFromString(String.serializer(), js.call("PBAutoListPage.nameFromFile", str(name)))
    /** What is missing before a product can be filled in Meesho. */
    fun problems(tpl: ALTemplate?, prod: ALProduct): List<String> = J.decodeFromString(ListSerializer(String.serializer()), js.call("PBListCore.problems", t(tpl), p(prod)))
    /** "{color} {Fabric} Kurti" with the product's colour and the template's Fabric. */
    fun render(pattern: String, tpl: ALTemplate?, prod: ALProduct): String = J.decodeFromString(String.serializer(), js.call("PBListCore.render", str(pattern), t(tpl), p(prod)))
    /** A name and a description pattern written from the template's details. */
    fun writeCopy(tpl: ALTemplate): Pair<String, String> {
        val o = J.parseToJsonElement(js.call("PBListCore.writeCopy", t(tpl))).jsonObject
        return o["title"]!!.jsonPrimitive.content to o["desc"]!!.jsonPrimitive.content
    }
    /** Sizes in Meesho's order: free size, XS to 6XL, then numbers. */
    fun sortSizes(list: List<ALSize>): List<ALSize> = J.decodeFromString(ListSerializer(ALSize.serializer()), js.call("PBListCore.sortSizes", J.encodeToString(ListSerializer(ALSize.serializer()), list)))
    /** One product in several colours: a copy per colour, with its own SKU. */
    fun variants(prod: ALProduct, colours: String): List<ALProduct> = J.decodeFromString(ListSerializer(ALProduct.serializer()), js.call("PBListCore.variants", p(prod), str(colours)))
    /** The template with the seller's details added where it has none. */
    fun withSeller(tpl: ALTemplate, seller: ALSeller): JsonObject =
        J.parseToJsonElement(js.call("PBListCore.withSeller", t(tpl), J.encodeToString(ALSeller.serializer(), seller))).jsonObject
    fun splitMulti(s: String): List<String> = J.decodeFromString(ListSerializer(String.serializer()), js.call("PBListCore.splitMulti", str(s)))
    fun norm(s: String): String = J.decodeFromString(String.serializer(), js.call("PBListCore.norm", str(s)))

    companion object {
        /** Sizes and prices typed on the website can be numbers; they are read as text. */
        val J = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false; coerceInputValues = true; isLenient = true }
    }
}

/**
 * The extension's storage (chrome.storage.local) as the app keeps it: listtpl (templates as the form
 * filler has them), liststat (each product's status), listq (the products waiting to be filled) and
 * listform (the drop-downs it read). These are the rules of the extension's bridge to PakkaBill
 * (lens/bridge.js), so templates move both ways and the newer copy of each wins.
 */
object ExtSync {
    private val J = AutoListEngine.J
    private fun at(o: JsonElement?) = (o as? JsonObject)?.get("updatedAt")?.jsonPrimitive?.longOrNull ?: 0L
    private fun idOf(o: JsonElement?) = ((o as? JsonObject)?.get("id") as? JsonPrimitive)?.contentOrNull
    private fun okTpl(t: JsonElement?) = t is JsonObject && idOf(t)?.let { it.length <= 60 } == true && t["fields"] is JsonArray && t["sizes"] is JsonArray && t.toString().length < 200_000

    /** PakkaBill's templates into the extension's (bridge.js "pb-list-templates"). */
    fun pushTemplates(ext: JsonObject, templates: List<ALTemplate>, removed: List<String>): JsonObject {
        val by = LinkedHashMap<String, JsonObject>()
        (ext["listtpl"] as? JsonArray)?.forEach { o -> idOf(o)?.let { by[it] = o as JsonObject } }
        for (t in templates) {
            val tj = J.encodeToJsonElement(ALTemplate.serializer(), t)
            if (!okTpl(tj)) continue
            val o = by[t.id]
            if (o == null || at(tj) >= at(o)) {
                val points = JsonObject(((o?.get("points") as? JsonObject) ?: JsonObject(emptyMap())) + ((tj.jsonObject["points"] as? JsonObject) ?: JsonObject(emptyMap())))
                by[t.id] = JsonObject(tj.jsonObject + ("points" to points))
            }
        }
        removed.forEach { by.remove(it) }
        return JsonObject(ext + ("listtpl" to JsonArray(by.values.take(200))))
    }

    /** Templates saved in Meesho into PakkaBill's (autolist.js "pb-list-state"); true when any changed. */
    fun pullTemplates(templates: List<ALTemplate>, ext: JsonObject, removed: List<String>): Pair<List<ALTemplate>, Boolean> {
        val out = templates.toMutableList()
        var changed = false
        (ext["listtpl"] as? JsonArray)?.forEach { o ->
            val id = idOf(o) ?: return@forEach
            if (id in removed || (o as JsonObject)["fields"] !is JsonArray) return@forEach
            val t = runCatching { J.decodeFromJsonElement(ALTemplate.serializer(), o) }.getOrNull() ?: return@forEach
            val i = out.indexOfFirst { it.id == id }
            if (i < 0) { out += t; changed = true } else if (t.updatedAt > out[i].updatedAt) { out[i] = t; changed = true }
        }
        return out to changed
    }

    /** Each product's status from the form filler. */
    fun statuses(ext: JsonObject): Map<String, ALStatus> =
        (ext["liststat"] as? JsonObject)?.mapNotNull { (k, v) -> runCatching { k to J.decodeFromJsonElement(ALStatus.serializer(), v) }.getOrNull() }?.toMap() ?: emptyMap()

    /**
     * Products for the form filler (bridge.js "pb-list-queue"): each with its template (the seller's
     * details added) and its photos as addresses the app answers. A fresh send clears their old status.
     */
    fun queue(ext: JsonObject, items: List<Triple<String, JsonObject, JsonObject>>, fresh: Boolean, now: Long): JsonObject {
        val st = ((ext["liststat"] as? JsonObject) ?: JsonObject(emptyMap())).toMutableMap()
        if (fresh) items.forEach { st.remove(it.first) }
        val list = items.take(300).map { (id, tpl, prod) -> buildJsonObject { put("id", id); put("tpl", tpl); put("prod", prod) } }
        val q: JsonElement = if (list.isEmpty()) JsonNull else buildJsonObject { put("at", now); put("items", JsonArray(list)) }
        return JsonObject(ext + mapOf("listq" to q, "liststat" to JsonObject(st)))
    }

    /** A product as the form filler takes it: name, colour, SKU, price, MRP, stock and photos. */
    fun prodFor(p: ALProduct, photos: List<ALPhoto>): JsonObject = buildJsonObject {
        put("name", p.name); put("color", p.color); put("sku", p.sku); put("price", p.price); put("mrp", p.mrp); put("stock", p.stock)
        put("photos", JsonArray(photos.take(10).map { ph -> buildJsonObject { put("name", ph.name); put("data", AutoListWeb.photoUrl(ph.id)); put("id", ph.id) } }))
    }
}

/** The script for Meesho's supplier panel: the extension's form filler, with the app as its storage. */
object AutoListWeb {
    const val ORIGIN = "https://supplier.meesho.com"
    /** Where the page loads a product's photo from; the app answers it from the phone. */
    const val PHOTO_PATH = "/__pakkabill__/photo/"
    fun photoUrl(id: String) = ORIGIN + PHOTO_PATH + id + ".jpg"
    /** The photo id in an address from [photoUrl], or null. */
    fun photoId(url: String): String? = Regex("^" + Regex.escape(ORIGIN + PHOTO_PATH) + "([A-Za-z0-9_-]{1,60})\\.jpg$").find(url)?.groupValues?.get(1)

    /** The whole script, from the extension's own files built into the app. */
    fun bundle(): String {
        val shell = ToolsJs.resource("autolist-web.js")
        val version = ToolsJs.resource("web/lens-version.txt").trim()
        return shell.replace("@VERSION@", version)
            .replace("/*@listcore@*/", ToolsJs.resource("web/listcore.js"))
            .replace("/*@list@*/", ToolsJs.resource("web/list.js"))
    }
}
