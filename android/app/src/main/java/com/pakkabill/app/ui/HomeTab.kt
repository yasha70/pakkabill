package com.pakkabill.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.account.AccountUi
import com.pakkabill.app.platform.SITE
import com.pakkabill.core.Report
import com.pakkabill.core.bill.BillData
import com.pakkabill.core.bill.BillStore
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** What Home can ask for. */
class HomeActs(
    /** opens a page ("pl", "newbill", "labels", "lowship", "tools", "bills", "account", "plan" ...) */
    val open: (String) -> Unit,
    val url: (String) -> Unit,
    /** Pro can be bought in this app (not in the Google Play version) */
    val sellsPro: Boolean,
)

private class MainTool(val key: String, val icon: ImageVector, val title: String, val sub: String, val primary: Boolean = false)

private val MAIN = listOf(
    MainTool("pl", PbIcons.Rupee, "Check my profit", "Profit & Loss from Meesho’s payment report", primary = true),
    MainTool("newbill", PbIcons.Plus, "New bill", "GST invoice or estimate"),
    MainTool("labels", PbIcons.Tag, "Sort labels", "Packing chart and labels in one PDF"),
    MainTool("lowship", PbIcons.Image, "Low shipping photo", "Find the photo Meesho charges less for"),
)

private val TRUST = listOf(
    Triple(PbIcons.Lock, "Your files stay with you", "Meesho reports are read on your own phone. They are not uploaded to us."),
    Triple(PbIcons.Shield, "No ads. Never sold.", "We never sell your data, show no ads and use no outside tracking."),
    Triple(PbIcons.Chart, "Checked to the paisa", "Your profit is matched to what Meesho paid you. GST is worked out by the rules."),
    Triple(PbIcons.Headset, "Real help", "Step-by-step help in English and Hindi, or write to our team."),
)

/**
 * Home, the screen the app opens on (the website's #/dashboard, dash.js): a greeting, the four main
 * tools with every other tool one tap away, this month's numbers when there are any, why PakkaBill is
 * safe to use, and the account. Kept short on purpose.
 */
