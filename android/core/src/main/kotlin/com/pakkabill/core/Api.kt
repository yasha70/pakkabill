package com.pakkabill.core

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** The PakkaBill account, as the server sends it (/api/me, /api/auth). */
@Serializable data class User(
    val phone: String = "",
    val shopName: String = "",
    val paidUntil: Long = 0,
    val pro: Boolean = false,
    val lastPlan: String = "",
    val trial: Boolean = false,
    val createdAt: Long = 0,
    val lastSeen: Long = 0,
    val tempPw: Boolean = false,
)

@Serializable data class Biz(val name: String? = null, val email: String? = null, val phone: String? = null, val address: String? = null, val grievance: String? = null)

/** Plan settings from /api/config. */
@Serializable data class ServerConfig(
    val enabled: Boolean = false,
    val enforce: Boolean = false,
    val monthly: Int = 99,
    val yearly: Int = 999,
    val freeBills: Int = 0,
    val trialDays: Int = 0,
    /** where Pro payments go (UPI), set by the admin */
    val upiId: String = "",
    val payeeName: String = "",
    val biz: Biz = Biz(),
)

/** A Pro payment the seller sent (UPI transaction number), checked by hand by PakkaBill. */
@Serializable data class Order(
    val id: String = "",
    val plan: String = "",
    /** paise */
    val amount: Long = 0,
    val listAmount: Long = 0,
    val coupon: String? = null,
    val utr: String = "",
    /** PENDING, COMPLETED or REJECTED */
    val state: String = "",
    val createdAt: Long = 0,
)

/** Price of a plan after a coupon, in rupees. */
@Serializable data class Quote(val list: Double = 0.0, val amount: Double = 0.0, val coupon: String? = null)

/** A message or offer from PakkaBill (the admin's banners, free Pro days to claim). */
@Serializable data class News(
    val id: String = "",
    val title: String = "",
    val message: String = "",
    /** info, offer or warn */
    val tone: String = "info",
    val trialDays: Int = 0,
    /** "", "upgrade" or "link" */
    val cta: String? = null,
    val ctaLabel: String? = null,
    val link: String? = null,
    val endAt: Long? = null,
    val claimed: Boolean = false,
)

@Serializable data class Session(val token: String, val user: User)

/** What the seller may do in the P&L: the same rule as the website (pro.js pbPnlAccess). */
data class Access(val login: Boolean, val pro: Boolean) {
    /** Full report, Excel and PDF need a login and Pro (Pro is free for everyone while plans are off). */
    val full get() = login && pro

    companion object {
        /**
         * [now] should be [Clock.now]: the latest time the app has seen from the server or the
         * phone, so turning the phone's clock back does not keep Pro running.
         */
        fun of(session: Session?, cfg: ServerConfig?, now: Long = System.currentTimeMillis()): Access {
            val login = session != null && session.token.isNotEmpty()
            val enforced = cfg != null && cfg.enabled && cfg.enforce
            val isPro = (session?.user?.paidUntil ?: 0) > now
            return Access(login, login && (!enforced || isPro))
        }
    }
}

/** A message for the seller (from the server, or about the internet connection). */
class ApiException(val status: Int, message: String) : IOException(message) {
    val loggedOut get() = status == 401
}

/**
 * Talks to the PakkaBill server. Blocking calls: use from a background thread or Dispatchers.IO.
 * [userAgent] lets the server know the request comes from the app (and from Google Play).
 */
class Api(private val base: String = "https://pakkabill1.vercel.app", private val userAgent: String = "PakkaBillApp/3") {

    /** The server's time from the last answer (0 before any): the phone's clock can be wrong or moved. */
    @Volatile var serverTime: Long = 0
        private set

