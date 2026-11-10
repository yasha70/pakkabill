package com.pakkabill.app.listing

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.pakkabill.app.data.KeyValue
import com.pakkabill.app.labels.Made
import com.pakkabill.core.listing.Copied
import com.pakkabill.core.listing.LCatalogue
import com.pakkabill.core.listing.LPlan
import com.pakkabill.core.listing.LSaid
import com.pakkabill.core.listing.LSet
import com.pakkabill.core.listing.LSetResult
import com.pakkabill.core.listing.LTemplate
import com.pakkabill.core.listing.LinkNote
import com.pakkabill.core.listing.ListingEngine
import com.pakkabill.core.listing.ListingS
import com.pakkabill.core.listing.ListingW
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
import kotlinx.serialization.json.JsonArray

/**
 * Meesho listing for the screen: the seller's category template, their details, sizes, photos and
 * image links, and Meesho's bulk-upload Excel made from them by the website's own listing engine. The
 * template, settings, saved sets, photo names and small pictures are kept on the phone for the next
 * catalogue. Every engine call runs on one worker thread, in order.
 */
class ListingController(
    private val dir: File,
    private val scope: CoroutineScope,
    private val kv: KeyValue,
    /** The shop's name and address from the bill settings, for Meesho's manufacturer field. */
    private val shop: () -> String,
) {
    private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "listing").apply { isDaemon = true } }.asCoroutineDispatcher()
    private var engine: ListingEngine? = null
    private fun eng() = engine ?: ListingEngine().also { engine = it }
    private val tplFile = File(dir, "template.xlsx")
    private val thumbs = File(dir, "thumbs").apply { mkdirs() }

    private val _ready = MutableStateFlow(false)
    /** False until the saved template (if any) has been read again. */
    val ready: StateFlow<Boolean> = _ready.asStateFlow()
    private val _tpl = MutableStateFlow<LTemplate?>(null)
    val template: StateFlow<LTemplate?> = _tpl.asStateFlow()
    private val _tplName = MutableStateFlow(kv.get(KN).orEmpty())
    val templateName: StateFlow<String> = _tplName.asStateFlow()
    private val _copied = MutableStateFlow<Copied?>(null)
    /** What Meesho's prefilled template gave, shown once after it is chosen. */
    val copied: StateFlow<Copied?> = _copied.asStateFlow()
    private val _S = MutableStateFlow(runCatching { ListingEngine.J.decodeFromString(ListingS.serializer(), kv.get(KS) ?: "") }.getOrDefault(ListingS()))
    val settings: StateFlow<ListingS> = _S.asStateFlow()
    private val _W = MutableStateFlow(runCatching { ListingEngine.J.decodeFromString(ListingW.serializer(), kv.get(KW) ?: "") }.getOrDefault(ListingW()))
    val work: StateFlow<ListingW> = _W.asStateFlow()
    private val _plan = MutableStateFlow<LPlan?>(null)
    val plan: StateFlow<LPlan?> = _plan.asStateFlow()
    private val _used = MutableStateFlow<List<String>>(emptyList())
    /** The photos that go to Meesho, in name order (the ones that need image links). */
    val used: StateFlow<List<String>> = _used.asStateFlow()
    private val _swatches = MutableStateFlow<Map<String, String>>(emptyMap())
    val swatches: StateFlow<Map<String, String>> = _swatches.asStateFlow()
    private val _sets = MutableStateFlow<List<LSet>>(emptyList())
    val sets: StateFlow<List<LSet>> = _sets.asStateFlow()
    private val _setResult = MutableStateFlow<LSetResult?>(null)
    val setResult: StateFlow<LSetResult?> = _setResult.asStateFlow()
    private val _shopNote = MutableStateFlow(false)
    /** The maker was filled in from the shop's details. */
    val shopNote: StateFlow<Boolean> = _shopNote.asStateFlow()
    private val _importers = MutableStateFlow<Map<String, String>>(emptyMap())
    /** What each importer field says when the goods are made in India. */
    val importers: StateFlow<Map<String, String>> = _importers.asStateFlow()
    private val _note = MutableStateFlow<LinkNote?>(null)
    val linkNote: StateFlow<LinkNote?> = _note.asStateFlow()
    private val _downloaded = MutableStateFlow(false)
    val downloaded: StateFlow<Boolean> = _downloaded.asStateFlow()
    private val _busy = MutableStateFlow<String?>(null)
    val busy: StateFlow<String?> = _busy.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages = _messages.asSharedFlow()

    private fun userSets(): JsonArray = runCatching { ListingEngine.J.parseToJsonElement(kv.get(KP) ?: "[]") as JsonArray }.getOrDefault(JsonArray(emptyList()))

    init {
        // the template used last time opens again by itself
        scope.launch {
            withContext(worker) {
                runCatching {
                    if (tplFile.exists()) { _tpl.value = eng().loadTemplate(tplFile.readBytes()); afterLoad() }
                    _sets.value = eng().sets(userSets())
                    replan()
                }.onFailure { _messages.tryEmit(it.message ?: "The saved template could not be read.") }
                _ready.value = true
            }
        }
    }

    private fun save() {
        kv.put(KS, ListingEngine.J.encodeToString(ListingS.serializer(), _S.value))
        kv.put(KW, ListingEngine.J.encodeToString(ListingW.serializer(), _W.value))
    }
    private fun afterLoad() {
        val t = _tpl.value ?: return
        _importers.value = t.schema.generic.filter { it.name.startsWith("importer", true) }.associate { it.name to eng().importer(it.name) }
    }
    private fun replan() {
        val t = _tpl.value
        if (t == null) { _plan.value = null; _used.value = emptyList(); _swatches.value = emptyMap(); return }
        _plan.value = runCatching { eng().plan(_S.value, _W.value) }.getOrNull()
        _used.value = runCatching { eng().usedPhotos(_S.value, _W.value) }.getOrDefault(emptyList())
        _swatches.value = runCatching { eng().swatches(_W.value) }.getOrDefault(emptyMap())
    }
    private fun say(s: LSaid?) { s?.msg?.takeIf { it.isNotBlank() }?.let { _messages.tryEmit(it) } }
    private fun run(block: () -> Unit) = scope.launch {
        withContext(worker) { runCatching(block).onFailure { _messages.tryEmit(it.message ?: "Something went wrong.") }; save(); replan() }
    }

    /** A message from the screen, shown like the others. */
    fun say(msg: String) { _messages.tryEmit(msg) }

    fun thumb(key: String): Bitmap? = File(thumbs, "$key.jpg").takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.path) }

    /** The Meesho category template (.xlsx from the supplier panel). */
    fun setTemplate(name: String, bytes: ByteArray) = scope.launch {
        withContext(worker) {
            if (!name.endsWith(".xlsx", true)) { _messages.tryEmit("Choose the .xlsx file you downloaded from Meesho."); return@withContext }
            _busy.value = "Reading the template…"
            runCatching {
                val t = eng().loadTemplate(bytes)
                tplFile.parentFile?.mkdirs(); tplFile.writeBytes(bytes)
                kv.put(KN, name); _tplName.value = name
                _tpl.value = t
                afterLoad()
                val (s, w, copied) = eng().apply(_S.value, _W.value)
                val after = eng().afterTemplate(s, w, userSets(), shop())
                _S.value = after.S; _W.value = after.W
                _copied.value = copied
                if (after.result != null) _setResult.value = after.result
                _shopNote.value = after.shopNote
                save(); replan()
                _messages.tryEmit(t.info.category + " template loaded" + (after.pend?.let { " and \"$it\" filled in." } ?: "."))
            }.onFailure { _messages.tryEmit(it.message ?: "This file could not be read.") }
            _busy.value = null
        }
    }

    /** A change to the details, sizes and chart, made in order with every other change. */
    fun editS(f: (ListingS) -> ListingS) = run { _S.value = f(_S.value) }
    /** A change to the photos, colours and catalogues. */
    fun editW(f: (ListingW) -> ListingW) = run { _W.value = f(_W.value) }

    fun typical() = run {
        val (s, n) = eng().typical(_S.value); _S.value = s
        _messages.tryEmit(if (n > 0) "Filled ${if (n == 1) "1 cell" else "$n cells"}. Check them against your chart." else "Nothing to fill: every cell has a value.")
    }

    /* ready-made sets */
    fun useSet(id: String) = run {
        val r = eng().useSet(_S.value, _W.value, userSets(), id)
        _S.value = r.S; _W.value = r.W; _setResult.value = r.result; _shopNote.value = false
        say(r.toast)
    }
    fun saveSet(name: String) = run {
        val r = eng().saveSet(_S.value, _W.value, userSets(), name)
        _S.value = r.S
        if (r.toast?.level != "error") kv.put(KP, r.sets.toString())
        _sets.value = eng().sets(userSets())
        say(r.toast)
    }
    fun deleteSet(id: String) = run { kv.put(KP, eng().deleteSet(userSets(), id).toString()); _sets.value = eng().sets(userSets()) }
    fun suggestName() = run {
        val n = eng().suggestName(_S.value)
        if (n.isBlank()) { _messages.tryEmit("Fill in the details below first."); return@run }
        _S.value = _S.value.copy(productName = n)
        _messages.tryEmit("Name suggested. Edit it if you like.")
    }

    /** Photos picked: their names, headers and small pictures are kept; colours by their names (red_front.jpg). */
    fun addPhotos(list: List<Pair<String, ByteArray>>) = run {
        if (_tpl.value == null) { _messages.tryEmit("Add the Meesho template first."); return@run }
        val photos = list.map { (n, b) -> Triple(n, b.size.toLong(), ListingEngine.inspect(b)) }
        val before = _W.value.images.keys
        val (w, left) = eng().addPhotos(_S.value, _W.value, photos)
        // small pictures for the screen, by the key each photo got
        val added = w.images.values.filter { it.key !in before }
        for (im in added) {
            val bytes = list.firstOrNull { it.first == im.name }?.second ?: continue
            runCatching {
                val o = BitmapFactory.Options().apply { inSampleSize = sampleFor(bytes) }
                val b = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o) ?: return@runCatching
                val k = 300f / maxOf(b.width, b.height)
                val t = if (k < 1) Bitmap.createScaledBitmap(b, (b.width * k).toInt().coerceAtLeast(1), (b.height * k).toInt().coerceAtLeast(1), true) else b
                File(thumbs, "${im.key}.jpg").outputStream().use { t.compress(Bitmap.CompressFormat.JPEG, 80, it) }
            }
        }
        _W.value = w
        val skipped = list.size - added.size
        _messages.tryEmit(
            if (added.isEmpty()) "Those photos are already here."
            else (if (added.size == 1) "1 photo added" else "${added.size} photos added") + (if (left > 0) ", $left to place by hand." else ", all sorted by their names.") +
                if (skipped > 0) " $skipped already here." else "",
        )
    }
    private fun sampleFor(b: ByteArray): Int {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(b, 0, b.size, o)
        var s = 1
        while (maxOf(o.outWidth, o.outHeight) / (s * 2) >= 300) s *= 2
        return s
    }

    fun removePhotos(keys: List<String>) = run {
        _W.value = eng().removePhotos(_W.value, keys); keys.forEach { File(thumbs, "$it.jpg").delete() }
        _messages.tryEmit(if (keys.size == 1) "1 photo removed." else "${keys.size} photos removed.")
    }
    fun groupInThrees(keys: List<String>) = run { _W.value = eng().groupInThrees(_S.value, _W.value, keys) }
    fun newColour() = run { _W.value = eng().newColour(_S.value, _W.value, "") }
    fun removeColour(id: String) = run { _W.value = _W.value.copy(colours = _W.value.colours.filterNot { it.id == id }) }
    /** A colour's name: Meesho's colour is guessed from it when the colour has none yet. */
    fun label(colourId: String, text: String) = run { _W.value = eng().label(_W.value, colourId, text) }
    fun place(key: String, type: String, colourId: String = "", view: String = "", catId: String = "") = run { _W.value = eng().place(_W.value, key, type, colourId, view, catId) }

    fun addCatalogue() = run { _W.value = _W.value.copy(catalogues = _W.value.catalogues + LCatalogue("c" + java.lang.Long.toString(System.nanoTime(), 36))) }
    /** A catalogue taken out: its colours move to the first one left. */
    fun removeCatalogue(id: String) = run {
        val w = _W.value
        val first = w.catalogues.firstOrNull { it.id != id } ?: return@run
        val firstId = w.catalogues.first().id
        _W.value = w.copy(
            colours = w.colours.map { c -> val cat = if (w.catalogues.any { it.id == c.cat }) c.cat else firstId; if (cat == id) c.copy(cat = first.id) else c },
            catalogues = w.catalogues.filterNot { it.id == id },
        )
    }

    fun matchLinks(text: String) = run {
        val (w, note) = eng().matchLinks(_S.value, _W.value, text)
        if (note == null) { _messages.tryEmit("No links found. Links start with https://"); return@run }
        _W.value = w; _note.value = note
    }
    /** A links file: Meesho's image upload sheet (.xlsx), or text and CSV. */
    fun linksFile(name: String, bytes: ByteArray) = run {
        val text = runCatching { if (name.endsWith(".xlsx", true)) eng().linksText(bytes) else bytes.toString(Charsets.UTF_8) }
            .getOrElse { _messages.tryEmit("That file could not be read."); return@run }
        val (w, note) = eng().matchLinks(_S.value, _W.value, text)
        if (note == null) { _messages.tryEmit("No links found. Links start with https://"); return@run }
        _W.value = w; _note.value = note
    }
    fun matchByOrder() = run {
        val (w, n) = eng().matchByOrder(_S.value, _W.value); _W.value = w; _note.value = null
        _messages.tryEmit((if (n == 1) "1 link" else "$n links") + " matched by order. Check a few by opening them.")
    }
    fun clearLinks() = run { _W.value = eng().clearLinks(_W.value); _note.value = null }
    /** A link typed by hand for one photo. */
    fun setLink(key: String, link: String) = editW { w ->
        val im = w.images[key] ?: return@editW w
        val l = link.trim()
        w.copy(images = w.images + (key to im.copy(link = l, how = if (l.isEmpty()) "" else "hand")))
    }

    /** One Excel file for Meesho's bulk upload, named as on the website. */
    suspend fun file(part: Int, of: Int): Made? = withContext(worker) {
        _busy.value = "Making the Excel file…"
        try {
            val bytes = eng().write(_S.value, _W.value, part)
            val cat = (_tpl.value?.info?.category ?: "").replace(Regex("[^A-Za-z0-9]+"), "").ifEmpty { "Bulk" }
            val stamp = java.text.SimpleDateFormat("yyyyMMdd-HHmm", java.util.Locale.ENGLISH).format(java.util.Date())
            Made("Meesho-$cat-$stamp" + (if (of > 1) "-part${part + 1}" else "") + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes)
        } catch (e: Throwable) {
            _messages.tryEmit("The file could not be made: " + (e.message ?: "")); null
        } finally { _busy.value = null }
    }
    fun downloaded() { _downloaded.value = true }

    /** A new batch: photos, colours and links cleared; the template, details and sizes kept. */
    fun newBatch() = run {
        thumbs.listFiles()?.forEach { it.delete() }
        _W.value = ListingW(); _note.value = null; _downloaded.value = false
        _messages.tryEmit("New batch started. Your details and sizes are kept.")
    }

    private companion object {
        const val KS = "settings"
        const val KW = "work"
        const val KN = "templateName"
        const val KP = "presets"
    }
}
