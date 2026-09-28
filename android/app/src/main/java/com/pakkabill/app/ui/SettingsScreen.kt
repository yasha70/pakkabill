package com.pakkabill.app.ui

import androidx.activity.compose.BackHandler
import androidx.annotation.DrawableRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.pakkabill.app.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    lockOn: Boolean,
    canLock: Boolean,
    version: String,
    onBack: () -> Unit,
    onToggleLock: (Boolean) -> Unit,
    onAction: (AppAction) -> Unit,
) {
    BackHandler(onBack = onBack)
    var confirmClear by remember { mutableStateOf(false) }
    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    Scaffold(
        modifier = Modifier.fillMaxSize().nestedScroll(scroll.nestedScrollConnection),
        topBar = {
            LargeTopAppBar(
                title = { Text("App settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(painterResource(R.drawable.ic_arrow_back), contentDescription = "Back") }
                },
                scrollBehavior = scroll,
            )
        },
    ) { padding ->
        LazyColumn(contentPadding = padding) {
            item { Section("Security") }
            item {
                ListItem(
                    headlineContent = { Text("App lock") },
                    supportingContent = {
                        Text(
                            if (canLock) "Ask for your fingerprint, face or screen lock when PakkaBill opens"
                            else "Set a screen lock or fingerprint in your phone's Settings to use this",
                        )
                    },
                    leadingContent = { Icon(painterResource(R.drawable.ic_lock), contentDescription = null) },
                    trailingContent = { Switch(checked = lockOn, onCheckedChange = onToggleLock, enabled = canLock) },
                    modifier = Modifier.clickable(enabled = canLock) { onToggleLock(!lockOn) },
                )
            }
            item { Section("Files") }
            item { SettingRow(R.drawable.ic_folder, "Saved bills and reports", "Open the Downloads/PakkaBill folder") { onAction(AppAction.DOWNLOADS) } }
            item { SettingRow(R.drawable.ic_refresh, "Clear app cache", "Frees space. Your bills and login stay safe") { confirmClear = true } }
            item { Section("Help and privacy") }
            item { SettingRow(R.drawable.ic_help, "Help and support", "Ask the assistant or message our team") { onAction(AppAction.HELP) } }
            item { SettingRow(R.drawable.ic_shield, "Privacy policy", "What we keep and why", external = true) { onAction(AppAction.PRIVACY) } }
            item {
                SettingRow(R.drawable.ic_delete, "Delete my account", "Remove your account and cloud backups", danger = true) {
                    onAction(AppAction.DELETE_ACCOUNT)
                }
            }
            item { Section("PakkaBill") }
            item { SettingRow(R.drawable.ic_star, "Rate PakkaBill", "Tell other sellers what you think", external = true) { onAction(AppAction.RATE) } }
            item { SettingRow(R.drawable.ic_share, "Share PakkaBill", "Send the app to a friend") { onAction(AppAction.SHARE_APP) } }
            item { HorizontalDivider(Modifier.padding(vertical = 8.dp)) }
            item {
                ListItem(
                    headlineContent = { Text("PakkaBill for Android") },
                    supportingContent = { Text("Version $version · Made in India for GST sellers") },
                    leadingContent = { Icon(painterResource(R.drawable.ic_info), contentDescription = null) },
                )
            }
        }
    }
    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("Clear app cache?") },
            text = { Text("PakkaBill will download its screens again. Your bills, parties, items and login are not deleted.") },
            confirmButton = { TextButton(onClick = { confirmClear = false; onAction(AppAction.CLEAR_CACHE) }) { Text("Clear") } },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun Section(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 16.dp, top = 20.dp, bottom = 4.dp),
    )
}

@Composable
private fun SettingRow(
    @DrawableRes icon: Int,
    title: String,
    subtitle: String,
    external: Boolean = false,
    danger: Boolean = false,
    onClick: () -> Unit,
) {
    val tint = if (danger) MaterialTheme.colorScheme.error else Color.Unspecified
    ListItem(
        headlineContent = { Text(title, color = if (danger) MaterialTheme.colorScheme.error else Color.Unspecified) },
        supportingContent = { Text(subtitle) },
        leadingContent = { Icon(painterResource(icon), contentDescription = null, tint = if (danger) tint else MaterialTheme.colorScheme.onSurfaceVariant) },
        trailingContent = {
            Icon(
                painterResource(if (external) R.drawable.ic_open_in_new else R.drawable.ic_chevron_right),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
        modifier = Modifier.clickable(onClick = onClick),
    )
}
