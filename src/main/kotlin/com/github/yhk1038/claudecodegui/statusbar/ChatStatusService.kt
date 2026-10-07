package com.github.yhk1038.claudecodegui.statusbar

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.WindowManager

/**
 * The chat statuses of one project window, for [ChatStatusBarWidget].
 *
 * Holds no state of its own beyond the [ChatStatusBoard], and nothing persists:
 * a status is only ever what a live panel last said, so after a restart the bar
 * starts empty and fills as the chats report.
 */
@Service(Service.Level.PROJECT)
class ChatStatusService(private val project: Project) {

    val board = ChatStatusBoard()

    /** A chat panel's latest status; see [ChatStatusBoard.report]. */
    fun report(panelId: String, focused: Boolean, status: ChatStatusBoard.ChatStatus?) {
        if (board.report(panelId, focused, status)) repaint()
    }

    /** The tab of [panelId] was closed for good (not moved or split). */
    fun remove(panelId: String) {
        if (board.remove(panelId)) repaint()
    }

    private fun repaint() {
        ApplicationManager.getApplication().invokeLater {
            if (project.isDisposed) return@invokeLater
            WindowManager.getInstance().getStatusBar(project)?.updateWidget(ChatStatusBarWidget.WIDGET_ID)
        }
    }

    companion object {
        fun getInstance(project: Project): ChatStatusService =
            project.getService(ChatStatusService::class.java)
    }
}
