package com.pakkabill.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Snackbar
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.account.AccountController
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.platform.SITE
import com.pakkabill.app.platform.SystemBack
import com.pakkabill.app.pnl.PnlController
import com.pakkabill.core.Report
import com.pakkabill.core.Sel
import kotlinx.coroutines.launch

/** The tabs of the website's Meesho P&L, in the same order. */
val TABS = listOf("pl" to "P&L", "rc" to "Reconcile", "data" to "Upload", "costs" to "Costs", "exp" to "Expenses", "set" to "Settings", "guide" to "How to use")

/** The whole app: the website's band and tabs, one tab at a time, and the account on top. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Root(pnl: PnlController, account: AccountController, lockOn: Boolean, snackbar: SnackbarHostState, startTab: String = "pl") {
    val platform = LocalPlatform.current
    val ui by pnl.ui.collectAsState()
    val acct by account.ui.collectAsState()
    val lang by pnl.lang.collectAsState()
    val theme by pnl.theme.collectAsState()
    val flags by pnl.flags.collectAsState()
    val guide by pnl.guide.collectAsState()
    val undo by pnl.undoLabel.collectAsState()
    val scope = rememberCoroutineScope()
    val tr = LocalTr.current
    var tab by rememberSaveable { mutableStateOf(startTab) }
    var accountOpen by rememberSaveable { mutableStateOf(false) }
    var askLogin by remember { mutableStateOf(false) }
    var pickDates by remember { mutableStateOf(false) }
    var rcB by rememberSaveable { mutableStateOf("all") }
    var rcQ by rememberSaveable { mutableStateOf("") }
    var rcN by rememberSaveable { mutableIntStateOf(60) }
    LaunchedEffect(startTab) { tab = startTab }

    fun say(text: String) { scope.launch { snackbar.currentSnackbarData?.dismiss(); snackbar.showSnackbar(tr(text)) } }
    LaunchedEffect(Unit) { pnl.messages.collect { say(it) } }

    val cfg = acct.config
    val enforced = cfg != null && cfg.enabled && cfg.enforce
    val login = acct.loggedIn
    val pro = login && (!enforced || (acct.session?.user?.paidUntil ?: 0) > System.currentTimeMillis())
    val x = Access(login, pro, if (cfg != null && cfg.enabled && cfg.enforce) cfg.trialDays else 0, !platform.sellsPro)
    fun unlock() {
        if (!login) askLogin = true
        else if (platform.sellsPro) platform.openUrl("$SITE/#/plan")
        else say("Log in with an account that has Pro to see it here.")
    }
    // downloads need a login and Pro, like the website (sample data too)
    fun needFull(block: () -> Unit) { if (x.full) block() else unlock() }

    val go = Go(
        tab = { tab = it },
        demo = { pnl.startSample(); say("Showing sample data. Nothing is saved.") },
        endDemo = { pnl.endSample() },
        select = { pnl.select(it) },
        pickDates = { pickDates = true },
        excel = { needFull { scope.launch { pnl.excel()?.let { pnl.flag("dl"); platform.saveFile(pnl.fileSlug() + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", it) } } } },
        pdf = {
            needFull {
                val r = ui.report ?: return@needFull
                runCatching { platform.pdf(r, ui.state.settings.biz) }
                    .onSuccess { pnl.flag("dl"); platform.saveFile(pnl.fileSlug() + ".pdf", "application/pdf", it) }
                    .onFailure { say("Could not build the file.") }
            }
        },
        share = { ui.report?.let { platform.shareText(summaryText(it, ui.state.settings.biz)) } },
        unlock = { unlock() },
        rcGo = { b -> if (b == "returned") pnl.flag("rv"); rcB = b; rcN = 60; rcQ = ""; tab = "rc" },
        hideSteps = { pnl.flag("steps") },
    )

    val h = LocalHues.current
    Box(Modifier.fillMaxSize().background(h.paper)) {
        Column(Modifier.fillMaxSize()) {
            Band(ui.state.settings.biz.ifBlank { if (ui.sample) "Sample blouse store" else "" }, login) { accountOpen = true }
            Tabs(tab, { tab = it }, ui.report?.reconcile?.get("issues")?.n ?: 0, lang, { pnl.setLang(it) })
            val list = rememberLazyListState()
            LaunchedEffect(tab) { list.scrollToItem(0) }
            SystemBack(enabled = tab != "pl" && !accountOpen) { tab = "pl" }
            LazyColumn(
                Modifier.fillMaxWidth().weight(1f).imePadding(), state = list,
                contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 16.dp, bottom = 48.dp),
                verticalArrangement = Arrangement.spacedBy(Gap),
            ) {
                item(key = tab) {
                    Column(verticalArrangement = Arrangement.spacedBy(Gap)) {
                        when (tab) {
                            "pl" -> PlTab(ui, x, flags, go)
                            "rc" -> RcTab(ui, x, RcState(rcB, rcQ, rcN, { rcB = it; rcN = 60 }, { rcQ = it; rcN = 60 }, { rcN += 60 }), { id, c -> pnl.setMark(id, c) }, go)
                            "data" -> DataTab(ui, go, DataActs(upload = { platform.pickMeeshoFiles() }, remove = { pnl.removeFile(it.id) }, removeAll = { pnl.removeAllFiles() }))
                            "costs" -> CostsTab(
                                ui, undo, go,
                                CostActs(
                                    field = { sku, f -> pnl.setCostField(sku, f) },
                                    settings = { pnl.saveSettings(it) },
                                    fill = { l, p, m -> pnl.fillCosts(l, p, m) },
                                    undo = { pnl.undoFill() },
                                    downloadSheet = { scope.launch { pnl.costSheet()?.let { platform.saveFile("Hisaab_costs.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", it) } } },
                                    uploadSheet = { platform.pickCostSheet() },
                                    say = ::say,
                                ),
                            )
                            "exp" -> ExpTab(ui, go, { pnl.addExpense(it) }, { pnl.removeExpense(it) }, ::say)
                            "set" -> SetTab(
                                ui, lang, theme, go,
                                SetActs(
                                    save = { pnl.saveSettings(it) },
                                    backup = { scope.launch { platform.saveFile("Hisaab_backup_" + java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ENGLISH).format(java.util.Date()) + ".json", "application/json", pnl.backup().toByteArray()) } },
                                    restore = { platform.pickBackup() },
                                    lang = { pnl.setLang(it) }, theme = { pnl.setTheme(it) },
                                    clearFiles = { pnl.removeAllFiles() }, resetAll = { pnl.eraseEverything() }, say = ::say,
                                ),
                            )
                            else -> GuideTab(guide, ui, lang, { pnl.setLang(it) }, go)
                        }
                    }
                }
            }
        }

        // the website's "Working" box
        AnimatedVisibility(ui.busy != null, enter = fadeIn(), exit = fadeOut()) {
            Box(Modifier.fillMaxSize().background(Color(0x590F1122)).clickable(enabled = true) {}, contentAlignment = Alignment.Center) {
                Box(Modifier.clip(RoundedCornerShape(8.dp)).background(h.sheet).padding(horizontal = 20.dp, vertical = 16.dp)) { Txt(ui.busy ?: "Working", weight = FontWeight.SemiBold) }
            }
        }

        AnimatedVisibility(accountOpen, enter = slideInHorizontally { it } + fadeIn(), exit = slideOutHorizontally { it } + fadeOut()) {
            SystemBack { accountOpen = false }
            Column(Modifier.fillMaxSize().background(h.paper)) {
                Row(
                    Modifier.fillMaxWidth().background(h.band).windowInsetsPadding(WindowInsets.statusBars).padding(horizontal = 8.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(40.dp).clip(CircleShape).clickable { accountOpen = false }, contentAlignment = Alignment.Center) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, t("Back"), tint = Color.White) }
                    Txt("My account", color = Color.White, weight = FontWeight.SemiBold, head = true, size = 18.sp)
                }
                AccountScreen(acct, account, lockOn, PaddingValues(0.dp), openPnlSettings = { accountOpen = false; tab = "set" }, say = ::say)
            }
        }

        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).windowInsetsPadding(WindowInsets.navigationBars).padding(bottom = 18.dp)) { d ->
            Snackbar(d, containerColor = h.ink, contentColor = h.paper, actionColor = h.carbonSoft, shape = RoundedCornerShape(8.dp))
        }
    }

    if (pickDates) ui.report?.let { r -> DateRange(r, { pickDates = false }) { a, b -> pickDates = false; pnl.select(Sel(mode = "custom", from = a, to = b, basis = r.per.basis)) } }
    // "Log in or sign up free" opens the account screen; it closes by itself once logged in
    LaunchedEffect(askLogin) { if (askLogin) { accountOpen = true; askLogin = false } }
    var wasIn by remember { mutableStateOf(acct.loggedIn) }
    LaunchedEffect(acct.loggedIn) { if (acct.loggedIn && !wasIn && accountOpen) accountOpen = false; wasIn = acct.loggedIn }
}

/** .band: indigo strip with the हिसाब mark, the tool's name and the business on the right */
@Composable
private fun Band(biz: String, login: Boolean, openAccount: () -> Unit) {
    val h = LocalHues.current
    val f = LocalFonts.current
    Row(
        Modifier.fillMaxWidth().background(h.band).windowInsetsPadding(WindowInsets.statusBars).padding(start = 16.dp, end = 8.dp, top = 14.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        androidx.compose.material3.Text("हिसाब", style = androidx.compose.ui.text.TextStyle(fontFamily = f.mark, fontWeight = FontWeight.SemiBold, fontSize = 30.sp, color = Color.White, lineHeight = 30.sp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Txt("Hisaab", weight = FontWeight.SemiBold, head = true, size = 16.8.sp, color = Color.White, lineHeight = 18.sp)
            Txt("Meesho P&L and reconciliation", size = 13.sp, color = Color.White.copy(alpha = 0.82f), maxLines = 1)
        }
        if (biz.isNotBlank()) Txt(biz, size = 13.sp, color = Color.White.copy(alpha = 0.9f), maxLines = 1, raw = true, modifier = Modifier.padding(start = 8.dp).width(110.dp))
        Box(Modifier.padding(start = 4.dp).size(40.dp).clip(CircleShape).clickable(onClick = openAccount), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.AccountCircle, t(if (login) "My account" else "Log in"), tint = Color.White, modifier = Modifier.size(26.dp))
        }
    }
}

/** .tabs: the tab strip with the red count on Reconcile and the EN / हिंदी switch */
@Composable
private fun Tabs(tab: String, pick: (String) -> Unit, issues: Int, lang: String, setLang: (String) -> Unit) {
    val h = LocalHues.current
    Row(
        Modifier.fillMaxWidth().background(h.sheet).drawBehind { drawLine(h.rule, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }.padding(end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp)) {
            TABS.forEach { (k, l) ->
                val on = k == tab
                Row(
                    Modifier.clickable { pick(k) }.drawBehind { if (on) drawRect(h.carbon, Offset(0f, size.height - 2.dp.toPx()), androidx.compose.ui.geometry.Size(size.width, 2.dp.toPx())) }
                        .padding(start = 12.dp, end = 12.dp, top = 13.dp, bottom = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Txt(l, weight = FontWeight.SemiBold, size = 15.2.sp, color = if (on) h.ink else h.ink3, maxLines = 1)
                    if (k == "rc" && issues > 0) {
                        Spacer(Modifier.width(4.dp))
                        Box(Modifier.clip(CircleShape).background(h.margin).padding(horizontal = 5.dp), contentAlignment = Alignment.Center) { Txt("$issues", size = 11.5.sp, color = Color.White, raw = true, lineHeight = 18.sp) }
                    }
                }
            }
        }
        Row(Modifier.clip(CircleShape).background(h.paper).border(1.dp, h.rule, CircleShape).padding(2.dp)) {
            listOf("en" to "EN", "hi" to "हिंदी").forEach { (v, l) ->
                Box(Modifier.clip(CircleShape).background(if (lang == v) h.carbon else Color.Transparent).clickable { setLang(v) }.padding(horizontal = 9.dp, vertical = 4.dp)) {
                    Txt(l, size = 12.8.sp, weight = FontWeight.Bold, color = if (lang == v) h.carbonInk else h.ink3, raw = true, lineHeight = 15.sp)
                }
            }
        }
    }
}

/** Custom dates: from and to. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateRange(r: Report, onDismiss: () -> Unit, onPick: (String, String) -> Unit) {
    val fmt = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ENGLISH).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
    fun ms(d: String) = runCatching { fmt.parse(d)!!.time }.getOrNull()
    val state = rememberDateRangePickerState(
        initialSelectedStartDateMillis = if (r.per.mode == "custom") ms(r.per.from) else null,
        initialSelectedEndDateMillis = if (r.per.mode == "custom") ms(r.per.to) else null,
        initialDisplayedMonthMillis = ms(r.per.to.ifBlank { r.per.from }),
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(enabled = state.selectedStartDateMillis != null, onClick = {
                val a = state.selectedStartDateMillis ?: return@TextButton
                onPick(fmt.format(java.util.Date(a)), fmt.format(java.util.Date(state.selectedEndDateMillis ?: a)))
            }) { Txt("OK", weight = FontWeight.SemiBold) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Txt("Cancel") } },
    ) { DateRangePicker(state, modifier = Modifier.weight(1f)) }
}

/** The WhatsApp summary, the same text as the website's. */
fun summaryText(r: Report, biz: String): String {
    val s = r.sum
    fun rr(v: Long) = "₹" + money(Math.round(v / 100.0) * 100, noPaise = true)
    val rv = r.returns
    val t = mutableListOf(
        "📊 *Meesho profit and loss: " + r.per.label + "*" + (if (biz.isNotBlank()) " ($biz)" else ""), "",
        "Net sales: " + rr(s.NS),
        "*Real profit: " + rr(s.NP) + "*" + if (s.NR != 0L) " (" + pct(s.margin) + ")" else "",
        "Received from Meesho: " + rr(s.payout),
        "Orders: ${s.sales}" + if (rv != null) " · RTO " + pct(rv.rtoRate) + " · Returns " + pct(rv.retRate) else "",
    )
    r.skus.maxByOrNull { it.contrib }?.takeIf { it.contrib > 0 }?.let { t += "Best product: ${it.sku} (${rr(it.contrib)} profit)" }
    if (s.missing.isNotEmpty()) t += "(Cost not added yet for " + pl(s.missing.size, "SKU") + ")"
    t += listOf("", "Made with PakkaBill: know your real profit", "$SITE/#/pnl")
    return t.joinToString("\n")
}
