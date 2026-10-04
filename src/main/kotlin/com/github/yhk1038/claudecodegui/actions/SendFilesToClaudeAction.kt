package com.github.yhk1038.claudecodegui.actions

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.vfs.VirtualFile

/**
 * "Send to Claude Code" on files and folders in the project view, and on an
 * editor tab: mentions every selected one in the chat input, as `@path` (a
 * folder as `@path/`), the way [SendSelectionToClaudeAction] mentions the file
 * in the editor. Nothing is sent to Claude; the paths wait in the input.
 *
 * Usable while indexing, since it only reads paths.
 */
class SendFilesToClaudeAction : AnAction(), DumbAware {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val files = selectedFiles(e)
        if (files.isEmpty()) return

        val workingDir = project.basePath
        val payload = EditorContextPayload.buildFilesPayload(
            files.map { EditorContextPayload.FileRef(it.path, it.isDirectory) },
            workingDir,
        ) ?: return
        EditorContextSender.send(project, workingDir, payload)
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null && selectedFiles(e).isNotEmpty()
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    /**
     * Files on disk only: a file inside a jar has no path the CLI can read, and
     * the Claude Code tab itself is not a file to mention.
     */
    private fun selectedFiles(e: AnActionEvent): List<VirtualFile> {
        val picked = e.getData(CommonDataKeys.VIRTUAL_FILE_ARRAY)?.toList()
            ?: listOfNotNull(e.getData(CommonDataKeys.VIRTUAL_FILE))
        return picked.filter { it.isValid && it.isInLocalFileSystem && it !is ClaudeCodeVirtualFile }
    }
}