    private fun request(method: String, path: String, token: String?, body: JsonObject? = null): JsonObject {
        val c = try { URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection } catch (e: Exception) { throw offline() }
        try {
            c.requestMethod = method
            c.connectTimeout = 15_000
            c.readTimeout = 25_000
            c.useCaches = false
            c.setRequestProperty("Accept", "application/json")
            c.setRequestProperty("Cache-Control", "no-cache")
            c.setRequestProperty("User-Agent", userAgent)
            if (!token.isNullOrEmpty()) c.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(json.encodeToString(body).toByteArray()) }
            }
            val status = c.responseCode
            c.date.takeIf { it > 0 }?.let { serverTime = it }
            val text = (if (status >= 400) c.errorStream else c.inputStream)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
            val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull()
            if (status >= 400 || obj == null) {
                val msg = obj?.get("error")?.jsonPrimitive?.content
                    ?: if (status == 429) "Too many tries. Please wait a few minutes and try again." else "The PakkaBill server did not answer properly (error $status). Please try again."
                throw ApiException(status, msg)
            }
            return obj
        } catch (e: ApiException) {
            throw e
        } catch (e: IOException) {
            throw offline()
        } finally {
            c.disconnect()
        }
    }

    private fun offline() = ApiException(0, "No internet connection. Check your data or Wi-Fi and try again.")

    private fun session(o: JsonObject) = json.decodeFromJsonElement(Session.serializer(), o)

    fun login(phone: String, password: String): Session =
        session(request("POST", "/api/auth", null, buildJsonObject { put("action", "login"); put("phone", phone); put("password", password) }))

    fun signup(phone: String, password: String, shopName: String): Session =
        session(request("POST", "/api/auth", null, buildJsonObject { put("action", "signup"); put("phone", phone); put("password", password); put("shopName", shopName) }))

    fun logout(token: String) { runCatching { request("POST", "/api/auth", token, buildJsonObject { put("action", "logout") }) } }

    /** Changes the password; the server logs out other devices and gives this one a new token. */
    fun changePassword(token: String, current: String, next: String): Session =
        session(request("POST", "/api/auth", token, buildJsonObject { put("action", "password"); put("password", current); put("newPassword", next) }))

    fun deleteAccount(token: String, password: String) {
        request("POST", "/api/auth", token, buildJsonObject { put("action", "delete"); put("password", password) })
    }

    fun me(token: String): User = json.decodeFromJsonElement(User.serializer(), request("GET", "/api/me", token)["user"]!!)

    fun config(): ServerConfig = json.decodeFromJsonElement(ServerConfig.serializer(), request("GET", "/api/config", null))

    /** The price of [plan] ("monthly" or "yearly") with a coupon; fails with the server's reason for a bad coupon. */
    fun quote(token: String, plan: String, coupon: String): Quote =
        json.decodeFromJsonElement(Quote.serializer(), request("POST", "/api/pay", token, buildJsonObject { put("action", "quote"); put("plan", plan); put("coupon", coupon) }))

    /** Sends a UPI payment for PakkaBill to check: the 12-digit transaction number (UTR). */
    fun pay(token: String, plan: String, utr: String, coupon: String?): Order =
        json.decodeFromJsonElement(
            Order.serializer(),
            request("POST", "/api/pay", token, buildJsonObject { put("plan", plan); put("utr", utr); if (!coupon.isNullOrBlank()) put("coupon", coupon) })["order"]!!,
        )

    /** The seller's latest payments, newest first. */
    fun orders(token: String): List<Order> =
        request("GET", "/api/pay", token)["orders"]?.let { json.decodeFromJsonElement(ListSerializer(Order.serializer()), it) } ?: emptyList()

    /** Messages and offers for this seller (or for everyone, without a login). */
    fun news(token: String?): List<News> =
        request("GET", "/api/news", token)["news"]?.let { json.decodeFromJsonElement(ListSerializer(News.serializer()), it) } ?: emptyList()

    /** Claims an offer of free Pro days; gives the account with its new Pro date. */
    fun claim(token: String, id: String): User =
        json.decodeFromJsonElement(User.serializer(), request("POST", "/api/news", token, buildJsonObject { put("action", "claim"); put("id", id) })["user"]!!)

    companion object {
        /** The 12-digit UPI transaction number (UTR) in what was copied from a payment app, or null. */
        fun findUtr(text: String): String? =
            Regex("(?<!\\d)\\d{12}(?!\\d)").find(text.replace(Regex("(\\d)[ -](?=\\d)"), "$1"))?.value

        /** The UPI payment link for a Pro plan (opens PhonePe, Google Pay, Paytm or a bank app). */
        fun upiLink(cfg: ServerConfig, plan: String, rupees: Double, phone: String): String {
            fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20")
            val note = "PakkaBill Pro $plan $phone".trim().take(50)
            return "upi://pay?pa=" + cfg.upiId.trim() + "&pn=" + enc(cfg.payeeName.ifBlank { "PakkaBill" }.take(40)) +
                "&am=" + String.format(java.util.Locale.ENGLISH, "%.2f", rupees) + "&cu=INR&tn=" + enc(note)
        }

        /** 10-digit Indian mobile number from what the seller typed (+91, spaces, a leading 0). */
        fun normPhone(s: String): String? {
            val d = s.filter { it.isDigit() }
            val n = when {
                d.length == 12 && d.startsWith("91") -> d.drop(2)
                d.length == 11 && d.startsWith("0") -> d.drop(1)
                else -> d
            }
            return if (n.length == 10 && n[0] in '6'..'9') n else null
        }
    }
}
