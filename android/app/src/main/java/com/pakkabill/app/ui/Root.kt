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
import com.pakkabill.app.bill.BillController
import com.pakkabill.app.tools.AppTools
import com.pakkabill.app.ui.tools.LabelActs
import com.pakkabill.app.ui.tools.gstr1Tab
import com.pakkabill.app.ui.tools.LensPanel
import com.pakkabill.app.ui.tools.MeeshoWeb
import com.pakkabill.app.ui.tools.MeeshoShipping
import com.pakkabill.app.ui.tools.MeeshoSupplier
import com.pakkabill.app.ui.tools.autolistTab
import com.pakkabill.app.ui.tools.lensTab
import com.pakkabill.app.ui.tools.listingTab
import com.pakkabill.app.ui.tools.lowshipTab
import com.pakkabill.app.ui.tools.labelsTab
import com.pakkabill.app.ui.tools.toolGroups
import com.pakkabill.app.ui.tools.toolsTab
import com.pakkabill.app.bill.BillPdf
import com.pakkabill.app.ui.bill.BillActs
import com.pakkabill.app.ui.bill.BillEditor
import com.pakkabill.app.ui.bill.BillFilter
import com.pakkabill.app.ui.bill.BillView
import com.pakkabill.app.ui.bill.BillViewActs
import com.pakkabill.app.ui.bill.billRows
import com.pakkabill.app.ui.bill.billsTab
import com.pakkabill.app.ui.bill.gstTab
import com.pakkabill.app.ui.bill.itemsTab
import com.pakkabill.app.ui.bill.partiesTab
import com.pakkabill.app.ui.bill.pdfName
import com.pakkabill.app.ui.bill.shopTab
import com.pakkabill.core.bill.BillStore
import com.pakkabill.core.bill.Gst
import com.pakkabill.core.bill.Invoice
import com.pakkabill.core.Art
import com.pakkabill.core.Report
import com.pakkabill.core.Sel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The tabs of the website's Meesho P&L, in the same order. */
val TABS = listOf("pl" to "P&L", "rc" to "Reconcile", "data" to "Upload", "costs" to "Costs", "exp" to "Expenses", "set" to "Settings", "guide" to "How to use")
/** Pages opened from the Tools page; the Tools tab stays lit on them. */
private val TOOL_PAGES = setOf("tools", "rc", "data", "costs", "exp", "set", "guide", "gstr1", "lowship", "autolist", "listing", "lens")
/** The billing pages; the Bills tab stays lit on all of them. */
private val BILL_TABS = setOf("bills", "parties", "items", "gst", "shop")

