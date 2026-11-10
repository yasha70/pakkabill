package com.pakkabill.app.lens

import com.pakkabill.app.data.KeyValue
import com.pakkabill.core.ToolsJs
import com.pakkabill.core.lens.LensEngine
import com.pakkabill.core.lens.LensSettings
import com.pakkabill.core.lens.LensView
import com.pakkabill.core.lens.Panel
import java.util.concurrent.Executors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/**
 * Meesho Lens for the screen: every competitor opened in the app's Meesho view, one reading a day,
 * with the website's estimates. Kept on this phone only (like the website keeps them in the browser).
 */
class LensController(private val scope: CoroutineScope, private val kv: KeyValue) {
    private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "lens").apply { isDaemon = true } }.asCoroutineDispatcher()
    private var engine: LensEngine? = null
    private fun eng() = engine ?: LensEngine().also { engine = it }

    private var products: JsonObject = runCatching { LensEngine.J.parseToJsonElement(kv.get(STORE) ?: "{}").jsonObject }.getOrDefault(JsonObject(emptyMap()))

    private val _settings = MutableStateFlow(runCatching { LensEngine.J.decodeFromString(LensSettings.serializer(), kv.get(SETS) ?: "") }.getOrDefault(LensSettings()))
    val settings: StateFlow<LensSettings> = _settings.asStateFlow()
    private val _sort = MutableStateFlow(kv.get(SORT) ?: "fast")
    val sort: StateFlow<String> = _sort.asStateFlow()
    private val _view = MutableStateFlow(LensView())
    val view: StateFlow<LensView> = _view.asStateFlow()
    private val _panel = MutableStateFlow<Panel?>(null)
    /** What the product open in the Meesho view shows. */
    val panel: StateFlow<Panel?> = _panel.asStateFlow()
    private val _open = MutableStateFlow<String?>(null)
    /** A link to open in the Meesho view (shared from the Meesho app, or typed), until the screen takes it. */
    val open: StateFlow<String?> = _open.asStateFlow()
    fun opened() { _open.value = null }
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages = _messages.asSharedFlow()

    init { refresh() }

    /** The script that reads a product page: the website's Lens core and a call to it. */
    val readScript: String by lazy {
        ToolsJs.resource("tools/lenscore.js") + "\n;(function(){ try { return JSON.stringify(PBLensCore.extract(document, location)); } catch (e) { return null; } })()"
    }

    private fun refresh() = scope.launch {
        withContext(worker) { runCatching { _view.value = eng().view(products, _settings.value, _sort.value, System.currentTimeMillis()) } }
    }

    fun setSettings(s: LensSettings) { _settings.value = s; kv.put(SETS, LensEngine.J.encodeToString(LensSettings.serializer(), s)); refresh() }
    fun setSort(s: String) { _sort.value = s; kv.put(SORT, s); refresh() }

    /** A link to look at: a Meesho product link from the share sheet or typed by the seller. */
    fun openLink(text: String) {
        val url = Regex("https?://[^\\s]*meesho\\.com[^\\s]*", RegexOption.IGNORE_CASE).find(text)?.value
            ?: if (text.trim().matches(Regex("[a-z0-9]{4,12}", RegexOption.IGNORE_CASE))) "https://www.meesho.com/p/" + text.trim() else null
        if (url == null) { _messages.tryEmit("That is not a Meesho link. Open the product in the Meesho app, tap Share and pick PakkaBill."); return }
        _open.value = url
    }

    /** A product page read in the Meesho view ([json] from the website's Lens core): kept and shown. */
    fun read(json: String) = scope.launch {
        withContext(worker) {
            val d = runCatching { LensEngine.J.parseToJsonElement(json).jsonObject }.getOrNull() ?: return@withContext
            val id = (d["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content
            val hasData = d["price"]?.toString()?.let { it != "null" } == true || d["ratings"]?.toString()?.let { it != "null" } == true
            if (id.isNullOrBlank() || id == "null" || !hasData) { _panel.value = null; return@withContext }
            val prev = products[id] as? JsonObject
            val p = eng().panel(d, prev, _settings.value, System.currentTimeMillis())
            _panel.value = p
            p.h?.let { h -> products = JsonObject(products + (id to h)); kv.put(STORE, products.toString()) }
            _view.value = eng().view(products, _settings.value, _sort.value, System.currentTimeMillis())
        }
    }

    fun leftProduct() { _panel.value = null }

    fun remove(id: String) = scope.launch {
        withContext(worker) { products = JsonObject(products - id); kv.put(STORE, products.toString()); _view.value = eng().view(products, _settings.value, _sort.value, System.currentTimeMillis()) }
    }

    fun clear() = scope.launch {
        withContext(worker) { products = JsonObject(emptyMap()); kv.put(STORE, "{}"); _view.value = eng().view(products, _settings.value, _sort.value, System.currentTimeMillis()) }
    }

    suspend fun csv(): ByteArray = withContext(worker) { eng().csv(products, _settings.value, System.currentTimeMillis()).toByteArray() }

    private companion object {
        const val STORE = "products"
        const val SETS = "settings"
        const val SORT = "sort"
    }
}
