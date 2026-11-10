package com.pakkabill.core

import com.pakkabill.core.listing.ListingEngine
import com.pakkabill.core.listing.ListingS
import com.pakkabill.core.listing.ListingW
import com.pakkabill.core.listing.PhotoInfo
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.JsonArray

/**
 * Meesho listing in the app: the website's listing engine reads a category template, sorts photos by
 * their names, matches image links, plans the rows and writes them into the template.
 */
class ListingTest {
    private fun res(n: String) = ListingTest::class.java.getResourceAsStream("/listing/$n")!!.readBytes()

    @Test fun templateToMeeshoExcel() {
        val e = ListingEngine()
        val t = e.loadTemplate(res("Blouses-template.xlsx"))
        assertEquals("Blouses", t.info.category)
        assertEquals("10771", t.info.id)
        assertEquals(5, t.schema.firstRow)
        assertEquals(listOf("32", "34", "36", "38", "Free Size"), t.schema.size.options)
        assertEquals(listOf("Cotton", "Silk", "Rayon"), t.schema.generic.first { it.name == "Fabric" }.options)
        assertEquals("returns", t.schema.returns?.role)
        assertEquals(3, t.schema.images.size)

        var (S, W, _) = e.apply(ListingS(), ListingW())
        assertEquals("India", S.details["Country of Origin"]) // filled by itself, as on the website
        S = S.copy(productName = "Cotton Blouse", price = "499", mrp = "999", sizes = listOf("32", "34"),
            details = S.details + mapOf("Fabric" to "Cotton", "Manufacturer Details" to "Kavya Fashions, Surat"))
        S = e.typical(S).first // bust sizes from the typical chart
        assertEquals("34", S.chart["34"]?.get("Bust Size"))

        val jpeg = PhotoInfo("jpeg", false, 1000, 1000)
        val (w1, left) = e.addPhotos(S, W, listOf(Triple("red_front.jpg", 1000L, jpeg), Triple("red_back.jpg", 1001L, jpeg), Triple("blue_front.jpg", 1002L, jpeg), Triple("IMG_2201.jpg", 1003L, jpeg)))
        W = w1
        assertEquals(1, left, "the photo without a colour in its name waits to be placed")
        // photos are taken in name order (as on the website): blue_front, red_back, red_front
        assertEquals(listOf("Blue", "Red"), W.colours.map { it.meesho })
        assertEquals(listOf("redfront", "redback"), listOf(W.colours[1].front, W.colours[1].back))

        // a plan before links: errors say what is missing
        assertTrue(e.plan(S, W).issues.any { it.level == "error" && it.where == "links" })
        val (w2, note) = e.matchLinks(S, W, "https://images.meesho.com/a/red_front.jpg\nhttps://images.meesho.com/a/red_back.jpg\nblue front https://images.meesho.com/a/7781.jpg")
        W = w2
        assertEquals(3, note!!.matched)
        val p = e.plan(S, W)
        assertEquals(emptyList(), p.issues.filter { it.level == "error" }.map { it.msg })
        assertEquals(4, p.counts.rows) // 2 colours x 2 sizes
        val rows = p.parts.single().rows
        assertEquals(listOf("32", "34", "32", "34"), rows.map { it.size })
        assertEquals("Cotton Blouse - Blue", rows[0].name)

        val out = e.write(S, W, 0)
        System.getProperty("listing.out")?.let { java.io.File(it).writeBytes(out) }
        val sheet = SheetReader.read("out.xlsx", out).files.single().sheets.first { it.name == "Blouses-Fill this" }
        val r5 = sheet.rows.first { (it.getOrNull(0) as? String) == "Cotton Blouse - Red" }
        assertEquals("32", r5[1].toString().removeSuffix(".0"))
        assertEquals(499.0, r5[2])
        assertEquals(468.0, r5[3]) // Meesho's returns price formula: price - 31
        assertEquals("https://images.meesho.com/a/red_front.jpg", r5[6])
        assertEquals("India", r5[13])
        assertEquals(4, sheet.rows.count { (it.getOrNull(0) as? String)?.startsWith("Cotton Blouse - ") == true })
    }

    /** The website page's own parts: ready-made sets, a set picked before the template, the shop as maker, swatches. */
    @Test fun readyMadeSetsAndPageParts() {
        val e = ListingEngine()
        val none = JsonArray(emptyList())
        // a set picked before any template waits for it
        val early = e.useSet(ListingS(), ListingW(), none, "sv-lycra-blouse")
        assertEquals("sv-lycra-blouse", early.S.pendingPreset)
        assertTrue(early.toast!!.msg.startsWith("Choose your Meesho template"))

        e.loadTemplate(res("Blouses-template.xlsx"))
        var (S, W, _) = e.apply(early.S, ListingW())
        val after = e.afterTemplate(S, W, none, "Kavya Fashions, 12 Ring Road, Surat")
        S = after.S
        assertEquals("Shree Vastraa: Lycra stretchable blouse, pack of 5", after.pend)
        assertNull(S.pendingPreset)
        assertEquals("sv-lycra-blouse", S.presetId)
        // the template sells 32 to 38 and Free Size, and has no Lycra: those are left for the seller
        assertEquals(listOf("32", "34", "36", "38"), S.sizes)
        assertTrue("Fabric: Lycra" in after.result!!.missed, after.result!!.missed.toString())
        assertTrue("Size 26" in after.result!!.missed)
        // this template lists single bust sizes, so the set's "30-34" is left for the seller too
        assertNull(S.chart["34"]?.get("Bust Size"))
        assertTrue("Bust 30-34 for size 34" in after.result!!.missed)
        // the maker comes from the shop only when the template has no maker filled in
        assertTrue(after.shopNote)
        assertEquals("Kavya Fashions, 12 Ring Road, Surat", S.details["Manufacturer Details"])
        assertEquals("Multicolor", S.presetColour)

        // the website's own set is listed; the seller's sets come first
        assertTrue(e.sets(none).any { it.id == "sv-lycra-blouse" && it.builtIn && it.facts.contains("Pack of 5") })
        val saved = e.saveSet(S, W, none, "Lycra blouse, my sizes")
        assertEquals(1, saved.sets.size)
        assertTrue(saved.S.presetId!!.startsWith("u"))
        assertTrue(saved.toast!!.msg.startsWith("Saved \"Lycra blouse, my sizes\""))
        val list = e.sets(saved.sets)
        assertEquals(listOf("Lycra blouse, my sizes", "Shree Vastraa: Lycra stretchable blouse, pack of 5"), list.map { it.name })
        val again = e.useSet(ListingS(), ListingW(), saved.sets, list[0].id)
        assertEquals(listOf("32", "34", "36", "38"), again.S.sizes)
        assertTrue(again.toast!!.msg.startsWith("Filled "))
        assertEquals(0, e.deleteSet(saved.sets, list[0].id).size)

        // a name from the details; colours and their swatches
        S = S.copy(details = S.details + ("Fabric" to "Cotton"))
        assertTrue(e.suggestName(S).contains("Cotton"), e.suggestName(S))
        W = e.newColour(S, W, "")
        val id = W.colours.single().id
        assertEquals("Multicolor", W.colours.single().meesho) // the set's colour for mixed packs
        W = e.label(W.copy(colours = W.colours.map { it.copy(meesho = "") }), id, "Red")
        assertEquals("Red", W.colours.single().meesho)
        assertEquals("#c8262c", e.swatches(W)[id])
        assertEquals("Not Required", e.importer("Fabric"))
    }
}
