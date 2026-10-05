package com.pakkabill.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/* The website's building blocks (pnl.html CSS) as Compose: sheet, sheet-h, btn, seg, select,
   inp, note, details.more, kv, table.t, chips, tags. Text goes through t() for Hindi. */

@Composable fun t(s: String): String = LocalTr.current(s)

/* ---------------- money and dates, like the website (E.money, E.fmtDate) ---------------- */

private fun grp(r: String): String {
    if (r.length <= 3) return r
    val last3 = r.takeLast(3)
    return r.dropLast(3).reversed().chunked(2).joinToString(",").reversed() + "," + last3
}
/** 1,31,328.00 ; with paren: (15,587.00) for minus ; sym adds ₹ */
fun money(p: Long, sym: Boolean = false, noPaise: Boolean = false, paren: Boolean = false): String {
    val neg = p < 0
    val a = kotlin.math.abs(p)
    var s = grp((a / 100).toString()) + if (noPaise) "" else "." + (a % 100).toString().padStart(2, '0')
    if (sym) s = "₹$s"
    if (!neg) return s
    return if (paren) "($s)" else "-$s"
}
fun mny(p: Long) = money(p, paren = true)
fun rs(p: Long, np: Boolean = false) = money(if (np) Math.round(p / 100.0) * 100 else p, sym = true, noPaise = np)
fun pct(x: Double) = String.format(java.util.Locale.ENGLISH, "%.1f%%", x * 100)
fun pct0(x: Double): String { val v = x * 100; return if (v >= 10 || v == 0.0) "${Math.round(v)}%" else String.format(java.util.Locale.ENGLISH, "%.1f%%", v) }
fun pl(n: Int, w: String) = "$n $w" + if (n == 1) "" else "s"
private val MON = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
/** "2026-09-23" -> "23 Sep 2026" */
fun fd(d: String?): String {
    if (d.isNullOrBlank()) return ""
    val p = d.split('-')
    if (p.size != 3) return d
    return "${p[2].toIntOrNull() ?: p[2]} ${MON.getOrElse((p[1].toIntOrNull() ?: 1) - 1) { p[1] }} ${p[0]}"
}
/** "2026-09" -> "Sep 2026" */
fun fmtMonth(m: String): String { val p = m.split('-'); return if (p.size >= 2) "${MON.getOrElse((p[1].toIntOrNull() ?: 1) - 1) { p[1] }} ${p[0]}" else m }

/* ---------------- text ---------------- */

@Composable
fun Txt(
    s: String, modifier: Modifier = Modifier, size: TextUnit = 16.sp, weight: FontWeight? = null, color: Color = Color.Unspecified,
    head: Boolean = false, align: TextAlign? = null, maxLines: Int = Int.MAX_VALUE, lineHeight: TextUnit = TextUnit.Unspecified, raw: Boolean = false, upper: Boolean = false,
) {
    val h = LocalHues.current
    val f = LocalFonts.current
    val text = (if (raw) s else t(s)).let { if (upper) it.uppercase() else it }
    Text(
        text, modifier,
        style = TextStyle(
            fontFamily = if (head) f.head else f.body, fontSize = size, fontWeight = weight, color = if (color == Color.Unspecified) h.ink else color,
            lineHeight = if (lineHeight == TextUnit.Unspecified) size * (if (LocalLang.current == "hi") 1.6f else 1.45f) else lineHeight,
            fontFeatureSettings = "tnum", textAlign = align ?: TextAlign.Unspecified,
        ),
        maxLines = maxLines, overflow = if (maxLines == Int.MAX_VALUE) TextOverflow.Clip else TextOverflow.Ellipsis,
    )
}
@Composable fun H2(s: String, modifier: Modifier = Modifier, size: TextUnit = 20.8.sp) = Txt(s, modifier, size = size, weight = FontWeight.SemiBold, head = true, lineHeight = size * 1.2f)
@Composable fun H3(s: String, modifier: Modifier = Modifier) = Txt(s, modifier, size = 16.8.sp, weight = FontWeight.SemiBold, head = true, lineHeight = 20.sp)
@Composable fun Small(s: String, modifier: Modifier = Modifier, color: Color = LocalHues.current.ink3, raw: Boolean = false, weight: FontWeight? = null) =
    Txt(s, modifier, size = 14.sp, color = color, raw = raw, weight = weight)
