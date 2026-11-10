package com.pakkabill.core.listing

import com.pakkabill.core.ToolsJs
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/* Meesho listing: the website's listing.js engine (category template, photo names, links, rows, the
   Excel writer) run in Rhino; the app reads and writes the .xlsx zip around it. */

/** The page's settings (listing.js defaultSettings, same names). */
@Serializable data class ListingS(
    val details: Map<String, String> = emptyMap(), val packerSame: Boolean = true, val price: String = "", val mrp: String = "",
    val returnsLess: Double? = 31.0, val sizes: List<String> = emptyList(), val chart: Map<String, Map<String, String>> = emptyMap(),
    val chartTypical: Boolean = false, val chartChecked: Boolean = false, val productName: String = "", val addColour: Boolean = true,
    val skuPrefix: String = "", val placement: String = "last", val presetColour: String? = null, val presetId: String? = null,
    val pendingPreset: String? = null,
)

/** A photo added (only its name and header are kept; the photo itself goes to Meesho's image upload). */
@Serializable data class LPhoto(
    val key: String, val name: String, val size: Long = 0, val link: String = "", val how: String = "", val format: String = "", val cmyk: Boolean = false,
    val w: Int = 0, val h: Int = 0,
)
/** A colour of the product: its name, Meesho's colour, and its front, back and side photos (keys). */
@Serializable data class LColour(
    val id: String, val key: String = "", val label: String = "", val meesho: String = "", val front: String = "", val back: String = "", val side: String = "", val cat: String = "",
)
/** A catalogue: its own name, collage (cover) photo and, when different, price, MRP and product name. */
@Serializable data class LCatalogue(val id: String, val name: String = "", val cover: String = "", val price: String = "", val mrp: String = "", val productName: String = "")
/** The page's work: photos, colours and catalogues (listing.js defaultWork). */
@Serializable data class ListingW(
    val images: Map<String, LPhoto> = emptyMap(), val colours: List<LColour> = emptyList(),
    val catalogues: List<LCatalogue> = listOf(LCatalogue("c" + java.lang.Long.toString(System.nanoTime(), 36))), val pendingLinks: List<String> = emptyList(),
)

/** A column of the template's "Fill this" sheet. */
@Serializable data class LColumn(
    val col: String, val name: String, val desc: String = "", val required: Boolean = false, val role: String = "", val kind: String = "text",
    val options: List<String>? = null, val store: String = "s",
)
@Serializable data class LSchema(
    val firstRow: Int = 5, val maxRows: Int = 0, val fillName: String = "", val columns: List<LColumn> = emptyList(), val name: LColumn, val size: LColumn,
    val price: LColumn, val mrp: LColumn, val color: LColumn, val returns: LColumn? = null, val sku: LColumn? = null, val style: LColumn? = null,
    val group: LColumn? = null, val images: List<LColumn> = emptyList(), val measures: List<LColumn> = emptyList(), val generic: List<LColumn> = emptyList(),
)
@Serializable data class LInfo(val category: String = "", val title: String = "", val id: String = "", val version: String = "")
@Serializable data class LTemplate(val info: LInfo, val schema: LSchema)
@Serializable data class Copied(val details: Int = 0, val sizes: Int = 0)

@Serializable data class LIssue(val level: String, val msg: String, val where: String = "")
@Serializable data class LCounts(val catalogues: Int = 0, val products: Int = 0, val sizes: Int = 0, val rows: Int = 0, val missingLinks: Int = 0, val usedImages: Int = 0)
@Serializable data class LRow(val group: String = "", val catLabel: String = "", val colour: String = "", val meesho: String = "", val size: String = "", val name: String = "", val price: Double = 0.0, val mrp: Double = 0.0, val photos: Int = 0, val sku: String = "")
@Serializable data class LPart(val groups: Int = 0, val cats: List<String> = emptyList(), val rows: List<LRow> = emptyList())
/** What would go to Meesho: the rows in files Meesho accepts, and every problem found first. */
@Serializable data class LPlan(val issues: List<LIssue> = emptyList(), val counts: LCounts = LCounts(), val returnsLess: Double = 31.0, val parts: List<LPart> = emptyList())
@Serializable data class LinkNote(val total: Int = 0, val matched: Int = 0, val missing: Int = 0)
/** A ready-made set of details, sizes and size chart: the website's own, or one the seller saved. */
@Serializable data class LSet(val id: String, val name: String, val builtIn: Boolean = false, val facts: String = "")
/** What a ready-made set filled in, and the values this template has no choice for. */
@Serializable data class LSetResult(val name: String = "", val details: Int = 0, val sizes: Int = 0, val chart: Int = 0, val missed: List<String> = emptyList())
/** A message the website's page would show. */
@Serializable data class LSaid(val msg: String = "", val level: String = "")
@Serializable data class LSetUse(val S: ListingS, val W: ListingW, val result: LSetResult? = null, val toast: LSaid? = null)
@Serializable data class LSetSaved(val S: ListingS, val sets: JsonArray = JsonArray(emptyList()), val toast: LSaid? = null)
@Serializable data class LAfter(val S: ListingS, val W: ListingW, val result: LSetResult? = null, val pend: String? = null, val shopNote: Boolean = false)

