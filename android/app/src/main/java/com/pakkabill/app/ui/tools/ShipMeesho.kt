package com.pakkabill.app.ui.tools

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.pakkabill.app.lowship.LowshipController
import com.pakkabill.app.ui.Btn
import com.pakkabill.app.ui.LocalHues
import com.pakkabill.app.ui.Small
import com.pakkabill.app.ui.Txt
import com.pakkabill.core.lowship.ShipWeb
import java.io.ByteArrayInputStream

/**
 * Meesho's supplier panel inside the app for the shipping check: the website's shipping bookmark
 * (lens/shipcore.js, shiphook.js, shipbm.js) runs in the page, as when a seller taps PB Shipping on a
 * phone, with this app as the PakkaBill tab it talks to. The app sends the versions; Meesho's price
 * for each comes back to the Low shipping page. Only supplier.meesho.com can reach the app.
 */
@Composable
fun MeeshoShipping(c: LowshipController, desktop: Boolean, onDesktop: (Boolean) -> Unit, onClose: () -> Unit) {
    val h = LocalHues.current
    val script = remember { runCatching { ShipWeb.bundle() }.getOrNull() }
    val canTalk = remember { WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) }
    val live by c.live.collectAsState()
    val version: (String) -> WebResourceResponse? = { url ->
        ShipWeb.token(url)?.let { t ->
            val b = c.shipFile(t)
            if (b != null) WebResourceResponse("image/jpeg", null, 200, "OK", mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(b))
            else WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))
        }
    }
    // versions asked for by a service worker of Meesho's site come from the app too
    LaunchedEffect(Unit) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE) && WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(object : ServiceWorkerClientCompat() {
                override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? = version(request.url.toString())
            })
        }
    }
    MeeshoWeb(
        "https://supplier.meesho.com/", "Meesho · PakkaBill shipping", onClose,
        onPage = { w, u ->
            if (script != null && canTalk && u.startsWith(ShipWeb.ORIGIN)) {
                w.evaluateJavascript(script, null)
                // the versions, as PakkaBill's Image tab sends them to the bookmark
                w.evaluateJavascript("window.__pbShipApp && window.__pbShipApp.queue(" + c.shipQueue() + ")", null)
            }
        },
        setup = { w ->
            if (canTalk) WebViewCompat.addWebMessageListener(w, "PBLensHost", setOf(ShipWeb.ORIGIN)) { _, message, _, isMainFrame, _ ->
                if (isMainFrame) message.data?.let { c.onShipMessage(it) }
            }
        },
        intercept = version, desktop = desktop, onDesktop = onDesktop,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp)) {
            if (!canTalk) Txt("This phone's Android System WebView is too old for the shipping check. Update Android System WebView from the Play Store, then open this again.", size = 14.sp, color = h.neg)
            else {
                val l = live
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Txt(
                            if (l != null && l.sent > 0) "Meesho priced ${l.priced} of ${l.sent} versions" else "Make the versions first",
                            size = 14.sp, weight = FontWeight.SemiBold, raw = l != null && l.sent > 0,
                        )
                        Small(
                            if (l?.lens?.learned == true) "Learned from your photo. The prices fill in on the Low shipping page."
                            else "Catalog Upload → Add Single Catalog: pick the category and upload your own photo once.",
                        )
                    }
                    Btn("Done", onClose, small = true)
                }
            }
        }
    }
}
