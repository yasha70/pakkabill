package com.pakkabill.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDateRangePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageShader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.account.AccountController
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.platform.SITE
import com.pakkabill.app.platform.SystemBack
import com.pakkabill.app.pnl.PnlController
import com.pakkabill.core.Art
import com.pakkabill.core.Report
import com.pakkabill.core.Sel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The tabs of the website's Meesho P&L, in the same order. */
val TABS = listOf("pl" to "P&L", "rc" to "Reconcile", "data" to "Upload", "costs" to "Costs", "exp" to "Expenses", "set" to "Settings", "guide" to "How to use")
private val IN_MORE = setOf("data", "exp", "set", "guide")

/**
 * The whole app, laid out like PakkaBill on a phone: the PakkaBill bar on top, the page, and the
 * tab bar at the bottom with the + in the middle. Every page is a lazy list, so only what is on
 * screen is drawn, and each tab keeps its own scroll position.
 */
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
    val h = LocalHues.current
    var tab by rememberSaveable { mutableStateOf(startTab) }
    var accountOpen by rememberSaveable { mutableStateOf(false) }
    var moreOpen by rememberSaveable { mutableStateOf(false) }
    var planOpen by rememberSaveable { mutableStateOf(false) }
    val reminder by pnl.reminder.collectAsState()
    val goal by pnl.goal.collectAsState()
    var speaking by remember { mutableStateOf(false) }
    var askLogin by remember { mutableStateOf(false) }
    var pickDates by remember { mutableStateOf(false) }
    // filters kept here, so the lazy rows below can be worked out once per change
    var rcB by rememberSaveable { mutableStateOf("all") }
    var rcQ by rememberSaveable { mutableStateOf("") }
    var costQ by rememberSaveable { mutableStateOf("") }
    var costCat by rememberSaveable { mutableStateOf("") }
    var costMiss by rememberSaveable { mutableStateOf(false) }
    val panes = remember { Panes() }
    val lists = remember { HashMap<String, LazyListState>() }
    fun open(k: String, top: Boolean = true) {
        if (k == "plan") { planOpen = true; moreOpen = false; return }
        if (top) lists.remove(k)
        tab = k
        moreOpen = false
    }
    LaunchedEffect(startTab) { open(startTab) }

    fun say(text: String) { scope.launch { snackbar.currentSnackbarData?.dismiss(); snackbar.showSnackbar(tr(text)) } }
    LaunchedEffect(Unit) { pnl.messages.collect { say(it) } }

    val cfg = acct.config
    val enforced = cfg != null && cfg.enabled && cfg.enforce
    val login = acct.loggedIn
    // Pro dates use the account's safe clock: turning the phone's clock back does not keep Pro on
    val pro = login && (!enforced || acct.isPro)
    val x = Access(login, pro, if (cfg != null && cfg.enabled && cfg.enforce) cfg.trialDays else 0, !platform.sellsPro)
    // the Plan screen: log in or sign up there, then the plans, coupons and UPI payment
    fun unlock() { planOpen = true; moreOpen = false }
    // downloads need a login and Pro, like the website (sample data too)
    fun needFull(block: () -> Unit) { if (x.full) block() else unlock() }

    val go = Go(
        tab = { open(it) },
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
        rcGo = { b -> if (b == "returned") pnl.flag("rv"); rcB = b; rcQ = ""; open("rc") },
        hideSteps = { pnl.flag("steps") },
    )

    val hindiNow = lang == "hi"
    val proNote = when {
        enforced && acct.isPro && acct.daysLeft <= 3 && platform.sellsPro -> {
            val d = acct.daysLeft
            ProNote(
                tr((if (acct.trial) "Your free Pro trial ends in $d day" else "Your Pro plan ends in $d day") + (if (d == 1) "" else "s") + ". Renew now; the new time adds on top of what is left."),
                tr("Renew Pro"), true,
            ) { planOpen = true }
        }
        acct.pending -> ProNote(tr("Your Pro payment is being checked. Pro turns on here by itself, usually within a few hours."), tr("See payment"), false) { planOpen = true }
        else -> acct.news.firstOrNull { it.trialDays > 0 && !it.claimed }?.let { n ->
            ProNote(n.title + if (n.message.isNotBlank()) ". " + n.message else "", tr("Claim ${n.trialDays} day" + (if (n.trialDays > 1) "s" else "") + " of Pro free"), false) { planOpen = true }
        }
    }
    val ex = PlExtras(
        goal = goal, setGoal = { pnl.setGoal(it) }, speaking = speaking, proNote = proNote,
        hear = {
            val r = ui.report
            if (speaking) { platform.stopSpeaking(); speaking = false }
            else if (r != null) {
                speaking = platform.speak(speechText(r, hindiNow, tr), hindiNow) { speaking = false }
                if (!speaking) say("No voice is installed on this phone. Add one in the phone's settings, under Text-to-speech.")
            }
        },
    )

    // the rows the lazy lists show, worked out only when the report or a filter changes
    val report = ui.report
    val rcBucketNow = report?.let { rcBucket(it, rcB) } ?: "all"
    val rcRowsNow = remember(report, rcBucketNow, rcQ) { if (report == null) emptyList() else rcRows(report, rcBucketNow, rcQ) }
    val costList = report?.costs.orEmpty()
    val costShown = remember(costList, costQ, costCat, costMiss) { costRows(costList, costQ, costCat, costMiss) }

    // the website's background doodles: a 300 × 300 tile repeated behind everything, made once
    val density = LocalDensity.current
    val tilePx = with(density) { 300.dp.roundToPx() }
    val tile = remember(h.dark, tilePx) { platform.svg(Art.doodle(h.dark), tilePx) }
    val paper = h.paper
    val doodle = remember(tile, paper) {
        Modifier.drawWithCache {
            val brush = tile?.let { ShaderBrush(ImageShader(it, TileMode.Repeated, TileMode.Repeated)) }
            onDrawBehind {
                drawRect(paper)
                if (brush != null) drawRect(brush)
            }
        }
    }
    // only a change between keyboard shown and hidden redraws the page, not every step of its animation
    val ime = WindowInsets.ime
    val imeOpen by remember(ime, density) { derivedStateOf { ime.getBottom(density) > 0 } }
    val issues = report?.reconcile?.get("issues")?.n ?: 0

    Box(Modifier.fillMaxSize().then(doodle)) {
        Column(Modifier.fillMaxSize().imePadding()) {
            TopBar(lang, { pnl.setLang(it) }, h.dark, { pnl.setTheme(if (h.dark) "light" else "dark") }, login) { accountOpen = true }
            SystemBack(enabled = tab != "pl" && !accountOpen && !moreOpen) { open("pl", top = false) }
            Box(Modifier.fillMaxWidth().weight(1f)) {
                val list = lists.getOrPut(tab) { LazyListState() }
                key(tab) {
                    LazyColumn(
                        Modifier.fillMaxSize(), state = list,
                        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 2.dp, bottom = 28.dp),
                    ) {
                        when (tab) {
                            "pl" -> plTab(ui, x, flags, go, panes, ex)
                            "rc" -> rcTab(ui, x, RcState(rcB, rcQ, rcRowsNow, { rcB = it }, { rcQ = it }), { id, c -> pnl.setMark(id, c) }, go, panes)
                            "data" -> block("data") { DataTab(ui, go, DataActs(upload = { platform.pickMeeshoFiles() }, remove = { pnl.removeFile(it.id) }, removeAll = { pnl.removeAllFiles() })) }
                            "costs" -> costsTab(
                                ui, undo, go,
                                CostActs(
                                    field = { sku, f -> pnl.setCostField(sku, f) },
                                    settings = { pnl.saveSettings(it) },
                                    fill = { l, p, m -> pnl.fillCosts(l, p, m) },
                                    undo = { pnl.undoFill() },
                                    downloadSheet = { scope.launch { pnl.costSheet()?.let { platform.saveFile("PakkaBill_costs.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", it) } } },
                                    uploadSheet = { platform.pickCostSheet() },
                                    say = ::say,
                                ),
                                CostFilter(costQ, costCat, costMiss, costShown, { costQ = it }, { costCat = it }, { costMiss = it }),
                            )
                            "exp" -> block("exp") { ExpTab(ui, go, { pnl.addExpense(it) }, { pnl.removeExpense(it) }, ::say) }
                            "set" -> block("set") {
                                AppExtrasSheet(reminder, { on -> pnl.setReminder(on); platform.setReminder(on); if (on) say("Reminder on: every Thursday morning.") }) {
                                    if (!platform.pinWidget()) say("Long-press your home screen, tap Widgets and pick PakkaBill.")
                                }
                                SetTab(
                                    ui, lang, theme, go,
                                    SetActs(
                                        save = { pnl.saveSettings(it) },
                                        backup = { scope.launch { platform.saveFile("PakkaBill_backup_" + java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ENGLISH).format(java.util.Date()) + ".json", "application/json", pnl.backup().toByteArray()) } },
                                        restore = { platform.pickBackup() },
                                        lang = { pnl.setLang(it) }, theme = { pnl.setTheme(it) },
                                        clearFiles = { pnl.removeAllFiles() }, resetAll = { pnl.eraseEverything() }, say = ::say,
                                    ),
                                )
                            }
                            else -> block("guide") { GuideTab(guide, ui, lang, { pnl.setLang(it) }, go) }
                        }
                    }
                }
            }
            if (!imeOpen) BottomBar(
                tab, moreOpen, issues, lang,
                pick = { k ->
                    // tapping the open tab again goes back to its top
                    if (k == tab && !moreOpen) lists[k]?.let { l -> scope.launch { l.animateScrollToItem(0) } } else open(k, top = false)
                },
                add = { open("data", top = false); platform.pickMeeshoFiles() },
                more = { moreOpen = !moreOpen },
            )
        }

        // the website's "Working" box, only when the work takes a moment
        var showBusy by remember { mutableStateOf(false) }
        LaunchedEffect(ui.busy) { if (ui.busy == null) showBusy = false else { delay(350); showBusy = true } }
        AnimatedVisibility(showBusy, enter = fadeIn(tween(120)), exit = fadeOut(tween(120))) {
            Box(Modifier.fillMaxSize().background(Color(0x590F1122)).clickable(remember { MutableInteractionSource() }, null) {}, contentAlignment = Alignment.Center) {
                Box(Modifier.clip(RoundedCornerShape(12.dp)).background(h.sheet).padding(horizontal = 20.dp, vertical = 16.dp)) { Txt(ui.busy ?: "Working", weight = FontWeight.SemiBold) }
            }
        }

        MoreSheet(moreOpen, tab, login, acct.isPro && enforced, close = { moreOpen = false }, pick = { open(it) }, account = { moreOpen = false; accountOpen = true })

        AnimatedVisibility(planOpen, enter = slideInHorizontally(tween(220)) { it } + fadeIn(tween(220)), exit = slideOutHorizontally(tween(200)) { it } + fadeOut(tween(200))) {
            SystemBack { planOpen = false }
            LaunchedEffect(Unit) { account.refresh(force = false) }
            Column(Modifier.fillMaxSize().then(doodle)) {
                OverlayBar("PakkaBill Pro") { planOpen = false }
                PlanScreen(acct, account, ::say)
            }
        }

        AnimatedVisibility(accountOpen, enter = slideInHorizontally(tween(220)) { it } + fadeIn(tween(220)), exit = slideOutHorizontally(tween(200)) { it } + fadeOut(tween(200))) {
            SystemBack { accountOpen = false }
            Column(Modifier.fillMaxSize().then(doodle)) {
                OverlayBar("My account") { accountOpen = false }
                AccountScreen(acct, account, lockOn, PaddingValues(0.dp), openPnlSettings = { accountOpen = false; open("set") }, openPlan = { planOpen = true }, say = ::say)
            }
        }

        SnackbarHost(
            snackbar,
            Modifier.align(Alignment.BottomCenter).windowInsetsPadding(WindowInsets.navigationBars).imePadding().padding(bottom = if (imeOpen || accountOpen) 12.dp else 78.dp),
        ) { d -> Snackbar(d, containerColor = h.ink, contentColor = h.paper, actionColor = h.carbonSoft, shape = RoundedCornerShape(10.dp)) }
    }

    if (pickDates) report?.let { r -> DateRange(r, { pickDates = false }) { a, b -> pickDates = false; pnl.select(Sel(mode = "custom", from = a, to = b, basis = r.per.basis)) } }
    // "Log in or sign up free" opens the account screen; it closes by itself once logged in
    LaunchedEffect(askLogin) { if (askLogin) { accountOpen = true; askLogin = false } }
    var wasIn by remember { mutableStateOf(acct.loggedIn) }
    LaunchedEffect(acct.loggedIn) { if (acct.loggedIn && !wasIn && accountOpen) accountOpen = false; wasIn = acct.loggedIn }
}

