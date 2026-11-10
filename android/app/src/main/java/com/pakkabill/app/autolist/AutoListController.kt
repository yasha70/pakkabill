package com.pakkabill.app.autolist

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.media.ExifInterface
import com.pakkabill.app.data.KeyValue
import com.pakkabill.core.autolist.ALPhoto
import com.pakkabill.core.autolist.ALProduct
import com.pakkabill.core.autolist.ALSeller
import com.pakkabill.core.autolist.ALSize
import com.pakkabill.core.autolist.ALState
import com.pakkabill.core.autolist.ALStatus
import com.pakkabill.core.autolist.ALTemplate
import com.pakkabill.core.autolist.AutoListEngine
import com.pakkabill.core.autolist.ExtSync
import java.io.ByteArrayInputStream
import java.io.File
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
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Auto listing for the screen, as on the website (autolist.js): templates, the seller's details,
 * products with their photos, and the products sent to Meesho's form. The PakkaBill Lens form filler,
 * running in Meesho's supplier panel inside the app, reads and writes the extension's storage kept
 * here ([onHostMessage]); templates saved there come back to this page. Photos stay on the phone.
 */
class AutoListController(private val dir: File, private val scope: CoroutineScope, private val kv: KeyValue) {
    private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "autolist").apply { isDaemon = true } }.asCoroutineDispatcher()
    private var engine: AutoListEngine? = null
    private fun eng() = engine ?: AutoListEngine().also { engine = it }
    private val J = AutoListEngine.J
    private val photos = File(dir, "photos").apply { mkdirs() }
    private val thumbs = File(dir, "thumbs").apply { mkdirs() }
    private val extFile = File(dir, "ext.json")

    private val _state = MutableStateFlow(runCatching { J.decodeFromString(ALState.serializer(), kv.get(KS) ?: "") }.getOrDefault(ALState()))
    val state: StateFlow<ALState> = _state.asStateFlow()
    private var names: Map<String, String> = runCatching { J.decodeFromString(MapSerializer(String.serializer(), String.serializer()), kv.get(KN) ?: "") }.getOrDefault(emptyMap())
    private val _stat = MutableStateFlow<Map<String, ALStatus>>(emptyMap())
    /** What the form filler in Meesho said about each product. */
    val stat: StateFlow<Map<String, ALStatus>> = _stat.asStateFlow()
    private val _edit = MutableStateFlow<ALTemplate?>(null)
    /** The template open in the editor (a copy; saved only with [saveTemplate]). */
    val edit: StateFlow<ALTemplate?> = _edit.asStateFlow()
    private val _problems = MutableStateFlow<Map<String, List<String>>>(emptyMap())
    val problems: StateFlow<Map<String, List<String>>> = _problems.asStateFlow()
    private val _titles = MutableStateFlow<Map<String, String>>(emptyMap())
    /** Each product's name as Meesho gets it (the template's name pattern). */
    val titles: StateFlow<Map<String, String>> = _titles.asStateFlow()
    private val _common = MutableStateFlow<List<String>>(emptyList())
    /** Meesho's usual detail labels. */
    val common: StateFlow<List<String>> = _common.asStateFlow()
    private val _desktop = MutableStateFlow(kv.get(KD) == "1")
    /** Meesho's supplier panel in its laptop layout (the seller's choice, kept). */
    val desktop: StateFlow<Boolean> = _desktop.asStateFlow()
    fun setDesktop(on: Boolean) { _desktop.value = on; kv.put(KD, if (on) "1" else null) }
    private val _busy = MutableStateFlow<String?>(null)
    val busy: StateFlow<String?> = _busy.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages = _messages.asSharedFlow()

    // the extension's storage (chrome.storage.local), kept for the form filler
    private val lock = Any()
    private var ext: JsonObject = runCatching { J.parseToJsonElement(extFile.readText()) as JsonObject }.getOrDefault(JsonObject(emptyMap()))

    init { scope.launch { withContext(worker) { runCatching { _common.value = eng().common; pull(); recompute() } } } }

    fun say(msg: String) { _messages.tryEmit(msg) }
    private fun save() { kv.put(KS, J.encodeToString(ALState.serializer(), _state.value)) }
    private fun saveExt() { val text = synchronized(lock) { ext.toString() }; runCatching { extFile.writeText(text) } }
    private fun run(block: () -> Unit) = scope.launch { withContext(worker) { runCatching(block).onFailure { _messages.tryEmit(it.message ?: "Something went wrong.") }; save(); recompute() } }

    // each product's problems and name, worked out by the website's own logic
    private fun recompute() {
        val s = _state.value
        val byId = s.templates.associateBy { it.id }
        _problems.value = s.products.associate { p -> p.id to runCatching { eng().problems(byId[p.tplId], p) }.getOrDefault(emptyList()) }
        _titles.value = s.products.associate { p -> val t = byId[p.tplId]; p.id to (if (t != null) runCatching { eng().render(t.title.ifBlank { "{name}" }, t, p) }.getOrDefault(p.name) else p.name) }
    }

    /** Templates saved in Meesho and the form filler's statuses, into this page (autolist.js "pb-list-state"). */
    private fun pull() {
        val e = synchronized(lock) { ext }
        val s = _state.value
        val (tpls, changed) = ExtSync.pullTemplates(s.templates, e, s.removed)
        if (changed) _state.value = s.copy(templates = tpls)
        _stat.value = ExtSync.statuses(e)
    }
    /** This page's templates into the extension's (bridge.js "pb-list-templates"). */
    private fun push() {
        val s = _state.value
        synchronized(lock) { ext = ExtSync.pushTemplates(ext, s.templates, s.removed) }
        saveExt()
    }
    /** Back from Meesho: templates saved there and what was filled come in. */
    fun refresh() = run { pull() }

    /* ---------- the seller's details and choices ---------- */

    fun setSeller(f: (ALSeller) -> ALSeller) = run { _state.value = _state.value.copy(seller = f(_state.value.seller)) }
    fun setDefTpl(id: String) = run { _state.value = _state.value.copy(defTpl = id) }
    fun setPerPhoto(on: Boolean) = run { _state.value = _state.value.copy(perPhoto = on) }

    /* ---------- templates ---------- */

    /** A new template from the website's starters ("blouse", "saree", "kurti", "blank"). */
    fun startTemplate(kind: String) = run { _edit.value = eng().starter(kind) }
    fun editTemplate(id: String) = run { _edit.value = _state.value.templates.firstOrNull { it.id == id } }
    fun copyTemplate(id: String) = run {
        val t = _state.value.templates.firstOrNull { it.id == id } ?: return@run
        _edit.value = t.copy(id = uid("t"), name = t.name + " (copy)", source = "pakkabill", updatedAt = System.currentTimeMillis())
    }
    fun deleteTemplate(id: String) = run {
        val s = _state.value
        _state.value = s.copy(templates = s.templates.filterNot { it.id == id }, removed = (s.removed + id).takeLast(200))
        push()
    }
    /** A change to the template being edited. */
    fun updateEdit(f: (ALTemplate) -> ALTemplate) = run { _edit.value = _edit.value?.let(f) }
    fun cancelEdit() { _edit.value = null }
    /** A size added to the template being edited, with the last size's price and stock. */
    fun addSize(size: String) = run {
        val t = _edit.value ?: return@run
        val prev = t.sizes.lastOrNull() ?: ALSize()
        _edit.value = t.copy(sizes = eng().sortSizes(t.sizes + ALSize(size, prev.price, prev.rprice, prev.mrp, prev.stock)))
    }
    /** The name and description written from the details (each product's colour goes in). */
    fun writeCopy() = run {
        val t = _edit.value ?: return@run
        val (title, desc) = eng().writeCopy(t)
        _edit.value = t.copy(title = title, desc = desc)
        say("Name and description written. Each product's colour goes in.")
    }
    fun saveTemplate() = run {
        val t0 = _edit.value ?: return@run
        val t = t0.copy(
            name = t0.name.trim().ifEmpty { "Template" },
            fields = t0.fields.filter { it.label.isNotBlank() }.map { it.copy(label = it.label.trim(), value = it.value.trim()) },
            sizes = eng().sortSizes(t0.sizes.filter { it.size.isNotBlank() }),
            updatedAt = System.currentTimeMillis(),
        )
        val s = _state.value
        val i = s.templates.indexOfFirst { it.id == t.id }
        _state.value = s.copy(templates = if (i >= 0) s.templates.toMutableList().also { it[i] = t } else s.templates + t, defTpl = s.defTpl.ifEmpty { t.id })
        _edit.value = null
        push()
        say("Template \"${t.name}\" saved.")
    }

    /* ---------- products ---------- */

    /** Photos picked: each a product (one product per photo), all one product, or more photos for [toProduct]. */
    fun addPhotos(files: List<Pair<String, ByteArray>>, toProduct: String? = null) = run {
        _busy.value = "Getting the photos ready…"
        try {
            val got = files.mapNotNull { (n, b) ->
                val ph = runCatching { ready(n, b) }.getOrNull()
                if (ph == null) say("$n could not be read as a photo.")
                ph?.let { it to n }
            }
            if (got.isEmpty()) return@run
            names = names + got.associate { it.first.id to it.first.name }
            kv.put(KN, J.encodeToString(MapSerializer(String.serializer(), String.serializer()), names))
            val s = _state.value
            val now = System.currentTimeMillis()
            val def = s.defTpl.ifEmpty { s.templates.firstOrNull()?.id.orEmpty() }
            val products = when {
                toProduct != null -> s.products.map { p -> if (p.id == toProduct) p.copy(photos = (p.photos + got.map { it.first.id }).take(10)) else p }
                s.perPhoto -> s.products + got.map { (ph, n) -> ALProduct(uid("p"), def, name = eng().nameFromFile(n), photos = listOf(ph.id), createdAt = now) }
                else -> s.products + ALProduct(uid("p"), def, name = eng().nameFromFile(got[0].second), photos = got.map { it.first.id }.take(10), createdAt = now)
            }
            _state.value = s.copy(products = products)
        } finally { _busy.value = null }
    }

    /** A photo made ready for Meesho, as the website does: at most 1500 px on the long side, JPEG, white behind. */
    private fun ready(name: String, bytes: ByteArray): ALPhoto {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
        require(o.outWidth > 0 && o.outHeight > 0) { "not a photo" }
        var sample = 1
        while (maxOf(o.outWidth, o.outHeight) / (sample * 2) >= 1500) sample *= 2
        var b = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: error("not a photo")
        // turned the way the camera held it (browsers do this by themselves)
        val turn = runCatching {
            when (ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f; ExifInterface.ORIENTATION_ROTATE_180 -> 180f; ExifInterface.ORIENTATION_ROTATE_270 -> 270f; else -> 0f
            }
        }.getOrDefault(0f)
        if (turn != 0f) b = Bitmap.createBitmap(b, 0, 0, b.width, b.height, Matrix().apply { postRotate(turn) }, true)
        val k = minOf(1f, 1500f / maxOf(b.width, b.height))
        val w = Math.round(b.width * k).coerceAtLeast(1)
        val h = Math.round(b.height * k).coerceAtLeast(1)
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        Canvas(out).apply { drawColor(Color.WHITE); drawBitmap(b, null, Rect(0, 0, w, h), Paint(Paint.FILTER_BITMAP_FLAG)) }
        val id = uid("ph")
        File(photos, "$id.jpg").outputStream().use { out.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        val tk = 240f / maxOf(w, h)
        val th = if (tk < 1) Bitmap.createScaledBitmap(out, Math.round(w * tk).coerceAtLeast(1), Math.round(h * tk).coerceAtLeast(1), true) else out
        File(thumbs, "$id.jpg").outputStream().use { th.compress(Bitmap.CompressFormat.JPEG, 80, it) }
        return ALPhoto(id, name.replace(Regex("\\.[^.]+$"), "") + ".jpg")
    }

    fun thumb(id: String): Bitmap? = File(thumbs, "$id.jpg").takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.path) }
    /** A product photo for Meesho's page, by its id. */
    fun photoFile(id: String): File? = File(photos, "$id.jpg").takeIf { it.exists() && Regex("[A-Za-z0-9_-]{1,60}").matches(id) }

    private fun forget(ids: List<String>, still: List<ALProduct>) {
        ids.filter { id -> still.none { id in it.photos } }.forEach { id -> File(photos, "$id.jpg").delete(); File(thumbs, "$id.jpg").delete() }
    }
    fun removePhoto(pid: String, photoId: String) = run {
        val s = _state.value
        val products = s.products.map { if (it.id == pid) it.copy(photos = it.photos - photoId) else it }
        _state.value = s.copy(products = products)
        forget(listOf(photoId), products)
    }
    fun removeProduct(pid: String) = run {
        val s = _state.value
        val p = s.products.firstOrNull { it.id == pid } ?: return@run
        val products = s.products - p
        _state.value = s.copy(products = products)
        forget(p.photos, products)
    }
    fun editProduct(pid: String, f: (ALProduct) -> ALProduct) = run { _state.value = _state.value.let { s -> s.copy(products = s.products.map { if (it.id == pid) f(it) else it }) } }
    /** The product as one product per colour, with the same photos and its own SKU. */
    fun variants(pid: String, colours: String) = run {
        val s = _state.value
        val p = s.products.firstOrNull { it.id == pid } ?: return@run
        val vs = eng().variants(p, colours).mapIndexed { i, v -> v.copy(id = if (i == 0) p.id else uid("p"), photos = p.photos, sent = 0, createdAt = System.currentTimeMillis()) }
        if (vs.isEmpty()) return@run
        val i = s.products.indexOf(p)
        _state.value = s.copy(products = s.products.take(i) + vs + s.products.drop(i + 1))
        say("${vs.size} products, one per colour.")
    }
    /** Products Meesho has (submitted), taken off the list. */
    fun clearDone() = run {
        val s = _state.value
        val st = _stat.value
        val gone = s.products.filter { st[it.id]?.state == "done" }
        val products = s.products - gone.toSet()
        _state.value = s.copy(products = products)
        forget(gone.flatMap { it.photos }, products)
    }

    /** Products ready for Meesho's form: not submitted yet, and nothing missing. */
    fun readyList(): List<ALProduct> = _state.value.products.filter { _stat.value[it.id]?.state != "done" && _problems.value[it.id].isNullOrEmpty() }

    /**
     * The ready products go to the form filler (autolist.js send): each with its template (the seller's
     * details added) and its photos. [limit] is the free plan's number at a time. Then the seller fills
     * them in Meesho's supplier panel.
     */
    fun send(limit: Int? = null, opened: () -> Unit) = scope.launch {
        withContext(worker) {
            runCatching {
                var list = readyList()
                if (list.isEmpty()) { say("Nothing is ready to fill yet."); return@runCatching }
                if (limit != null && list.size > limit) { say("Free plan: $limit products at a time. Sending the first $limit."); list = list.take(limit) }
                val s = _state.value
                val byId = s.templates.associateBy { it.id }
                val now = System.currentTimeMillis()
                val items = list.mapNotNull { p ->
                    val t = byId[p.tplId] ?: return@mapNotNull null
                    Triple(p.id, eng().withSeller(t, s.seller), ExtSync.prodFor(p, p.photos.map { ALPhoto(it, names[it] ?: "$it.jpg") }))
                }
                push()
                synchronized(lock) { ext = ExtSync.queue(ext, items, fresh = true, now = now) }
                saveExt()
                val sent = list.map { it.id }.toSet()
                _state.value = s.copy(products = s.products.map { if (it.id in sent) it.copy(sent = now) else it })
                pull()
                say("${items.size} product${if (items.size > 1) "s" else ""} sent. In Meesho, open Catalog Upload → Add Single Catalog and tap Fill in the PakkaBill panel.")
                withContext(kotlinx.coroutines.Dispatchers.Main) { opened() }
            }.onFailure { say(it.message ?: "Something went wrong.") }
            save(); recompute()
        }
    }

    /* ---------- the form filler in Meesho's page ---------- */

    /**
     * A message from the form filler in Meesho's supplier panel ({ id, op, arg }): its storage, read and
     * written as chrome.storage.local. Gives the answer ({ id, v }).
     */
    fun onHostMessage(text: String): String {
        val m = runCatching { J.parseToJsonElement(text) as JsonObject }.getOrNull() ?: return "{}"
        val id = m["id"] ?: JsonNull
        val arg = m["arg"]
        val v: JsonElement = when ((m["op"] as? JsonPrimitive)?.contentOrNull) {
            "get" -> synchronized(lock) {
                val keys = (arg as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: ext.keys.toList()
                JsonObject(keys.mapNotNull { k -> ext[k]?.takeIf { it !is JsonNull }?.let { k to it } }.toMap())
            }
            "set" -> {
                val o = arg as? JsonObject ?: JsonObject(emptyMap())
                synchronized(lock) { ext = JsonObject(ext + o.filterKeys { it in KEYS }) }
                scope.launch(worker) { saveExt() }
                JsonNull
            }
            "remove" -> {
                val keys = (arg as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()
                synchronized(lock) { ext = JsonObject(ext - keys.toSet()) }
                scope.launch(worker) { saveExt() }
                JsonNull
            }
            else -> JsonNull
        }
        return buildJsonObject { put("id", id); put("v", v) }.toString()
    }

    /** Products waiting in Meesho's panel, and how many of them are submitted. */
    fun queued(): Pair<Int, Int> {
        val items = synchronized(lock) { (ext["listq"] as? JsonObject)?.get("items") as? JsonArray } ?: return 0 to 0
        val st = _stat.value
        return items.size to items.count { st[(it as? JsonObject)?.get("id")?.jsonPrimitive?.contentOrNull]?.state == "done" }
    }

    private fun uid(p: String) = p + java.lang.Long.toString(System.currentTimeMillis(), 36) + java.lang.Long.toString((Math.random() * 1_679_616).toLong(), 36).padStart(4, '0')

    private companion object {
        const val KS = "state"
        const val KN = "photoNames"
        const val KD = "desktop"
        /** What the form filler keeps (the extension's keys for auto listing). */
        val KEYS = setOf("listtpl", "liststat", "listq", "listform")
    }
}
