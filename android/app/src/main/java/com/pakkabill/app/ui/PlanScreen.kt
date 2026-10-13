package com.pakkabill.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.account.AccountController
import com.pakkabill.app.account.AccountUi
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.platform.RzpResult
import com.pakkabill.app.platform.SITE
import com.pakkabill.core.Api
import com.pakkabill.core.News
import com.pakkabill.core.Order
import com.pakkabill.core.Qr
import kotlinx.coroutines.launch

/* The Plan: PakkaBill Pro inside the app, the same plans, coupons and payments as the website (pro.js):
   Razorpay's checkout when the admin has set it up (Pro turns on by itself), and the UPI QR with the
   transaction number, where a UPI app can hand the number back. */

private val PERKS = listOf(
    "Full Meesho profit and loss report: statement, returns and RTO, GST, profit by SKU and category",
    "Order-by-order reconcile with every Meesho payment, overdue and recoveries",
    "Download the P&L as PDF and Excel, share it with your CA",
    "Unlimited bills, up to 10 shops and cloud backup on the PakkaBill website",
    "GSTR-1 JSON from Meesho, Amazon and Flipkart reports",
)

private fun dateOf(t: Long) = java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.ENGLISH).format(java.util.Date(t))
private fun rupees(n: Double) = "₹" + money(Math.round(n * 100), noPaise = n == Math.floor(n))

@Composable
fun PlanScreen(ui: AccountUi, account: AccountController, say: (String) -> Unit) {
    val platform = LocalPlatform.current
    val cfg = ui.config
    var plan by rememberSaveable { mutableStateOf<String?>(null) }
    // Razorpay set up: its checkout first, the UPI QR and transaction number when the seller asks
    var upi by rememberSaveable { mutableStateOf(false) }
    // a payment waiting to be checked: look again every half minute while this screen is open
    LaunchedEffect(ui.pending) { if (ui.pending) account.watchPending() }
    LazyColumn(contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 2.dp, bottom = 40.dp)) {
        block("status") { StatusCard(ui) }
        if (ui.orders.isNotEmpty()) block("orders") { OrdersCard(ui.orders) }
        if (ui.news.isNotEmpty()) block("news") { NewsCard(ui.news, ui.loggedIn, account, say) { plan = null } }
        if (ui.session == null) block("auth") { AuthCard(account, cfg?.trialDays ?: 0, say, title = "Log in or create a free account") }
        if (cfg != null && cfg.enabled) {
            val p = plan
            if (p != null && ui.session != null && platform.sellsPro) {
                if (cfg.razorpay.isNotBlank() && !upi) block("pay") { RzpSheet(ui, account, p, say, if (cfg.upiId.isNotBlank()) ({ upi = true }) else null) { plan = null } }
                else block("pay") { PaySheet(ui, account, p, say) { plan = null; upi = false } }
            } else block("pro") { ProCard(ui, platform.sellsPro) { plan = it } }
        }
        if (!ui.isPro) block("help") {
            Small("Paid but Pro is not on yet, or a question about your plan?", Modifier.padding(horizontal = 4.dp))
            Btn("Raise a support ticket", { platform.openUrl("$SITE/#/support?new=1&topic=payment") }, kind = BtnKind.LINK, small = true)
        }
    }
}

/* ---------------- where the seller stands ---------------- */

