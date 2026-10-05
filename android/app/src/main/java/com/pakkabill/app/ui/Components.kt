package com.pakkabill.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/* Building blocks of the Account screen, in the website's style. */

/** A sheet with a heading (and something on the right). */
@Composable
fun SectionCard(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    action: (@Composable RowScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Sheet(modifier) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                H2(title, size = 18.sp)
                if (subtitle != null) Small(subtitle)
            }
            if (action != null) action()
        }
        Spacer(Modifier.height(10.dp))
        content()
    }
}

enum class Tone { INFO, WARN, BAD }

@Composable
fun NoteCard(text: String, tone: Tone = Tone.INFO, action: String? = null, onAction: () -> Unit = {}) {
    Note(when (tone) { Tone.INFO -> NoteKind.INFO; Tone.WARN -> NoteKind.WARN; Tone.BAD -> NoteKind.BAD }) {
        NoteText(text)
        if (action != null) Btn(action, onAction, small = true)
    }
}

/** A row in a settings list. */
@Composable
fun MenuRow(icon: ImageVector, title: String, subtitle: String? = null, tint: Color = Color.Unspecified, trailing: (@Composable () -> Unit)? = null, onClick: (() -> Unit)? = null) {
    val h = LocalHues.current
    Row(
        Modifier.fillMaxWidth().clip(androidx.compose.foundation.shape.RoundedCornerShape(6.dp)).let { if (onClick != null) it.clickable(onClick = onClick) else it }.padding(horizontal = 2.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = if (tint == Color.Unspecified) h.ink3 else tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            Txt(title, color = if (tint == Color.Unspecified) h.ink else tint, weight = FontWeight.SemiBold)
            if (subtitle != null) Small(subtitle)
        }
        if (trailing != null) trailing()
    }
}