fun LazyListScope.homeTab(report: Report?, sample: Boolean, bills: BillData, acct: AccountUi, acts: HomeActs) {
    val own = report?.takeIf { !sample && !it.empty }
    val shop = bills.business.name.trim()
    val fresh = shop.isEmpty() && bills.invoices.isEmpty() && own == null
    block("home-hello") { Hello(shop, fresh) }
    block("home-main") {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) { MAIN.forEach { m -> MainCard(m) { acts.open(m.key) } } }
        Row(
            Modifier.clip(CtlShape).clickable { acts.open("tools") }.padding(horizontal = 4.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(PbIcons.Grid, null, tint = LocalHues.current.carbon, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Column {
                Txt("All tools", size = 15.sp, weight = FontWeight.SemiBold, color = LocalHues.current.carbon)
                Txt("Bills, GST, GSTR-1, listing, Lens and more", size = 13.5.sp, color = LocalHues.current.ink3)
            }
        }
    }
    if (own != null || bills.invoices.isNotEmpty()) block("home-nums") { Numbers(own, bills, acts) }
    block("home-trust") { Trust(acct, acts) }
    block("home-acct") { AccountCard(acct, acts) }
    block("home-foot") {
        Row(Modifier.padding(horizontal = 2.dp), horizontalArrangement = Arrangement.spacedBy(22.dp)) {
            FootLink("Help & support") { acts.url("$SITE/#/support") }
            FootLink("How to use") { acts.open("guide") }
            FootLink("About PakkaBill") { acts.url("$SITE/home") }
        }
    }
}

@Composable
private fun Hello(shop: String, fresh: Boolean) {
    val h = LocalHues.current
    val now = remember { Date() }
    val hour = remember { Calendar.getInstance().get(Calendar.HOUR_OF_DAY) }
    Column(Modifier.padding(top = 6.dp)) {
        Txt(SimpleDateFormat("EEEE, d MMMM", Locale.ENGLISH).format(now), size = 12.5.sp, weight = FontWeight.SemiBold, color = h.ink3, upper = true, raw = true)
        Spacer(Modifier.height(4.dp))
        if (fresh) Txt("Welcome to PakkaBill", size = 27.sp, weight = FontWeight.Bold, head = true, lineHeight = 32.sp)
        else {
            Txt(if (hour < 12) "Good morning" else if (hour < 17) "Good afternoon" else "Good evening", size = 27.sp, weight = FontWeight.Bold, head = true, lineHeight = 32.sp)
            if (shop.isNotEmpty()) Txt(shop, size = 21.sp, weight = FontWeight.Bold, head = true, color = h.carbon, raw = true, maxLines = 1, lineHeight = 27.sp)
        }
        Spacer(Modifier.height(5.dp))
        Txt(
            if (fresh) "Know your real profit on Meesho, make GST bills and sort labels. Free to start, no sign-up needed." else "What would you like to do today?",
            size = 14.5.sp, color = h.ink2,
        )
    }
}

@Composable
private fun MainCard(m: MainTool, onClick: () -> Unit) {
    val h = LocalHues.current
    val bg = if (m.primary) h.btnBg else h.sheet
    val fg = if (m.primary) h.btnFg else h.ink
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clip(CardShape).background(bg).border(1.dp, if (m.primary) h.btnBg else h.rule, CardShape)
            .clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(if (m.primary) Color.White.copy(alpha = 0.15f) else h.carbonTint), contentAlignment = Alignment.Center) {
            Icon(m.icon, null, tint = if (m.primary) Color.White else h.carbon, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Txt(m.title, size = 16.5.sp, weight = FontWeight.Bold, color = fg, lineHeight = 21.sp)
            Txt(m.sub, size = 13.5.sp, color = if (m.primary) Color.White.copy(alpha = 0.85f) else h.ink2, lineHeight = 18.sp)
        }
        Spacer(Modifier.width(8.dp))
        Icon(PbIcons.Arrow, null, tint = if (m.primary) Color.White.copy(alpha = 0.85f) else h.ink3, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun SecHead(s: String) = Txt(s, size = 13.sp, weight = FontWeight.Bold, color = LocalHues.current.ink3, upper = true)

/** Your numbers: the Meesho profit the P&L last showed for the seller's own files, billed this month and money to collect. */
@Composable
private fun Numbers(own: Report?, bills: BillData, acts: HomeActs) {
    val h = LocalHues.current
    SecHead("Your numbers")
    // label, value, note, colour, the page it opens, and whether the label is already final text
    class Num(val label: String, val value: String, val note: String, val color: Color, val key: String, val raw: Boolean = false)
    val cells = ArrayList<Num>()
    if (own != null) {
        val np = own.sum.NP
        cells += Num(if (np < 0) "Meesho loss" else "Meesho profit", rs(np, true), own.per.label, if (np < 0) h.neg else h.pos, "pl")
    }
    if (bills.invoices.isNotEmpty()) {
        val s = remember(bills.invoices) { BillStore.stats(bills.invoices) }
        val month = remember { SimpleDateFormat("MMMM", Locale.ENGLISH).format(Date()) }
        cells += Num("Billed in $month", "₹" + money(Math.round(s.thisMonth) * 100, noPaise = true), fmtMonth(com.pakkabill.core.bill.Gst.today().take(7)), h.ink, "bills", raw = true)
        cells += Num("To collect", "₹" + money(Math.round(s.unpaid) * 100, noPaise = true), if (s.unpaidCount > 0) "${s.unpaidCount} unpaid" else "All paid", if (s.unpaid > 0) h.neg else h.ink, "bills")
    }
    Column(Modifier.fillMaxWidth().clip(CardShape).background(h.sheet).border(1.dp, h.rule, CardShape)) {
        cells.forEachIndexed { i, c ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(h.ruleSoft))
            Column(Modifier.fillMaxWidth().clickable { acts.open(c.key) }.padding(horizontal = 18.dp, vertical = 14.dp)) {
                Txt(c.label, size = 13.sp, weight = FontWeight.SemiBold, color = h.ink2, raw = c.raw)
                Txt(c.value, size = 24.sp, weight = FontWeight.Bold, head = true, color = c.color, raw = true, lineHeight = 30.sp)
                Txt(c.note, size = 12.5.sp, color = h.ink3, raw = true)
            }
        }
    }
    if (own != null) Txt("Meesho profit is what Profit & Loss shows for your own reports.", size = 12.5.sp, color = h.ink3, modifier = Modifier.padding(horizontal = 2.dp))
}

/** Safe to use: four plain facts from the privacy policy, who runs PakkaBill, and the policies. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Trust(acct: AccountUi, acts: HomeActs) {
    val h = LocalHues.current
    SecHead("Safe to use")
    Column(Modifier.fillMaxWidth().clip(CardShape).background(h.sheet).border(1.dp, h.rule, CardShape)) {
        Column(Modifier.padding(horizontal = 18.dp, vertical = 4.dp)) {
            TRUST.forEachIndexed { i, (icon, title, text) ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(h.ruleSoft))
                Row(Modifier.padding(vertical = 13.dp)) {
                    Box(Modifier.size(38.dp).clip(RoundedCornerShape(10.dp)).background(h.posSoft), contentAlignment = Alignment.Center) {
                        Icon(icon, null, tint = h.pos, modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.width(13.dp))
                    Column(Modifier.weight(1f)) {
                        Txt(title, size = 15.sp, weight = FontWeight.Bold, lineHeight = 20.sp)
                        Txt(text, size = 13.5.sp, color = h.ink2, lineHeight = 19.sp)
                    }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(h.ruleSoft))
        Column(Modifier.fillMaxWidth().background(h.paper).padding(horizontal = 18.dp, vertical = 12.dp)) {
            val biz = acct.config?.biz
            val name = biz?.name.orEmpty().trim()
            if (name.isNotEmpty()) {
                Txt("Run by $name", size = 13.5.sp, weight = FontWeight.SemiBold, raw = true)
                val bits = listOf(biz?.address, biz?.email, biz?.phone).map { it.orEmpty().trim() }.filter { it.isNotEmpty() }
                if (bits.isNotEmpty()) Txt(bits.joinToString(" · "), size = 13.sp, color = h.ink2, raw = true)
                Spacer(Modifier.height(8.dp))
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(18.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                listOf("Privacy policy" to "/privacy", "Terms" to "/terms", "Refunds" to "/refund", "Contact us" to "/contact").forEach { (l, u) ->
                    Txt(l, size = 13.sp, weight = FontWeight.SemiBold, color = h.carbon, modifier = Modifier.clickable { acts.url(SITE + u) }.padding(vertical = 4.dp))
                }
            }
        }
    }
}

@Composable
private fun AccountCard(acct: AccountUi, acts: HomeActs) {
    val s = acct.session
    Sheet(padding = 18.dp) {
        if (s == null) {
            val trial = acct.config?.takeIf { it.enabled && it.enforce }?.trialDays ?: 0
            Txt("Your bills are saved on this phone only.", size = 15.sp, weight = FontWeight.Bold)
            Txt(
                if (trial > 0) "A free account adds $trial days of Pro and keeps your plan on every phone and laptop." else "A free account keeps your plan on every phone and laptop.",
                size = 13.5.sp, color = LocalHues.current.ink2,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Btn("Sign up free", { acts.open("account") }, kind = BtnKind.PRI)
                Btn("Log in", { acts.open("account") })
            }
        } else {
            val u = s.user
            val line = when {
                acct.isPro && acct.daysLeft < 3650 -> (if (acct.trial) "Free Pro trial" else "Pro") + " till " + SimpleDateFormat("d MMM yyyy", Locale.ENGLISH).format(Date(u.paidUntil))
                acct.isPro -> "Pro"
                acct.enforced -> "Free plan"
                else -> "Everything is free right now"
            }
            Txt("Logged in as +91 " + u.phone.replace(Regex("^(\\d{5})(\\d{5})$"), "$1 $2"), size = 15.sp, weight = FontWeight.Bold, raw = true)
            Txt(line, size = 13.5.sp, color = LocalHues.current.ink2)
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Btn("My account", { acts.open("account") })
                if (acts.sellsPro && acct.enforced && (!acct.isPro || acct.daysLeft <= 7)) Btn(if (acct.isPro) "Renew Pro" else "See Pro", { acts.open("plan") }, kind = BtnKind.PRI)
            }
        }
    }
}

@Composable
private fun FootLink(s: String, onClick: () -> Unit) =
    Txt(s, size = 14.sp, weight = FontWeight.SemiBold, color = LocalHues.current.ink2, modifier = Modifier.clickable(onClick = onClick).padding(vertical = 6.dp))
