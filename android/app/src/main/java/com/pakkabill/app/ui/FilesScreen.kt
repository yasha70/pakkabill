package com.pakkabill.app.ui

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FileUpload
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pakkabill.app.pnl.PnlUi
import com.pakkabill.core.FileInfo
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val SHEET_NAMES = mapOf("pay" to "Order payments", "ads" to "Ads cost", "ref" to "Referral payments", "adj" to "Compensation and recovery", "ord" to "Orders", "skip" to "Not used")

@Composable
fun FilesScreen(
    ui: PnlUi,
    padding: PaddingValues,
    upload: () -> Unit,
    sample: () -> Unit,
    remove: (FileInfo) -> Unit,
    removeAll: () -> Unit,
) {
    var confirm by remember { mutableStateOf<FileInfo?>(null) }
    var confirmAll by remember { mutableStateOf(false) }
    val files = ui.report?.files.orEmpty()
    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            SectionCard("Add Meesho files", subtitle = "Excel, CSV or ZIP. Pick several at once; repeated rows are counted once.") {
                Button(onClick = upload, enabled = ui.ready && ui.busy == null, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                    Icon(Icons.Outlined.FileUpload, null)
                    Spacer(Modifier.width(8.dp))
                    Text("Choose files")
                }
                if (!ui.hasData) {
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = sample, enabled = ui.ready, modifier = Modifier.fillMaxWidth()) { Text("Try with sample data") }
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    "Files are read on this phone. Nothing is uploaded to the internet.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (ui.sample) item { NoteCard("Sample data is open. Files you add replace it.", Tone.INFO) }
        if (!ui.sample && files.isNotEmpty()) {
            item { Text("Your files (${files.size})", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 6.dp)) }
            items(files, key = { it.id }) { f -> FileRow(f) { confirm = f } }
            item {
                TextButton(onClick = { confirmAll = true }) { Text("Remove all files", color = MaterialTheme.colorScheme.error) }
            }
        }
        item { MeeshoGuide() }
    }
    confirm?.let { f ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text("Remove this file?") },
            text = { Text("${f.name} will be removed from the P&L. You can add it again later.") },
            confirmButton = { TextButton(onClick = { remove(f); confirm = null }) { Text("Remove") } },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancel") } },
        )
    }
    if (confirmAll) AlertDialog(
        onDismissRequest = { confirmAll = false },
        title = { Text("Remove all files?") },
        text = { Text("All uploaded Meesho files are removed from this phone. Your product costs, expenses and settings are kept.") },
        confirmButton = { TextButton(onClick = { removeAll(); confirmAll = false }) { Text("Remove all") } },
        dismissButton = { TextButton(onClick = { confirmAll = false }) { Text("Cancel") } },
    )
}

@Composable
private fun FileRow(f: FileInfo, onRemove: () -> Unit) {
    SectionCard(
        f.name,
        subtitle = listOfNotNull(
            if (f.size > 0) sizeText(f.size) else null,
            if (f.at > 0) "added " + SimpleDateFormat("d MMM yyyy", Locale.ENGLISH).format(Date(f.at)) else null,
        ).joinToString(" · ").ifBlank { null },
        action = { IconButton(onClick = onRemove) { Icon(Icons.Outlined.DeleteOutline, "Remove ${f.name}") } },
    ) {
        f.sheets.filter { it.type != "skip" }.forEach { s ->
            Row(Modifier.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Description, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                Text(
                    "${SHEET_NAMES[s.type] ?: s.name}: ${plural(s.n, "row")}" + if (s.from != null && s.to != null) " (${s.from} to ${s.to})" else "",
                    style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (f.cats > 0) Text("Categories for ${plural(f.cats, "SKU")}", style = MaterialTheme.typography.bodySmall)
    }
}

private fun sizeText(b: Long) = when {
    b >= 1_000_000 -> String.format(Locale.ENGLISH, "%.1f MB", b / 1_000_000.0)
    b >= 1000 -> "${b / 1000} KB"
    else -> "$b bytes"
}