/** .topbar: PakkaBill's mark and wordmark, then the language switch, the theme and the account. */
@Composable
private fun TopBar(lang: String, setLang: (String) -> Unit, dark: Boolean, flipTheme: () -> Unit, login: Boolean, openAccount: () -> Unit) {
    val h = LocalHues.current
    val f = LocalFonts.current
    Row(
        Modifier.fillMaxWidth().background(h.spine).drawBehind { drawRect(h.rule, Offset(0f, size.height - 1.dp.toPx()), Size(size.width, 1.dp.toPx())) }
            .windowInsetsPadding(WindowInsets.statusBars).height(56.dp).padding(start = 12.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Mark(28.dp, outline = if (h.dark) Color.Transparent else h.rule)
        Spacer(Modifier.width(7.dp))
        Text(
            "PakkaBill", Modifier.padding(top = 5.dp),
            style = TextStyle(brush = Brush.horizontalGradient(h.brand), fontFamily = f.mark, fontWeight = FontWeight.SemiBold, fontSize = 27.sp, lineHeight = 27.sp, letterSpacing = 0.2.sp),
            maxLines = 1,
        )
        Spacer(Modifier.weight(1f))
        Row(Modifier.clip(CircleShape).background(h.paper).border(1.dp, h.rule, CircleShape).padding(2.dp)) {
            listOf("en" to "EN", "hi" to "हिंदी").forEach { (v, l) ->
                Box(Modifier.clip(CircleShape).background(if (lang == v) h.carbon else Color.Transparent).clickable { setLang(v) }.padding(horizontal = 10.dp, vertical = 5.dp)) {
                    Txt(l, size = 13.sp, weight = FontWeight.Bold, color = if (lang == v) h.carbonInk else h.ink3, raw = true, lineHeight = 15.sp)
                }
            }
        }
        BarIcon(if (dark) PbIcons.Sun else PbIcons.Moon, if (dark) "Light" else "Dark", h.ink2, onClick = flipTheme)
        BarIcon(PbIcons.User, if (login) "My account" else "Log in", if (login) h.carbon else h.ink2, if (login) h.carbonTint else Color.Transparent, openAccount)
    }
}

@Composable
private fun BarIcon(icon: ImageVector, label: String, tint: Color, bg: Color = Color.Transparent, onClick: () -> Unit) {
    Box(Modifier.padding(start = 2.dp).size(42.dp).clip(CircleShape).background(bg).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, t(label), tint = tint, modifier = Modifier.size(21.dp))
    }
}

