package com.pakkabill.core

import com.pakkabill.core.XlsxWriter.Num
import com.pakkabill.core.XlsxWriter.Percent
import com.pakkabill.core.XlsxWriter.Rupees
import com.pakkabill.core.XlsxWriter.Text

/** The Meesho P&L as an Excel file (same sheets as the website's main ones). */
object ReportExcel {
    fun build(r: Report, biz: String, expenses: List<Expense>): ByteArray {
        val x = XlsxWriter()
        val s = r.sum

        val pl = mutableListOf<List<XlsxWriter.Cell?>>(
            listOf(Text("Meesho Profit & Loss", true)),
            listOf(Text("Business"), Text(biz.ifBlank { "-" })),
            listOf(Text("Period"), Text(r.per.label)),
            listOf(Text("Based on"), Text(if (r.per.basis == "order") "Order date" else "Payment date")),
            listOf(Text("Made with"), Text("PakkaBill app")),
            emptyList(),
            listOf(Text("Item", true), Text("Amount", true)),
        )
        r.lines.forEach { pl += listOf(Text(it.l, it.k == "NP" || it.k == "NS"), Rupees(it.v, it.k == "NP")) }
        pl += emptyList<XlsxWriter.Cell?>()
        pl += listOf(Text("Net profit", true), Rupees(s.NP, true))
        pl += listOf(Text("Profit margin"), Percent(s.margin))
        pl += listOf(Text("Money received from Meesho"), Rupees(s.payout))
        pl += listOf(Text("Orders sold"), Num(s.sales.toDouble()))
        pl += listOf(Text("Delivered (no return or RTO)"), Num(s.del.toDouble()))
        pl += listOf(Text("Profit per delivered order"), Rupees(s.perDel))
        x.sheet("P&L", pl, listOf(46, 18), freezeRows = 0)

        x.sheet("SKU wise", listOf(listOf<XlsxWriter.Cell?>(
            Text("SKU"), Text("Product"), Text("Category"), Text("Pieces"), Text("Orders"), Text("Returned / RTO"), Text("Delivered"),
            Text("Net sales"), Text("Cost of goods"), Text("Meesho charges"), Text("Packaging"), Text("Profit"), Text("Profit per delivered order"), Text("Avg price"), Text("Break-even price"),
        )) + r.skus.map { k ->
            listOf(Text(k.sku), Text(k.pn), Text(k.cat), Num(k.pcs.toDouble()), Num(k.sold.toDouble()), Num(k.retRto.toDouble()), Num(k.delivered.toDouble()),
                Rupees(k.NS), Rupees(-k.COGS), Rupees(k.MC), Rupees(-k.pack), Rupees(k.contrib), Rupees(k.perOrder), Rupees(k.avgPrice), Rupees(k.breakEven))
        } + listOf(listOf(Text("Not tied to a product (ads, referral, account credits, expenses)"), null, null, null, null, null, null, null, null, null, null, Rupees(r.sum.unalloc))),
            listOf(16, 40, 18, 8, 9, 14, 10, 14, 14, 14, 12, 14, 16, 12, 15), freezeCols = 1)

        if (r.categories.isNotEmpty()) x.sheet("Category wise", listOf(listOf<XlsxWriter.Cell?>(
            Text("Category"), Text("SKUs"), Text("Orders"), Text("Delivered"), Text("RTO"), Text("Returns"), Text("Net sales"), Text("Profit"), Text("Return / RTO loss"),
        )) + r.categories.map { c ->
            listOf(Text(c.cat), Num(c.skus.toDouble()), Num(c.sold.toDouble()), Num(c.delivered.toDouble()), Num(c.rto.toDouble()), Num(c.ret.toDouble()),
                Rupees(c.NS), Rupees(c.profit), Rupees(c.loss))
        }, listOf(28, 8, 9, 10, 8, 9, 14, 14, 16), freezeCols = 1)

        r.returns?.let { rv ->
            x.sheet("Returns & RTO", listOf(listOf<XlsxWriter.Cell?>(
                Text("SKU"), Text("Product"), Text("Finished orders"), Text("RTO"), Text("Customer returns"), Text("Exchanges"), Text("Lost"),
                Text("RTO rate"), Text("Return rate"), Text("Loss"),
            )) + rv.skus.map { k ->
                listOf(Text(k.sku), Text(k.pn), Num(k.done.toDouble()), Num(k.rto.toDouble()), Num(k.ret.toDouble()), Num(k.exch.toDouble()), Num(k.lost.toDouble()),
                    Percent(k.rtoRate), Percent(k.retRate), Rupees(k.loss))
            }, listOf(16, 40, 14, 8, 15, 10, 8, 10, 11, 13), freezeCols = 1)
        }

        if (r.monthly.isNotEmpty()) x.sheet("Month wise", listOf(listOf<XlsxWriter.Cell?>(
            Text("Month"), Text("Net sales"), Text("Gross profit"), Text("Net profit"), Text("Money received"),
        )) + r.monthly.map { m -> listOf(Text(m.label), Rupees(m.NS), Rupees(m.GP), Rupees(m.NP), Rupees(m.payout)) },
            listOf(12, 14, 14, 14, 16))

        if (r.gstRows.isNotEmpty()) x.sheet("GST", listOf(listOf<XlsxWriter.Cell?>(Text("Item"), Text("Amount"))) +
            r.gstRows.map { g -> listOf(Text(g.l, g.b), Rupees(g.v, g.b)) } +
            listOf(listOf(Text("TCS deducted by Meesho"), Rupees(-r.sum.T)), listOf(Text("TDS deducted by Meesho (194-O)"), Rupees(-r.sum.D))),
            listOf(48, 16))

        if (r.orders.isNotEmpty()) x.sheet("Orders", listOf(listOf<XlsxWriter.Cell?>(
            Text("Sub order"), Text("SKU"), Text("Product"), Text("Status"), Text("Ordered"), Text("Last paid"), Text("Paid by Meesho"),
            Text("Order value (not paid yet)"), Text("Return condition"), Text("Notes"),
        )) + r.orders.map { o ->
            listOf(Text(o.id), Text(o.sku), Text(o.pn), Text(o.label), Text(o.od), Text(o.pd), if (o.hasPay) Rupees(o.f) else null,
                if (!o.hasPay && o.est > 0) Rupees(o.est) else null,
                Text(when (o.cond) { "ok" -> "Back in stock"; "loss" -> "Not resellable"; else -> "" } + if (o.condDef) " (default)" else ""),
                Text(o.flags.joinToString(", ")))
        }, listOf(22, 14, 36, 14, 12, 12, 14, 16, 22, 26), freezeCols = 1)

        if (r.payouts.isNotEmpty()) x.sheet("Payouts", listOf(listOf<XlsxWriter.Cell?>(
            Text("Payment date"), Text("Orders"), Text("Settlements"), Text("Ads"), Text("Other"), Text("Net received"), Text("Transaction IDs"),
        )) + r.payouts.map { p -> listOf(Text(p.d), Num(p.n.toDouble()), Rupees(p.f), Rupees(p.ads), Rupees(p.other), Rupees(p.net, true), Text(p.tx.joinToString(", "))) },
            listOf(14, 9, 14, 12, 12, 15, 30))

        if (expenses.isNotEmpty()) x.sheet("Expenses", listOf(listOf<XlsxWriter.Cell?>(Text("Expense"), Text("When"), Text("Amount"))) +
            expenses.map { e -> listOf(Text(e.name), Text(if (e.`when` == "monthly") "Every month" else e.`when`), Rupees(e.amt)) },
            listOf(30, 16, 14))

        return x.bytes()
    }
}
