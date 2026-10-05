package com.github.yhk1038.claudecodegui.actions

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.wm.WindowManager
import java.awt.datatransfer.StringSelection

/**
 * Editor action that copies the current file, and the selected lines if any,
 * as the `@` reference the Claude Code CLI reads (`@src/a.ts#L10-12`).
 *
 * For pasting where the chat input is not: a Claude Code session in a terminal,
 * a note, a message to someone. Inside the chat, Alt+K inserts the same text
 * directly. The path is relative to the project, as Alt+K writes it; the
 * reference is meant for a Claude Code session started in the project.
 *
 * Only the clipboard is touched, so nothing here needs the backend.
 */
class CopyClaudeReferenceAction : AnAction(), DumbAware {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val vFile = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return

        val lines = selectedLineRange(editor)
        val relativePath = EditorContextPayload.computeRelativePath(vFile.path, project.basePath)
        val reference = EditorContextPayload.referenceText(relativePath, lines?.first, lines?.second)

        CopyPasteManager.getInstance().setContents(StringSelection(reference))
        WindowManager.getInstance().getStatusBar(project)?.info = "Copied $reference"
    }

    override fun update(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR)
        val vFile = e.getData(CommonDataKeys.VIRTUAL_FILE)
        // Not inside the Claude Code panel itself, which is not a file anyone can mention.
        e.presentation.isEnabledAndVisible =
            e.project != null && editor != null && vFile != null && vFile !is ClaudeCodeVirtualFile
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT
}
