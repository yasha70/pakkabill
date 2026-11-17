package com.pakkabill.app.ui.tools

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.labels.CropController
import com.pakkabill.app.labels.CropFile
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.ui.Btn
import com.pakkabill.app.ui.BtnKind
import com.pakkabill.app.ui.Check
import com.pakkabill.app.ui.Field
import com.pakkabill.app.ui.H2
import com.pakkabill.app.ui.LocalHues
import com.pakkabill.app.ui.Note
import com.pakkabill.app.ui.NoteKind
import com.pakkabill.app.ui.NoteText
import com.pakkabill.app.ui.PbIcons
import com.pakkabill.app.ui.Seg
import com.pakkabill.app.ui.Sheet
import com.pakkabill.app.ui.SheetH
import com.pakkabill.app.ui.Small
import com.pakkabill.app.ui.Txt
import com.pakkabill.app.ui.block
import kotlinx.coroutines.launch

/**
 * Label cropper (the website's #/crop): makes every label page exactly 4 x 4 or 4 x 6 inch, or just
 * cuts the empty white space under the label, so each label prints on one label of a thermal printer.
 */
fun LazyListScope.cropTab(ctl: CropController) {
    block("crop-top") { CropTop(ctl) }
    block("crop-files") { CropFiles(ctl) }
}

@Composable
private fun CropTop(ctl: CropController) {
    val h = LocalHues.current
    val platform = LocalPlatform.current
    val o by ctl.opts.collectAsState()
    val fixed = o.size != "any"
    Sheet {
        Small("Free · your files stay on your phone")
        H2("Label cropper")
        Spacer(Modifier.height(6.dp))
        Txt("Makes every label page exactly 4×4 or 4×6 inch (or just cuts the empty white space), so each label prints on one label of your thermal printer. Text and barcodes stay sharp.", size = 15.sp)
        Spacer(Modifier.height(12.dp))
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).border(1.5.dp, h.rule2, RoundedCornerShape(12.dp)).background(h.carbonTint)
                .clickable { platform.pickFor("crop", arrayOf("application/pdf")) }.padding(vertical = 18.dp, horizontal = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(PbIcons.Upload, null, tint = h.carbon, modifier = Modifier.size(28.dp))
            Spacer(Modifier.height(6.dp))
            Txt("Choose label PDFs", weight = FontWeight.SemiBold, color = h.carbon)
            Small("Many files at once is fine.")
        }
        Spacer(Modifier.height(14.dp))
        Field("Label size") {
            Seg(listOf("4x4" to "4 × 4 inch", "4x6" to "4 × 6 inch", "any" to "Any size"), o.size, { ctl.setOpts(o.copy(size = it)) })
            Small(if (fixed) "Exact size" else "Only cut empty space")
        }
        Spacer(Modifier.height(10.dp))
        Field(if (fixed) "Margin" else "Space kept") {
            Seg(
                (if (fixed) listOf(0, 4, 8, 14, 20) else listOf(0, 4, 8, 16, 28, 40)).map { "$it" to "$it pt" },
                "${o.gap}", { ctl.setOpts(o.copy(gap = it.toInt())) }, raw = true,
            )
        }
        Spacer(Modifier.height(10.dp))
        if (!fixed) { Check(o.all, { ctl.setOpts(o.copy(all = it)) }, "Also cut top and sides"); Spacer(Modifier.height(8.dp)) }
        Check(o.inv, { ctl.setOpts(o.copy(inv = it)) }, "Leave out the invoice (label only)")
        if (fixed) {
            Spacer(Modifier.height(10.dp))
            Note(NoteKind.INFO) {
                NoteText("Every page comes out exactly ${o.size.replace("x", " × ")} inch, so each label prints on one label. In the print window choose this paper size, Actual size (100%, not “Fit”) and no margins.", raw = true)
            }
        }
    }
}

@Composable
private fun CropFiles(ctl: CropController) {
    val platform = LocalPlatform.current
    val scope = rememberCoroutineScope()
    val files by ctl.files.collectAsState()
    if (files.isEmpty()) {
        Sheet {
            listOf(
                "Download the labels PDF from Meesho (or any courier).",
                "Choose it above. Each page is checked and cut just under the label.",
                "Save or share the cropped PDF and print it.",
            ).forEachIndexed { i, s ->
                Row(Modifier.padding(vertical = 4.dp)) {
                    Txt("${i + 1}.", weight = FontWeight.SemiBold, modifier = Modifier.width(24.dp), raw = true)
                    Txt(s, size = 15.sp)
                }
            }
        }
        return
    }
    val done = files.count { it.status == "done" }
    Sheet {
        SheetH("Your files", right = { Btn("Clear", { ctl.clear() }, kind = BtnKind.LINK, small = true) })
        files.forEachIndexed { i, f ->
            if (i > 0) Box(Modifier.fillMaxWidth().padding(vertical = 12.dp).height(1.dp).background(LocalHues.current.ruleSoft))
            FileRow(f, ctl)
        }
        if (done > 1) {
            Spacer(Modifier.height(14.dp))
            Btn("All in one PDF", { scope.launch { ctl.allInOne()?.let { platform.saveFile(it.name, it.mime, it.bytes) } } }, Modifier.fillMaxWidth())
        }
    }
}

private fun kb(n: Int) = if (n >= 1048576) String.format(java.util.Locale.ENGLISH, "%.1f MB", n / 1048576.0) else "${maxOf(1, Math.round(n / 1024.0))} KB"

@Composable
private fun FileRow(f: CropFile, ctl: CropController) {
    val h = LocalHues.current
    val platform = LocalPlatform.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Txt(f.name, weight = FontWeight.SemiBold, raw = true, maxLines = 1, size = 15.sp)
            val out = f.out
            when {
                out != null -> Small(
                    (if (f.pages == 1) "1 page" else "${f.pages} pages") + " · " + when {
                        f.size != "any" -> "every page exactly ${f.size.replace("x", " × ")} inch"
                        f.cut > 0 -> "${f.cut} cropped" + if (f.saved > 0) ", ${f.saved}% smaller" else ""
                        else -> "nothing to cut"
                    } + " · " + kb(out.bytes.size),
                    raw = true,
                )
                f.status == "err" -> Small(f.msg, color = h.neg)
                else -> Small(f.msg, raw = true)
            }
        }
        Box(Modifier.size(36.dp).clip(CircleShape).clickable { ctl.remove(f.id) }, contentAlignment = Alignment.Center) {
            Icon(PbIcons.Close, "Remove", tint = h.ink3, modifier = Modifier.size(18.dp))
        }
    }
    val out = f.out ?: return
    Spacer(Modifier.height(8.dp))
    PdfThumbs(out, max = 8)
    Spacer(Modifier.height(10.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Btn("Save", { platform.saveFile(out.name, out.mime, out.bytes) }, Modifier.weight(1f), kind = BtnKind.PRI)
        Btn("Share", { platform.shareFile(out.name, out.mime, out.bytes) }, Modifier.weight(1f), kind = BtnKind.WA)
        Btn("Print", { platform.printPdf(out.name, out.bytes) }, Modifier.weight(1f))
    }
}
