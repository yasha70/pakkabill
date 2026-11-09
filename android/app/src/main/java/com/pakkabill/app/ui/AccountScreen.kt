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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun AccountScreen(
    ui: AccountUi,
    account: AccountController,
    lockOn: Boolean,
    padding: PaddingValues,
    openPnlSettings: () -> Unit,
    openPlan: () -> Unit = {},
    say: (String) -> Unit,
) {
    val platform = LocalPlatform.current
    var changePw by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var confirmLogout by remember { mutableStateOf(false) }
    var verifying by remember { mutableStateOf(false) }
    val otp = ui.config?.otp == true
    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        val s = ui.session
        if (s == null) {
            item { AuthCard(account, ui.config?.trialDays ?: 0, say, otp = otp) }
        } else {
            item { ProfileCard(ui, openPlan) }
            if (s.user.tempPw) item {
                NoteCard("You are using a temporary password from PakkaBill support. Set your own password now.", Tone.WARN, "Change password") { changePw = true }
            }
            // accounts made before OTP was on can check their number once
            if (otp && !s.user.verified && s.user.phone != "owner") item {
                NoteCard("Verify your mobile number with an SMS OTP. Then you can set a new password yourself if you ever forget it.", Tone.INFO, "Verify number") { verifying = true }
            }
            item {
                SectionCard("Account") {
                    MenuRow(Icons.Outlined.WorkspacePremium, "PakkaBill Pro plan", "Plans, payments and offers", onClick = openPlan)
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
    if (changePw) ChangePasswordDialog(account, otp, onDone = { changePw = false; if (it) say("Password changed. Other phones and browsers were logged out.") })
    if (deleting) DeleteAccountDialog(account, otp, say, onDone = { deleting = false; if (it) say("Your account was deleted.") })
    if (verifying) VerifyDialog(account, say, onDone = { verifying = false; if (it) say("Your mobile number is verified.") })
    if (confirmLogout) AlertDialog(
        onDismissRequest = { confirmLogout = false },
        title = { Text("Log out?") },
        text = { Text("Your P&L files and costs stay on this phone.") },
        confirmButton = { TextButton(onClick = { account.logout(); confirmLogout = false }) { Text("Log out") } },
        dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Cancel") } },
    )
}

@Composable
private fun ProfileCard(ui: AccountUi, openPlan: () -> Unit) {
    val s = ui.session ?: return
    val x = LocalExtra.current
    val u = s.user
    val pro = ui.isPro
    val enforced = ui.config?.let { it.enabled && it.enforce } ?: false
    val until = SimpleDateFormat("d MMM yyyy", Locale.ENGLISH).format(Date(u.paidUntil))
    SectionCard(u.shopName.ifBlank { "My shop" }, subtitle = "+91 " + u.phone + if (u.verified) "  ✓ verified" else "") {
        Surface(shape = MaterialTheme.shapes.medium, color = if (pro || !enforced) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainer) {
            Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.WorkspacePremium, null, tint = MaterialTheme.colorScheme.onPrimary)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        when {
                            ui.trial -> "Pro free trial"
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
        if (enforced && platform.sellsPro && (!pro || ui.daysLeft <= 5)) {
            Spacer(Modifier.height(10.dp))
            Button(onClick = openPlan, modifier = Modifier.fillMaxWidth()) { Text(if (pro) "Renew PakkaBill Pro" else "Get PakkaBill Pro") }
            Text("Pay by UPI right here. Pro turns on in the app as soon as it is confirmed.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
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

/**
 * A 6-digit OTP box with its own Send OTP button. [send] asks the server to send the SMS
 * (null when sent, otherwise the message); [onSent] gets that result. Resend waits 30 seconds.
 */
@Composable
fun OtpField(value: String, onChange: (String) -> Unit, send: suspend () -> String?, onSent: (String?) -> Unit, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    var wait by remember { mutableIntStateOf(0) }
    var sending by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf(false) }
    LaunchedEffect(wait) {
        if (wait > 0) {
            delay(1000)
            wait -= 1
        }
    }
    OutlinedTextField(
        value, { onChange(it.filter { c -> c.isDigit() }.take(6)) }, singleLine = true,
        label = { Text("OTP sent by SMS") }, placeholder = { Text("6-digit OTP") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        trailingIcon = {
            TextButton(enabled = !sending && wait == 0, onClick = {
                sending = true
                scope.launch {
                    val e = send()
                    sending = false
                    if (e == null) {
                        sent = true
                        wait = 30
                    }
                    onSent(e)
                }
            }) { Text(when { sending -> "Sending…"; wait > 0 -> "Resend ${wait}s"; sent -> "Resend OTP"; else -> "Send OTP" }) }
        },
        modifier = modifier.fillMaxWidth(),
    )
}

/**
 * Log in or sign up (same account as the website). When OTP by SMS is set up on the server ([otp]):
 * sign-up checks the number with an OTP, and "Forgot password?" offers a new password or log in by OTP.
 */
@Composable
fun AuthCard(account: AccountController, trialDays: Int, say: (String) -> Unit, title: String = "Log in or create a free account", otp: Boolean = account.otpOn) {
    val scope = rememberCoroutineScope()
    // "login", "signup", "otp" (log in with an OTP) or "reset" (forgot password: a new one with an OTP)
    var mode by remember { mutableStateOf("login") }
    val m = if (!otp && (mode == "otp" || mode == "reset")) "login" else mode
    val signup = m == "signup"
    var phone by remember { mutableStateOf("") }
    var pw by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var shop by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    fun go(to: String) {
        mode = to
        code = ""
        pw = ""
        error = null
    }
    val sent: (String?) -> Unit = { e -> error = e; if (e == null) say("OTP sent by SMS. It works for 10 minutes.") }
    val subtitle = when (m) {
        "reset" -> "We send a 6-digit OTP to your mobile number. Then choose a new password. Your other phones and browsers get logged out."
        "otp" -> "We send a 6-digit OTP to your mobile number. No password needed."
        else -> "Use the same mobile number and password as on the PakkaBill website." + (if (signup && otp) " We check your number with an SMS OTP." else "") + if (trialDays > 0) " New accounts get $trialDays days of Pro free." else ""
    }
    SectionCard(if (m == "reset") "Set a new password" else title, subtitle = subtitle) {
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            SegmentedButton(selected = !signup, onClick = { go("login") }, shape = SegmentedButtonDefaults.itemShape(0, 2), label = { Text("Log in") })
            SegmentedButton(selected = signup, onClick = { go("signup") }, shape = SegmentedButtonDefaults.itemShape(1, 2), label = { Text("Sign up") })
        }
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            phone, { phone = it.filter { c -> c.isDigit() || c == '+' || c == ' ' }.take(16); error = null }, singleLine = true,
            label = { Text("Mobile number") }, prefix = { Text("+91 ") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth(),
        )
        if (signup && otp) OtpField(code, { code = it; error = null }, send = { account.sendOtp(phone, "signup") }, onSent = sent)
        if (signup) OutlinedTextField(shop, { shop = it.take(80) }, singleLine = true, label = { Text("Shop name") }, modifier = Modifier.fillMaxWidth())
        when (m) {
            "otp" -> OtpField(code, { code = it; error = null }, send = { account.sendOtp(phone, "login") }, onSent = sent)
            "reset" -> {
                OtpField(code, { code = it; error = null }, send = { account.sendOtp(phone, "reset") }, onSent = sent)
                PasswordField(pw, { pw = it; error = null }, "New password (6 or more characters)")
            }
            else -> PasswordField(pw, { pw = it; error = null }, if (signup) "Make a password (6 or more characters)" else "Password")
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
        Spacer(Modifier.height(12.dp))
        Button(
            enabled = !busy,
            onClick = {
                busy = true
                scope.launch {
                    val e = when (m) {
                        "signup" -> account.signup(phone, pw, shop, code)
                        "otp" -> account.otpLogin(phone, code)
                        "reset" -> account.resetPassword(phone, code, pw)
                        else -> account.login(phone, pw)
                    }
                    busy = false
                    error = e
                    if (e == null) say(when (m) { "signup" -> "Welcome to PakkaBill!"; "reset" -> "New password saved. You are logged in."; else -> "Logged in." })
                }
            },
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) {
            if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
            else Text(when (m) { "signup" -> "Create account"; "reset" -> "Save new password and log in"; else -> "Log in" })
        }
        when {
            m == "login" && otp -> {
                Text("Forgot your password?", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                Row {
                    TextButton(onClick = { go("reset") }) { Text("Set a new one with OTP") }
                    TextButton(onClick = { go("otp") }) { Text("Log in with OTP") }
                }
            }
            m == "login" -> Text(
                "Forgot your password? Ask PakkaBill support to reset it (Help and support below).",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp),
            )
            m == "otp" || m == "reset" -> TextButton(onClick = { go("login") }, modifier = Modifier.padding(top = 4.dp)) { Text("Use my password instead") }
        }
    }
}

/** Checks the number of an account made before OTP was on. */
@Composable
private fun VerifyDialog(account: AccountController, say: (String) -> Unit, onDone: (Boolean) -> Unit) {
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDone(false) },
        title = { Text("Verify your mobile number") },
        text = {
            Column {
                Text("We send a 6-digit OTP to your number by SMS.")
                Spacer(Modifier.height(10.dp))
                OtpField(code, { code = it; error = null }, send = { account.sendOtp("", "verify") }, onSent = { e -> error = e; if (e == null) say("OTP sent by SMS.") })
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && code.length == 6, onClick = {
                busy = true
                scope.launch {
                    val e = account.verify(code)
                    busy = false
                    if (e == null) onDone(true) else error = e
                }
            }) { Text(if (busy) "Checking…" else "Verify") }
        },
        dismissButton = { TextButton(onClick = { onDone(false) }, enabled = !busy) { Text("Cancel") } },
    )
}

@Composable
private fun ChangePasswordDialog(account: AccountController, otp: Boolean, onDone: (Boolean) -> Unit) {
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
                if (otp) Text(
                    "Forgot your current password? Log out, then tap \"Set a new one with OTP\".",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp),
                )
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
private fun DeleteAccountDialog(account: AccountController, otp: Boolean, say: (String) -> Unit, onDone: (Boolean) -> Unit) {
    val scope = rememberCoroutineScope()
    var pw by remember { mutableStateOf("") }
    // forgot the password: confirm with an OTP sent to the account's number instead
    var viaOtp by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDone(false) },
        title = { Text("Delete your account?") },
        text = {
            Column {
                Text("Your PakkaBill account, plan and cloud backups are deleted for good. This cannot be undone. Files on this phone stay until you remove them.")
                Spacer(Modifier.height(10.dp))
                if (viaOtp) OtpField(code, { code = it; error = null }, send = { account.sendOtp("", "delete") }, onSent = { e -> error = e; if (e == null) say("OTP sent by SMS.") })
                else PasswordField(pw, { pw = it; error = null }, "Password")
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                if (otp && !viaOtp) TextButton(onClick = { viaOtp = true; error = null }) { Text("Forgot your password? Use an OTP instead") }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && (if (viaOtp) code.length == 6 else pw.isNotEmpty()), onClick = {
                busy = true
                scope.launch {
                    val e = if (viaOtp) account.deleteAccount("", code) else account.deleteAccount(pw)
                    busy = false
                    if (e == null) onDone(true) else error = e
                }
            }) { Text("Delete for good", color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { TextButton(onClick = { onDone(false) }, enabled = !busy) { Text("Cancel") } },
    )
}
