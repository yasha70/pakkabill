package com.pakkabill.core.bill

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

/*
 * GST billing data, with the same names as the website's billing (index.html), so a backup made on
 * the website opens in the app and the other way round.
 */

/** A number that may be saved as a number or as text ("1,250.50"), like the website's inputs. */
object LenientDouble : KSerializer<Double> {
    override val descriptor = PrimitiveSerialDescriptor("LenientDouble", PrimitiveKind.DOUBLE)
    override fun serialize(encoder: Encoder, value: Double) = encoder.encodeDouble(value)
    override fun deserialize(decoder: Decoder): Double {
        if (decoder !is JsonDecoder) return decoder.decodeDouble()
        val e = decoder.decodeJsonElement()
        if (e is JsonNull || e !is JsonPrimitive) return 0.0
        return e.doubleOrNull ?: Gst.num(e.content)
    }
}

/** The seller's shop: printed on every bill. */
@Serializable data class Business(
    val name: String = "",
    val gstin: String = "",
    val stateCode: String = "",
    val address: String = "",
    val phone: String = "",
    val email: String = "",
    val bankName: String = "",
    val accountName: String = "",
    val accountNo: String = "",
    val ifsc: String = "",
    val upi: String = "",
    val prefix: String = "INV",
    val estPrefix: String = "EST",
    val terms: String = "Goods once sold will not be taken back.\nPayment due within 15 days.",
    /** Composition dealer: Bill of supply, no GST on the bill. */
    val composition: Boolean = false,
    val roundOff: Boolean = true,
    /** Rates typed include GST. */
    val inclusive: Boolean = false,
    val template: String = "carbon",
    val accent: String = "#252B6E",
    val showQr: Boolean = true,
)

/** A buyer (or supplier) kept for the next bill. */
@Serializable data class Party(
    val id: String = "",
    val name: String = "",
    val gstin: String = "",
    val stateCode: String = "",
    val address: String = "",
    val phone: String = "",
    val email: String = "",
)

/** An item kept for the next bill. */
@Serializable data class Product(
    val id: String = "",
    val name: String = "",
    val hsn: String = "",
    val unit: String = "PCS",
    @Serializable(with = LenientDouble::class) val rate: Double = 0.0,
    @Serializable(with = LenientDouble::class) val gstRate: Double = 5.0,
    /** "apparel": 5% up to ₹2,500 a piece, 18% above (garments). Otherwise the fixed rate. */
    val taxMode: String = "",
)

@Serializable data class Buyer(
    val name: String = "",
    val gstin: String = "",
    val stateCode: String = "",
    val address: String = "",
    val phone: String = "",
    val email: String = "",
)

/** One line on a bill. */
@Serializable data class Item(
    val id: String = "",
    val name: String = "",
    val hsn: String = "",
    @Serializable(with = LenientDouble::class) val qty: Double = 1.0,
    val unit: String = "PCS",
    @Serializable(with = LenientDouble::class) val rate: Double = 0.0,
    /** Discount in percent. */
    @Serializable(with = LenientDouble::class) val discount: Double = 0.0,
    @Serializable(with = LenientDouble::class) val gstRate: Double = 5.0,
    val taxMode: String = "",
)

@Serializable data class Totals(
    val taxable: Double = 0.0,
    val cgst: Double = 0.0,
    val sgst: Double = 0.0,
    val igst: Double = 0.0,
    val tax: Double = 0.0,
    val roundOff: Double = 0.0,
    val total: Double = 0.0,
)

/** A tax invoice, bill of supply or estimate. */
@Serializable data class Invoice(
    val id: String = "",
    /** "invoice" or "estimate". */
    val docType: String = "invoice",
    val number: String = "",
    /** yyyy-MM-dd */
    val date: String = "",
    val dueDate: String = "",
    val partyId: String = "",
    val buyer: Buyer = Buyer(),
    /** Place of supply: the buyer's state code. Different from the seller's state means IGST. */
    val pos: String = "",
    val calcV: Int = 2,
    val reverseCharge: Boolean = false,
    val inclusive: Boolean = false,
    val roundOff: Boolean = true,
    val composition: Boolean = false,
    val items: List<Item> = emptyList(),
    val notes: String = "",
    /** "unpaid" or "paid". */
    val status: String = "unpaid",
    val paidOn: String = "",
    val template: String = "carbon",
    val accent: String = "#252B6E",
    val showQr: Boolean = true,
    val seller: Business = Business(),
    val totals: Totals = Totals(),
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
) {
    val isEstimate get() = docType == "estimate"
    val paid get() = status == "paid"
    /** "Tax invoice", "Bill of supply" or "Estimate", as printed at the top. */
    val title get() = when { isEstimate -> "Estimate"; composition -> "Bill of supply"; else -> "Tax invoice" }
}

@Serializable data class BillMeta(val lastBackup: String = "", val sample: Boolean = false, val created: Long = 0)

/** Everything the billing part keeps: the same shape as the website's billing backup. */
@Serializable data class BillData(
    val business: Business = Business(),
    val parties: List<Party> = emptyList(),
    val products: List<Product> = emptyList(),
    val invoices: List<Invoice> = emptyList(),
    val meta: BillMeta = BillMeta(),
)
