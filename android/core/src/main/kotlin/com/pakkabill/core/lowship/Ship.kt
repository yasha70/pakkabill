package com.pakkabill.core.lowship

import com.pakkabill.core.ToolsJs
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/* Low shipping image: the website's lowship.js. Which versions to make (and their names) come from its
   engine run in Rhino; the pixel work is the same arithmetic in Kotlin, because it runs on every pixel. */

/** One version of the photo: what is changed (the website's tweak, same names). */
@Serializable data class Tweak(
    val key: String,
    val label: String = "",
    val zoom: Double? = null, val rot: Double? = null, val dx: Double? = null, val dy: Double? = null,
    val light: Double? = null, val contrast: Double? = null, val sat: Double? = null, val warm: Double? = null, val sharp: Double? = null,
    val white: Boolean? = null, val border: Double? = null, val borderColor: List<Int>? = null, val q: Double? = null, val flip: Boolean? = null,
    val frame: Double? = null, val frameColor: List<Int>? = null, val fc: String? = null, val sticker: String? = null, val corner: String? = null,
    val fill: Double? = null, val bd: String? = null,
)

/** The product's box in a photo, in pixels. */
data class PBox(val x: Int, val y: Int, val w: Int, val h: Int)

/** What a look at a photo found: background colour, plain or busy, the background mask and the product's box. */
class Analysis(val bg: IntArray, val uniform: Double, val plain: Boolean, val mask: ByteArray?, val box: PBox)

/** Meesho's photo check for a version (size, file weight, product size). */
@Serializable data class PhotoNote(val bad: Boolean, val text: String)

/** One category's results: the cheapest shipping, which versions gave it, the seller's own photo, the saving. */
@Serializable data class ShipSummary(val low: Double, val best: List<String>, val own: Double? = null, val save: Double? = null, val checked: Int = 0)

object ShipPixels {
    val BACKDROPS = mapOf(
        "white" to intArrayOf(255, 255, 255), "cream" to intArrayOf(250, 246, 236), "grey" to intArrayOf(241, 241, 243),
        "blush" to intArrayOf(252, 238, 240), "sky" to intArrayOf(236, 243, 252), "mint" to intArrayOf(235, 247, 239),
    )
    val STRENGTH = mapOf("gentle" to 28, "normal" to 42, "strong" to 60)

    private fun r(c: Int) = (c shr 16) and 255
    private fun g(c: Int) = (c shr 8) and 255
    private fun b(c: Int) = c and 255
    private fun d2(c: Int, k: IntArray): Int { val x = r(c) - k[0]; val y = g(c) - k[1]; val z = b(c) - k[2]; return x * x + y * y + z * z }
    private fun d2d(c: Int, k: DoubleArray): Double { val x = r(c) - k[0]; val y = g(c) - k[1]; val z = b(c) - k[2]; return x * x + y * y + z * z }

    /** Background colour from the photo's border, and how much of the border is that colour (lowship.js borderColor). */
    fun borderColor(w: Int, h: Int, px: IntArray): Pair<IntArray, Double> {
        val band = max(1, (min(w, h) * 0.015).roundHalfUp())
        val idx = ArrayList<Int>()
        for (y in 0 until h) {
            if (y < band || y >= h - band) for (x in 0 until w) idx += y * w + x
            else for (x in 0 until band) { idx += y * w + x; idx += y * w + w - 1 - x }
        }
        val bins = LinkedHashMap<Int, Int>()
        for (i in idx) { val c = px[i]; val k = ((r(c) shr 4) shl 8) or ((g(c) shr 4) shl 4) or (b(c) shr 4); bins[k] = (bins[k] ?: 0) + 1 }
        var best = 0; var bestN = -1
        for ((k, n) in bins) if (n > bestN) { best = k; bestN = n }
        val seed = intArrayOf(((best shr 8) and 15) * 16 + 8, ((best shr 4) and 15) * 16 + 8, (best and 15) * 16 + 8)
        var rs = 0.0; var gs = 0.0; var bs = 0.0; var n = 0
        for (i in idx) if (d2(px[i], seed) <= 24 * 24) { rs += r(px[i]); gs += g(px[i]); bs += b(px[i]); n++ }
        val bg = if (n > 0) doubleArrayOf(rs / n, gs / n, bs / n) else doubleArrayOf(seed[0].toDouble(), seed[1].toDouble(), seed[2].toDouble())
        var near = 0
        for (i in idx) if (d2d(px[i], bg) <= 36.0 * 36) near++
        val ring = ArrayList<Int>()
        for (x in 0 until w) ring += x
        for (y in 1 until h) ring += y * w + w - 1
        for (x in w - 2 downTo 0) ring += (h - 1) * w + x
        for (y in h - 2 downTo 1) ring += y * w
        var smooth = 0; var close = 0
        for (j in ring.indices) {
            val i = ring[j]; val k = ring[(j + 1) % ring.size]
            if (d2(px[i], intArrayOf(r(px[k]), g(px[k]), b(px[k]))) <= 10 * 10) smooth++
            if (d2d(px[i], bg) <= 84.0 * 84) close++
        }
        val shaded = min(smooth, close).toDouble() / ring.size
        return intArrayOf(bg[0].roundHalfUp(), bg[1].roundHalfUp(), bg[2].roundHalfUp()) to max(near.toDouble() / idx.size, if (shaded >= 0.9) shaded else 0.0)
    }

