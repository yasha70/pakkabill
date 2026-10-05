package com.pakkabill.app.account

import com.pakkabill.app.data.KeyValue
import com.pakkabill.core.Access
import com.pakkabill.core.Api
import com.pakkabill.core.ApiException
import com.pakkabill.core.News
import com.pakkabill.core.Order
import com.pakkabill.core.Quote
import com.pakkabill.core.SafeClock
import com.pakkabill.core.ServerConfig
import com.pakkabill.core.Session
import com.pakkabill.core.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class AccountUi(
    val session: Session? = null,
    val config: ServerConfig? = null,
    /** the seller's latest Pro payments (newest first) */
    val orders: List<Order> = emptyList(),
    /** messages and offers from PakkaBill */
    val news: List<News> = emptyList(),
    /** time for plan dates: see [SafeClock] */
    val now: Long = System.currentTimeMillis(),
) {
    val access get() = Access.of(session, config, now)
    val loggedIn get() = session != null
    /** paid plans are switched on and Pro is needed for the full report */
    val enforced get() = config != null && config.enabled && config.enforce
    val paidUntil get() = session?.user?.paidUntil ?: 0
    val isPro get() = paidUntil > now
    /** whole days of Pro left (0 when none) */
    val daysLeft get() = if (isPro) ((paidUntil - now + 86_399_999) / 86_400_000).toInt() else 0
    val trial get() = isPro && session?.user?.lastPlan == "trial"
    val pending get() = orders.any { it.state == "PENDING" }
}

/**
 * The PakkaBill account: log in, sign up, change password, log out, delete. The login token is
 * kept in the app's private storage. Plans follow the same rules as the website.
 */
class AccountController(private val api: Api, private val kv: KeyValue, private val scope: CoroutineScope) {
    /** plan dates use a clock that turning the phone's clock back cannot move back */
    private val clock = SafeClock({ kv.get(K_TIME)?.toLongOrNull() ?: 0L }, { kv.put(K_TIME, it.toString()) })

    private val _ui = MutableStateFlow(
        AccountUi(
            session = kv.get(K_SESSION)?.let { runCatching { json.decodeFromString(Session.serializer(), it) }.getOrNull() },
            config = kv.get(K_CONFIG)?.let { runCatching { json.decodeFromString(ServerConfig.serializer(), it) }.getOrNull() },
            now = clock.now(),
        ),
    )
    val ui: StateFlow<AccountUi> = _ui.asStateFlow()

    private fun setSession(s: Session?) {
        kv.put(K_SESSION, s?.let { json.encodeToString(Session.serializer(), it) })
        _ui.value = _ui.value.copy(session = s, orders = if (s == null) emptyList() else _ui.value.orders, now = clock.now())
    }

    private fun tick() {
        if (api.serverTime > 0) clock.server(api.serverTime)
        _ui.value = _ui.value.copy(now = clock.now())
    }

    private var lastRefresh = 0L

    /**
     * Checks the plan settings, the account, payments and offers again: when the app opens or
     * comes back (at most once a minute unless [force]). Fails quietly offline.
     */
    fun refresh(force: Boolean = true) {
        val t = System.currentTimeMillis()
        if (!force && t - lastRefresh < 60_000) { _ui.value = _ui.value.copy(now = clock.now()); return }
        lastRefresh = t
        scope.launch(Dispatchers.IO) {
            runCatching { api.config() }.onSuccess { c ->
                kv.put(K_CONFIG, json.encodeToString(ServerConfig.serializer(), c))
                _ui.value = _ui.value.copy(config = c)
            }
            tick()
            val s = _ui.value.session
            if (s != null) {
                try {
                    val u = api.me(s.token)
                    setSession(s.copy(user = u))
                } catch (e: ApiException) {
                    // logged out elsewhere, password changed or reset, or account stopped
                    if (e.status == 401 || e.status == 403) setSession(null)
                }
            }
            loadExtras()
        }
    }

    /** Payments and offers (only once paid plans are on). */
    private fun loadExtras() {
        val c = _ui.value.config
        val s = _ui.value.session
        runCatching { api.news(s?.token) }.onSuccess { _ui.value = _ui.value.copy(news = it) }
        if (s != null && c != null && c.enabled) runCatching { api.orders(s.token) }.onSuccess { _ui.value = _ui.value.copy(orders = it) }
    }