@Composable
private fun StatusCard(ui: AccountUi) {
    val h = LocalHues.current
    val cfg = ui.config
    val n = ui.daysLeft
    val (title, sub, tone) = when {
        cfg == null -> Triple("Checking your plan", "Connect to the internet once to see the plans.", 0)
        !cfg.enabled || !cfg.enforce -> Triple("Everything is free right now", "The full P&L report and downloads are open to everyone who is logged in.", 1)
        ui.trial -> Triple("Free Pro trial: $n day" + (if (n == 1) "" else "s") + " left", "Till ${dateOf(ui.paidUntil)}. Take Pro before it ends to keep the full report and downloads.", if (n <= 3) 2 else 1)
        ui.isPro && n <= 5 -> Triple("Your Pro plan ends in $n day" + (if (n == 1) "" else "s"), "On ${dateOf(ui.paidUntil)}. Renew now; the new time adds on top of what is left.", 2)
        ui.isPro -> Triple("PakkaBill Pro is active", "Till ${dateOf(ui.paidUntil)}. Everything is unlocked; nothing to pay now.", 1)
        ui.paidUntil > 0 -> Triple("Your Pro plan ended on ${dateOf(ui.paidUntil)}", "You are on the free plan: the real profit summary, costs and expenses.", 0)
        else -> Triple("You are on the free plan", "Real profit summary, costs, expenses and settings are free. Pro opens the full report.", 0)
    }
    val shape = RoundedCornerShape(16.dp)
    Column(
        Modifier.fillMaxWidth().clip(shape)
            .background(if (tone == 1) Brush.linearGradient(listOf(Color(0xFF26307F), Color(0xFF4B3BD6), Color(0xFF7C56EE))) else Brush.linearGradient(listOf(h.sheet, h.sheet)))
            .border(1.dp, if (tone == 2) h.warn else if (tone == 1) Color.Transparent else h.rule, shape)
            .padding(18.dp),
    ) {
        val fg = if (tone == 1) Color.White else h.ink
        Row(Modifier.clip(CircleShape).background(if (tone == 1) Color.White.copy(alpha = 0.16f) else h.carbonTint).padding(horizontal = 10.dp, vertical = 2.dp)) {
            Txt("PRO", size = 11.sp, weight = FontWeight.Bold, color = if (tone == 1) Color.White else h.carbon, raw = true)
        }
        Spacer(Modifier.height(8.dp))
        Txt(title, size = 21.sp, weight = FontWeight.Bold, head = true, color = if (tone == 2) h.warn else fg, lineHeight = 25.sp)
        Spacer(Modifier.height(4.dp))
        Txt(sub, size = 14.5.sp, color = if (tone == 1) Color.White.copy(alpha = 0.9f) else h.ink2)
        ui.session?.user?.let { u ->
            Spacer(Modifier.height(10.dp))
            Txt("+91 " + u.phone + if (u.shopName.isNotBlank()) " · " + u.shopName else "", size = 13.sp, color = if (tone == 1) Color.White.copy(alpha = 0.8f) else h.ink3, raw = true)
        }
    }
}

@Composable
private fun OrdersCard(orders: List<Order>) {
    val h = LocalHues.current
    Sheet {
        SheetH("Your payments", h3 = true)
        orders.forEachIndexed { i, o ->
            if (i > 0) Spacer(Modifier.height(8.dp))
            val (label, color) = when (o.state) {
                "PENDING" -> "Waiting for confirmation" to h.warn
                "COMPLETED" -> (if (o.paymentId.isNotBlank()) "Paid" else "Confirmed") to h.pos
                "REJECTED" -> "Not found in our account" to h.neg
                else -> o.state to h.ink2
            }
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(h.carbonTint).padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Txt(rs(o.amount, true) + " · " + t(if (o.plan == "yearly") "Yearly" else "Monthly"), size = 14.5.sp, weight = FontWeight.SemiBold, raw = true)
                    Txt((if (o.utr.isNotBlank()) "UTR " + o.utr else "Razorpay") + (if (o.createdAt > 0) " · " + t(dateOf(o.createdAt)) else ""), size = 12.5.sp, color = h.ink3, raw = true)
                }
                Txt(label, size = 13.sp, weight = FontWeight.Bold, color = color)
            }
        }
        if (orders.any { it.state == "PENDING" }) Small("We check every payment by hand, usually within a few hours. Pro turns on here by itself; this page looks again every half minute.", Modifier.padding(top = 8.dp))
        if (orders.any { it.state == "REJECTED" }) Small("If a payment was not found, check the transaction number and submit it again.", Modifier.padding(top = 6.dp))
    }
}

/* ---------------- messages and offers ---------------- */

