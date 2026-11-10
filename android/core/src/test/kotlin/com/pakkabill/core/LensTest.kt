package com.pakkabill.core

import com.pakkabill.core.lens.LensEngine
import com.pakkabill.core.lens.LensSettings
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.Json

/** Meesho Lens in the app: the website's Lens core on product readings, as the Meesho view gives them. */
class LensTest {
    private fun read(ratings: Int, price: Int) = Json.parseToJsonElement(
        """{"v":2,"id":"4xyz9k","url":"https://www.meesho.com/kurti/p/4xyz9k","src":{},"name":"Rayon Kurti","price":$price,"mrp":999,"off":60,"onwards":false,
           "rating":4.1,"ratings":$ratings,"reviews":300,"seller":"Kavya Fashions","pack":1,"freeDelivery":true,
           "breakdown":{"Excellent":500,"Very Good":200,"Good":100,"Average":60,"Poor":40},"lowShare":11.1,"poorShare":4.4}""",
    ).jsonObject

    @Test fun estimatesAndSpeedLikeTheWebsite() {
        val e = LensEngine()
        val day = 86_400_000L
        val t0 = 1_790_000_000_000L
        val p1 = e.panel(read(1000, 399), null, LensSettings(), t0)
        // ₹399 with ₹70 shipping inside: seller price 329, GST 5% out, TCS 0.5% and TDS 0.1% held back
        assertEquals(329.0, p1.money.sellerPrice)
        assertEquals(327.12, Math.round(p1.money.settlement!! * 100) / 100.0)
        assertEquals("Low", p1.risk)
        val p2 = e.panel(read(1070, 389), p1.h, LensSettings(), t0 + 7 * day)
        assertNotNull(p2.v)
        assertEquals(10.0, p2.v!!.ratingsPerDay)
        assertEquals(80.0, p2.v!!.ordersPerDay) // 8 orders per rating
        val products = JsonObject(mapOf("4xyz9k" to p2.h!!))
        val v = e.view(products, LensSettings(myPrice = "420"), "fast", t0 + 7 * day)
        assertEquals(1, v.tiles.count)
        assertEquals(389.0, v.rows.single().price)
        assertEquals(399.0, v.rows.single().firstPrice)
        assertEquals(1, v.tiles.mine!!.cheaper)
        assertTrue(e.csv(products, LensSettings(), t0).contains("Rayon Kurti"))
        assertEquals("4xyz9k", e.productId("https://www.meesho.com/s/p/4xyz9k?utm_source=s"))
    }
}