@Composable fun Muted(s: String, modifier: Modifier = Modifier, raw: Boolean = false) = Txt(s, modifier, color = LocalHues.current.ink3, raw = raw)

/* ---------------- containers ---------------- */

/** .sheet: white panel, 1px rule border, 3px corners */
@Composable
fun Sheet(modifier: Modifier = Modifier, padding: Dp = 16.dp, content: @Composable ColumnScope.() -> Unit) {
    val h = LocalHues.current
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(3.dp)).background(h.sheet).border(1.dp, h.rule, RoundedCornerShape(3.dp)).padding(padding),
        content = content,
    )
}

/** .sheet-h: a heading with something on the right */
@Composable
fun SheetH(title: String, right: (@Composable RowScope.() -> Unit)? = null, h3: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) { if (h3) H3(title) else H2(title) }
        if (right != null) right()
    }
}

enum class NoteKind { WARN, INFO, BAD }

/** .note: callout with a coloured left edge */
@Composable
fun Note(kind: NoteKind = NoteKind.WARN, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val h = LocalHues.current
    val edge = when (kind) { NoteKind.WARN -> h.warn; NoteKind.INFO -> h.carbon; NoteKind.BAD -> h.neg }
    val bg = if (kind == NoteKind.INFO) h.carbonSoft else h.warnBg
    Column(
        modifier.fillMaxWidth().clip(RoundedCornerShape(topEnd = 6.dp, bottomEnd = 6.dp)).background(bg)
            .drawBehind { drawRect(edge, size = androidx.compose.ui.geometry.Size(3.dp.toPx(), size.height)) }
            .padding(start = 15.dp, end = 12.dp, top = 10.dp, bottom = 10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp), content = content,
    )
}
@Composable fun NoteText(s: String, raw: Boolean = false) = Txt(s, size = 14.9.sp, raw = raw)

/** The bar on every tab while sample data is open. */
@Composable
fun DemoBar(sample: Boolean, close: () -> Unit) {
    if (!sample) return
    Note(NoteKind.INFO) {
        NoteText("You are looking at sample data for a blouse and track pant store. Nothing here is saved.")
        Btn("Close sample", close, small = true)
    }
}

/* ---------------- controls ---------------- */

enum class BtnKind { NORMAL, PRI, DANGER, LINK, WA }

/** .btn (.pri .sm .link .danger .wa) */
@Composable
fun Btn(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, kind: BtnKind = BtnKind.NORMAL, small: Boolean = false, enabled: Boolean = true, raw: Boolean = false) {
    val h = LocalHues.current
    if (kind == BtnKind.LINK) {
        Txt(
            text, modifier.clickable(enabled = enabled, onClick = onClick).padding(vertical = 4.dp, horizontal = 2.dp),
            color = h.carbon, weight = FontWeight.SemiBold, raw = raw, size = if (small) 14.sp else 16.sp,
        )
        return
    }
    val (bg, fg, border) = when (kind) {
        BtnKind.PRI -> Triple(h.carbon, h.carbonInk, h.carbon)
        BtnKind.WA -> Triple(Color(0xFF1FAA59), Color.White, Color(0xFF1FAA59))
        BtnKind.DANGER -> Triple(h.sheet, h.neg, h.rule2)
        else -> Triple(h.sheet, h.ink, h.rule2)
    }
    Box(
        modifier.defaultMinSize(minHeight = if (small) 34.dp else 42.dp).clip(RoundedCornerShape(6.dp)).background(bg).border(1.dp, border, RoundedCornerShape(6.dp))
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = if (small) 10.dp else 16.dp, vertical = if (small) 4.dp else 8.dp)
            .let { if (enabled) it else it.background(h.sheet.copy(alpha = 0.45f)) },
        contentAlignment = Alignment.Center,
    ) {
        Txt(text, color = fg, weight = FontWeight.SemiBold, size = if (small) 14.sp else 16.sp, raw = raw, align = TextAlign.Center)
    }
}