@Composable
private fun NewsCard(news: List<News>, loggedIn: Boolean, account: AccountController, say: (String) -> Unit, showPlans: () -> Unit) {
    val h = LocalHues.current
    val platform = LocalPlatform.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf("") }
    Sheet {
        SheetH("Messages and offers", h3 = true)
        news.forEachIndexed { i, n ->
            if (i > 0) Spacer(Modifier.height(10.dp))
            val edge = when (n.tone) { "offer" -> h.focus; "warn" -> h.warn; else -> h.carbon }
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(h.paper).border(1.dp, h.rule, RoundedCornerShape(12.dp))
                    .drawBehind { drawRect(edge, size = Size(size.width, 4.dp.toPx())) }.padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 12.dp),
            ) {
                Txt(n.title, weight = FontWeight.Bold, raw = true)
                if (n.message.isNotBlank()) Txt(n.message, size = 14.sp, color = h.ink2, raw = true)
                Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    when {
                        n.trialDays > 0 && n.claimed -> Txt("Claimed", weight = FontWeight.Bold, color = h.pos)
                        n.trialDays > 0 -> Btn(
                            if (busy == n.id) "Claiming…" else "Claim ${n.trialDays} day" + (if (n.trialDays > 1) "s" else "") + " of Pro free",
                            {
                                if (!loggedIn) { say("Log in or create a free account to claim your free Pro days."); return@Btn }
                                busy = n.id
                                scope.launch {
                                    val e = account.claim(n.id)
                                    busy = ""
                                    say(e ?: "Done! PakkaBill Pro is on.")
                                }
                            },
                            kind = BtnKind.PRI, small = true, enabled = busy.isEmpty(),
                        )
                        n.cta == "upgrade" -> Btn(n.ctaLabel ?: "See Pro plans", showPlans, kind = BtnKind.PRI, small = true, raw = n.ctaLabel != null)
                        n.cta == "link" && !n.link.isNullOrBlank() -> Btn(n.ctaLabel ?: "Open", { platform.openUrl(n.link!!) }, small = true, raw = n.ctaLabel != null)
                    }
                    Spacer(Modifier.weight(1f))
                    n.endAt?.takeIf { it > 0 }?.let { Txt("Till " + dateOf(it), size = 12.sp, color = h.ink3) }
                }
            }
        }
    }
}

/* ---------------- Pro: what it opens, Free vs Pro, the two plans ---------------- */

@Composable
private fun ProCard(ui: AccountUi, sells: Boolean, pick: (String) -> Unit) {
    val h = LocalHues.current
    val cfg = ui.config ?: return
    val proOn = ui.isPro && !ui.trial && ui.daysLeft > 7
    Sheet {
        H2(if (proOn) "Your Pro plan" else if (ui.isPro) "Keep PakkaBill Pro" else "PakkaBill Pro")
        Spacer(Modifier.height(8.dp))
        PERKS.forEach { p ->
            Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
                Box(Modifier.padding(top = 3.dp).size(18.dp).clip(CircleShape).background(h.carbonTint), contentAlignment = Alignment.Center) {
                    Txt("✓", size = 11.sp, weight = FontWeight.ExtraBold, color = h.carbon, raw = true)
                }
                Spacer(Modifier.width(10.dp))
                Txt(p, size = 14.5.sp)
            }
        }
        Spacer(Modifier.height(10.dp))
        if (proOn) {
            if (sells && ui.session != null) Details("Extend Pro early", "plan-extend", bare = true) {
                Small("Not needed now. Paying again adds the new time after ${dateOf(ui.paidUntil)}.")
                Plans(cfg, ui, pick)
            }
            return@Sheet
        }
        Details("Compare Free and Pro", "plan-cmp", bare = true) {
            Table(
                listOf(Col("", 170.dp, false), Col("Free", 76.dp), Col("Pro", 90.dp)),
                listOf(
                    Triple("Real profit summary", "✓", "✓"),
                    Triple("Costs, expenses, settings", "✓", "✓"),
                    Triple("Full P&L report", "–", "✓"),
                    Triple("Order-wise reconcile", "–", "✓"),
                    Triple("PDF and Excel download", "–", "✓"),
                    Triple("Bills every month (website)", "${cfg.freeBills}", "Unlimited"),
                    Triple("Shops (GSTINs)", "1", "Up to 10"),
                    Triple("Cloud backup", "–", "✓"),
                    Triple("GSTR-1 JSON", "–", "✓"),
                ).map { (a, b, c) -> listOf(Cell(t(a)), Cell(b), Cell(c, h.carbon, bold = true)) },
            )
        }
        Spacer(Modifier.height(12.dp))
        if (!sells) {
            Note(NoteKind.INFO) { NoteText("Buying Pro is not available in this app. If your account has Pro, it works here too.") }
            return@Sheet
        }
        if (ui.session == null) {
            Small("Log in or create a free account above to take Pro.")
            return@Sheet
        }
        Plans(cfg, ui, pick)
    }
}

