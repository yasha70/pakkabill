package com.pakkabill.core

import com.pakkabill.core.autolist.ALPhoto
import com.pakkabill.core.autolist.ALProduct
import com.pakkabill.core.autolist.ALSeller
import com.pakkabill.core.autolist.ALSize
import com.pakkabill.core.autolist.ALTemplate
import com.pakkabill.core.autolist.AutoListEngine
import com.pakkabill.core.autolist.AutoListWeb
import com.pakkabill.core.autolist.ExtSync
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Auto listing in the app: the website's starter templates and listing logic in Rhino, the
 * extension's rules for moving templates between PakkaBill and Meesho, and the script for Meesho's
 * supplier panel.
 */
class AutoListTest {
    private val e = AutoListEngine()

    @Test fun websiteLogic() {
        val b = e.starter("blouse")
        assertEquals("Readymade blouse", b.name)
        assertEquals("Women Fashion > Ethnic Wear > Blouses", b.category)
        assertEquals(listOf("S", "M", "L", "XL", "XXL"), b.sizes.map { it.size })
        assertEquals("Cotton", b.fields.first { it.label == "Fabric" }.value)
        assertTrue(b.id.startsWith("t") && b.title == "{name}" && b.source == "pakkabill")
        assertEquals("New template", e.starter("nothing-like-this").name)
        assertTrue("Fabric" in e.common && "Product Description" in e.common)
        assertEquals("Maroon cotton blouse", e.nameFromFile("Maroon_cotton-blouse.jpg"))
        assertEquals("", e.nameFromFile("IMG_2034.jpg"))

        // a template with prices, and a product
        val t = b.copy(sizes = b.sizes.map { it.copy(price = "349", mrp = "999", stock = "10") }, title = "{color} {Fabric} Blouse")
        val p = ALProduct("p1", t.id, name = "Blouse", color = "Maroon", sku = "BL01")
        assertEquals(listOf("Add at least one photo."), e.problems(t, p))
        assertEquals(emptyList(), e.problems(t, p.copy(photos = listOf("ph1"))))
        assertEquals(listOf("Pick a template."), e.problems(null, p))
        assertTrue(e.problems(b, p.copy(photos = listOf("ph1"))).contains("Price is missing for size S."))
        assertTrue(e.problems(t, p.copy(photos = listOf("ph1"), price = "1200")).contains("Price is above MRP for size S."))
        assertEquals("Maroon Cotton Blouse", e.render(t.title, t, p))
        val (title, desc) = e.writeCopy(t)
        assertTrue(title.startsWith("{color} {Fabric}"), title)
        assertTrue(desc.contains("Sizes: {sizes}."), desc)

        assertEquals(listOf("BL01-RED", "BL01-NAVYBLUE"), e.variants(p, "Red, Navy Blue").map { it.sku })
        assertEquals(listOf("Free Size", "S", "XL", "38"), e.sortSizes(listOf(ALSize("38"), ALSize("XL"), ALSize("Free Size"), ALSize("S"))).map { it.size })
        val ws = e.withSeller(t, ALSeller(maker = "Kavya Fashions, Surat 395003", brand = "Kavya"))
        val fields = ws["fields"]!!.jsonArray.map { it.jsonObject["label"]!!.jsonPrimitive.content to it.jsonObject["value"]!!.jsonPrimitive.content }.toMap()
        assertEquals("Kavya Fashions, Surat 395003", fields["Manufacturer Details"]) // the template had it empty
        assertEquals("Kavya", fields["Brand Name"])
        assertEquals("India", fields["Country of Origin"]) // the template's own value wins
        assertEquals(listOf("S", "M", "L"), e.splitMulti("S, M; L"))
    }

