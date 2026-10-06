package com.github.yhk1038.claudecodegui.terminal

import com.github.yhk1038.claudecodegui.actions.ConsoleSelection
import com.github.yhk1038.claudecodegui.actions.EditorContextSender
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.editor.EditorKind
import com.intellij.openapi.project.DumbAware
import com.intellij.terminal.JBTerminalWidget

/** Where a terminal's selection is found, whichever of the IDE's terminals it is. */
object TerminalSelection {
    /**
     * The first source with more than whitespace in it. The sources are asked in
     * order and only as far as needed, since reading an editor's selection is
     * not free and the earlier sources usually answer.
     */
    fun first(vararg sources: () -> String?): String? =
        sources.asSequence().map { it() }.firstOrNull { !it.isNullOrBlank() }
}

/**
 * "Send Selection to Claude Code" in the terminal's context menu: puts the
 * selected terminal text (a command's output, an error) into the chat input, on
 * lines of its own, the same way the Run/Debug console's action does. Ported
 * from CC GUI's "send terminal selection".
 *
 * The supported IDE range has three terminals, and each hands its selection to
 * an action through a public data key of its own:
 * - the classic terminal: [JBTerminalWidget.SELECTED_TEXT_DATA_KEY];
 * - the reworked terminal from 2025.3: [PlatformDataKeys.PREDEFINED_TEXT], which
 *   it fills with the selection for Find in Files and Search Everywhere;
 * - the reworked terminal of 2025.1 and 2025.2, and the block terminal before
 *   it: the selection of the editor it puts under [CommonDataKeys.EDITOR]. Its
 *   output is a console-kind editor; a code editor's selection is not taken,
 *   since this action can also be run from Find Action over one.
 *
 * The action joins those terminals' menus at run time; see [TerminalMenus].
 */
class SendTerminalSelectionAction : AnAction(), DumbAware {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val text = ConsoleSelection.sendableText(selectedText(e)) ?: return
        val workingDir = project.basePath
        EditorContextSender.send(project, workingDir, ConsoleSelection.buildPayload(text, workingDir))
    }

    // Always in the terminal menus it joins, and enabled only with something
    // selected, like the terminal's own Copy beside it.
    override fun update(e: AnActionEvent) {
        val project = e.project
        e.presentation.isVisible = project != null
        e.presentation.isEnabled = project != null && ConsoleSelection.sendableText(selectedText(e)) != null
    }

    // An editor's selection is read on the EDT, where the terminal updates it.
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    companion object {
        const val ID = "ClaudeCode.SendTerminalSelection"

        private fun selectedText(e: AnActionEvent): String? = TerminalSelection.first(
            { e.getData(JBTerminalWidget.SELECTED_TEXT_DATA_KEY) },
            { e.getData(PlatformDataKeys.PREDEFINED_TEXT) },
            {
                e.getData(CommonDataKeys.EDITOR)
                    ?.takeIf { it.editorKind == EditorKind.CONSOLE }
                    ?.selectionModel?.selectedText
            },
        )
    }
}
