package com.github.yhk1038.claudecodegui.statusbar

import com.github.yhk1038.claudecodegui.actions.OpenClaudeCodeAction
import com.github.yhk1038.claudecodegui.hosting.ThinClient
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.intellij.util.Consumer
import java.awt.Component
import java.awt.event.MouseEvent

/**
 * The status of the chat the user was last in, in the IDE's status bar: whether
 * it is working or waiting for an answer, and how much of the context window it
 * has used, with the model and mode in the tooltip. Ported from CC GUI's status
 * bar widget.
 *
 * Kotlin draws it and decides nothing about it. The words come from the webview,
 * which already shows the same facts in the composer; this side only picks the
 * chat to speak for ([ChatStatusBoard]) and brings it to the front on a click.
 *
 * Next to the backend dot rather than inside it: the dot is about the process
 * shared by every chat, this is about one conversation, and the user can hide
 * either from the status bar's own menu.
 */
class ChatStatusBarWidget(private val project: Project) : StatusBarWidget, StatusBarWidget.TextPresentation {

    private val service = ChatStatusService.getInstance(project)

    override fun ID(): String = WIDGET_ID

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun install(statusBar: StatusBar) {}

    override fun dispose() {}

    override fun getText(): String = service.board.shown()?.text ?: ""

    override fun getAlignment(): Float = Component.CENTER_ALIGNMENT

    override fun getTooltipText(): String? = service.board.shown()?.tooltip?.let(::tooltipHtml)

    override fun getClickConsumer(): Consumer<MouseEvent> = Consumer {
        val panelId = service.board.shownPanelId ?: return@Consumer
        // The same door every "show this chat" entry point uses, so the chat comes
        // forward wherever it lives: its editor tab or the tool window.
        OpenClaudeCodeAction.openTab(project, panelId)
    }

    companion object {
        const val WIDGET_ID = "ClaudeCodeGui.ChatStatus"
    }
}

/** Puts [ChatStatusBarWidget] in every project window's status bar. Public platform API only. */
class ChatStatusBarWidgetFactory : StatusBarWidgetFactory {

    override fun getId(): String = ChatStatusBarWidget.WIDGET_ID

    override fun getDisplayName(): String = "Claude Code Chat Status"

    /**
     * Not on the JetBrains Client half of Remote Development: the chats report to
     * the host's half, so a widget here would stay empty for good (issue #292).
     */
    override fun isAvailable(project: Project): Boolean = !ThinClient.isThinClient()

    override fun createWidget(project: Project): StatusBarWidget = ChatStatusBarWidget(project)
}