// short Hindi names that fit under the icons
private val HI_BAR = mapOf("P&L" to "मुनाफ़ा", "Reconcile" to "मिलान", "Costs" to "लागत", "More" to "और")

/** .tabbar: P&L, Reconcile, the + to add Meesho files, Costs, and More. */
@Composable
private fun BottomBar(tab: String, moreOpen: Boolean, issues: Int, lang: String, pick: (String) -> Unit, add: () -> Unit, more: () -> Unit) {
    val h = LocalHues.current
    Row(
        Modifier.fillMaxWidth().background(h.sheet).drawBehind {
            drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color(0x14141846)), startY = -14.dp.toPx(), endY = 0f), Offset(0f, -14.dp.toPx()), Size(size.width, 14.dp.toPx()))
            drawRect(h.rule, size = Size(size.width, 1.dp.toPx()))
        }.windowInsetsPadding(WindowInsets.navigationBars).height(62.dp).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        fun label(s: String) = if (lang == "hi") HI_BAR[s] ?: s else s
        BarTab(PbIcons.Rupee, label("P&L"), tab == "pl" && !moreOpen) { pick("pl") }
        BarTab(PbIcons.Checks, label("Reconcile"), tab == "rc" && !moreOpen, issues) { pick("rc") }
        Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.Center) {
            Box(
                Modifier.offset(y = (-12).dp).size(54.dp).shadow(10.dp, RoundedCornerShape(16.dp), ambientColor = h.carbon, spotColor = h.carbon)
                    .clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(h.btn)).clickable(onClick = add),
                contentAlignment = Alignment.Center,
            ) { Icon(PbIcons.Plus, t("Upload files"), tint = h.btnFg, modifier = Modifier.size(26.dp)) }
        }
        BarTab(PbIcons.Box, label("Costs"), tab == "costs" && !moreOpen) { pick("costs") }
        BarTab(PbIcons.Grid, label("More"), moreOpen || tab in IN_MORE) { more() }
    }
}