/** A photo's header, read by the app (listing.js inspectImage): format, CMYK, size. */
data class PhotoInfo(val format: String, val cmyk: Boolean, val w: Int, val h: Int)

class ListingEngine(private val js: ToolsJs = ToolsJs()) {
    init { js.use("xmldom", "zip-facade", "listing", "listing-facade") }
    private var xlsx: ByteArray? = null
    var template: LTemplate? = null
        private set

    private fun s(o: ListingS) = J.encodeToString(ListingS.serializer(), o)
    private fun w(o: ListingW) = J.encodeToString(ListingW.serializer(), o)

    /** Reads a Meesho category template (.xlsx). Throws with the website's message when it is not one. */
    fun loadTemplate(bytes: ByteArray): LTemplate {
        val (files, bin) = unzip(bytes)
        val src = JsonObject(mapOf("files" to JsonObject(files.mapValues { JsonPrimitive(it.value) }), "bin" to JsonArray(bin.map { JsonPrimitive(it) })))
        val t = J.decodeFromString(LTemplate.serializer(), js.callAsync("PBListingApp.template", src.toString()))
        xlsx = bytes
        template = t
        return t
    }

    /** What Meesho already filled in the template goes into the empty settings (listing.js applyTemplate). */
    fun apply(S: ListingS, W: ListingW): Triple<ListingS, ListingW, Copied> {
        val o = J.parseToJsonElement(js.call("PBListingApp.apply", s(S), w(W))).jsonObject
        return Triple(J.decodeFromJsonElement(ListingS.serializer(), o["S"]!!), J.decodeFromJsonElement(ListingW.serializer(), o["W"]!!), J.decodeFromJsonElement(Copied.serializer(), o["copied"]!!))
    }

    /** Adds photos by name and header; ones named by colour and view (red_front.jpg) sort themselves. Gives the work and how many are left to place. */
    fun addPhotos(S: ListingS, W: ListingW, photos: List<Triple<String, Long, PhotoInfo>>): Pair<ListingW, Int> {
        val arr = JsonArray(photos.map { (n, size, i) -> JsonObject(mapOf("name" to JsonPrimitive(n), "size" to JsonPrimitive(size), "format" to JsonPrimitive(i.format), "cmyk" to JsonPrimitive(i.cmyk), "w" to JsonPrimitive(i.w), "h" to JsonPrimitive(i.h))) })
        val o = J.parseToJsonElement(js.call("PBListingApp.addPhotos", s(S), w(W), arr.toString())).jsonObject
        return J.decodeFromJsonElement(ListingW.serializer(), o["W"]!!) to ((o["left"] as JsonPrimitive).content.toInt())
    }
    fun removePhotos(W: ListingW, keys: List<String>): ListingW = J.decodeFromString(ListingW.serializer(), js.call("PBListingApp.removePhotos", w(W), J.encodeToString(ListingSerializerStrings, keys)))
    fun groupInThrees(S: ListingS, W: ListingW, keys: List<String>): ListingW = J.decodeFromString(ListingW.serializer(), js.call("PBListingApp.groupInThrees", s(S), w(W), J.encodeToString(ListingSerializerStrings, keys)))
    fun newColour(S: ListingS, W: ListingW, label: String): ListingW = J.decodeFromString(ListingW.serializer(), js.call("PBListingApp.newColour", s(S), w(W), JsonPrimitive(label).toString()))
    /** Puts a photo in a colour's view ("front", "back", "side"), a catalogue's collage, or back in the tray. */
    fun place(W: ListingW, key: String, type: String, colourId: String = "", view: String = "", catId: String = ""): ListingW {
        val target = JsonObject(mapOf("type" to JsonPrimitive(type), "colourId" to JsonPrimitive(colourId), "view" to JsonPrimitive(view), "catId" to JsonPrimitive(catId)))
        return J.decodeFromString(ListingW.serializer(), js.call("PBListingApp.place", w(W), JsonPrimitive(key).toString(), target.toString()))
    }
    fun matchLinks(S: ListingS, W: ListingW, text: String): Pair<ListingW, LinkNote?> {
        val o = J.parseToJsonElement(js.call("PBListingApp.matchLinks", s(S), w(W), JsonPrimitive(text).toString())).jsonObject
        return J.decodeFromJsonElement(ListingW.serializer(), o["W"]!!) to o["note"]?.takeIf { it is JsonObject }?.let { J.decodeFromJsonElement(LinkNote.serializer(), it) }
    }
    fun matchByOrder(S: ListingS, W: ListingW): Pair<ListingW, Int> {
        val o = J.parseToJsonElement(js.call("PBListingApp.matchByOrder", s(S), w(W))).jsonObject
        return J.decodeFromJsonElement(ListingW.serializer(), o["W"]!!) to (o["n"] as JsonPrimitive).content.toInt()
    }
    fun clearLinks(W: ListingW): ListingW = J.decodeFromString(ListingW.serializer(), js.call("PBListingApp.clearLinks", w(W)))
    /** Links in a spreadsheet (Meesho's image upload sheet) as text lines. */
    fun linksText(bytes: ByteArray): String {
        val (files, bin) = unzip(bytes)
        val src = JsonObject(mapOf("files" to JsonObject(files.mapValues { JsonPrimitive(it.value) }), "bin" to JsonArray(bin.map { JsonPrimitive(it) })))
        return J.decodeFromString(String.serializer(), js.callAsync("PBListingApp.linksText", src.toString()))
    }
    /** A typical readymade-blouse size chart in the empty cells (the seller checks it). */
    fun typical(S: ListingS): Pair<ListingS, Int> {
        val o = J.parseToJsonElement(js.call("PBListingApp.typical", s(S))).jsonObject
        return J.decodeFromJsonElement(ListingS.serializer(), o["S"]!!) to (o["n"] as JsonPrimitive).content.toInt()
    }
    fun usedPhotos(S: ListingS, W: ListingW): List<String> = J.decodeFromString(ListingSerializerStrings, js.call("PBListingApp.used", s(S), w(W)))