/** .seg: joined buttons, the chosen one filled */
@Composable
fun Seg(options: List<Pair<String, String>>, value: String, onPick: (String) -> Unit, modifier: Modifier = Modifier, raw: Boolean = false) {
    val h = LocalHues.current
    Row(modifier.height(IntrinsicSize.Min).clip(RoundedCornerShape(6.dp)).border(1.dp, h.rule2, RoundedCornerShape(6.dp))) {
        options.forEachIndexed { i, (v, l) ->
            if (i > 0) Box(Modifier.width(1.dp).fillMaxHeight().background(h.rule2))
            val on = v == value
            Box(
                Modifier.background(if (on) h.carbon else h.sheet).clickable { onPick(v) }.heightIn(min = 40.dp).padding(horizontal = 12.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) { Txt(l, color = if (on) h.carbonInk else h.ink2, weight = FontWeight.SemiBold, size = 14.4.sp, raw = raw, maxLines = 1) }
        }
    }
}

/** label.f: a small bold label above a control */
@Composable
fun Field(label: String, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Txt(label, size = 14.sp, color = LocalHues.current.ink2, weight = FontWeight.SemiBold)
        content()
    }
}

/** select.inp: a box that opens the choices */
@Composable
fun Select(options: List<Pair<String, String>>, value: String, onPick: (String) -> Unit, modifier: Modifier = Modifier, raw: Boolean = false, small: Boolean = false, dashed: Boolean = false) {
    val h = LocalHues.current
    var open by remember { mutableStateOf(false) }
    val label = options.firstOrNull { it.first == value }?.second ?: options.firstOrNull()?.second ?: ""
    Box(modifier) {
        Row(
            Modifier.fillMaxWidth().defaultMinSize(minHeight = if (small) 34.dp else 42.dp).clip(RoundedCornerShape(6.dp)).background(h.sheet)
                .border(1.dp, if (dashed) h.rule2.copy(alpha = 0.6f) else h.rule2, RoundedCornerShape(6.dp)).clickable { open = true }
                .padding(horizontal = 10.dp, vertical = if (small) 4.dp else 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.weight(1f)) { Txt(label, size = if (small) 14.sp else 16.sp, raw = raw, maxLines = 1) }
            Txt("⌄", color = h.ink3, raw = true, size = 16.sp)
        }
        DropdownMenu(open, onDismissRequest = { open = false }, modifier = Modifier.background(h.sheet)) {
            options.forEach { (v, l) ->
                DropdownMenuItem(
                    text = { Txt(l, raw = raw, weight = if (v == value) FontWeight.SemiBold else null, color = if (v == value) h.carbon else h.ink) },
                    onClick = { open = false; onPick(v) },
                )
            }
        }
    }
}

/**
 * input.inp: saves when the seller is done (keyboard Done or leaving the box), like the website's
 * change event. [money] puts the number on the right.
 */
@Composable
fun Inp(
    value: String, onCommit: (String) -> Unit, modifier: Modifier = Modifier, placeholder: String = "", money: Boolean = false,
    keyboard: KeyboardType = KeyboardType.Text, small: Boolean = false, onChange: ((String) -> Unit)? = null, rawPlaceholder: Boolean = false, singleLine: Boolean = true, minLines: Int = 1,
) {
    val h = LocalHues.current
    val f = LocalFonts.current
    var text by remember(value) { mutableStateOf(value) }
    var focused by remember { mutableStateOf(false) }
    val style = TextStyle(fontFamily = f.body, fontSize = if (small) 15.sp else 16.sp, color = h.ink, textAlign = if (money) TextAlign.End else TextAlign.Start, fontFeatureSettings = "tnum")
    BasicTextField(
        text, { text = it; onChange?.invoke(it) },
        modifier.fillMaxWidth().onFocusChanged { s -> if (focused && !s.isFocused && text != value) onCommit(text); focused = s.isFocused },
        textStyle = style, singleLine = singleLine, minLines = minLines, cursorBrush = SolidColor(h.carbon),
        keyboardOptions = KeyboardOptions(keyboardType = keyboard, imeAction = if (singleLine) ImeAction.Done else ImeAction.Default),
        keyboardActions = KeyboardActions(onDone = { if (text != value) onCommit(text) }),
        decorationBox = { inner ->
            Box(
                Modifier.fillMaxWidth().defaultMinSize(minHeight = if (small) 38.dp else 42.dp).clip(RoundedCornerShape(6.dp)).background(h.sheet)
                    .border(if (focused) 2.dp else 1.dp, if (focused) Color(0xFF5A61E6) else h.rule2, RoundedCornerShape(6.dp))
                    .padding(horizontal = if (small) 8.dp else 10.dp, vertical = 8.dp),
                contentAlignment = if (money) Alignment.CenterEnd else Alignment.CenterStart,
            ) {
                if (text.isEmpty() && placeholder.isNotEmpty()) Txt(placeholder, color = h.ink3, size = style.fontSize, raw = rawPlaceholder, align = style.textAlign, modifier = Modifier.fillMaxWidth())
                inner()
            }
        },
    )
}

