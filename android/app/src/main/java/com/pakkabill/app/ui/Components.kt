package com.pakkabill.app.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pakkabill.core.Money

fun rs(paise: Long) = Money.rs(paise)
fun rsp(paise: Long) = Money.rs(paise, withPaise = true)
fun pct(x: Double) = Money.pct(x)
fun plural(n: Int, one: String, many: String = one + "s") = "$n " + if (n == 1) one else many

/** A white card with a title, used for every section of the report. */
@Composable
fun SectionCard(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    action: (@Composable RowScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth().animateContentSize(),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(horizontal = 18.dp, vertical = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleMedium)
                    if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (action != null) action()
            }
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

/** A small number with its label (Net sales, Orders ...). */
@Composable
fun StatTile(label: String, value: String, modifier: Modifier = Modifier, valueColor: Color = Color.Unspecified, hint: String? = null) {
    Surface(modifier, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceContainer) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.titleLarge.merge(TabularNums), color = valueColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (hint != null) Text(hint, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Two tiles side by side. */
@Composable
fun TileRow(content: @Composable RowScope.() -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), content = content)
}

enum class Tone { INFO, WARN, BAD }

/** A note above the report: missing costs, pending reversals ... */
@Composable
fun NoteCard(text: String, tone: Tone = Tone.INFO, action: String? = null, onAction: () -> Unit = {}) {
    val x = LocalExtra.current
    val (bg, fg, icon) = when (tone) {
        Tone.INFO -> Triple(MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.onPrimaryContainer, Icons.Outlined.Info)
        Tone.WARN -> Triple(x.warnContainer, x.warn, Icons.Outlined.WarningAmber)
        Tone.BAD -> Triple(MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer, Icons.Outlined.WarningAmber)
    }
    Surface(shape = MaterialTheme.shapes.medium, color = bg, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
            Icon(icon, null, tint = fg, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                if (action != null) TextButton(onClick = onAction, modifier = Modifier.padding(top = 2.dp)) { Text(action) }
            }
        }
    }
}

/** One line of a statement: label on the left, amount on the right. */
@Composable
fun AmountRow(label: String, paise: Long, bold: Boolean = false, big: Boolean = false, color: Color = Color.Unspecified, indent: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            label,
            style = if (big) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium,
            fontWeight = if (bold) FontWeight.SemiBold else null,
            modifier = Modifier.weight(1f).padding(start = if (indent) 8.dp else 0.dp, end = 12.dp),
        )
        Text(
            if (paise < 0) "(" + rsp(-paise) + ")" else rsp(paise),
            style = (if (big) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium).merge(TabularNums),
            fontWeight = if (bold) FontWeight.SemiBold else null,
            color = color,
        )
    }
}

@Composable
fun Divider() = HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

/** Shown instead of the full report when not logged in or not on Pro (same as the website). */
@Composable
fun LockCard(title: String, text: String, items: List<String>, button: String?, onButton: () -> Unit, footnote: String? = null) {
    Card(
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(52.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                Icon(Icons.Outlined.Lock, null, tint = MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.height(12.dp))
            Text(title, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(6.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Column(Modifier.fillMaxWidth()) {
                items.forEach { t ->
                    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Rounded.Check, null, tint = LocalExtra.current.gain, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(t, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            if (button != null) {
                Spacer(Modifier.height(16.dp))
                Button(onClick = onButton, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(button) }
            }
            if (footnote != null) {
                Spacer(Modifier.height(8.dp))
                Text(footnote, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** Bars for each month: profit above the line, loss below. Grows in when shown. */
@Composable
fun MonthBars(items: List<Pair<String, Long>>, modifier: Modifier = Modifier) {
    if (items.isEmpty()) return
    val x = LocalExtra.current
    val max = items.maxOf { kotlin.math.abs(it.second) }.coerceAtLeast(1)
    val hasNeg = items.any { it.second < 0 }
    val grow by animateFloatAsState(1f, tween(600), label = "bars")
    Row(modifier.fillMaxWidth().height(if (hasNeg) 190.dp else 160.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
        items.forEach { (label, v) ->
            Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(rs(v), style = MaterialTheme.typography.labelSmall.merge(TabularNums), maxLines = 1, overflow = TextOverflow.Clip)
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
                    if (v >= 0) Box(
                        Modifier.fillMaxWidth(0.62f).fillMaxHeight((v.toFloat() / max * grow).coerceIn(0.02f, 1f))
                            .clip(RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp)).background(x.gain),
                    )
                }
                if (hasNeg) Box(Modifier.weight(0.35f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                    if (v < 0) Box(
                        Modifier.fillMaxWidth(0.62f).fillMaxHeight((-v.toFloat() / max * grow).coerceIn(0.02f, 1f))
                            .clip(RoundedCornerShape(bottomStart = 8.dp, bottomEnd = 8.dp)).background(x.loss),
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            }
        }
    }
}

/** A thin bar that shows a share (returns, categories). */
@Composable
fun ShareBar(fraction: Float, color: Color, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHigh)) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).fillMaxHeight().clip(CircleShape).background(color))
    }
}

/** A row in a settings list. */
@Composable
fun MenuRow(icon: ImageVector, title: String, subtitle: String? = null, tint: Color = Color.Unspecified, trailing: (@Composable () -> Unit)? = null, onClick: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).let { if (onClick != null) it.clickable(onClick = onClick) else it }.padding(horizontal = 4.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = if (tint == Color.Unspecified) MaterialTheme.colorScheme.onSurfaceVariant else tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = if (tint == Color.Unspecified) MaterialTheme.colorScheme.onSurface else tint)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (trailing != null) trailing()
    }
}
