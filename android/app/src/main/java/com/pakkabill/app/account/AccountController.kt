package com.pakkabill.app.account

import com.pakkabill.app.data.KeyValue
import com.pakkabill.core.Access
import com.pakkabill.core.Api
import com.pakkabill.core.ApiException
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

data class AccountUi(val session: Session? = null, val config: ServerConfig? = null) {
    val access get() = Access.of(session, config)
    val loggedIn get() = session != null
}

/**
 * The PakkaBill account: log in, sign up, change password, log out, delete. The login token is
 * kept in the app's private storage. Plans follow the same rules as the website.
 */
class AccountController(private val api: Api, private val kv: KeyValue, private val scope: CoroutineScope) {
    private val _ui = MutableStateFlow(
        AccountUi(
            session = kv.get(K_SESSION)?.let { runCatching { json.decodeFromString(Session.serializer(), it) }.getOrNull() },
            config = kv.get(K_CONFIG)?.let { runCatching { json.decodeFromString(ServerConfig.serializer(), it) }.getOrNull() },
        ),
    )
    val ui: StateFlow<AccountUi> = _ui.asStateFlow()

    private fun setSession(s: Session?) {
        kv.put(K_SESSION, s?.let { json.encodeToString(Session.serializer(), it) })
        _ui.value = _ui.value.copy(session = s)
    }

    /** Checks the plan settings and the account again (when the app opens). Fails quietly offline. */
    fun refresh() {
        scope.launch(Dispatchers.IO) {
            runCatching { api.config() }.onSuccess { c ->
                kv.put(K_CONFIG, json.encodeToString(ServerConfig.serializer(), c))
                _ui.value = _ui.value.copy(config = c)
            }
            val s = _ui.value.session ?: return@launch
            try {
                val u = api.me(s.token)
                setSession(s.copy(user = u))
            } catch (e: ApiException) {
                // logged out elsewhere, password changed or reset, or account stopped
                if (e.status == 401 || e.status == 403) setSession(null)
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
    }
}
