package com.pakkabill.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.pnl.PnlUi
import com.pakkabill.core.Guide
import kotlinx.coroutines.delay

/** "How to use": the website's 10 steps with pictures; Play reads them aloud one after another. */
@Composable
fun GuideTab(guide: Guide?, ui: PnlUi, lang: String, setLang: (String) -> Unit, go: Go) {
    val h = LocalHues.current
    val platform = LocalPlatform.current
    if (guide == null || guide.steps.isEmpty()) { Sheet { Small("Getting the guide ready…") }; return }
    val u = guide.ui[lang] ?: guide.ui["en"].orEmpty()
    var i by rememberSaveable { mutableIntStateOf(0) }
    var playing by remember { mutableStateOf(false) }
    var tick by remember { mutableIntStateOf(0) } // a step finished speaking
    val n = guide.steps.size
    val step = guide.steps[i.coerceIn(0, n - 1)]
    val (title, body) = if (lang == "hi") step.hi else step.en

    DisposableEffect(Unit) { onDispose { platform.stopSpeaking() } }
    LaunchedEffect(playing, i, lang) {
        if (!playing) { platform.stopSpeaking(); return@LaunchedEffect }
        val spoke = platform.speak("$title. $body", lang == "hi") { tick++ }
        if (!spoke) { delay(maxOf(6000L, body.length * 55L)); tick++ }
    }
    LaunchedEffect(tick) {
        if (tick == 0 || !playing) return@LaunchedEffect
        delay(900)
        if (i >= n - 1) playing = false else i++
    }

    Sheet {
        Txt(u["title"] ?: "How to use Meesho P&L", size = 20.8.sp, weight = FontWeight.SemiBold, head = true, raw = true)
        Txt(u["sub"] ?: "", color = h.ink3, raw = true, modifier = Modifier.padding(top = 2.dp))
        Spacer(Modifier.height(10.dp))
        Seg(listOf("en" to "English", "hi" to "हिंदी"), lang, { platform.stopSpeaking(); setLang(it) }, raw = true)
    }
    Sheet {
        val svg = guide.art[step.art]
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val px = with(LocalDensity.current) { maxWidth.roundToPx() }
            val img = remember(svg, px) { svg?.let { platform.svg(it, px) } }
            Box(Modifier.fillMaxWidth().aspectRatio(320f / 170f).clip(RoundedCornerShape(12.dp)).background(h.paper), contentAlignment = Alignment.Center) {
                if (img != null) Image(img, contentDescription = title, modifier = Modifier.fillMaxWidth())
            }
        }
        Spacer(Modifier.height(14.dp))
        Txt("${i + 1} ${u["of"] ?: "of"} $n", size = 12.5.sp, weight = FontWeight.Bold, color = h.carbon, raw = true, upper = true)
        Txt(title, size = 19.2.sp, weight = FontWeight.SemiBold, head = true, raw = true, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
        Txt(body, raw = true, lineHeight = 25.sp)
        Spacer(Modifier.height(14.dp))
        Box(Modifier.fillMaxWidth().height(5.dp).clip(CircleShape).background(h.rule)) {
            Box(Modifier.fillMaxWidth((i + 1f) / n).height(5.dp).clip(CircleShape).background(Brush.horizontalGradient(listOf(Color(0xFF2B3494), Color(0xFF5B3FE6), Color(0xFFFF7A59)))))
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
            Btn(u["prev"] ?: "‹ Back", { playing = false; if (i > 0) i-- }, small = true, enabled = i > 0, raw = true)
            Btn(if (playing) u["pause"] ?: "⏸ Pause" else u["play"] ?: "▶ Play guide", { playing = !playing }, kind = BtnKind.PRI, raw = true)
            Btn(u["next"] ?: "Next ›", { playing = false; if (i < n - 1) i++ }, small = true, enabled = i < n - 1, raw = true)
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally)) {
            repeat(n) { k ->
                Box(Modifier.height(9.dp).width(if (k == i) 22.dp else 9.dp).clip(CircleShape).background(if (k == i) h.carbon else h.rule).clickable { playing = false; i = k })
            }
        }
    }
    Sheet {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Btn(u["upload"] ?: "Go to Upload", { go.tab("data") }, raw = true)
            if (!ui.hasData) Btn(u["try"] ?: "Try with sample data", go.demo, raw = true)
        }
    }
    Details(u["terms"] ?: "What each option means", "terms", open = i == n - 1) {
        guide.terms.forEach { term ->
            Txt(if (lang == "hi") term.hi else term.en, weight = FontWeight.Bold, raw = true, modifier = Modifier.padding(top = 8.dp))
            Txt(if (lang == "hi") term.hiText else term.enText, color = h.ink2, raw = true)
        }
    }
}
