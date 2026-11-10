package com.pakkabill.app.lowship

import android.graphics.Bitmap
import com.pakkabill.app.data.KeyValue
import com.pakkabill.core.lowship.PhotoNote
import com.pakkabill.core.lowship.ShipEngine
import com.pakkabill.core.lowship.ShipLens
import com.pakkabill.core.lowship.ShipPixels
import com.pakkabill.core.lowship.ShipSummary
import com.pakkabill.core.lowship.ShipWeb
import com.pakkabill.core.lowship.Tweak
import java.util.concurrent.Executors
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** How to make the versions (the website's options). */
@Serializable data class ShipOpts(val look: String = "smart", val level: String = "normal", val shape: String = "photo", val strength: String = "normal", val category: String = "")

/** A photo waiting to be made into versions. */
class Pending(val name: String, val bytes: ByteArray, val mime: String)

/** One version on the screen. */
class VersionView(val key: String, val label: String, val w: Int, val h: Int, val bytes: Int, val fillNow: Double?, val round: Int, val thumb: Bitmap, val notes: List<PhotoNote>)

/** One photo's versions and their shipping: typed, or Meesho's own price ([live]). */
class PhotoView(
    val id: String, val name: String, val thumb: Bitmap, val plain: Boolean, val fill: Double?, val versions: List<VersionView>, val ship: Map<String, Double>,
    val sum: ShipSummary?, val live: Set<String> = emptySet(),
)

/** What the shipping check in Meesho's page has done: versions sent, versions priced, what it learned. */
data class ShipLive(val sent: Int = 0, val priced: Int = 0, val lens: ShipLens? = null, val current: String? = null)

/** The seller's results, per category: versionKey -> the shipping Meesho showed (the website's pb-lowship2). */
@Serializable data class CatResults(val name: String, val results: MutableMap<String, MutableList<Double>> = mutableMapOf())
@Serializable data class ShipStore(val cats: MutableMap<String, CatResults> = mutableMapOf())

/**
 * Low shipping image for the screen: versions of the seller's main photo, made on one worker the way
 * the website makes them. The seller checks each in Meesho's catalogue upload and types the shipping;
 * the cheapest is marked, and "Try more" makes versions close to it. Photos stay on the phone.
 */
class LowshipController(private val scope: CoroutineScope, private val kv: KeyValue) {
    private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "lowship").apply { isDaemon = true } }.asCoroutineDispatcher()
    private var engine: ShipEngine? = null
    private fun eng() = engine ?: ShipEngine().also { engine = it }

    private class Work(
        val id: String, val photo: ShipPhoto, val out: MutableList<ShipVersion> = mutableListOf(), val ship: MutableMap<String, Double> = mutableMapOf(), var round: Int = 0,
        val thumb: Bitmap, val live: MutableSet<String> = mutableSetOf(),
    )
    private val work = mutableListOf<Work>()

    private val _opts = MutableStateFlow(runCatching { J.decodeFromString(ShipOpts.serializer(), kv.get(OPTS) ?: "") }.getOrDefault(ShipOpts()))
    val opts: StateFlow<ShipOpts> = _opts.asStateFlow()
    private val _pending = MutableStateFlow<List<Pending>>(emptyList())
    val pending: StateFlow<List<Pending>> = _pending.asStateFlow()
    private val _photos = MutableStateFlow<List<PhotoView>>(emptyList())
    val photos: StateFlow<List<PhotoView>> = _photos.asStateFlow()
    private val _progress = MutableStateFlow<Pair<Int, Int>?>(null)
    val progress: StateFlow<Pair<Int, Int>?> = _progress.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages = _messages.asSharedFlow()

    private fun store(): ShipStore = runCatching { J.decodeFromString(ShipStore.serializer(), kv.get(STORE) ?: "") }.getOrDefault(ShipStore())
    private fun catKey(c: String) = c.trim().lowercase().replace(Regex("\\s+"), " ").take(40)

    fun setOpts(o: ShipOpts) { _opts.value = o; kv.put(OPTS, J.encodeToString(ShipOpts.serializer(), o)) }

    fun addPhotos(list: List<Pair<String, ByteArray>>) {
        val ok = list.filter { (n, b) -> Regex("\\.(jpe?g|png|webp|heic|heif)$", RegexOption.IGNORE_CASE).containsMatchIn(n) || isImage(b) }
        if (ok.isEmpty()) { _messages.tryEmit("Choose a photo (JPG, PNG or WebP)."); return }
        _pending.value = (_pending.value + ok.map { (n, b) -> Pending(n, b, mimeOf(n, b)) }).take(10)
    }
    fun removePending(i: Int) { _pending.value = _pending.value.filterIndexed { j, _ -> j != i } }

    private fun isImage(b: ByteArray) = b.size > 4 && ((b[0] == 0xff.toByte() && b[1] == 0xd8.toByte()) || (b[0] == 0x89.toByte() && b[1] == 'P'.code.toByte()) || (b[8] == 'W'.code.toByte() && b[9] == 'E'.code.toByte()))
    private fun mimeOf(n: String, b: ByteArray) = when {
        b.size > 2 && b[0] == 0xff.toByte() && b[1] == 0xd8.toByte() -> "image/jpeg"
        b.size > 2 && b[0] == 0x89.toByte() -> "image/png"
        n.endsWith(".webp", true) -> "image/webp"
        else -> "image/other"
    }

    /** Versions that were cheapest before in this category (or in any). */
    private fun pastWinners(): List<String> {
        val st = store()
        val chosen = st.cats[catKey(_opts.value.category)]
        val cats = if (chosen != null) listOf(chosen) else st.cats.values.toList()
        val el: JsonElement = J.encodeToJsonElement(kotlinx.serialization.builtins.ListSerializer(CatResults.serializer()), cats)
        return runCatching { eng().ranking(el).take(4) }.getOrDefault(emptyList())
    }

    /** Makes the versions of every photo waiting, with the options chosen. */
    fun generate() {
        val list = _pending.value
        if (list.isEmpty()) { _messages.tryEmit("Add your product photo first."); return }
        _pending.value = emptyList()
        scope.launch {
            withContext(worker) {
                val o = _opts.value
                val n = eng().levels()[o.level] ?: 24
                var made = 0
                _progress.value = 0 to list.size * n
                for (p in list) {
                    val ph = runCatching { ShipRender.open(p.name.substringBeforeLast('.'), p.bytes, p.mime, o.strength) }.getOrNull()
                    if (ph == null) { _messages.tryEmit("${p.name} is not a photo PakkaBill can open (use JPG, PNG or WebP)."); continue }
                    val w = Work(java.util.UUID.randomUUID().toString().take(8), ph, thumb = ShipRender.thumb(ph.src))
                    synchronized(work) { work.add(0, w) }
                    for (t in eng().versions(o.look, n, ph.cut != null, pastWinners())) {
                        runCatching { add(w, t, 0, o.shape) }
                        made++
                        _progress.value = made to list.size * n
                        if (made % 4 == 0) publish()
                    }
                    publish()
                }
                _progress.value = null
                publish()
            }
        }
    }

    private fun add(w: Work, t: Tweak, round: Int, shape: String) {
        val ph = w.photo
        // "Your photo" is the seller's own file, byte for byte, so its shipping is what Meesho charges today
        val own = t.key == "orig" && ph.mime in setOf("image/jpeg", "image/png", "image/webp") && ph.bytes.size <= 8 * 1024 * 1024
        val bmp = if (own) null else ShipRender.render(ph, t, shape)
        val jpeg = if (own) ph.bytes else ShipRender.jpeg(bmp!!, t.q)
        val vw = bmp?.width ?: ph.origW
        val vh = bmp?.height ?: ph.origH
        val frame = t.frame
        val tf = t.fill
        val border = if (frame != null) frame + 0.007 else t.border ?: 0.0
        val fill = if (tf != null && ph.cut != null) tf * (t.zoom ?: 1.0) else ph.fill?.let { min(1.0, it * (t.zoom ?: 1.0) * (1 - 2 * border)) }
        val thumb = if (bmp != null) ShipRender.thumb(bmp).also { bmp.recycle() } else w.thumb
        w.out += ShipVersion(t, jpeg, vw, vh, fill, round, thumb)
    }

    private fun publish() {
        val list = synchronized(work) { work.toList() }
        _photos.value = list.map { w ->
            val versions = w.out.map { v ->
                VersionView(v.t.key, v.t.label.ifBlank { eng().keyLabel(v.t.key) }, v.w, v.h, v.jpeg.size, v.fillNow, v.round, v.thumb,
                    runCatching { eng().photoCheck(v.w, v.h, v.jpeg.size, if (v.t.key == "orig") null else v.fillNow) }.getOrDefault(emptyList()))
            }
            PhotoView(w.id, w.photo.name, w.thumb, w.photo.cut != null, w.photo.fill, versions, w.ship.toMap(), if (w.ship.isEmpty()) null else runCatching { eng().summary(w.ship) }.getOrNull(), w.live.toSet())
        }
    }

    /** The shipping Meesho showed for a version (0 or blank clears it); kept for this category for next time. */
    fun setShip(photo: String, key: String, rupees: Double?) = scope.launch {
        withContext(worker) {
            val w = synchronized(work) { work.find { it.id == photo } } ?: return@withContext
            put(w, key, rupees, _opts.value.category.ifBlank { "Typed by you" }, live = false)
            publish()
        }
    }
    private fun put(w: Work, key: String, rupees: Double?, cat: String, live: Boolean) {
        val st = store()
        val old = w.ship[key]
        val c = st.cats.getOrPut(catKey(cat)) { CatResults(cat.trim()) }
        if (old != null) c.results[key]?.let { l -> val i = l.lastIndexOf(old.roundToInt().toDouble()); if (i >= 0) l.removeAt(i) }
        if (rupees != null && rupees > 0) {
            w.ship[key] = rupees
            val l = c.results.getOrPut(key) { mutableListOf() }
            l += rupees.roundToInt().toDouble()
            while (l.size > 20) l.removeAt(0)
            if (live) w.live += key else w.live -= key
        } else { w.ship.remove(key); w.live -= key }
        kv.put(STORE, J.encodeToString(ShipStore.serializer(), st))
    }

    /* ---------- Meesho's real shipping: the website's shipping bookmark, in Meesho's page in the app ---------- */

    private val _live = MutableStateFlow<ShipLive?>(null)
    val live: StateFlow<ShipLive?> = _live.asStateFlow()
    @Volatile private var tokens: Map<String, Pair<String, String>> = emptyMap()
    @Volatile private var catNames: Map<String, String> = emptyMap()
    private val _desktop = MutableStateFlow(kv.get(DESKTOP) == "1")
    /** Meesho's supplier panel in its laptop layout (the seller's choice, kept). */
    val desktop: StateFlow<Boolean> = _desktop.asStateFlow()
    fun setDesktop(on: Boolean) { _desktop.value = on; kv.put(DESKTOP, if (on) "1" else null) }

    /**
     * The versions for Meesho's page, as PakkaBill's Image tab sends them (lowship.js sendToLens):
     * { cats: [{ name, id }], items: [{ id: "photo|key", label, name, url }] }, each photo at an address
     * the app answers ([shipFile]). The category is the one chosen here, when there is one.
     */
    fun shipQueue(): String {
        val t = LinkedHashMap<String, Pair<String, String>>()
        val items = JsonArray(_photos.value.flatMapIndexed { i, ph ->
            ph.versions.mapIndexed { j, v ->
                val token = "p${i}v$j"
                t[token] = ph.id to v.key
                buildJsonObject {
                    put("id", "${ph.id}|${v.key}"); put("label", "${ph.name} · ${v.label}")
                    put("name", file(ph.id, v.key)?.first ?: "photo.jpg"); put("url", ShipWeb.url(token))
                }
            }
        })
        tokens = t
        _live.value = (_live.value ?: ShipLive()).copy(sent = items.size)
        val cat = _opts.value.category.trim()
        return buildJsonObject {
            put("cats", JsonArray(if (cat.isEmpty()) emptyList() else listOf(buildJsonObject { put("name", cat); put("id", JsonNull) })))
            put("items", items)
        }.toString()
    }
    /** A version's JPEG for Meesho's page, by the token in its address. */
    fun shipFile(token: String): ByteArray? = tokens[token]?.let { (p, k) -> file(p, k)?.second }

    /**
     * A message from the shipping check in Meesho's page. Meesho's price for each version goes where the
     * seller would type it: the price in the category chosen here, else the category Meesho used.
     */
    fun onShipMessage(text: String) {
        val m = ShipWeb.read(text) ?: return
        if (m.cats.isNotEmpty()) catNames = catNames + m.cats
        val lens = m.lens ?: _live.value?.lens
        if (m.type != "results") { _live.value = (_live.value ?: ShipLive()).copy(lens = lens); return }
        val want = _opts.value.category.trim()
        val names = catNames
        val got = m.results.mapNotNull { (id, per) ->
            val parts = id.split('|')
            if (parts.size != 2) return@mapNotNull null
            val k = per.keys.firstOrNull { names[it]?.equals(want, true) == true } ?: per.keys.first()
            Triple(parts[0], parts[1], per.getValue(k) to (want.ifBlank { names[k]?.takeIf { n -> !n.startsWith("Category picked") } ?: "Meesho" }))
        }
        _live.value = (_live.value ?: ShipLive()).copy(priced = got.size, lens = lens, current = m.current)
        scope.launch {
            withContext(worker) {
                var changed = false
                for ((photo, key, vc) in got) {
                    val w = synchronized(work) { work.find { it.id == photo } } ?: continue
                    if (w.ship[key] == vc.first && key in w.live) continue
                    put(w, key, vc.first, vc.second, live = true)
                    changed = true
                }
                if (changed) publish()
            }
        }
    }

    /** Round 2: up to 12 new versions close to the cheapest one of this photo. */
    fun more(photo: String) = scope.launch {
        withContext(worker) {
            val w = synchronized(work) { work.find { it.id == photo } } ?: return@withContext
            val s = if (w.ship.isEmpty()) null else eng().summary(w.ship)
            if (s == null) { _messages.tryEmit("Type the shipping of a few versions first, so PakkaBill knows the cheapest."); return@withContext }
            val best = w.out.find { it.t.key == s.best.first() } ?: return@withContext
            val list = eng().around(eng().tweakOf(best.t.key) ?: best.t, 12, w.out.map { it.t.key }).filter { w.photo.cut != null || !ShipPixels.needsCut(it) }
            if (list.isEmpty()) { _messages.tryEmit("No new versions left to try near this one."); return@withContext }
            w.round++
            var made = 0
            _progress.value = 0 to list.size
            for (t in list) { runCatching { add(w, t, w.round, _opts.value.shape) }; made++; _progress.value = made to list.size }
            _progress.value = null
            publish()
            _messages.tryEmit("${list.size} new versions made around \"${best.t.label.ifBlank { eng().keyLabel(best.t.key) }}\".")
        }
    }

    fun remove(photo: String) = scope.launch {
        withContext(worker) {
            synchronized(work) { work.find { it.id == photo }?.let { it.photo.recycle(); work.remove(it) } }
            publish()
        }
    }

    /** A version's JPEG, with the website's file name. */
    fun file(photo: String, key: String): Pair<String, ByteArray>? {
        val w = synchronized(work) { work.find { it.id == photo } } ?: return null
        val v = w.out.find { it.t.key == key } ?: return null
        val base = w.photo.name.replace(Regex("[^\\w\\- ]+"), "").trim().replace(Regex("\\s+"), "-").ifBlank { "photo" }
        return "$base-meesho-${key}.jpg" to v.jpeg
    }

    fun files(photo: String): List<Pair<String, ByteArray>> {
        val w = synchronized(work) { work.find { it.id == photo } } ?: return emptyList()
        return w.out.mapNotNull { file(photo, it.t.key) }
    }

    private companion object {
        const val OPTS = "opts"
        const val STORE = "results"
        const val DESKTOP = "desktop"
        val J = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    }
}
