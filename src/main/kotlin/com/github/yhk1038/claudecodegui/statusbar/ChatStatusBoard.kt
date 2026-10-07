package com.github.yhk1038.claudecodegui.statusbar

/**
 * Which chat the status bar of one project window speaks for, and what it says.
 *
 * Every chat panel of the window reports its own status (the webview composes
 * the words; see `useReportChatStatus`). The bar has room for one, so it shows
 * the chat the user was last in: a panel that reports while it has focus takes
 * the bar, and keeps it while the user works in the editor, since the point of
 * the bar is to keep an eye on that chat from elsewhere in the IDE.
 *
 * A panel with nothing to say (it moved to the settings screen, or its tab was
 * closed) gives the bar back to the chat the user was in before it, so the bar
 * never goes on showing a status nobody is reporting any more.
 *
 * Free of IDE API so the rule can be unit-tested (see ChatStatusBoardTest).
 */
class ChatStatusBoard {

    /** What the bar shows for one chat: one short line, and the tooltip under it. */
    data class ChatStatus(val text: String, val tooltip: String)

    private val statuses = LinkedHashMap<String, ChatStatus>()

    /** Panels in the order the user was last in them, most recent last. */
    private val focusOrder = ArrayList<String>()

    /** The panel the bar speaks for, or null when no chat has anything to say. */
    @get:Synchronized
    var shownPanelId: String? = null
        private set

    /** What the bar shows, or null when it shows nothing. */
    @Synchronized
    fun shown(): ChatStatus? = shownPanelId?.let { statuses[it] }

    /**
     * Take [panelId]'s latest status. [status] null means the panel has nothing
     * to say for now; [focused] means the user is in that panel as it reports.
     *
     * Returns whether what the bar shows changed, so the caller repaints only then.
     */
    @Synchronized
    fun report(panelId: String, focused: Boolean, status: ChatStatus?): Boolean {
        val before = shownPanelId to shown()
        if (status == null) {
            statuses.remove(panelId)
        } else {
            // Re-inserted so the map's order is the order panels last reported in,
            // which is what picks a panel when none has been focused.
            statuses.remove(panelId)
            statuses[panelId] = status
        }
        if (focused) {
            focusOrder.remove(panelId)
            focusOrder.add(panelId)
        }
        shownPanelId = pick()
        return before != (shownPanelId to shown())
    }

    /** Forget [panelId], whose tab was closed. Returns whether what the bar shows changed. */
    @Synchronized
    fun remove(panelId: String): Boolean {
        val before = shownPanelId to shown()
        statuses.remove(panelId)
        focusOrder.remove(panelId)
        shownPanelId = pick()
        return before != (shownPanelId to shown())
    }

    /**
     * The chat the user was last in that has something to say; failing that, the
     * one that reported last (a panel that opened without ever taking focus).
     */
    private fun pick(): String? =
        focusOrder.lastOrNull { it in statuses } ?: statuses.keys.lastOrNull()
}

/**
 * The webview's tooltip, one line per line, as the HTML a status bar tooltip
 * renders. Escaped first: a session title is the user's own text.
 */
internal fun tooltipHtml(tooltip: String): String {
    val lines = tooltip.split('\n').joinToString("<br>") {
        it.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    }
    return "<html>$lines</html>"
}
