package com.pakkabill.core

import com.pakkabill.core.lowship.ShipWeb
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The shipping check for Meesho's page: the website's bookmark code with the app as its PakkaBill tab. */
class ShipWebTest {
    @Test fun scriptForMeesho() {
        val s = ShipWeb.bundle()
        assertFalse(s.contains("/*@ship") || s.contains("__PB_ORIGIN__"))
        assertTrue(s.contains("var PBShipSync") && s.contains("window.__pbShipHook") && s.contains("window.__pbShipBm"))
        assertTrue(s.contains("const HOME = '" + ShipWeb.PAKKABILL + "'"))
        System.getProperty("ship.web.out")?.let { java.io.File(it).writeText(s) }
    }

    @Test fun messagesFromThePage() {
        val r = ShipWeb.read(
            """{"op":"ship","m":{"pbsb":1,"type":"results","results":{"ph1|orig":{"1234":88},"ph1|frame":{"1234":71.5,"bad key!":3},"ph2|zoom":69,"ph3|x":{"1234":0}},
               "cats":{"1234":"Blouses"},"current":"ph1|frame","lens":{"learned":true,"confirmed":true,"ship":88,"verified":true}}}""",
        )!!
        assertEquals("results", r.type)
        assertEquals(mapOf("1234" to 88.0), r.results["ph1|orig"])
        assertEquals(mapOf("1234" to 71.5), r.results["ph1|frame"]) // a key that is not a category is left out
        assertEquals(mapOf("picked" to 69.0), r.results["ph2|zoom"]) // one number: the category picked in Meesho
        assertNull(r.results["ph3|x"]) // no price
        assertEquals(mapOf("1234" to "Blouses"), r.cats)
        assertEquals("ph1|frame", r.current)
        assertEquals(88.0, r.lens!!.ship)
        assertTrue(r.lens!!.verified == true)
        assertEquals("state", ShipWeb.read("""{"op":"ship","m":{"pbsb":1,"type":"state","lens":{"learned":false}}}""")!!.type)
        assertNull(ShipWeb.read("""{"op":"get","arg":null}"""))
        assertNull(ShipWeb.read("""{"op":"ship","m":{"type":"results"}}"""))
        assertEquals("p0v12", ShipWeb.token(ShipWeb.url("p0v12")))
        assertNull(ShipWeb.token("https://supplier.meesho.com/__pakkabill__/ship/../x.jpg"))
    }
}
