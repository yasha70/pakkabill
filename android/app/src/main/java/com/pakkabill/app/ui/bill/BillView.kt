package com.pakkabill.app.ui.bill

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.bill.BillPdf
import com.pakkabill.app.platform.SystemBack
import com.pakkabill.app.ui.Btn
import com.pakkabill.app.ui.BtnKind
import com.pakkabill.app.ui.LocalHues
import com.pakkabill.app.ui.PbIcons
import com.pakkabill.app.ui.Small
import com.pakkabill.app.ui.Tag
import com.pakkabill.app.ui.TagKind
import com.pakkabill.app.ui.Txt
import com.pakkabill.core.bill.Invoice
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** What can be done with a saved bill. */
class BillViewActs(
    val whatsapp: (Invoice, ByteArray) -> Unit,
    val save: (Invoice, ByteArray) -> Unit,
    val print: (Invoice, ByteArray) -> Unit,
    val setPaid: (Invoice, Boolean) -> Unit,
    val edit: (Invoice) -> Unit,
    val copy: (Invoice, String) -> Unit,
    val delete: (Invoice) -> Unit,
)

/** File name of a bill's PDF: "INV-26-27-0007 Ravi Traders.pdf" */
fun pdfName(b: Invoice) = (b.number.replace('/', '-') + " " + b.buyer.name.trim()).trim().take(80) + ".pdf"

/** A saved bill: the PDF as it will look, and the buttons to send, print or change it. */
@Composable
fun BillView(bill: Invoice, acts: BillViewActs, onClose: () -> Unit) {
    val h = LocalHues.current
    val ctx = LocalContext.current
    SystemBack(onBack = onClose)
    var pdf by remember { mutableStateOf<ByteArray?>(null) }
    var pages by remember { mutableStateOf<List<ImageBitmap>>(emptyList()) }
    var sure by remember { mutableStateOf(false) }
    LaunchedEffect(bill) {
        val r = withContext(Dispatchers.Default) {
            runCatching {
                val bytes = BillPdf.build(bill)
                bytes to render(ctx.cacheDir, bytes)
            }.getOrNull()
        }
        pdf = r?.first
        pages = r?.second.orEmpty()
    }

    Column(Modifier.fillMaxSize().background(h.paper)) {
        Row(
            Modifier.fillMaxWidth().background(h.spine).drawBehind { drawRect(h.rule, Offset(0f, size.height - 1.dp.toPx()), Size(size.width, 1.dp.toPx())) }
                .windowInsetsPadding(WindowInsets.statusBars).height(56.dp).padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(44.dp).clip(CircleShape).clickable(onClick = onClose), contentAlignment = Alignment.Center) { Icon(PbIcons.Back, "Back", tint = h.ink, modifier = Modifier.size(22.dp)) }
            Column(Modifier.weight(1f)) {
                Txt(bill.number, weight = FontWeight.SemiBold, head = true, size = 17.sp, raw = true, maxLines = 1)
                Small(bill.buyer.name.ifBlank { "Cash sale" } + " · " + BillPdf.fdate(bill.date), raw = true)
            }
            Box(Modifier.padding(end = 8.dp)) {
                when {
                    bill.isEstimate -> Tag("Estimate")
                    bill.paid -> Tag("Paid", TagKind.GOOD)
                    else -> Tag("Unpaid", TagKind.BAD)
                }
            }
        }

        Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (pages.isEmpty()) {
                Box(Modifier.fillMaxWidth().aspectRatio(595f / 842f).clip(RoundedCornerShape(4.dp)).background(h.sheet).border(1.dp, h.rule, RoundedCornerShape(4.dp)), contentAlignment = Alignment.Center) {
                    Small("Making the bill…")
                }
            } else pages.forEach { p ->
                Image(p, "Bill page", Modifier.fillMaxWidth().aspectRatio(p.width.toFloat() / p.height).clip(RoundedCornerShape(4.dp)).border(1.dp, h.rule, RoundedCornerShape(4.dp)))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn("Change", { acts.edit(bill) }, Modifier.weight(1f))
                Btn("Make a copy", { acts.copy(bill, bill.docType) }, Modifier.weight(1f))
            }
            if (bill.isEstimate) Btn("Turn into a tax invoice", { acts.copy(bill, "invoice") }, Modifier.fillMaxWidth())
            Btn(if (sure) "Tap again to delete this bill" else "Delete bill", { if (sure) acts.delete(bill) else sure = true }, Modifier.fillMaxWidth(), kind = BtnKind.DANGER)
        }

        Column(
            Modifier.fillMaxWidth().background(h.sheet).drawBehind { drawRect(h.rule, size = Size(size.width, 1.dp.toPx())) }
                .windowInsetsPadding(WindowInsets.navigationBars).padding(horizontal = 14.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val p = pdf
            Btn("Send on WhatsApp", { p?.let { acts.whatsapp(bill, it) } }, Modifier.fillMaxWidth(), kind = BtnKind.WA, enabled = p != null)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn("PDF", { p?.let { acts.save(bill, it) } }, Modifier.weight(1f), enabled = p != null)
                Btn("Print", { p?.let { acts.print(bill, it) } }, Modifier.weight(1f), enabled = p != null)
                if (!bill.isEstimate) Btn(if (bill.paid) "Unpaid" else "Paid ✓", { acts.setPaid(bill, !bill.paid) }, Modifier.weight(1f), kind = if (bill.paid) BtnKind.NORMAL else BtnKind.PRI)
            }
        }
    }
}

/** Draws each page of the PDF as a picture (Android's own PDF renderer), for the preview. */
private fun render(cache: File, bytes: ByteArray): List<ImageBitmap> {
    val f = File(cache, "bill-preview.pdf")
    f.writeBytes(bytes)
    return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
        PdfRenderer(fd).use { r ->
            (0 until r.pageCount).map { i ->
                r.openPage(i).use { page ->
                    val scale = 2.2f
                    val bmp = Bitmap.createBitmap((page.width * scale).toInt(), (page.height * scale).toInt(), Bitmap.Config.ARGB_8888)
                    bmp.eraseColor(android.graphics.Color.WHITE)
                    page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    bmp.asImageBitmap()
                }
            }
        }
    }.also { f.delete() }
}
