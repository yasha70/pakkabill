package com.pakkabill.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.outlined.DeleteForever
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.outlined.WorkspacePremium
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.pakkabill.app.account.AccountController
import com.pakkabill.app.account.AccountUi
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.platform.SITE
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.launch

@Composable
fun AccountScreen(
    ui: AccountUi,
    account: AccountController,
    lockOn: Boolean,
    padding: PaddingValues,
    openPnlSettings: () -> Unit,
    say: (String) -> Unit,
) {
    val platform = LocalPlatform.current
    var changePw by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var confirmLogout by remember { mutableStateOf(false) }
    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        val s = ui.session
        if (s == null) {
            item { AuthCard(account, ui.config?.trialDays ?: 0, say) }
        } else {
            item { ProfileCard(ui) }
            if (s.user.tempPw) item {
                NoteCard("You are using a temporary password from PakkaBill support. Set your own password now.", Tone.WARN, "Change password") { changePw = true }
            }
            item {
                SectionCard("Account") {
                    MenuRow(Icons.Outlined.Key, "Change password", "Other phones and browsers get logged out") { changePw = true }
                    MenuRow(Icons.AutoMirrored.Outlined.Logout, "Log out") { confirmLogout = true }
                    MenuRow(Icons.Outlined.DeleteForever, "Delete account", "Removes your account and cloud backups for good", tint = MaterialTheme.colorScheme.error) { deleting = true }
                }
            }
        }
        item {
            SectionCard("App") {
                MenuRow(Icons.Outlined.Tune, "P&L settings and expenses", "Business, GST, returns, monthly costs", onClick = openPnlSettings)
                if (platform.canLock) MenuRow(
                    Icons.Outlined.Fingerprint, "App lock", "Fingerprint, face or screen lock when PakkaBill opens",
                    trailing = { Switch(checked = lockOn, onCheckedChange = { platform.setAppLock(it) }) },
                ) { platform.setAppLock(!lockOn) }
                MenuRow(Icons.AutoMirrored.Outlined.ReceiptLong, "GST billing", "Bills, estimates and GSTR-1 open on the website for now") { platform.openUrl("$SITE/") }
            }
        }
        item {
            SectionCard("Help and about") {
                MenuRow(Icons.AutoMirrored.Outlined.HelpOutline, "Help and support") { platform.openUrl("$SITE/#/support") }
                MenuRow(Icons.Outlined.PrivacyTip, "Privacy policy") { platform.openUrl("$SITE/privacy.html") }
                MenuRow(Icons.Outlined.Gavel, "Terms and refunds") { platform.openUrl("$SITE/terms.html") }
                MenuRow(Icons.Outlined.StarOutline, "Rate PakkaBill") { platform.rateApp() }
                MenuRow(Icons.Outlined.Share, "Share the app") { platform.shareApp() }
                Text("PakkaBill ${platform.version}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp, start = 4.dp))
            }
        }
    }
    if (changePw) ChangePasswordDialog(account, onDone = { changePw = false; if (it) say("Password changed. Other phones and browsers were logged out.") })
    if (deleting) DeleteAccountDialog(account, onDone = { deleting = false; if (it) say("Your account was deleted.") })
    if (confirmLogout) AlertDialog(
        onDismissRequest = { confirmLogout = false },
        title = { Text("Log out?") },
        text = { Text("Your P&L files and costs stay on this phone.") },
        confirmButton = { TextButton(onClick = { account.logout(); confirmLogout = false }) { Text("Log out") } },
        dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Cancel") } },
    )
}