@Composable
private fun Plans(cfg: com.pakkabill.core.ServerConfig, ui: AccountUi, pick: (String) -> Unit) {
    val save = cfg.monthly * 12 - cfg.yearly
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PlanCard("₹" + money(cfg.monthly * 100L, noPaise = true), "per month", null, false, Modifier.weight(1f)) { pick("monthly") }
        PlanCard("₹" + money(cfg.yearly * 100L, noPaise = true), "per year", if (save > 0) "Save ₹" + money(save * 100L, noPaise = true) else null, true, Modifier.weight(1f)) { pick("yearly") }
    }
    Small(
        when {
            ui.isPro -> "Paying again adds time on top of what is left."
            cfg.razorpay.isNotBlank() -> "Pay by UPI, card or net banking. Pro turns on as soon as you pay."
            else -> "Pay by UPI from any app: PhonePe, Google Pay, Paytm or your bank."
        },
        Modifier.padding(top = 8.dp),
    )
}

@Composable
private fun PlanCard(price: String, per: String, badge: String?, best: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val h = LocalHues.current
    val shape = RoundedCornerShape(14.dp)
    Box(modifier.padding(top = 10.dp)) {
        Column(
            Modifier.fillMaxWidth().clip(shape).background(if (best) h.carbonTint else h.sheet).border(1.5.dp, if (best) h.carbon else h.rule, shape)
                .clickable(onClick = onClick).padding(top = 18.dp, bottom = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Txt(price, size = 30.sp, weight = FontWeight.SemiBold, head = true, raw = true, lineHeight = 32.sp)
            Txt(per, size = 13.sp, color = h.ink2)
            Spacer(Modifier.height(8.dp))
            Txt("Choose", size = 13.5.sp, weight = FontWeight.Bold, color = h.carbon)
        }
        if (badge != null) Box(Modifier.align(Alignment.TopCenter).offset(y = (-10).dp).clip(CircleShape).background(h.carbon).padding(horizontal = 9.dp, vertical = 2.dp)) {
            Txt(badge, size = 11.sp, weight = FontWeight.Bold, color = h.carbonInk, raw = true)
        }
    }
}

/* ---------------- paying: coupon, UPI app or QR, then the 12-digit transaction number ---------------- */

@Composable
private fun PaySheet(ui: AccountUi, account: AccountController, plan: String, say: (String) -> Unit, back: () -> Unit) {
    val h = LocalHues.current
    val platform = LocalPlatform.current
    val scope = rememberCoroutineScope()
    val cfg = ui.config ?: return
    val list = (if (plan == "yearly") cfg.yearly else cfg.monthly).toDouble()
    var amount by rememberSaveable(plan) { mutableStateOf(list) }
    var coupon by rememberSaveable(plan) { mutableStateOf("") }
    var couponText by rememberSaveable(plan) { mutableStateOf("") }
    var couponErr by remember { mutableStateOf<String?>(null) }
    var utr by rememberSaveable(plan) { mutableStateOf("") }
    var err by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var done by rememberSaveable(plan) { mutableStateOf(false) }
    var showQr by rememberSaveable(plan) { mutableStateOf(false) }
    val link = Api.upiLink(cfg, plan, amount, ui.session?.user?.phone ?: "")
    Sheet {
        if (done) {
            H2("Payment submitted")
            Spacer(Modifier.height(6.dp))
            Txt("Thank you. We will match transaction $utr for ${rupees(amount)} with our account and turn on Pro, usually within a few hours. Pro turns on in the app by itself; you can keep using PakkaBill meanwhile.", color = h.ink2)
            Spacer(Modifier.height(12.dp))
            Btn("OK", back, kind = BtnKind.PRI)
            return@Sheet
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    H2("Pay " + rupees(amount), size = 24.sp)
                    if (amount < list) {
                        Spacer(Modifier.width(8.dp))
                        androidx.compose.material3.Text(rupees(list), style = androidx.compose.ui.text.TextStyle(color = h.ink3, fontSize = 15.sp, textDecoration = TextDecoration.LineThrough))
                    }
                }
                Txt(t(if (plan == "yearly") "PakkaBill Pro for 1 year." else "PakkaBill Pro for 1 month.") + if (coupon.isNotBlank()) " " + t("Coupon") + ": " + coupon else "", size = 14.sp, color = h.ink2, raw = true)
            }
            Btn("Change plan", back, kind = BtnKind.LINK, small = true)
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Inp(couponText, {}, Modifier.weight(1f), placeholder = "Coupon code", onChange = { couponText = it.uppercase(); couponErr = null }, small = true)
            Spacer(Modifier.width(8.dp))
            Btn(if (coupon.isNotBlank() && couponText == coupon) "Applied" else "Apply", {
                val code = couponText.trim()
                if (code.isEmpty()) { coupon = ""; amount = list; return@Btn }
                scope.launch {
                    account.quote(plan, code).onSuccess { q -> coupon = q.coupon ?: code; amount = q.amount; say("Coupon applied. You pay ${rupees(q.amount)}.") }
                        .onFailure { couponErr = it.message }
                }
            }, small = true)
        }
        couponErr?.let { Txt(it, size = 13.5.sp, color = h.neg, raw = true, modifier = Modifier.padding(top = 4.dp)) }

        Spacer(Modifier.height(16.dp))
        Step(1, "Pay exactly ${rupees(amount)} by UPI")
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(12.dp)).background(Brush.linearGradient(h.btn)).clickable {
                val opened = platform.payUpi(link) { got ->
                    if (got != null) { utr = got; err = null; say("Transaction number filled in from your UPI app. Check it and submit.") }
                }
                if (!opened) { showQr = true; say("No UPI app found on this phone. Scan the QR code from another phone.") }
            },
            contentAlignment = Alignment.Center,
        ) { Txt("Pay ${rupees(amount)} with a UPI app", weight = FontWeight.Bold, color = h.btnFg) }
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Txt(cfg.payeeName.ifBlank { "PakkaBill" } + " · " + cfg.upiId, size = 13.5.sp, color = h.ink2, raw = true, modifier = Modifier.weight(1f))
            Btn("Copy UPI ID", { platform.copyText(cfg.upiId); say("UPI ID copied.") }, kind = BtnKind.LINK, small = true)
        }
        Btn(if (showQr) "Hide the QR code" else "Show a QR code to pay from another phone", { showQr = !showQr }, kind = BtnKind.LINK, small = true)
        if (showQr) Box(Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) { QrImage(link, 220.dp) }

        Spacer(Modifier.height(16.dp))
        Step(2, "Enter the 12-digit transaction number")
        Small("From the payment receipt. PhonePe calls it UTR, Google Pay UPI transaction ID, Paytm UPI Ref No.", Modifier.padding(top = 4.dp, bottom = 8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Inp(utr, {}, Modifier.weight(1f), placeholder = "12-digit number", keyboard = KeyboardType.Number, onChange = { utr = it.filter { c -> c.isDigit() }.take(12); err = null })
            Spacer(Modifier.width(8.dp))
            Btn("Paste", {
                val found = platform.pasteText()?.let { Api.findUtr(it) }
                if (found != null) { utr = found; say("Transaction number pasted. Check it matches your payment app.") }
                else say("No 12-digit number found in what you copied. Copy the UTR in your payment app first.")
            })
        }
        err?.let { Txt(it, size = 13.5.sp, color = h.neg, raw = true, modifier = Modifier.padding(top = 6.dp)) }
        Spacer(Modifier.height(10.dp))
        Btn(if (busy) "Sending…" else "Submit payment", {
            if (utr.length != 12) { err = "The transaction number has exactly 12 digits."; return@Btn }
            busy = true
            scope.launch {
                val e = account.pay(plan, utr, coupon.ifBlank { null })
                busy = false
                if (e == null) done = true else err = e
            }
        }, Modifier.fillMaxWidth(), kind = BtnKind.PRI, enabled = !busy)
        Small("We check every payment by hand. Pro turns on as soon as it is confirmed, usually within a few hours.", Modifier.padding(top = 8.dp))
    }
}