    @Test fun templatesMoveBothWays() {
        val J = AutoListEngine.J
        // the extension has t1 (older, with a pointed box) and t2 (saved in Meesho, sizes as numbers)
        val ext = J.parseToJsonElement(
            """{"listtpl":[{"id":"t1","name":"Old","fields":[],"sizes":[],"updatedAt":3,"points":{"fabric|":"#fab"}},
               {"id":"t2","name":"From Meesho","category":"Kurtis","fields":[{"label":"Fabric","value":"Rayon","multi":true}],"sizes":[{"size":"M","price":299,"stock":5}],"source":"meesho","updatedAt":9},
               {"id":"t3","name":"Gone","fields":[],"sizes":[],"updatedAt":1}],
               "liststat":{"p1":{"state":"done","filled":9,"total":9},"p2":{"state":"filled","filled":7,"total":9,"missing":["Pattern"]}}}""",
        ).jsonObject
        val app = listOf(ALTemplate("t1", "New", updatedAt = 5), ALTemplate("t4", "Only in app", updatedAt = 2))

        val pushed = ExtSync.pushTemplates(ext, app, removed = listOf("t3"))
        val byId = pushed["listtpl"]!!.jsonArray.associateBy { it.jsonObject["id"]!!.jsonPrimitive.content }
        assertEquals(setOf("t1", "t2", "t4"), byId.keys)
        assertEquals("New", byId["t1"]!!.jsonObject["name"]!!.jsonPrimitive.content) // newer copy wins
        assertEquals("#fab", byId["t1"]!!.jsonObject["points"]!!.jsonObject["fabric|"]!!.jsonPrimitive.content) // and keeps the pointed box

        val (pulled, changed) = ExtSync.pullTemplates(app, ext, removed = listOf("t3"))
        assertTrue(changed)
        assertEquals(listOf("t1", "t4", "t2"), pulled.map { it.id })
        assertEquals("New", pulled[0].name) // the app's copy is newer
        val t2 = pulled[2]
        assertEquals("299", t2.sizes.single().price)
        assertEquals(true, t2.fields.single().multi)
        assertEquals("meesho", t2.source)
        assertFalse(ExtSync.pullTemplates(pulled, ext, listOf("t3")).second)

        val st = ExtSync.statuses(ext)
        assertEquals("done", st["p1"]!!.state)
        assertEquals(listOf("Pattern"), st["p2"]!!.missing)

        // a fresh send clears the old status of the products sent
        val p = ALProduct("p2", "t2", name = "Kurti", color = "Red", photos = listOf("ph9"))
        val tpl = e.withSeller(t2, ALSeller(maker = "Kavya"))
        val q = ExtSync.queue(ext, listOf(Triple(p.id, tpl, ExtSync.prodFor(p, listOf(ALPhoto("ph9", "kurti.jpg"))))), fresh = true, now = 77)
        assertNull(q["liststat"]!!.jsonObject["p2"])
        assertEquals("done", q["liststat"]!!.jsonObject["p1"]!!.jsonObject["state"]!!.jsonPrimitive.content)
        val item = q["listq"]!!.jsonObject["items"]!!.jsonArray.single().jsonObject
        val photo = item["prod"]!!.jsonObject["photos"]!!.jsonArray.single().jsonObject
        assertEquals("https://supplier.meesho.com/__pakkabill__/photo/ph9.jpg", photo["data"]!!.jsonPrimitive.content)
        assertEquals("ph9", AutoListWeb.photoId(photo["data"]!!.jsonPrimitive.content))
        assertNull(AutoListWeb.photoId("https://supplier.meesho.com/__pakkabill__/photo/../x.jpg"))
        assertTrue(ExtSync.queue(q, emptyList(), fresh = true, now = 78)["listq"] !is JsonObject)
    }

    @Test fun scriptForMeesho() {
        val s = AutoListWeb.bundle()
        assertFalse(s.contains("/*@list") || s.contains("@VERSION@"))
        assertTrue(s.contains("var PBListCore = (function ()") && s.contains("window.PBListPage = {"))
        assertTrue(s.contains("(app)"))
        System.getProperty("autolist.web.out")?.let { java.io.File(it).writeText(s) }
    }
}