    fun plan(S: ListingS, W: ListingW): LPlan = J.decodeFromString(LPlan.serializer(), js.call("PBListingApp.plan", s(S), w(W)))

    /* The website page's own parts: ready-made sets (the seller's sets are a JSON array the app keeps),
       the suggested name, colour swatches. */
    fun sets(user: JsonArray): List<LSet> = J.decodeFromString(ListSerializer(LSet.serializer()), js.call("PBListingApp.sets", user.toString()))
    fun useSet(S: ListingS, W: ListingW, user: JsonArray, id: String): LSetUse =
        J.decodeFromString(LSetUse.serializer(), js.call("PBListingApp.useSet", s(S), w(W), user.toString(), JsonPrimitive(id).toString()))
    fun saveSet(S: ListingS, W: ListingW, user: JsonArray, name: String): LSetSaved =
        J.decodeFromString(LSetSaved.serializer(), js.call("PBListingApp.saveSet", s(S), w(W), user.toString(), JsonPrimitive(name).toString()))
    fun deleteSet(user: JsonArray, id: String): JsonArray = J.parseToJsonElement(js.call("PBListingApp.deleteSet", user.toString(), JsonPrimitive(id).toString())) as JsonArray
    /** After a template is read: a set picked before it fills in, and the maker from the shop's name and address. */
    fun afterTemplate(S: ListingS, W: ListingW, user: JsonArray, shop: String): LAfter =
        J.decodeFromString(LAfter.serializer(), js.call("PBListingApp.afterTemplate", s(S), w(W), user.toString(), JsonPrimitive(shop).toString()))
    fun suggestName(S: ListingS): String = J.decodeFromString(String.serializer(), js.call("PBListingApp.suggestName", s(S)))
    /** Each colour's swatch: "#rrggbb", the multicolour gradient ("conic-gradient(...)"), or "". */
    fun swatches(W: ListingW): Map<String, String> = J.decodeFromString(MapSerializer(String.serializer(), String.serializer()), js.call("PBListingApp.swatches", w(W)))
    /** A colour's name typed: Meesho's colour is picked from it when the colour has none yet. */
    fun label(W: ListingW, colourId: String, text: String): ListingW =
        J.decodeFromString(ListingW.serializer(), js.call("PBListingApp.label", w(W), JsonPrimitive(colourId).toString(), JsonPrimitive(text).toString()))
    /** What an importer field says when the goods are made in India. */
    fun importer(field: String): String = J.decodeFromString(String.serializer(), js.call("PBListingApp.importer", JsonPrimitive(field).toString()))