/** .check: a checkbox with text and a grey line under it */
@Composable
fun Check(checked: Boolean, onChange: (Boolean) -> Unit, text: String, sub: String? = null) {
    val h = LocalHues.current
    Row(Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(vertical = 2.dp), verticalAlignment = Alignment.Top) {
        Box(
            Modifier.padding(top = 2.dp).size(20.dp).clip(RoundedCornerShape(4.dp)).background(if (checked) h.carbon else h.sheet)
                .border(1.5.dp, if (checked) h.carbon else h.rule2, RoundedCornerShape(4.dp)),
            contentAlignment = Alignment.Center,
        ) { if (checked) Txt("✓", color = h.carbonInk, size = 13.sp, weight = FontWeight.Bold, raw = true) }
        Spacer(Modifier.width(10.dp))
        Column {
            Txt(text, size = 15.2.sp)
            if (sub != null) Small(sub)
        }
    }
}

/** details.more: a sheet that opens and closes, with + and − */
@Composable
fun Details(title: String, key: String, open: Boolean = false, modifier: Modifier = Modifier, bare: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    val h = LocalHues.current
    var isOpen by rememberSaveable(key) { mutableStateOf(open) }
    val body: @Composable ColumnScope.() -> Unit = {
        Row(Modifier.fillMaxWidth().clickable { isOpen = !isOpen }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                if (bare) Txt(title, weight = FontWeight.SemiBold) else Txt(title, weight = FontWeight.SemiBold, head = true, size = 17.sp)
            }
            Txt(if (isOpen) "−" else "+", color = h.ink3, size = 21.sp, raw = true)
        }
        AnimatedVisibility(isOpen, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
            Column(Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(0.dp), content = content)
        }
    }
    if (bare) Column(modifier.fillMaxWidth().padding(top = 12.dp), content = body) else Sheet(modifier, content = body)
}

/** .kv: label and value pairs; a bold row gets a line above */
class KvRow(val label: String, val value: Long? = null, val text: String? = null, val bold: Boolean = false, val raw: Boolean = false)
@Composable
fun Kv(rows: List<KvRow>) {
    val h = LocalHues.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        rows.forEach { r ->
            Row(
                Modifier.fillMaxWidth().let { if (r.bold) it.drawBehind { drawLine(h.rule2, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(top = 4.dp) else it },
                verticalAlignment = Alignment.Top,
            ) {
                Box(Modifier.weight(1f).padding(end = 12.dp)) { Txt(r.label, size = 14.9.sp, weight = if (r.bold) FontWeight.Bold else null, raw = r.raw) }
                if (r.value != null) Txt(mny(r.value), size = 14.9.sp, weight = if (r.bold) FontWeight.Bold else null, color = if (r.value < 0) h.neg else h.ink, raw = true)
                else Txt(r.text ?: "", size = 14.9.sp, weight = if (r.bold) FontWeight.Bold else null, raw = r.raw, align = TextAlign.End)
            }
        }
    }
}

/** table.t inside .tw: columns with set widths, scrolls sideways on a phone */
class Col(val label: String, val width: Dp, val num: Boolean = true)
class Cell(val text: String, val color: Color = Color.Unspecified, val bold: Boolean = false, val sub: String? = null, val raw: Boolean = true)
@Composable
fun Table(cols: List<Col>, rows: List<List<Cell>>, totals: List<List<Cell>> = emptyList()) {
    val h = LocalHues.current
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(3.dp)).border(1.dp, h.rule, RoundedCornerShape(3.dp)).background(h.sheet).horizontalScroll(rememberScrollState())) {
        Column {
            Row(Modifier.background(h.paper)) {
                cols.forEach { c ->
                    Box(Modifier.width(c.width).padding(horizontal = 10.dp, vertical = 8.dp), contentAlignment = if (c.num) Alignment.CenterEnd else Alignment.CenterStart) {
                        Txt(c.label, size = 13.sp, weight = FontWeight.SemiBold, color = h.ink2, maxLines = 2, align = if (c.num) TextAlign.End else TextAlign.Start)
                    }
                }
            }
            (rows.map { it to false } + totals.map { it to true }).forEach { (r, tot) ->
                Box(Modifier.height(1.dp).width(cols.sumOf { it.width.value.toDouble() }.dp).background(if (tot) h.rule2 else h.rule))
                Row {
                    r.forEachIndexed { i, cell ->
                        val c = cols[i]
                        Column(Modifier.width(c.width).padding(horizontal = 10.dp, vertical = 8.dp), horizontalAlignment = if (c.num) Alignment.End else Alignment.Start) {
                            Txt(
                                cell.text, size = 14.4.sp, color = cell.color, weight = if (cell.bold || tot) FontWeight.Bold else null, raw = cell.raw,
                                align = if (c.num) TextAlign.End else TextAlign.Start,
                            )
                            if (cell.sub != null) Small(cell.sub, raw = true)
                        }
                    }
                }
            }
        }
    }
}

