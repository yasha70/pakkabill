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
            Text("Net sales"), Text("Profit"), Text("Profit per delivered order"), Text("Avg price"), Text("Break-even price"),
        )) + r.skus.map { k ->
            listOf(Text(k.sku), Text(k.pn), Text(k.cat), Num(k.pcs.toDouble()), Num(k.sold.toDouble()), Num(k.retRto.toDouble()), Num(k.delivered.toDouble()),
                Rupees(k.NS), Rupees(k.contrib), Rupees(k.perOrder), Rupees(k.avgPrice), Rupees(k.breakEven))
        }, listOf(16, 40, 18, 8, 9, 14, 10, 14, 14, 16, 12, 15), freezeCols = 1)

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

        r.gst?.let { g ->
            x.sheet("GST", listOf(
                listOf(Text("Item"), Text("Amount")),
                listOf(Text("GST on sales"), Rupees(g.out)),
                listOf(Text("Input credit on Meesho fees"), Rupees(g.itcCh)),
                listOf(Text("Input credit on ads"), Rupees(g.itcAds)),
                listOf(Text("Total input credit"), Rupees(g.itc)),
                listOf(Text("Net GST", true), Rupees(g.net, true)),
                listOf(Text("TCS deducted by Meesho"), Rupees(g.tcs)),
                listOf(Text("GST to pay in cash"), Rupees(g.cash)),
            ), listOf(32, 16))
        }

        if (expenses.isNotEmpty()) x.sheet("Expenses", listOf(listOf<XlsxWriter.Cell?>(Text("Expense"), Text("When"), Text("Amount"))) +
            expenses.map { e -> listOf(Text(e.name), Text(if (e.`when` == "monthly") "Every month" else e.`when`), Rupees(e.amt)) },
            listOf(30, 16, 14))

        return x.bytes()
    }
}
