package com.pakkabill.app.ui.tools

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.ui.LocalHues
import com.pakkabill.app.ui.PbIcons
import com.pakkabill.app.ui.Small
import com.pakkabill.app.ui.Tag
import com.pakkabill.app.ui.TagKind
import com.pakkabill.app.ui.Txt
import com.pakkabill.app.ui.block

/** A tool on the Tools page: the page it opens, its name, what it does. */
class Tool(val key: String, val title: String, val sub: String, val icon: ImageVector, val badge: Int = 0)

/** The tools, grouped as on the website's menu. */
fun toolGroups(login: Boolean, pro: Boolean, issues: Int): List<Pair<String, List<Tool>>> = listOf(
    "Meesho tools" to listOf(
        Tool("pl", "Profit & Loss", "Real profit after Meesho fees, RTO and returns", PbIcons.Rupee),
        Tool("rc", "Reconcile", "Every order against Meesho's payments", PbIcons.Checks, issues),
        Tool("labels", "Labels & packing chart", "Packing chart from the manifest, labels in SKU and size order", PbIcons.Tag),
        Tool("lowship", "Low shipping image", "Main photos that show lower shipping in Meesho", PbIcons.Image),
        Tool("autolist", "Auto listing", "Templates that fill Meesho's catalogue form", PbIcons.Wand),
        Tool("costs", "Product costs", "Cost of each SKU, for the real profit", PbIcons.Box),
        Tool("exp", "Expenses", "Packing, rent, ads and other costs", PbIcons.Receipt),
        Tool("data", "Upload Meesho files", "Payment and order reports for the P&L", PbIcons.Upload),
    ),
    "Billing & GST" to listOf(
        Tool("bills", "Bills", "GST bills and estimates, sent on WhatsApp", PbIcons.Receipt),
        Tool("parties", "Parties", "Buyers kept for the next bill", PbIcons.User),
        Tool("items", "Items", "Things you sell, with HSN and GST", PbIcons.Box),
        Tool("gst", "GST summary", "Tax on your bills by month and rate", PbIcons.Rupee),
        Tool("gstr1", "GSTR-1 JSON", "Meesho, Amazon and Flipkart reports to the GST portal file", PbIcons.FileJson),
        Tool("shop", "Shop details", "Name, GSTIN, bank and UPI on every bill", PbIcons.Gear),
    ),
    "More tools" to listOf(
        Tool("listing", "Meesho listing", "Meesho's bulk upload Excel from your template", PbIcons.Sheet),
        Tool("lens", "Meesho Lens", "Competitor prices and how fast they sell", PbIcons.Scan),
    ),
    "Account" to listOf(
        Tool("plan", if (pro) "PakkaBill Pro is active" else "PakkaBill Pro", "Plans, trial and payment", PbIcons.Crown),
        Tool("account", if (login) "My account" else "Log in", "Login, backup and your data", PbIcons.User),
        Tool("set", "Settings", "Language, dark mode, reminder, backup", PbIcons.Gear),
        Tool("guide", "How to use", "Step by step, in English and Hindi", PbIcons.Book),
    ),
)

/** The Tools page: every tool of PakkaBill, one tap away. */
fun LazyListScope.toolsTab(groups: List<Pair<String, List<Tool>>>, open: (String) -> Unit) {
    groups.forEach { (title, tools) ->
        block("tools-$title") {
            Txt(title, size = 13.sp, weight = FontWeight.SemiBold, color = LocalHues.current.ink3, upper = true)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                tools.chunked(2).forEach { pair ->
                    Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        pair.forEach { t -> ToolCard(t, Modifier.weight(1f).fillMaxHeight()) { open(t.key) } }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun ToolCard(t: Tool, modifier: Modifier, onClick: () -> Unit) {
    val h = LocalHues.current
    Column(
        modifier.heightIn(min = 128.dp).clip(RoundedCornerShape(12.dp)).background(h.sheet).border(1.dp, h.rule, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).clip(RoundedCornerShape(10.dp)).background(h.carbonTint), contentAlignment = Alignment.Center) {
                Icon(t.icon, null, tint = h.carbon, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.weight(1f))
            if (t.badge > 0) Tag(if (t.badge > 99) "99+" else "${t.badge}", TagKind.BAD, raw = true)
        }
        Spacer(Modifier.height(8.dp))
        Txt(t.title, weight = FontWeight.SemiBold, size = 15.sp, maxLines = 2, lineHeight = 18.sp)
        Spacer(Modifier.height(2.dp))
        Small(t.sub)
    }
}