@Composable
private fun ProfileCard(ui: AccountUi) {
    val s = ui.session ?: return
    val x = LocalExtra.current
    val u = s.user
    val now = System.currentTimeMillis()
    val pro = u.paidUntil > now
    val enforced = ui.config?.let { it.enabled && it.enforce } ?: false
    val until = SimpleDateFormat("d MMM yyyy", Locale.ENGLISH).format(Date(u.paidUntil))
    SectionCard(u.shopName.ifBlank { "My shop" }, subtitle = "+91 " + u.phone) {
        Surface(shape = MaterialTheme.shapes.medium, color = if (pro || !enforced) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainer) {
            Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.WorkspacePremium, null, tint = MaterialTheme.colorScheme.onPrimary)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        when {
                            u.trial && pro -> "Pro free trial"
                            pro -> "PakkaBill Pro"
                            !enforced -> "All features are free right now"
                            else -> "Free plan"
                        },
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        when {
                            pro -> "Active till $until"
                            !enforced -> "The full P&L report and downloads are open to everyone who is logged in."
                            else -> "Pro opens the full P&L report, Excel and PDF."
                        },
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        val platform = LocalPlatform.current
        if (enforced && !pro && !platform.sellsPro) {
            Text("Buying Pro is not available in this app. If your account has Pro, it works here too.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        }
        if (enforced && !pro && platform.sellsPro) {
            Spacer(Modifier.height(10.dp))
            Button(onClick = { platform.openUrl("$SITE/#/plan") }, modifier = Modifier.fillMaxWidth()) { Text("Get PakkaBill Pro") }
            Text("Opens the PakkaBill website. Pro works in the app as soon as it is active.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

@Composable
fun PasswordField(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier) {
    var show by remember { mutableStateOf(false) }
    OutlinedTextField(
        value, onChange, singleLine = true, label = { Text(label) },
        visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = {
            IconButton(onClick = { show = !show }) {
                Icon(if (show) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, if (show) "Hide password" else "Show password")
            }
        },
        modifier = modifier.fillMaxWidth(),
    )
}

/** Log in or sign up (same account as the website). */
@Composable
fun AuthCard(account: AccountController, trialDays: Int, say: (String) -> Unit, title: String = "Log in or create a free account") {
    val scope = rememberCoroutineScope()
    var signup by remember { mutableStateOf(false) }
    var phone by remember { mutableStateOf("") }
    var pw by remember { mutableStateOf("") }
    var shop by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    SectionCard(title, subtitle = "Use the same mobile number and password as on the PakkaBill website." + if (trialDays > 0) " New accounts get $trialDays days of Pro free." else "") {
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            SegmentedButton(selected = !signup, onClick = { signup = false; error = null }, shape = SegmentedButtonDefaults.itemShape(0, 2), label = { Text("Log in") })
            SegmentedButton(selected = signup, onClick = { signup = true; error = null }, shape = SegmentedButtonDefaults.itemShape(1, 2), label = { Text("Sign up") })
        }
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            phone, { phone = it.filter { c -> c.isDigit() || c == '+' || c == ' ' }.take(16); error = null }, singleLine = true,
            label = { Text("Mobile number") }, prefix = { Text("+91 ") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth(),
        )
        if (signup) OutlinedTextField(shop, { shop = it.take(80) }, singleLine = true, label = { Text("Shop name") }, modifier = Modifier.fillMaxWidth())
        PasswordField(pw, { pw = it; error = null }, if (signup) "Make a password (6 or more characters)" else "Password")
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
        Spacer(Modifier.height(12.dp))
        Button(
            enabled = !busy,
            onClick = {
                busy = true
                scope.launch {
                    val e = if (signup) account.signup(phone, pw, shop) else account.login(phone, pw)
                    busy = false
                    error = e
                    if (e == null) say(if (signup) "Welcome to PakkaBill!" else "Logged in.")
                }
            },
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) {
            if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
            else Text(if (signup) "Create account" else "Log in")
        }
        if (!signup) Text(
            "Forgot your password? Ask PakkaBill support to reset it (Help and support below).",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun ChangePasswordDialog(account: AccountController, onDone: (Boolean) -> Unit) {
    val scope = rememberCoroutineScope()
    var cur by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDone(false) },
        title = { Text("Change password") },
        text = {
            Column {
                PasswordField(cur, { cur = it; error = null }, "Current password")
                PasswordField(next, { next = it; error = null }, "New password (6 or more characters)")
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy, onClick = {
                busy = true
                scope.launch {
                    val e = account.changePassword(cur, next)
                    busy = false
                    if (e == null) onDone(true) else error = e
                }
            }) { Text(if (busy) "Saving…" else "Change") }
        },
        dismissButton = { TextButton(onClick = { onDone(false) }, enabled = !busy) { Text("Cancel") } },
    )
}

@Composable
private fun DeleteAccountDialog(account: AccountController, onDone: (Boolean) -> Unit) {
    val scope = rememberCoroutineScope()
    var pw by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDone(false) },
        title = { Text("Delete your account?") },
        text = {
            Column {
                Text("Your PakkaBill account, plan and cloud backups are deleted for good. This cannot be undone. Files on this phone stay until you remove them.")
                Spacer(Modifier.height(10.dp))
                PasswordField(pw, { pw = it; error = null }, "Password")
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && pw.isNotEmpty(), onClick = {
                busy = true
                scope.launch {
                    val e = account.deleteAccount(pw)
                    busy = false
                    if (e == null) onDone(true) else error = e
                }
            }) { Text("Delete for good", color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { TextButton(onClick = { onDone(false) }, enabled = !busy) { Text("Cancel") } },
    )
}