    /** Background pixels: a flood from the border through colours near the background, and along gentle shading (1 = background). */
    fun backgroundMask(w: Int, h: Int, px: IntArray, bg: IntArray, tol: Int): ByteArray {
        val total = w * h
        val m = ByteArray(total)
        val q = IntArray(total)
        val t2 = tol * tol; val far2 = (tol * 2) * (tol * 2); val step2 = 9 * 9
        var qh = 0; var qt = 0
        fun take(p: Int, from: Int) {
            if (m[p].toInt() != 0) return
            val e = d2(px[p], bg)
            if (e <= t2 || (from >= 0 && e <= far2 && d2(px[p], intArrayOf(r(px[from]), g(px[from]), b(px[from]))) <= step2)) { m[p] = 1; q[qt++] = p }
        }
        for (x in 0 until w) { take(x, -1); take((h - 1) * w + x, -1) }
        for (y in 0 until h) { take(y * w, -1); take(y * w + w - 1, -1) }
        while (qh < qt) {
            val p = q[qh++]; val x = p % w
            if (x > 0) take(p - 1, p)
            if (x < w - 1) take(p + 1, p)
            if (p >= w) take(p - w, p)
            if (p < total - w) take(p + w, p)
        }
        return m
    }

    /** The product: pieces of non-background at least 2% the size of the biggest; specks go to the background. */
    fun productBox(mask: ByteArray, w: Int, h: Int): PBox? {
        val total = w * h
        val lab = IntArray(total)
        val q = IntArray(total)
        class Part(val id: Int, val area: Int, val x0: Int, val y0: Int, val x1: Int, val y1: Int)
        val parts = ArrayList<Part>()
        for (s in 0 until total) {
            if (mask[s].toInt() != 0 || lab[s] != 0) continue
            val id = parts.size + 1
            var qh = 0; var qt = 0; var area = 0; var x0 = w; var y0 = h; var x1 = -1; var y1 = -1
            lab[s] = id; q[qt++] = s
            while (qh < qt) {
                val p = q[qh++]; val x = p % w; val y = p / w
                area++
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
                if (x > 0 && mask[p - 1].toInt() == 0 && lab[p - 1] == 0) { lab[p - 1] = id; q[qt++] = p - 1 }
                if (x < w - 1 && mask[p + 1].toInt() == 0 && lab[p + 1] == 0) { lab[p + 1] = id; q[qt++] = p + 1 }
                if (y > 0 && mask[p - w].toInt() == 0 && lab[p - w] == 0) { lab[p - w] = id; q[qt++] = p - w }
                if (y < h - 1 && mask[p + w].toInt() == 0 && lab[p + w] == 0) { lab[p + w] = id; q[qt++] = p + w }
            }
            parts += Part(id, area, x0, y0, x1, y1)
        }
        if (parts.isEmpty()) return null
        val big = parts.maxOf { it.area }
        val keep = parts.filter { it.area >= max(big * 0.02, total * 0.0002) }
        val kept = keep.map { it.id }.toHashSet()
        for (p in 0 until total) if (lab[p] != 0 && lab[p] !in kept) mask[p] = 1
        val x = keep.minOf { it.x0 }; val y = keep.minOf { it.y0 }
        return PBox(x, y, keep.maxOf { it.x1 } - x + 1, keep.maxOf { it.y1 } - y + 1)
    }