/* ---------------- paying with Razorpay: pick the plan, coupon, one Pay button, Pro turns on by itself ---------------- */

@Composable
private fun RzpSheet(ui: AccountUi, account: AccountController, start: String, say: (String) -> Unit, useUpi: (() -> Unit)?, back: () -> Unit) {
    val h = LocalHues.current
    val platform = LocalPlatform.current
    val scope = rememberCoroutineScope()
    val cfg = ui.config ?: return
    val wasPro = ui.isPro
    var plan by rememberSaveable { mutableStateOf(start) }
    val list = (if (plan == "yearly") cfg.yearly else cfg.monthly).toDouble()
    var amount by rememberSaveable { mutableStateOf(list) }
    var coupon by rememberSaveable { mutableStateOf("") }
    var couponText by rememberSaveable { mutableStateOf("") }
    var couponOpen by rememberSaveable { mutableStateOf(false) }
    var couponErr by remember { mutableStateOf<String?>(null) }
    // pick → opening → confirming → done, or waiting when the server has not confirmed yet
    var stage by rememberSaveable { mutableStateOf("pick") }
    var err by remember { mutableStateOf<String?>(null) }
    var paidUntil by rememberSaveable { mutableStateOf(0L) }
    var paidPaise by rememberSaveable { mutableStateOf(0L) }
    var payId by rememberSaveable { mutableStateOf("") }
    val period = if (plan == "yearly") "1 year" else "1 month"
    val days = if (plan == "yearly") 365 else 30
    val newEnd = maxOf(ui.now, ui.paidUntil) + days * 86_400_000L

    fun choose(p: String) {
        if (p == plan) return
        plan = p
        amount = (if (p == "yearly") cfg.yearly else cfg.monthly).toDouble()
        err = null
        val code = coupon
        if (code.isNotBlank()) scope.launch {
            // a coupon can be for one plan only
            account.quote(p, code).onSuccess { q -> amount = q.amount }.onFailure { coupon = ""; couponErr = it.message }
        }
    }

    Sheet {
        when (stage) {
            "confirming" -> {
                Txt("Confirming your payment…", size = 21.sp, weight = FontWeight.Bold, head = true)
                Small("This takes a few seconds. Please keep the app open.", Modifier.padding(top = 6.dp))
                return@Sheet
            }
            "done", "waiting" -> {
                val ok = stage == "done"
                Box(Modifier.size(56.dp).clip(CircleShape).background(if (ok) h.pos else h.warn), contentAlignment = Alignment.Center) {
                    Txt(if (ok) "✓" else "…", size = 28.sp, weight = FontWeight.Bold, color = Color.White, raw = true)
                }
                Spacer(Modifier.height(10.dp))
                H2(if (ok) "Payment successful" else "Payment received")
                Spacer(Modifier.height(4.dp))
                Txt(
                    if (ok) "PakkaBill Pro is active till ${dateOf(paidUntil)}." else (err ?: "") + " Pro turns on by itself within a few minutes; this page updates when it does.",
                    color = h.ink2, raw = !ok,
                )
                Spacer(Modifier.height(10.dp))
                if (ok) Txt("Paid " + rs(paidPaise, true) + " · Pro, " + period, size = 14.sp, raw = true)
                Small("Payment ID " + payId + ". Razorpay also sends a receipt by SMS or email.", Modifier.padding(top = 4.dp), raw = true)
                Spacer(Modifier.height(12.dp))
                Btn(if (ok) "Start using Pro" else "OK", back, Modifier.fillMaxWidth(), kind = BtnKind.PRI)
                return@Sheet
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            H2(if (wasPro) "Extend PakkaBill Pro" else "Get PakkaBill Pro", Modifier.weight(1f))
            Btn("Back", back, kind = BtnKind.LINK, small = true)
        }
        // plan picker
        val save = cfg.monthly * 12 - cfg.yearly
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf("monthly", "yearly").forEach { p ->
                val on = p == plan
                val shape = RoundedCornerShape(14.dp)
                Box(Modifier.weight(1f).padding(top = 10.dp)) {
                    Column(
                        Modifier.fillMaxWidth().clip(shape).background(if (on) h.carbonTint else h.sheet).border(if (on) 2.dp else 1.5.dp, if (on) h.carbon else h.rule, shape)
                            .clickable { choose(p) }.padding(horizontal = 12.dp, vertical = 12.dp),
                    ) {
                        Txt(if (p == "yearly") "Yearly" else "Monthly", size = 13.sp, weight = FontWeight.Bold, color = h.ink2)
                        Txt("₹" + money((if (p == "yearly") cfg.yearly else cfg.monthly) * 100L, noPaise = true), size = 26.sp, weight = FontWeight.SemiBold, head = true, raw = true, lineHeight = 28.sp)
                        Txt(if (p == "yearly") "₹" + money(Math.round(cfg.yearly / 12.0) * 100L, noPaise = true) + " a month" else "per month", size = 12.5.sp, color = h.ink3, raw = p == "yearly")
                    }
                    if (p == "yearly" && save > 0) Box(Modifier.align(Alignment.TopStart).offset(x = 10.dp, y = (-9).dp).clip(CircleShape).background(h.pos).padding(horizontal = 8.dp, vertical = 2.dp)) {
                        Txt("Save ₹" + money(save * 100L, noPaise = true), size = 11.sp, weight = FontWeight.Bold, color = Color.White, raw = true)
                    }
                    if (on) Box(Modifier.align(Alignment.TopEnd).padding(top = 8.dp, end = 8.dp).size(20.dp).clip(CircleShape).background(h.carbon), contentAlignment = Alignment.Center) {
                        Txt("✓", size = 11.sp, weight = FontWeight.Bold, color = h.carbonInk, raw = true)
                    }
                }
            }
        }
        // summary
        Spacer(Modifier.height(12.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.dp, h.rule, RoundedCornerShape(12.dp)).padding(12.dp)) {
            Row { Txt("PakkaBill Pro, $period", size = 14.5.sp, modifier = Modifier.weight(1f), raw = true); Txt(rupees(list), size = 14.5.sp, raw = true) }
            if (coupon.isNotBlank() && amount < list) Row(Modifier.padding(top = 4.dp)) {
                Txt("Coupon $coupon", size = 14.5.sp, color = h.pos, modifier = Modifier.weight(1f), raw = true)
                Txt("−" + rupees(list - amount), size = 14.5.sp, color = h.pos, raw = true)
            }
            Box(Modifier.fillMaxWidth().padding(vertical = 8.dp).height(1.dp).background(h.rule))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Txt("You pay", weight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Txt(rupees(amount), size = 22.sp, weight = FontWeight.SemiBold, head = true, raw = true)
            }
            Small("Pro till " + dateOf(newEnd) + if (wasPro) ", added on top of your plan" else "", Modifier.padding(top = 2.dp), raw = true)
        }
        // coupon
        if (coupon.isBlank()) {
            if (!couponOpen) Btn("Have a coupon code?", { couponOpen = true }, kind = BtnKind.LINK, small = true)
            else Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Inp(couponText, {}, Modifier.weight(1f), placeholder = "Coupon code", onChange = { couponText = it.uppercase(); couponErr = null }, small = true)
                Spacer(Modifier.width(8.dp))
                Btn("Apply", {
                    val code = couponText.trim()
                    if (code.isEmpty()) return@Btn
                    scope.launch {
                        account.quote(plan, code).onSuccess { q -> coupon = q.coupon ?: code; amount = q.amount; say("Coupon applied. You pay ${rupees(q.amount)}.") }
                            .onFailure { couponErr = it.message }
                    }
                }, small = true)
            }
        } else Btn("Remove coupon", { coupon = ""; amount = list }, kind = BtnKind.LINK, small = true)
        couponErr?.let { Txt(it, size = 13.5.sp, color = h.neg, raw = true, modifier = Modifier.padding(top = 4.dp)) }
        // pay
        Spacer(Modifier.height(12.dp))
        val opening = stage == "opening"
        Box(
            Modifier.fillMaxWidth().height(54.dp).clip(RoundedCornerShape(12.dp)).background(Brush.linearGradient(h.btn)).clickable(enabled = !opening) {
                err = null
                stage = "opening"
                scope.launch {
                    account.rzpOrder(plan, coupon.ifBlank { null }).onSuccess { o ->
                        val u = ui.session?.user
                        platform.payRazorpay(o.key, o.orderId, o.amount, "PakkaBill Pro, $period", u?.phone.orEmpty(), u?.shopName.orEmpty()) { r ->
                            when (r) {
                                is RzpResult.Paid -> {
                                    stage = "confirming"
                                    payId = r.paymentId
                                    account.confirmRazorpay(r.orderId, r.paymentId, r.signature) { res ->
                                        res.onSuccess { p -> paidUntil = p.user.paidUntil; paidPaise = p.order.amount; stage = "done" }
                                            .onFailure { e -> err = e.message; stage = "waiting" }
                                    }
                                }
                                is RzpResult.Failed -> {
                                    stage = "pick"
                                    if (r.cancelled) say(r.message) else err = r.message
                                }
                            }
                        }
                    }.onFailure { stage = "pick"; err = it.message }
                }
            },
            contentAlignment = Alignment.Center,
        ) { Txt(if (opening) "Opening secure payment…" else "🔒  Pay " + rupees(amount), size = 17.sp, weight = FontWeight.Bold, color = h.btnFg, raw = true) }
        err?.let { Txt(it, size = 13.5.sp, color = h.neg, raw = true, modifier = Modifier.padding(top = 6.dp)) }
        Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally)) {
            listOf("UPI", "Cards", "Net banking", "Wallets").forEach { m ->
                Box(Modifier.clip(CircleShape).border(1.dp, h.rule, CircleShape).padding(horizontal = 9.dp, vertical = 3.dp)) { Txt(m, size = 12.sp, weight = FontWeight.SemiBold, color = h.ink2) }
            }
        }
        Small("Secured by Razorpay. Pro turns on the moment you pay.", Modifier.fillMaxWidth().padding(top = 8.dp))
        if (useUpi != null) Btn("Pay by UPI QR and transaction number instead", useUpi, kind = BtnKind.LINK, small = true)
    }
}

@Composable
private fun Step(n: Int, text: String) {
    val h = LocalHues.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(24.dp).clip(CircleShape).background(h.carbon), contentAlignment = Alignment.Center) { Txt("$n", size = 12.5.sp, weight = FontWeight.Bold, color = h.carbonInk, raw = true) }
        Spacer(Modifier.width(10.dp))
        Txt(text, weight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
    }
}

/** A QR code drawn by the app (black on white, with a quiet border so every UPI app can read it). */
@Composable
fun QrImage(text: String, side: Dp) {
    val m = remember(text) { runCatching { Qr.of(text) }.getOrNull() } ?: return
    Box(Modifier.size(side).clip(RoundedCornerShape(12.dp)).background(Color.White).padding(12.dp)) {
        Canvas(Modifier.size(side - 24.dp)) {
            val n = m.size
            val cell = size.width / n
            for (y in 0 until n) for (x in 0 until n) if (m[y][x]) drawRect(Color.Black, Offset(x * cell, y * cell), Size(cell + 0.6f, cell + 0.6f))
        }
    }
}
