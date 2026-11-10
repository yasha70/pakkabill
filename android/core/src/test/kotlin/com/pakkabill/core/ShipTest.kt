package com.pakkabill.core

import com.pakkabill.core.lowship.ShipEngine
import com.pakkabill.core.lowship.ShipPixels
import com.pakkabill.core.lowship.Tweak
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.boolean

/** The app's pixel work for Low shipping image gives what the website's lowship.js gives, pixel for pixel. */
class ShipTest {
    private val e = ShipEngine()

    private fun argb(r: Int, g: Int, b: Int) = (0xff shl 24) or (r.coerceIn(0, 255) shl 16) or (g.coerceIn(0, 255) shl 8) or b.coerceIn(0, 255)
    private fun rgba(px: IntArray) = px.joinToString(",") { c -> "${(c shr 16) and 255},${(c shr 8) and 255},${c and 255},255" }

    /** A product (a dark rounded blob) on a light studio background with a gentle gradient, noise and specks. */
    private fun studio(w: Int, h: Int, seed: Int): IntArray {
        val rnd = Random(seed)
        return IntArray(w * h) { i ->
            val x = i % w; val y = i / w
            val inBlob = ((x - w * 0.5) / (w * 0.22)).let { it * it } + ((y - h * 0.55) / (h * 0.3)).let { it * it } < 1
            val speck = rnd.nextInt(400) == 0
            when {
                inBlob -> argb(120 + rnd.nextInt(40), 30 + rnd.nextInt(20), 60 + rnd.nextInt(30))
                speck -> argb(90, 90, 90)
                else -> { val v = 246 - y * 10 / h + rnd.nextInt(3); argb(v, v, v - 2) }
            }
        }
    }

    private fun compareAnalyze(w: Int, h: Int, px: IntArray, strength: String) {
        val k = ShipPixels.analyze(w, h, px.copyOf(), strength)
        val j = Json.parseToJsonElement(
            e.jsEval("(function(){ var a = PBShip.analyze({ width: $w, height: $h, data: new Uint8ClampedArray([${rgba(px)}]) }, { strength: '$strength' });" +
                " return JSON.stringify({ bg: a.bg, uniform: a.uniform, plain: a.plain, box: a.box, mask: a.mask ? Array.prototype.slice.call(a.mask) : null }); })()"),
        ).jsonObject
        assertEquals(j["bg"]!!.jsonArray.map { it.jsonPrimitive.int }, k.bg.toList(), "background colour")
        assertEquals(j["uniform"]!!.jsonPrimitive.double, k.uniform, 1e-9, "uniform")
        assertEquals(j["plain"]!!.jsonPrimitive.boolean, k.plain, "plain")
        val b = j["box"]!!.jsonObject
        assertEquals(listOf("x", "y", "w", "h").map { b[it]!!.jsonPrimitive.int }, listOf(k.box.x, k.box.y, k.box.w, k.box.h), "product box")
        val jm = j["mask"]
        if (k.mask == null) assertTrue(jm == null || jm.toString() == "null")
        else assertContentEquals(jm!!.jsonArray.map { it.jsonPrimitive.int.toByte() }.toByteArray(), k.mask, "mask")
    }

    @Test fun findsTheProductLikeTheWebsite() {
        compareAnalyze(80, 60, studio(80, 60, 1), "normal")
        compareAnalyze(64, 90, studio(64, 90, 2), "gentle")
        compareAnalyze(90, 64, studio(90, 64, 3), "strong")
        // a busy photo: no plain background
        val rnd = Random(9)
        compareAnalyze(50, 40, IntArray(50 * 40) { argb(rnd.nextInt(256), rnd.nextInt(256), rnd.nextInt(256)) }, "normal")
    }

    @Test fun lightColourAndSharpeningLikeTheWebsite() {
        val w = 30; val h = 20
        val rnd = Random(5)
        val px = IntArray(w * h) { argb(rnd.nextInt(256), rnd.nextInt(256), rnd.nextInt(256)) }
        for (t in listOf(Tweak("a", light = 0.05), Tweak("b", contrast = 1.08, sat = 1.1), Tweak("c", warm = -0.6, light = -0.04), Tweak("d", sat = 0.92, contrast = 0.94, warm = 0.5))) {
            val k = px.copyOf().also { ShipPixels.adjust(it, t) }
            val js = e.jsEval("(function(){ var d = new Uint8ClampedArray([${rgba(px)}]); PBShip.adjustPixels(d, ${ShipEngine.J.encodeToString(Tweak.serializer(), t)}); return Array.prototype.slice.call(d).join(','); })()")
            assertEquals(js, rgba(k), "adjust ${t.key}")
        }
        val k = px.copyOf().also { ShipPixels.sharpen(it, w, h, 0.45) }
        val js = e.jsEval("(function(){ var d = new Uint8ClampedArray([${rgba(px)}]); PBShip.sharpen(d, $w, $h, 0.45); return Array.prototype.slice.call(d).join(','); })()")
        assertEquals(js, rgba(k), "sharpen")
    }

    @Test fun versionsAndResultsComeFromTheWebsite() {
        val v = e.versions("smart", 24, true, emptyList())
        assertEquals(24, v.size)
        assertEquals("orig", v[0].key)
        assertTrue(v.any { it.fill != null }, "product size versions on a plain background")
        val busy = e.versions("smart", 24, false, emptyList())
        assertEquals(24, busy.size)
        assertTrue(busy.none { ShipPixels.needsCut(it) }, "no cut-out versions on a busy photo")
        val more = e.around(v[3], 12, v.map { it.key })
        assertTrue(more.isNotEmpty() && more.all { it.key.startsWith("x-") })
        val s = e.summary(mapOf("orig" to 92.0, v[2].key to 74.0, v[3].key to 81.0))!!
        assertEquals(74.0, s.low); assertEquals(18.0, s.save)
        assertTrue("smart" in e.looks() && "natural" in e.looks())
        assertEquals(24, e.levels()["normal"])
        for ((w, h, shape) in listOf(Triple(500, 400, "photo"), Triple(2400, 1801, "photo"), Triple(1234, 777, "square"))) {
            val (kw, kh) = ShipPixels.outSize(w, h, shape)
            assertEquals(e.jsEval("JSON.stringify(PBShip.outSize($w, $h, '$shape'))"), "{\"w\":$kw,\"h\":$kh}")
        }
    }
}