    /** A look at a photo (ideally at most 600 px): plain background or busy, the mask and the product's box. */
    fun analyze(w: Int, h: Int, px: IntArray, strength: String = "normal"): Analysis {
        val (bg, uniform) = borderColor(w, h, px)
        val plain = uniform >= 0.6
        val whole = PBox(0, 0, w, h)
        if (!plain || strength == "off") return Analysis(bg, uniform, plain, null, whole)
        val mask = backgroundMask(w, h, px, bg, STRENGTH[strength] ?: STRENGTH.getValue("normal"))
        val box = productBox(mask, w, h)
        if (box == null || box.w.toLong() * box.h > w * h * 0.985) return Analysis(bg, uniform, false, null, whole)
        return Analysis(bg, uniform, plain, mask, box)
    }

    /** Uint8ClampedArray's rounding: to the nearest, a tie to the even one, then 0..255. */
    private fun clamp8(v: Double): Int = Math.rint(v).coerceIn(0.0, 255.0).toInt()
    private fun Double.roundHalfUp(): Int = Math.floor(this + 0.5).toInt()

    /** Light, contrast, colour and warmth on ARGB pixels, in place (lowship.js adjustPixels). */
    fun adjust(px: IntArray, t: Tweak) {
        val light = (t.light ?: 0.0) * 255; val con = t.contrast ?: 1.0; val sat = t.sat ?: 1.0; val warm = (t.warm ?: 0.0) * 12
        if (light == 0.0 && con == 1.0 && sat == 1.0 && warm == 0.0) return
        for (i in px.indices) {
            val c = px[i]
            var rr = r(c).toDouble(); var gg = g(c).toDouble(); var bb = b(c).toDouble()
            if (sat != 1.0) { val y = 0.299 * rr + 0.587 * gg + 0.114 * bb; rr = y + (rr - y) * sat; gg = y + (gg - y) * sat; bb = y + (bb - y) * sat }
            if (con != 1.0) { rr = (rr - 128) * con + 128; gg = (gg - 128) * con + 128; bb = (bb - 128) * con + 128 }
            rr += light + warm; gg += light + warm * 0.25; bb += light - warm
            px[i] = (c and 0xff000000.toInt()) or (clamp8(rr) shl 16) or (clamp8(gg) shl 8) or clamp8(bb)
        }
    }

    /** Sharpening with the 4 neighbours (unsharp mask), in place (lowship.js sharpen). */
    fun sharpen(px: IntArray, w: Int, h: Int, amount: Double) {
        if (!(amount > 0)) return
        val src = px.copyOf()
        for (y in 1 until h - 1) for (x in 1 until w - 1) {
            val i = y * w + x
            val c = src[i]; val up = src[i - w]; val dn = src[i + w]; val lf = src[i - 1]; val rt = src[i + 1]
            fun ch(f: (Int) -> Int): Int { val v = f(c); val n = f(up) + f(dn) + f(lf) + f(rt); return clamp8(v + amount * (4 * v - n)) }
            px[i] = (c and 0xff000000.toInt()) or (ch(::r) shl 16) or (ch(::g) shl 8) or ch(::b)
        }
    }

    /** Output size: "photo" keeps the shape (longer side 1000-1500 px), "square" is 1000 × 1000. */
    fun outSize(w: Int, h: Int, shape: String): Pair<Int, Int> {
        if (shape == "square") return 1000 to 1000
        val long = max(w, h)
        val k = min(1500, max(1000, long)).toDouble() / long
        return (w * k).roundHalfUp() to (h * k).roundHalfUp()
    }

    /** How much bigger a turned photo must be drawn so its corners still fill the frame. */
    fun coverScale(w: Int, h: Int, deg: Double): Double {
        val a = abs(deg) * Math.PI / 180
        return cos(a) + max(w.toDouble() / h, h.toDouble() / w) * sin(a)
    }