/**
 * The whole app, laid out like PakkaBill on a phone: the PakkaBill bar on top, the page, and the
 * tab bar at the bottom with the + in the middle. Every page is a lazy list, so only what is on
 * screen is drawn, and each tab keeps its own scroll position.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Root(pnl: PnlController, account: AccountController, bills: BillController, tools: AppTools, lockOn: Boolean, snackbar: SnackbarHostState, startTab: String = "pl") {
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
    var planOpen by rememberSaveable { mutableStateOf(false) }
    // billing: the list's filter, the add menu, the bill being made and the bill being looked at
    val billData by bills.data.collectAsState()
    var billKind by rememberSaveable { mutableStateOf("all") }
    var billQ by rememberSaveable { mutableStateOf("") }
    var addOpen by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Invoice?>(null) }
    var viewId by rememberSaveable { mutableStateOf<String?>(null) }
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
    fun newBill(docType: String) {
        addOpen = false
        scope.launch { editing = bills.draft(docType) }
    }
    fun open(k: String, top: Boolean = true) {
        if (k == "plan") { planOpen = true; return }
        if (k == "account") { accountOpen = true; return }
        if (k == "newbill") { tab = "bills"; newBill("invoice"); return }
        if (top) lists.remove(k)
        tab = k
    }
    // where the back button goes from a page: a billing page to Bills, a tool to Tools, the rest to the P&L
    fun parentOf(k: String) = when {
        k in BILL_TABS && k != "bills" -> "bills"
        k in TOOL_PAGES && k != "tools" -> "tools"
        else -> "pl"
    }
    LaunchedEffect(startTab) { open(startTab) }

    fun say(text: String) { scope.launch { snackbar.currentSnackbarData?.dismiss(); snackbar.showSnackbar(tr(text)) } }
    LaunchedEffect(Unit) { pnl.messages.collect { say(it) } }
    LaunchedEffect(Unit) { bills.messages.collect { say(it) } }

    // Labels & packing chart
    val labelsCtl = tools.labels
    val labView by labelsCtl.view.collectAsState()
    val labOpts by labelsCtl.opts.collectAsState()
    val labBusy by labelsCtl.busy.collectAsState()
    val labOut by labelsCtl.out.collectAsState()
    LaunchedEffect(Unit) { labelsCtl.messages.collect { say(it) } }
    LaunchedEffect(Unit) { tools.gstr1.messages.collect { say(it) } }
    LaunchedEffect(Unit) { tools.lowship.messages.collect { say(it) } }
    LaunchedEffect(Unit) { tools.lens.messages.collect { say(it) } }
    // Meesho listing is made the first time its page opens (it reads the saved template then, not at every start)
    var listingSeen by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(tab) { if (tab == "listing") listingSeen = true }
    if (listingSeen) LaunchedEffect(Unit) { tools.listing.messages.collect { say(it) } }
    // Auto listing, the same way; and Meesho's supplier panel with the PakkaBill form filler
    var autolistSeen by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(tab) { if (tab == "autolist") autolistSeen = true }
    if (autolistSeen) LaunchedEffect(Unit) { tools.autolist.messages.collect { say(it) } }
    var supplier by rememberSaveable { mutableStateOf(false) }
    // and for Low shipping image: Meesho's supplier panel, where Meesho prices every version
    var shipping by rememberSaveable { mutableStateOf(false) }
    // Meesho's website inside a tool (Lens), opened from the Lens page or a link shared from the Meesho app
    var meesho by rememberSaveable { mutableStateOf<String?>(null) }
    val lensOpen by tools.lens.open.collectAsState()
    LaunchedEffect(lensOpen) { lensOpen?.let { meesho = it; tab = "lens"; tools.lens.opened() } }
    val labActs = LabelActs(
        pick = { platform.pickPdfs() },
        remove = { labelsCtl.remove(it) },
        clear = { labelsCtl.clear() },
        opts = { labelsCtl.setOpts(it) },
        make = { scope.launch { labelsCtl.sortedPdf() } },
        share = { platform.shareFile(it.name, it.mime, it.bytes) },
        save = { platform.saveFile(it.name, it.mime, it.bytes) },
        print = { platform.printPdf(it.name, it.bytes) },
        chartPdf = { scope.launch { labelsCtl.chartPdf()?.let { m -> platform.saveFile(m.name, m.mime, m.bytes) } } },
        chartCsv = { scope.launch { labelsCtl.chartCsv()?.let { m -> platform.saveFile(m.name, m.mime, m.bytes) } } },
        chartText = { platform.shareText(it) },
    )

    val cfg = acct.config
    val enforced = cfg != null && cfg.enabled && cfg.enforce
    val login = acct.loggedIn
    // Pro dates use the account's safe clock: turning the phone's clock back does not keep Pro on
    val pro = login && (!enforced || acct.isPro)
    val x = Access(login, pro, if (cfg != null && cfg.enabled && cfg.enforce) cfg.trialDays else 0, !platform.sellsPro)
    // the Plan screen: log in or sign up there, then the plans, coupons and UPI payment
    fun unlock() { planOpen = true }
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

    val billRowsNow = remember(billData, billKind, billQ) { billRows(billData, BillFilter(billKind, billQ, {}, {})) }
    val billActs = BillActs(
        newBill = { newBill(it) },
        open = { viewId = it.id },
        tab = { open(it) },
        saveBusiness = { bills.saveBusiness(it) },
        saveParty = { bills.saveParty(it) }, deleteParty = { bills.deleteParty(it) },
        saveProduct = { bills.saveProduct(it) }, deleteProduct = { bills.deleteProduct(it) },
        exportCsv = { platform.saveFile("PakkaBill_bills_" + Gst.today() + ".csv", "text/csv", BillStore.csv(billData.invoices).toByteArray()) },
        backup = { scope.launch { platform.saveFile("PakkaBill_bills_backup_" + Gst.today() + ".json", "application/json", bills.backup().toByteArray()) } },
        restore = { platform.pickBackup() },
        say = ::say,
    )

    Box(Modifier.fillMaxSize().then(doodle)) {
        Column(Modifier.fillMaxSize().imePadding()) {
            TopBar(lang, { pnl.setLang(it) }, h.dark, { pnl.setTheme(if (h.dark) "light" else "dark") }, login) { accountOpen = true }
            SystemBack(enabled = tab != "pl" && !accountOpen && !addOpen) { open(parentOf(tab), top = false) }
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
                            "bills" -> billsTab(billData, billRowsNow, BillFilter(billKind, billQ, { billKind = it }, { billQ = it }), billActs)
                            "parties" -> partiesTab(billData, billActs)
                            "items" -> itemsTab(billData, billActs)
                            "gst" -> gstTab(billData, billActs)
                            "shop" -> shopTab(billData, billActs)
                            "labels" -> labelsTab(labView, labOpts, labBusy, labOut, labActs)
                            "gstr1" -> gstr1Tab(tools.gstr1)
                            "lowship" -> lowshipTab(tools.lowship) { shipping = true }
                            "lens" -> lensTab(tools.lens) { meesho = it }
                            "listing" -> listingTab(tools.listing) { scope.launch { list.scrollToItem(0) } }
                            "autolist" -> autolistTab(tools.autolist, pro, upgrade = { planOpen = true }, openMeesho = { supplier = true })
                            "tools" -> toolsTab(toolGroups(login, acct.isPro && enforced, issues)) { open(it) }
                            else -> block("guide") { GuideTab(guide, ui, lang, { pnl.setLang(it) }, go) }
                        }
                    }
                }
            }
            if (!imeOpen) BottomBar(
                tab, issues, lang,
                pick = { k ->
                    // tapping the open tab again goes back to its top
                    if (k == tab) lists[k]?.let { l -> scope.launch { l.animateScrollToItem(0) } } else open(k, top = false)
                },
                add = { addOpen = !addOpen },
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

        AddSheet(
            addOpen, close = { addOpen = false }, bill = { newBill(it) },
            labels = { addOpen = false; open("labels", top = false); platform.pickPdfs() },
            meesho = { addOpen = false; open("data", top = false); platform.pickMeeshoFiles() },
        )

        // a saved bill: preview, WhatsApp, PDF, print, paid
        val viewing = viewId?.let { id -> billData.invoices.firstOrNull { it.id == id } }
        AnimatedVisibility(viewing != null && editing == null, enter = slideInHorizontally(tween(220)) { it } + fadeIn(tween(220)), exit = slideOutHorizontally(tween(200)) { it } + fadeOut(tween(200))) {
            val b = viewing ?: return@AnimatedVisibility
            BillView(
                b,
                BillViewActs(
                    whatsapp = { inv, pdf -> platform.shareToWhatsApp(inv.buyer.phone, pdfName(inv), "application/pdf", pdf, BillPdf.message(inv)) },
                    save = { inv, pdf -> platform.saveFile(pdfName(inv), "application/pdf", pdf) },
                    print = { inv, pdf -> platform.printPdf(pdfName(inv), pdf) },
                    setPaid = { inv, paid -> bills.setPaid(inv.id, paid) },
                    edit = { inv -> editing = inv },
                    copy = { inv, docType -> scope.launch { editing = bills.duplicate(inv, docType) } },
                    delete = { inv -> viewId = null; bills.delete(inv.id) },
                ),
            ) { viewId = null }
        }

        // Meesho's own pages, read by the website's Lens code, with the Lens panel under them
        AnimatedVisibility(meesho != null, enter = slideInVertically(tween(240)) { it } + fadeIn(tween(240)), exit = slideOutVertically(tween(200)) { it } + fadeOut(tween(200))) {
            val u = meesho ?: return@AnimatedVisibility
            val pn by tools.lens.panel.collectAsState()
            fun read(w: android.webkit.WebView) {
                if (Regex("/p/[a-z0-9]+", RegexOption.IGNORE_CASE).containsMatchIn(w.url.orEmpty()))
                    w.evaluateJavascript(tools.lens.readScript) { v -> (runCatching { org.json.JSONTokener(v).nextValue() }.getOrNull() as? String)?.let { tools.lens.read(it) } }
                else tools.lens.leftProduct()
            }
            MeeshoWeb(u, "Meesho · PakkaBill Lens", onClose = { meesho = null; tools.lens.leftProduct() }, every = 2500, onTick = ::read, onPage = { w, _ -> read(w) }) { LensPanel(pn) }
        }

        // Meesho's supplier panel for Auto listing, with the PakkaBill Lens form filler in the page
        AnimatedVisibility(supplier, enter = slideInVertically(tween(240)) { it } + fadeIn(tween(240)), exit = slideOutVertically(tween(200)) { it } + fadeOut(tween(200))) {
            val desktop by tools.autolist.desktop.collectAsState()
            MeeshoSupplier(tools.autolist, desktop, { tools.autolist.setDesktop(it) }) { supplier = false; tools.autolist.refresh() }
        }

        // Meesho's supplier panel for Low shipping image, with the website's shipping check in the page
        AnimatedVisibility(shipping, enter = slideInVertically(tween(240)) { it } + fadeIn(tween(240)), exit = slideOutVertically(tween(200)) { it } + fadeOut(tween(200))) {
            val desktop by tools.lowship.desktop.collectAsState()
            MeeshoShipping(tools.lowship, desktop, { tools.lowship.setDesktop(it) }) { shipping = false }
        }

        // making or changing a bill
        AnimatedVisibility(editing != null, enter = slideInVertically(tween(240)) { it } + fadeIn(tween(240)), exit = slideOutVertically(tween(200)) { it } + fadeOut(tween(200))) {
            val e = editing ?: return@AnimatedVisibility
            key(e.id) {
                BillEditor(e, billData, { bills.numberTaken(it) }, onSave = { inv ->
                    scope.launch {
                        val saved = bills.save(inv) ?: return@launch
                        editing = null
                        if (tab !in BILL_TABS) open("bills", top = false)
                        viewId = saved.id
                    }
                }) { editing = null }
            }
        }

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
private val HI_BAR = mapOf("P&L" to "मुनाफ़ा", "Labels" to "लेबल", "Bills" to "बिल", "Tools" to "टूल्स")

/** .tabbar: P&L, Labels, the + (new bill, estimate, labels or Meesho files), Bills, and every other tool. */
@Composable
private fun BottomBar(tab: String, issues: Int, lang: String, pick: (String) -> Unit, add: () -> Unit) {
    val h = LocalHues.current
    Row(
        Modifier.fillMaxWidth().background(h.sheet).drawBehind {
            drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color(0x14141846)), startY = -14.dp.toPx(), endY = 0f), Offset(0f, -14.dp.toPx()), Size(size.width, 14.dp.toPx()))
            drawRect(h.rule, size = Size(size.width, 1.dp.toPx()))
        }.windowInsetsPadding(WindowInsets.navigationBars).height(62.dp).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        fun label(s: String) = if (lang == "hi") HI_BAR[s] ?: s else s
        BarTab(PbIcons.Rupee, label("P&L"), tab == "pl", issues) { pick("pl") }
        BarTab(PbIcons.Tag, label("Labels"), tab == "labels") { pick("labels") }
        Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.Center) {
            Box(
                Modifier.offset(y = (-12).dp).size(54.dp).shadow(10.dp, RoundedCornerShape(16.dp), ambientColor = h.carbon, spotColor = h.carbon)
                    .clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(h.btn)).clickable(onClick = add),
                contentAlignment = Alignment.Center,
            ) { Icon(PbIcons.Plus, t("New bill, labels or Meesho files"), tint = h.btnFg, modifier = Modifier.size(26.dp)) }
        }
        BarTab(PbIcons.Receipt, label("Bills"), tab in BILL_TABS) { pick("bills") }
        BarTab(PbIcons.Grid, label("Tools"), tab in TOOL_PAGES) { pick("tools") }
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

/** The + button's menu: a new bill, a new estimate, Meesho labels to sort, or Meesho files for the P&L. */
@Composable
private fun AddSheet(open: Boolean, close: () -> Unit, bill: (String) -> Unit, labels: () -> Unit, meesho: () -> Unit) {
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
                MoreRow(PbIcons.Receipt, "New GST bill", false) { bill("invoice") }
                MoreRow(PbIcons.Book, "New estimate", false) { bill("estimate") }
                MoreRow(PbIcons.Tag, "Sort Meesho labels", false, labels)
                MoreRow(PbIcons.Upload, "Add Meesho files (P&L)", false, meesho)
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
