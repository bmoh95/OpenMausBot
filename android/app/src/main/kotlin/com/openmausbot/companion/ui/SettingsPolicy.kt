package com.openmausbot.companion.ui

import com.openmausbot.companion.core.L10n

import com.openmausbot.companion.core.Connection
import com.openmausbot.companion.core.Session
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * What little the phone gets to configure — `ios/App/SettingsView.swift`.
 *
 * Almost nothing, on purpose: Phone settings, API keys and pairing all live
 * on the computer, because losing the phone must not mean losing the ability to
 * lock it out (§13). This is a status page with an unpair button.
 */
object SettingsPolicy {
    val NOTIFICATIONS_FOOTER: String get() = L10n.s("Approvals and finished work appear while MausBot is connected, including " +
            "frames replayed after a short background pause. Closed-app push needs a " +
            "separate push-relay release that does not exist yet.")
    val WORKSPACE_FOOTER: String get() = L10n.s("Routine schedules are safe to manage here. Provider keys, webhook secrets, " +
            "pairing, revocation, Local VM, and agent execution policy stay on your computer.")
    val UNPAIR_FOOTER: String get() = L10n.s("Removes the pairing from this phone only. To stop it reaching the computer at all, " +
            "remove the device in OpenMausBot → Settings → Phone.")
    val NOT_HERE: String get() = L10n.s("API keys, pairing and the Local VM are managed on the computer. This phone is " +
            "deliberately not allowed to change them.")
    val UNPAIR_CONFIRM_TITLE: String get() = L10n.s("Unpair this phone?")
    val UNPAIR_CONFIRM_MESSAGE: String get() = L10n.s("You'll need a new pairing code to connect again.")
    val EDIT_ADDRESS_MESSAGE: String get() = L10n.s("Enter whatever Phone settings on your computer shows. The pairing itself is kept.")
    fun statusText(status: Session.Status): String = when (status) {
        Session.Status.Live -> L10n.s("Connected")
        Session.Status.Connecting -> L10n.s("Connecting…")
        Session.Status.Unpaired -> L10n.s("Not paired")
        Session.Status.Unauthorized -> L10n.s("Unpaired on the computer")
        is Session.Status.Offline -> status.message
    }

    fun addressText(connection: Connection?): String =
        connection?.displayAddress ?: "—"
}

/**
 * The stored address can simply go stale — a tailnet name on a phone that left
 * the tailnet, a LAN address after the router reshuffled. Editing it keeps the
 * pairing and its token; the alternative is a walk to the computer for a new code
 * (§7).
 */
object AddressEdit {
    val INVALID: String get() = L10n.s("Enter a secure https:// address, 192.168.1.42:8810, or a name like " +
            "macbook.tail1234.ts.net.")
    /** The same parse `Session.updateAddress` will do, so the form can say no first. */
    fun isValid(text: String): Boolean = Connection.parse(text) != null
}

/** What the notification row can offer right now. */
enum class NotificationAccess {
    GRANTED,

    /** Not granted, and the OS will still show a prompt. */
    ASKABLE,

    /** Only the system settings page can turn these back on. */
    BLOCKED,
}

/**
 * The notification permission, as a row with one button.
 *
 * Two platform facts shape this, and getting either wrong shows the user a button
 * that does nothing:
 *
 * - **Being granted the runtime permission is not the same as notifications being
 *   on.** Below API 33 there is no runtime permission at all, yet a person can
 *   still switch the app's notifications off in system settings; on 33+ they can
 *   do it after granting. `areNotificationsEnabled()` is the question that
 *   actually matters on every version, so that is what [isGranted] asks.
 * - **"Denied for good" is not directly observable.** After a refusal
 *   `shouldShowRequestPermissionRationale` stays true while the OS is still
 *   willing to prompt and goes false once it is not — but it is *also* false
 *   before the first request. The two are told apart by [hasAskedBefore], which
 *   outlives the Activity and the process, so a recreation does not turn a dead
 *   request back into a live-looking button. `PermissionRequests` sets that flag
 *   as part of launching any prompt, so every path that can ask is covered — not
 *   only the one this class starts.
 *
 * Where no request can help — pre-33, or a permanent denial — the button routes
 * to the app's notification settings instead.
 */
class NotificationPermissionController(
    private val isGranted: () -> Boolean,
    /** False below API 33, where there is no runtime permission to ask for. */
    private val canRequest: () -> Boolean,
    private val shouldShowRationale: () -> Boolean,
    private val hasAskedBefore: () -> Boolean,
    /** Goes through [PermissionRequests], which records the asking. */
    private val request: () -> Unit,
    private val openSettings: () -> Unit,
) {
    private val _access = MutableStateFlow(read())
    val access: StateFlow<NotificationAccess> = _access.asStateFlow()

    /** The single button: ask when asking can work, otherwise hand over to settings. */
    fun act() {
        val current = read()
        _access.value = current
        when (current) {
            NotificationAccess.GRANTED -> Unit
            NotificationAccess.BLOCKED -> openSettings()
            // PermissionRequests records the asking as part of launching it, so
            // a process death mid-prompt still counts as having asked.
            NotificationAccess.ASKABLE -> request()
        }
    }

    fun onResult(granted: Boolean) {
        _access.value = read(grantedOverride = granted)
    }

    /** A change made in system settings should take effect on return. */
    fun refresh() {
        _access.value = read()
    }

    private fun read(grantedOverride: Boolean? = null): NotificationAccess {
        val granted = grantedOverride?.let { it && isGranted() } ?: isGranted()
        return when {
            granted -> NotificationAccess.GRANTED
            // Nothing to ask for: only system settings can turn these back on.
            !canRequest() -> NotificationAccess.BLOCKED
            // The OS is still willing to prompt.
            shouldShowRationale() -> NotificationAccess.ASKABLE
            // No rationale and we have asked before: the prompt is spent.
            hasAskedBefore() -> NotificationAccess.BLOCKED
            else -> NotificationAccess.ASKABLE
        }
    }

    companion object {
        fun statusText(access: NotificationAccess): String = when (access) {
            NotificationAccess.GRANTED -> L10n.s("Allowed")
            NotificationAccess.ASKABLE -> L10n.s("Not allowed")
            NotificationAccess.BLOCKED -> L10n.s("Turned off in system settings")
        }

        fun buttonText(access: NotificationAccess): String = when (access) {
            NotificationAccess.GRANTED -> L10n.s("Notifications are on")
            NotificationAccess.ASKABLE -> L10n.s("Enable notifications")
            NotificationAccess.BLOCKED -> L10n.s("Open notification settings")
        }

        fun buttonEnabled(access: NotificationAccess): Boolean =
            access != NotificationAccess.GRANTED
    }
}
