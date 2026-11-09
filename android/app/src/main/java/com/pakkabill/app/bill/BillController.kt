package com.pakkabill.app.bill

import com.pakkabill.core.bill.BillData
import com.pakkabill.core.bill.BillStore
import com.pakkabill.core.bill.Business
import com.pakkabill.core.bill.Invoice
import com.pakkabill.core.bill.Party
import com.pakkabill.core.bill.Product
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

/**
 * GST billing for the screens: every change goes to [BillStore] on one worker thread (the file is
 * written there), and [data] gives the screens the new state.
 */
class BillController(dir: File, private val scope: CoroutineScope) {
    private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "bills").apply { isDaemon = true } }.asCoroutineDispatcher()
    private lateinit var store: BillStore
    private val _data = MutableStateFlow(BillData())
    val data: StateFlow<BillData> = _data.asStateFlow()
    private val _ready = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = _ready.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages = _messages.asSharedFlow()

    init {
        scope.launch(worker) {
            store = BillStore(dir)
            _data.value = store.data
            _ready.value = true
        }
    }

    private fun run(done: String? = null, block: BillStore.() -> Unit) {
        scope.launch {
            val ok = withContext(worker) {
                runCatching { store.block(); _data.value = store.data }.isSuccess
            }
            if (!ok) _messages.tryEmit("Could not save. Is the phone's storage full?") else if (done != null) _messages.tryEmit(done)
        }
    }

    /** A new bill's draft (worked out on the worker so the number is right). */
    suspend fun draft(docType: String = "invoice"): Invoice = withContext(worker) { store.draft(docType) }
    suspend fun duplicate(inv: Invoice, docType: String = inv.docType): Invoice = withContext(worker) { store.duplicate(inv, docType) }
    suspend fun numberTaken(inv: Invoice): Boolean = withContext(worker) { store.numberTaken(inv) }

    /** Saves and returns the bill as saved (totals worked out, buyer kept). */
    suspend fun save(inv: Invoice): Invoice? = withContext(worker) {
        runCatching { store.saveInvoice(inv).also { _data.value = store.data } }.getOrNull()
    }.also { if (it == null) _messages.tryEmit("Could not save. Is the phone's storage full?") }

    fun delete(id: String) = run("Bill deleted") { deleteInvoice(id) }
    fun setPaid(id: String, paid: Boolean) = run(if (paid) "Marked as paid" else "Marked as unpaid") { setPaid(id, paid) }
    fun saveBusiness(b: Business) = run("Shop details saved") { saveBusiness(b) }
    fun saveParty(p: Party) = run("Party saved") { saveParty(p) }
    fun deleteParty(id: String) = run("Party deleted") { deleteParty(id) }
    fun saveProduct(p: Product) = run("Item saved") { saveProduct(p) }
    fun deleteProduct(id: String) = run("Item deleted") { deleteProduct(id) }
    fun eraseAll() = run("All bills deleted") { eraseAll() }

    suspend fun backup(): String = withContext(worker) { store.backup() }

    /** Adds the bills in a backup (the app's or the website's). */
    fun restore(text: String) = scope.launch {
        val r = withContext(worker) { runCatching { store.restore(text).also { _data.value = store.data } } }
        _messages.tryEmit(r.fold({ n -> if (n == 1) "1 bill added from the backup" else "$n bills added from the backup" }, { "This file has no PakkaBill bills in it." }))
    }
}