    /** Where the product goes in a "product fills" version: the part of the photo to take and where it lands. */
    data class Place(val sx: Double, val sy: Double, val sw: Double, val sh: Double, val dx: Double, val dy: Double, val dw: Double, val dh: Double)
    fun placeFill(box: PBox, srcW: Int, srcH: Int, w: Int, h: Int, fill: Double, dy: Double = 0.0): Place {
        val pad = (max(box.w, box.h) * 0.02).roundHalfUp()
        val sx = max(0, box.x - pad); val sy = max(0, box.y - pad)
        val sw = min(srcW, box.x + box.w + pad) - sx; val sh = min(srcH, box.y + box.h + pad) - sy
        val k = fill * min(w, h) / max(box.w, box.h)
        val cx = (box.x + box.w / 2.0 - sx) * k; val cy = (box.y + box.h / 2.0 - sy) * k
        return Place(sx.toDouble(), sy.toDouble(), sw.toDouble(), sh.toDouble(), w / 2.0 - cx, h / 2.0 + dy * h - cy, sw * k, sh * k)
    }

    fun fillOf(box: PBox?, w: Int, h: Int) = if (box == null) 1.0 else max(box.w.toDouble() / w, box.h.toDouble() / h)

    /** Versions that need the product cut out (a plain background). */
    fun needsCut(t: Tweak) = t.white == true || t.fill != null || (t.bd != null && t.bd != "own")
}

/** The website's list of versions, their names and the results, through its own engine. */
class ShipEngine(private val js: ToolsJs = ToolsJs()) {
    init { js.use("lowship") }

    private val tweaks = ListSerializer(Tweak.serializer())

    /** The first [n] versions of [look] this photo can have ([plain]: the product can be cut out); [lead] first. */
    fun versions(look: String, n: Int, plain: Boolean, lead: List<String>): List<Tweak> =
        J.decodeFromString(tweaks, js.eval("JSON.stringify(PBShip.pick(PBShip.order(${JsonPrimitive(look)}), $n, $plain, ${J.encodeToString(ListSerializer(String.serializer()), lead)}))"))

    /** Up to [n] new versions close to the cheapest one. */
    fun around(t: Tweak, n: Int, have: List<String>): List<Tweak> =
        J.decodeFromString(tweaks, js.call("PBShip.around", J.encodeToString(Tweak.serializer(), t), n.toString(), J.encodeToString(ListSerializer(String.serializer()), have)))

    fun tweakOf(key: String): Tweak? = js.call("PBShip.tweakOf", JsonPrimitive(key).toString()).let { if (it == "null") null else J.decodeFromString(Tweak.serializer(), it) }
    fun keyLabel(key: String): String = J.decodeFromString(String.serializer(), js.call("PBShip.keyLabel", JsonPrimitive(key).toString()))

    /** Version keys that were cheapest before, from the seller's results per category. */
    fun ranking(cats: JsonElement): List<String> = J.decodeFromString(ListSerializer(String.serializer()), js.call("PBShip.ranking", cats.toString()))

    /** One photo's results for one category: versionKey -> rupees. */
    fun summary(ship: Map<String, Double>): ShipSummary? = js.call("PBShip.summary", JsonObject(ship.mapValues { JsonPrimitive(it.value) }).toString()).let { if (it == "null") null else J.decodeFromString(ShipSummary.serializer(), it) }

    fun photoCheck(w: Int, h: Int, bytes: Int, fill: Double?): List<PhotoNote> =
        J.decodeFromString(ListSerializer(PhotoNote.serializer()), js.call("PBShip.photoCheck", "$w", "$h", "$bytes", fill?.toString() ?: "null"))

    /** The looks and how many versions each level makes. */
    fun looks(): Map<String, String> = J.decodeFromString(kotlinx.serialization.builtins.MapSerializer(String.serializer(), String.serializer()), js.eval("JSON.stringify(PBShip.LOOKS)"))
    fun levels(): Map<String, Int> = J.decodeFromString(kotlinx.serialization.builtins.MapSerializer(String.serializer(), Int.serializer()), js.eval("JSON.stringify(PBShip.LEVELS)"))

    /** Runs the website's own pixel functions (for tests: the Kotlin port must give the same). */
    fun jsEval(code: String) = js.eval(code)

    companion object {
        val J = Json { ignoreUnknownKeys = true; encodeDefaults = false; explicitNulls = false; coerceInputValues = true }
    }
}