@Composable
private fun RowScope.BarTab(icon: ImageVector, label: String, on: Boolean, badge: Int = 0, onClick: () -> Unit) {
    val h = LocalHues.current
    val c = if (on) h.carbon else h.ink2
    Column(
        Modifier.weight(1f).fillMaxHeight().clickable(remember { MutableInteractionSource() }, null, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Box {
            Box(Modifier.clip(CircleShape).background(if (on) h.carbonTint else Color.Transparent).padding(horizontal = 14.dp, vertical = 3.dp)) {
                Icon(icon, null, tint = c, modifier = Modifier.size(22.dp))
            }
            if (badge > 0) Box(
                Modifier.align(Alignment.TopEnd).offset(x = 2.dp, y = (-3).dp).clip(CircleShape).background(h.margin).padding(horizontal = 5.dp),
                contentAlignment = Alignment.Center,
            ) { Txt(if (badge > 99) "99+" else "$badge", size = 10.5.sp, color = Color.White, weight = FontWeight.Bold, raw = true, lineHeight = 16.sp) }
        }
        Spacer(Modifier.height(2.dp))
        Txt(label, size = 11.5.sp, weight = if (on) FontWeight.SemiBold else FontWeight.Medium, color = c, maxLines = 1, raw = true, lineHeight = 14.sp, align = TextAlign.Center)
    }
}

/** More: the rest of the P&L (files, expenses, settings, how to use) and the account. */
@Composable
private fun MoreSheet(open: Boolean, tab: String, login: Boolean, pro: Boolean, close: () -> Unit, pick: (String) -> Unit, account: () -> Unit) {
    val h = LocalHues.current
    if (open) SystemBack(onBack = close)
    AnimatedVisibility(open, enter = fadeIn(tween(160)), exit = fadeOut(tween(160))) {
        Box(Modifier.fillMaxSize().background(Color(0x66100C24)).clickable(remember { MutableInteractionSource() }, null, onClick = close))
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(open, enter = slideInVertically(tween(220)) { it }, exit = slideOutVertically(tween(180)) { it }) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp)).background(h.sheet)
                    .clickable(remember { MutableInteractionSource() }, null) {}.windowInsetsPadding(WindowInsets.navigationBars).padding(start = 10.dp, end = 10.dp, top = 8.dp, bottom = 12.dp),
            ) {
                Box(Modifier.align(Alignment.CenterHorizontally).size(width = 40.dp, height = 4.dp).clip(CircleShape).background(h.rule2))
                Spacer(Modifier.height(10.dp))
                listOf(
                    Triple("data", "Upload", PbIcons.Upload), Triple("exp", "Expenses", PbIcons.Receipt),
                    Triple("set", "Settings", PbIcons.Gear), Triple("guide", "How to use", PbIcons.Book),
                ).forEach { (k, l, ic) -> MoreRow(ic, l, tab == k) { pick(k) } }
                Box(Modifier.padding(vertical = 6.dp, horizontal = 8.dp).fillMaxWidth().height(1.dp).background(h.rule))
                MoreRow(PbIcons.Crown, if (pro) "PakkaBill Pro is active" else "PakkaBill Pro", false) { pick("plan") }
                MoreRow(PbIcons.User, if (login) "My account" else "Log in", false, account)
            }
        }
    }
}