/** .chip: rounded filter with a count; .alert is red until chosen */
@Composable
fun Chip(text: String, count: Int?, on: Boolean, alert: Boolean = false, onClick: () -> Unit) {
    val h = LocalHues.current
    val border = if (on) h.carbon else if (alert) h.margin else h.rule2
    Row(
        Modifier.clip(CircleShape).background(if (on) h.carbon else h.sheet).border(1.dp, border, CircleShape).clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Txt(text, size = 14.sp, weight = FontWeight.SemiBold, color = if (on) h.carbonInk else if (alert) h.neg else h.ink2, maxLines = 1)
        if (count != null) Txt(" $count", size = 14.sp, weight = FontWeight.SemiBold, color = if (on) h.carbonInk.copy(alpha = 0.85f) else h.ink3, raw = true)
    }
}

enum class TagKind { PLAIN, BAD, GOOD }
@Composable
fun Tag(text: String, kind: TagKind = TagKind.PLAIN, raw: Boolean = false) {
    val h = LocalHues.current
    val m = Modifier.clip(CircleShape).let {
        when (kind) {
            TagKind.PLAIN -> it.background(h.carbonSoft)
            TagKind.BAD -> it.border(1.dp, h.margin, CircleShape)
            TagKind.GOOD -> it.border(1.dp, h.pos, CircleShape)
        }
    }.padding(horizontal = 8.dp, vertical = 1.dp)
    Box(m) { Txt(text, size = 12.5.sp, weight = FontWeight.SemiBold, color = when (kind) { TagKind.BAD -> h.neg; TagKind.GOOD -> h.pos; else -> h.ink2 }, raw = raw) }
}

/** A thin progress bar (.rv-bar, .g-prog). */
@Composable
fun Bar(fraction: Float, color: Color, modifier: Modifier = Modifier, height: Dp = 6.dp) {
    val h = LocalHues.current
    Box(modifier.fillMaxWidth().height(height).clip(CircleShape).background(h.paper)) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).fillMaxHeight().clip(CircleShape).background(color))
    }
}

/** A list of things done with ticks, used under next steps. */
@Composable
fun Doneline(text: String) {
    val h = LocalHues.current
    Row(Modifier.clip(CircleShape).background(h.pos.copy(alpha = 0.1f)).padding(start = 6.dp, end = 10.dp, top = 3.dp, bottom = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(16.dp).clip(CircleShape).background(h.pos), contentAlignment = Alignment.Center) { Txt("✓", size = 10.sp, color = Color.White, weight = FontWeight.ExtraBold, raw = true) }
        Spacer(Modifier.width(5.dp))
        Txt(text, size = 12.8.sp, weight = FontWeight.SemiBold, color = h.pos)
    }
}

/** Keep a small gap between stacked blocks (.stack > * + *). */
val Gap = 14.dp