    /** One Excel file for Meesho's bulk upload: the seller's own template with the rows written in. */
    fun write(S: ListingS, W: ListingW, part: Int): ByteArray {
        val src = xlsx ?: error("No template")
        val o = J.parseToJsonElement(js.callAsync("PBListingApp.write", s(S), w(W), part.toString())).jsonObject
        val files = J.decodeFromJsonElement(MapSerializer(String.serializer(), String.serializer()), o["files"]!!)
        val removed = J.decodeFromJsonElement(ListSerializer(String.serializer()), o["removed"]!!).toSet()
        return rezip(src, files, removed)
    }

    companion object {
        val J = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false; coerceInputValues = true }
        private val ListingSerializerStrings = ListSerializer(String.serializer())
        private fun isText(p: String) = p.endsWith(".xml", true) || p.endsWith(".rels", true) || p.endsWith(".vml", true)

        /** The .xlsx parts: XML as text (the engine reads and changes these), the rest by name. */
        fun unzip(bytes: ByteArray): Pair<Map<String, String>, List<String>> {
            val files = LinkedHashMap<String, String>()
            val bin = ArrayList<String>()
            ZipInputStream(ByteArrayInputStream(bytes)).use { z ->
                while (true) {
                    val e = z.nextEntry ?: break
                    if (e.isDirectory) continue
                    val data = z.readBytes()
                    if (isText(e.name)) files[e.name] = String(data, Charsets.UTF_8).removePrefix("﻿") else bin += e.name
                }
            }
            if (files.isEmpty()) error("This is not an Excel (.xlsx) file.")
            return files to bin
        }

        /** The template again, with the parts the engine changed, in the same order (removed parts left out). */
        fun rezip(src: ByteArray, files: Map<String, String>, removed: Set<String>): ByteArray {
            val out = ByteArrayOutputStream()
            val seen = HashSet<String>()
            ZipOutputStream(out).use { zo ->
                ZipInputStream(ByteArrayInputStream(src)).use { z ->
                    while (true) {
                        val e = z.nextEntry ?: break
                        if (e.isDirectory || e.name in removed || !seen.add(e.name)) continue
                        val data = z.readBytes()
                        zo.putNextEntry(ZipEntry(e.name))
                        zo.write(files[e.name]?.toByteArray(Charsets.UTF_8) ?: data)
                        zo.closeEntry()
                    }
                }
                for ((p, t) in files) if (p !in seen && p !in removed) { zo.putNextEntry(ZipEntry(p)); zo.write(t.toByteArray(Charsets.UTF_8)); zo.closeEntry() }
            }
            return out.toByteArray()
        }

        /** A photo's header (listing.js inspectImage): JPEG (and whether CMYK), PNG, WebP or HEIC, and its size. */
        fun inspect(b: ByteArray, mime: String = ""): PhotoInfo {
            fun u(i: Int) = b[i].toInt() and 255
            if (b.size > 3 && u(0) == 0xFF && u(1) == 0xD8) {
                var i = 2
                while (i + 9 < b.size) {
                    if (u(i) != 0xFF) { i++; continue }
                    val m = u(i + 1)
                    if (m == 0xFF) { i++; continue }
                    if (m == 0xD8 || m == 0x01 || m in 0xD0..0xD7) { i += 2; continue }
                    val len = (u(i + 2) shl 8) or u(i + 3)
                    if (m in 0xC0..0xCF && m != 0xC4 && m != 0xC8 && m != 0xCC) return PhotoInfo("jpeg", u(i + 9) == 4, (u(i + 7) shl 8) or u(i + 8), (u(i + 5) shl 8) or u(i + 6))
                    if (m == 0xDA) break
                    i += 2 + len
                }
                return PhotoInfo("jpeg", false, 0, 0)
            }
            if (b.size > 24 && u(0) == 0x89 && u(1) == 0x50 && u(2) == 0x4E) return PhotoInfo("png", false, (u(16) shl 24) or (u(17) shl 16) or (u(18) shl 8) or u(19), (u(20) shl 24) or (u(21) shl 16) or (u(22) shl 8) or u(23))
            if (b.size > 10 && u(0) == 0x52 && u(1) == 0x49 && u(8) == 0x57 && u(9) == 0x45) return PhotoInfo("webp", false, 0, 0)
            if (b.size > 12 && String(b, 4, 4, Charsets.ISO_8859_1) == "ftyp") return PhotoInfo(if (String(b, 8, 4, Charsets.ISO_8859_1).contains("avif")) "avif" else "heic", false, 0, 0)
            return PhotoInfo(mime.substringAfter('/', "unknown").lowercase(), false, 0, 0)
        }
    }

}
