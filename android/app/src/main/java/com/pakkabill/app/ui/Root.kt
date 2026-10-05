package com.pakkabill.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.automirrored.rounded.ReceiptLong
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Insights
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import com.pakkabill.app.account.AccountController
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.platform.SITE
import com.pakkabill.app.platform.SystemBack
import com.pakkabill.app.pnl.PnlController
import kotlinx.coroutines.launch

enum class Tab(val label: String, val icon: ImageVector, val selectedIcon: ImageVector, val title: String) {
    PNL("P&L", Icons.Outlined.Insights, Icons.Rounded.Insights, "Meesho P&L"),
    ORDERS("Orders", Icons.AutoMirrored.Outlined.ReceiptLong, Icons.AutoMirrored.Rounded.ReceiptLong, "Orders and payments"),
    COSTS("Costs", Icons.Outlined.Inventory2, Icons.Rounded.Inventory2, "Product costs"),
    FILES("Files", Icons.Outlined.FolderOpen, Icons.Rounded.Folder, "Meesho files"),
    ACCOUNT("Account", Icons.Outlined.AccountCircle, Icons.Rounded.AccountCircle, "Account"),
}

/** The whole app: four tabs and the P&L settings screen on top. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Root(pnl: PnlController, account: AccountController, lockOn: Boolean, snackbar: SnackbarHostState, startTab: Tab = Tab.PNL) {
    val platform = LocalPlatform.current
    val ui by pnl.ui.collectAsState()
    val acct by account.ui.collectAsState()
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableStateOf(startTab) }
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    var askLogin by remember { mutableStateOf(false) }
    LaunchedEffect(startTab) { tab = startTab }

    fun say(text: String) { scope.launch { snackbar.currentSnackbarData?.dismiss(); snackbar.showSnackbar(text, withDismissAction = true) } }
    LaunchedEffect(Unit) { pnl.messages.collect { say(it) } }

    val access = acct.access
    val full = ui.sample || access.full
    // the full report and downloads need a login and Pro, as on the website
    fun unlock() {
        if (!acct.loggedIn) askLogin = true
        else if (platform.sellsPro) platform.openUrl("$SITE/#/plan")
        else say("Log in with an account that has Pro to see it here.")
    }
    fun needFull(block: () -> Unit) { if (access.full) block() else unlock() }

    val actions = PnlActions(
        upload = { platform.pickMeeshoFiles() },
        sample = { pnl.startSample() },
        endSample = { pnl.endSample() },
        select = { pnl.select(it) },
        goCosts = { tab = Tab.COSTS },
        goFiles = { tab = Tab.FILES },
        goOrders = { tab = Tab.ORDERS },
        openSettings = { settingsOpen = true },
        unlock = ::unlock,
        excel = {
            needFull {
                scope.launch {
                    val bytes = pnl.excel() ?: return@launch
                    platform.saveFile(pnl.fileSlug() + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes)
                }
            }
        },
        pdf = {
            needFull {
                val r = ui.report ?: return@needFull
                runCatching { platform.pdf(r, ui.state.settings.biz) }
                    .onSuccess { platform.saveFile(pnl.fileSlug() + ".pdf", "application/pdf", it) }
                    .onFailure { say("Could not make the PDF: ${it.message}") }
            }
        },
        share = { ui.report?.let { platform.shareText(summaryText(it, ui.state.settings.biz, full)) } },
    )

    Box(Modifier.fillMaxSize()) {
        val scroll = TopAppBarDefaults.enterAlwaysScrollBehavior()
        Scaffold(
            modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
            topBar = {
                Column {
                    TopAppBar(
                        title = { Text(tab.title) },
                        actions = {
                            if (tab == Tab.PNL || tab == Tab.COSTS || tab == Tab.ORDERS) IconButton(onClick = { settingsOpen = true }) { Icon(Icons.Outlined.Tune, "P&L settings") }
                        },
                        scrollBehavior = scroll,
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background, scrolledContainerColor = MaterialTheme.colorScheme.surfaceContainer),
                    )
                    AnimatedVisibility(ui.busy != null) {
                        Column {
                            LinearProgressIndicator(Modifier.fillMaxWidth())
                            Text(ui.busy ?: "", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
                        }
                    }
                }
            },
            bottomBar = {
                NavigationBar {
                    Tab.entries.forEach { t ->
                        NavigationBarItem(
                            selected = tab == t,
                            onClick = { tab = t },
                            icon = { Icon(if (tab == t) t.selectedIcon else t.icon, null) },
                            label = { Text(t.label) },
                        )
                    }
                }
            },
            snackbarHost = { SnackbarHost(snackbar) },
        ) { padding ->
            SystemBack(enabled = tab != Tab.PNL && !settingsOpen) { tab = Tab.PNL }
            AnimatedContent(tab, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "tab") { t ->
                when (t) {
                    Tab.PNL -> PnlScreen(ui, access, acct.loggedIn, acct.config?.trialDays ?: 0, padding, actions)
                    Tab.FILES -> FilesScreen(ui, padding, upload = actions.upload, sample = actions.sample, remove = { pnl.removeFile(it.id) }, removeAll = { pnl.removeAllFiles() })
                    Tab.ORDERS -> OrdersScreen(ui, full, padding, setMark = { id, c -> pnl.setMark(id, c) }, unlock = ::unlock, goFiles = { tab = Tab.FILES })
                    Tab.COSTS -> CostsScreen(
                        ui, padding,
                        CostActions(
                            save = { sku, c -> pnl.setCost(sku, c) },
                            saveMany = { m, what -> pnl.setCosts(m, what) },
                            saveSettings = { pnl.saveSettings(it) },
                            goFiles = { tab = Tab.FILES },
                            downloadSheet = { scope.launch { pnl.costSheet()?.let { platform.saveFile("PakkaBill-cost-sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", it) } } },
                            uploadSheet = { platform.pickCostSheet() },
                        ),
                    )
                    Tab.ACCOUNT -> AccountScreen(acct, account, lockOn, padding, openPnlSettings = { settingsOpen = true }, say = ::say)
                }
            }
        }

        AnimatedVisibility(
            settingsOpen,
            enter = slideInHorizontally { it } + fadeIn(),
            exit = slideOutHorizontally { it } + fadeOut(),
        ) {
            PnlSettingsScreen(
                ui,
                SettingsActions(
                    back = { settingsOpen = false },
                    save = { pnl.saveSettings(it) },
                    addExpense = { pnl.addExpense(it) },
                    removeExpense = { pnl.removeExpense(it) },
                    backup = { scope.launch { platform.saveFile("PakkaBill-PnL-backup.json", "application/json", pnl.backup().toByteArray()) } },
                    restore = { platform.pickBackup() },
                    eraseAll = { pnl.eraseEverything(); settingsOpen = false },
                ),
            )
        }
    }

    if (askLogin) AlertDialog(
        onDismissRequest = { askLogin = false },
        title = null,
        text = { AuthCard(account, acct.config?.trialDays ?: 0, { askLogin = false; say(it) }, title = "Log in to see the full report") },
        confirmButton = { TextButton(onClick = { askLogin = false }) { Text("Not now") } },
    )
    LaunchedEffect(acct.loggedIn) { if (acct.loggedIn) askLogin = false }
}

/** The text shared on WhatsApp (same as the website's summary). */
fun summaryText(r: com.pakkabill.core.Report, biz: String, full: Boolean): String {
    val s = r.sum
    val t = mutableListOf<String>()
    t += "Meesho P&L" + (if (biz.isNotBlank()) " – $biz" else "") + " (" + r.per.label + ")"
    t += (if (s.NP < 0) "Net loss: " else "Net profit: ") + rsp(s.NP)
    t += "Net sales: " + rsp(s.NS)
    t += "Received from Meesho: " + rsp(s.payout)
    t += "Orders: ${s.sales}, delivered: ${s.del}"
    if (s.del > 0) t += "Profit per delivered order: " + rsp(s.perDel)
    if (full) r.skus.maxByOrNull { it.contrib }?.takeIf { it.contrib > 0 }?.let { t += "Best product: ${it.sku} (${rs(it.contrib)} profit)" }
    if (s.missing.isNotEmpty()) t += "(Cost not added yet for ${plural(s.missing.size, "SKU")})"
    t += ""
    t += "Made with PakkaBill: know your real profit"
    t += "$SITE/#/pnl"
    return t.joinToString("\n")
}
