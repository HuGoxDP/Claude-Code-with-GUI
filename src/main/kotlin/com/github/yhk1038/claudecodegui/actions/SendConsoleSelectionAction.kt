package com.github.yhk1038.claudecodegui.actions

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.DumbAware
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

/** Text selected in a Run/Debug console or the terminal, as the chat input takes it. */
object ConsoleSelection {
    /**
     * The longest selection sent. Matches `MAX_EDITOR_CONTEXT_TEXT` on the
     * backend; a log longer than this keeps its END, where the error usually is.
     */
    const val MAX_TEXT_CHARS = 200_000

    /** What stands in for the part cut off the start of an over-long selection. */
    const val CUT_MARK = "…\n"

    /**
     * The selection worth sending, or null when it is only whitespace. Line ends
     * become `\n`; past [MAX_TEXT_CHARS] the start is cut and marked.
     */
    fun sendableText(selected: String?): String? {
        if (selected == null || selected.isBlank()) return null
        val text = selected.replace("\r\n", "\n").replace('\r', '\n')
        if (text.length <= MAX_TEXT_CHARS) return text
        return CUT_MARK + text.takeLast(MAX_TEXT_CHARS - CUT_MARK.length)
    }

    /** The editor-context payload that puts [text] into the chat input of [workingDir]. */
    fun buildPayload(text: String, workingDir: String?): JsonObject = buildJsonObject {
        put("text", JsonPrimitive(text))
        put("workingDir", workingDir?.let { JsonPrimitive(it) } ?: JsonNull)
    }
}

/**
 * "Send Selection to Claude Code" in the Run/Debug console's context menu: puts
 * the selected output (a stack trace, a failing test's message) into the chat
 * input, on lines of its own, ready for the user to say what they want and send.
 * Ported from CC GUI's "send console selection".
 */
class SendConsoleSelectionAction : AnAction(), DumbAware {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val text = ConsoleSelection.sendableText(selectedText(e)) ?: return
        val workingDir = project.basePath
        EditorContextSender.send(project, workingDir, ConsoleSelection.buildPayload(text, workingDir))
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible =
            e.project != null && ConsoleSelection.sendableText(selectedText(e)) != null
    }

    // The console's editor and its selection are read on the EDT, where the
    // console itself updates them.
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    companion object {
        private val LOG = Logger.getInstance(SendConsoleSelectionAction::class.java)

        private fun selectedText(e: AnActionEvent): String? =
            consoleEditor(e)?.selectionModel?.selectedText

        /**
         * The editor showing the console's output. The console view exposes it
         * through a public `getEditor()` that its interface does not declare, so
         * it is called by name rather than through the implementation class;
         * the editor in the action's context is the fallback.
         */
        private fun consoleEditor(e: AnActionEvent): Editor? {
            val console = e.getData(LangDataKeys.CONSOLE_VIEW)
            if (console != null) {
                try {
                    val editor = console.javaClass.getMethod("getEditor").invoke(console)
                    if (editor is Editor) return editor
                } catch (_: ReflectiveOperationException) {
                    // Not this kind of console; fall through.
                } catch (t: RuntimeException) {
                    LOG.debug("Could not read the console's editor", t)
                }
            }
            return e.getData(CommonDataKeys.EDITOR)
        }
    }
}