@Composable
private fun MoreRow(icon: ImageVector, label: String, on: Boolean, onClick: () -> Unit) {
    val h = LocalHues.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (on) h.carbonTint else Color.Transparent).clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(38.dp).clip(RoundedCornerShape(10.dp)).background(h.carbonTint), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = h.carbon, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(14.dp))
        Txt(label, weight = FontWeight.SemiBold, color = if (on) h.carbon else h.ink, modifier = Modifier.weight(1f))
        Txt("›", size = 22.sp, color = h.ink3, raw = true)
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

/** The bar of a screen opened over the tabs (Plan, My account): back and the title. */
@Composable
private fun OverlayBar(title: String, back: () -> Unit) {
    val h = LocalHues.current
    Row(
        Modifier.fillMaxWidth().background(h.spine).drawBehind { drawRect(h.rule, Offset(0f, size.height - 1.dp.toPx()), Size(size.width, 1.dp.toPx())) }
            .windowInsetsPadding(WindowInsets.statusBars).height(56.dp).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp).clip(CircleShape).clickable(onClick = back), contentAlignment = Alignment.Center) { Icon(PbIcons.Back, t("Back"), tint = h.ink, modifier = Modifier.size(22.dp)) }
        Txt(title, weight = FontWeight.SemiBold, head = true, size = 18.sp)
    }
}