    /** The price of [plan] with [coupon]: the quote, or the reason the coupon does not work. */
    suspend fun quote(plan: String, coupon: String): Result<Quote> = withContext(Dispatchers.IO) {
        val s = _ui.value.session ?: return@withContext Result.failure(ApiException(401, "Log in first."))
        runCatching { api.quote(s.token, plan, coupon) }.recoverCatching { throw if (it is ApiException) it else ApiException(0, "Something went wrong. Please try again.") }
    }

    /** Sends the UPI transaction number; null when it worked, otherwise the message to show. */
    suspend fun pay(plan: String, utr: String, coupon: String?): String? = withContext(Dispatchers.IO) {
        val s = _ui.value.session ?: return@withContext "Log in first."
        val u = Api.findUtr(utr) ?: return@withContext "The transaction number has exactly 12 digits."
        try {
            val o = api.pay(s.token, plan, u, coupon)
            _ui.value = _ui.value.copy(orders = listOf(o) + _ui.value.orders.filter { it.id != o.id })
            null
        } catch (e: ApiException) {
            e.message
        } catch (e: Exception) {
            "Something went wrong. Please try again."
        }
    }

    /** Claims free Pro days from an offer; null when it worked, otherwise the message to show. */
    suspend fun claim(id: String): String? = withContext(Dispatchers.IO) {
        val s = _ui.value.session ?: return@withContext "Log in or create a free account to claim your free Pro days."
        try {
            val u = api.claim(s.token, id)
            setSession(s.copy(user = u))
            _ui.value = _ui.value.copy(news = _ui.value.news.map { if (it.id == id) it.copy(claimed = true) else it })
            null
        } catch (e: ApiException) {
            e.message
        } catch (e: Exception) {
            "Something went wrong. Please try again."
        }
    }

    /** While a payment waits to be checked: looks again every [everyMs] until Pro is on. */
    suspend fun watchPending(everyMs: Long = 30_000) {
        while (true) {
            kotlinx.coroutines.delay(everyMs)
            val ui = _ui.value
            if (!ui.pending || ui.session == null) return
            withContext(Dispatchers.IO) {
                val s = ui.session
                runCatching { api.me(s.token) }.onSuccess { setSession(s.copy(user = it)) }
                tick()
                loadExtras()
            }
        }
    }

    /** null when it worked, otherwise the message to show. */
    private suspend fun call(block: () -> Session): String? = withContext(Dispatchers.IO) {
        try {
            setSession(block())
            null
        } catch (e: ApiException) {
            e.message
        } catch (e: Exception) {
            "Something went wrong. Please try again."
        }
    }

    suspend fun login(phone: String, password: String): String? {
        val p = Api.normPhone(phone) ?: return "Enter your 10-digit mobile number."
        if (password.isEmpty()) return "Enter your password."
        return call { api.login(p, password) }.also { if (it == null) refresh() }
    }

    suspend fun signup(phone: String, password: String, shopName: String): String? {
        val p = Api.normPhone(phone) ?: return "Enter a 10-digit mobile number."
        if (password.length < 6) return "Use a password of at least 6 characters."
        return call { api.signup(p, password, shopName.trim()) }.also { if (it == null) refresh() }
    }

    suspend fun changePassword(current: String, next: String): String? {
        val s = _ui.value.session ?: return "Log in first."
        if (next.length < 6) return "Use a new password of at least 6 characters."
        return call { api.changePassword(s.token, current, next) }
    }

    suspend fun deleteAccount(password: String): String? {
        val s = _ui.value.session ?: return "Log in first."
        return withContext(Dispatchers.IO) {
            try {
                api.deleteAccount(s.token, password)
                setSession(null)
                null
            } catch (e: ApiException) {
                e.message
            } catch (e: Exception) {
                "Something went wrong. Please try again."
            }
        }
    }

    fun logout() {
        val s = _ui.value.session ?: return
        setSession(null)
        scope.launch(Dispatchers.IO) { api.logout(s.token) }
    }

    private companion object {
        const val K_SESSION = "session"
        const val K_CONFIG = "server_config"
        const val K_TIME = "seen_time"
    }
}
