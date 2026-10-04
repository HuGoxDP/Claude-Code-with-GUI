package com.github.yhk1038.claudecodegui.actions

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

/**
 * Pure, platform-independent logic for building the editor-context payload.
 *
 * Extracted from [SendSelectionToClaudeAction] so it can be unit-tested without
 * the IntelliJ platform, EDT, coroutines, or HTTP. Only string handling and
 * kotlinx.serialization are used here.
 */
object EditorContextPayload {

    /**
     * Compute the path of [absolutePath] relative to [workingDir].
     *
     * Returns [absolutePath] unchanged when:
     * - [workingDir] is null or blank, or
     * - [absolutePath] is not located under [workingDir].
     *
     * A trailing slash on [workingDir] is normalized. Sibling directories that
     * merely share a name prefix (e.g. "/abs/path" vs "/abs/pathology") are not
     * treated as a parent.
     */
    fun computeRelativePath(absolutePath: String, workingDir: String?): String {
        if (workingDir.isNullOrBlank()) return absolutePath
        val normalizedDir = workingDir.trimEnd('/')
        val prefix = "$normalizedDir/"
        return if (absolutePath.startsWith(prefix)) {
            absolutePath.substring(prefix.length)
        } else {
            absolutePath
        }
    }

    /**
     * Build the JSON payload sent to the backend's /internal/editor-context endpoint.
     *
     * When there is no selection, [startLine] and [endLine] are null and serialized
     * as JSON null. [workingDir] is serialized as JSON null when null. Note that
     * selectedText and language are intentionally omitted — the chat input only
     * needs the file path and optional line range.
     */
    fun buildPayload(
        absolutePath: String,
        relativePath: String,
        startLine: Int?,
        endLine: Int?,
        workingDir: String?
    ): JsonObject = buildJsonObject {
        put("absolutePath", JsonPrimitive(absolutePath))
        put("relativePath", JsonPrimitive(relativePath))
        put("startLine", startLine?.let { JsonPrimitive(it) } ?: JsonNull)
        put("endLine", endLine?.let { JsonPrimitive(it) } ?: JsonNull)
        put("workingDir", workingDir?.let { JsonPrimitive(it) } ?: JsonNull)
    }

    /** A file or folder picked in the project view or on an editor tab. */
    data class FileRef(val absolutePath: String, val isDirectory: Boolean)

    /**
     * The path a picked file or folder is mentioned by: relative to [workingDir]
     * when it is inside it, and a folder ending in `/`, as the CLI's own `@`
     * completion writes folders. The working directory itself is `./`.
     */
    fun mentionPath(file: FileRef, workingDir: String?): String {
        if (!workingDir.isNullOrBlank() && file.absolutePath.trimEnd('/') == workingDir.trimEnd('/')) return "./"
        val relative = computeRelativePath(file.absolutePath, workingDir)
        return if (file.isDirectory && !relative.endsWith("/")) "$relative/" else relative
    }

    /**
     * Build the editor-context payload for several files at once.
     *
     * Every path goes in `items`, so the webview inserts them all in one go;
     * sent one request at a time, each insertion would read the composer before
     * the previous one had rendered. The first item is repeated at the top
     * level, the shape a single-path payload has. Returns null for no files.
     */
    fun buildFilesPayload(files: List<FileRef>, workingDir: String?): JsonObject? {
        if (files.isEmpty()) return null
        val items = files.map { file ->
            buildJsonObject {
                put("absolutePath", JsonPrimitive(file.absolutePath))
                put("relativePath", JsonPrimitive(mentionPath(file, workingDir)))
                put("startLine", JsonNull)
                put("endLine", JsonNull)
            }
        }
        return buildJsonObject {
            items.first().forEach { (key, value) -> put(key, value) }
            put("workingDir", workingDir?.let { JsonPrimitive(it) } ?: JsonNull)
            put("items", JsonArray(items))
        }
    }

    /**
     * Build the JSON payload sent to the backend's /internal/ide-selection endpoint.
     *
     * Extends [buildPayload] with [selectedText] so the passive auto-selection
     * channel can transmit the currently selected text alongside the file and line
     * range. When [selectedText] is null (no selection or tab-only switch),
     * [startLine], [endLine], and [selectedText] are all serialized as JSON null.
     *
     * Contract agreed with the backend:
     * ```
     * { absolutePath, relativePath,
     *   startLine: number | null,   // 1-based, null when no selection
     *   endLine:   number | null,
     *   selectedText: string | null,
     *   workingDir: string,
     *   isGitignored: boolean }      // true when the file is VCS-ignored
     * ```
     */
    fun buildSelectionPayload(
        absolutePath: String,
        relativePath: String,
        startLine: Int?,
        endLine: Int?,
        selectedText: String?,
        workingDir: String?,
        isGitignored: Boolean = false
    ): JsonObject = buildJsonObject {
        put("absolutePath", JsonPrimitive(absolutePath))
        put("relativePath", JsonPrimitive(relativePath))
        put("startLine", startLine?.let { JsonPrimitive(it) } ?: JsonNull)
        put("endLine", endLine?.let { JsonPrimitive(it) } ?: JsonNull)
        put("selectedText", selectedText?.let { JsonPrimitive(it) } ?: JsonNull)
        put("workingDir", workingDir?.let { JsonPrimitive(it) } ?: JsonNull)
        put("isGitignored", JsonPrimitive(isGitignored))
    }
}

/**
 * Editor action that sends the current file path (and selected line range, if any)
 * to the Claude Code chat input.
 *
 * Triggered via Alt+K or the editor context menu. The action:
 * 1. Extracts file path + optional selection range from the editor.
 * 2. Ensures the Node.js backend is running and focuses/opens a Claude Code tab.
 * 3. POSTs the editor context to the backend's /internal/editor-context endpoint
 *    on a background coroutine (fire-and-forget).
 *
 * The backend forwards the context to the webview, which inserts it as text into
 * the chat input (implemented in later stages).
 */
class SendSelectionToClaudeAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val vFile = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return

        val selectionModel = editor.selectionModel
        val hasSelection = selectionModel.hasSelection() && selectionModel.selectedText != null
        val startLine: Int?
        val endLine: Int?
        if (hasSelection) {
            // Editor positions are 0-based; the payload uses 1-based line numbers.
            startLine = selectionModel.selectionStartPosition?.line?.plus(1)
            endLine = selectionModel.selectionEndPosition?.line?.plus(1)
        } else {
            startLine = null
            endLine = null
        }

        val absolutePath = vFile.path
        val workingDir = project.basePath
        val relativePath = EditorContextPayload.computeRelativePath(absolutePath, workingDir)
        val payload = EditorContextPayload.buildPayload(
            absolutePath = absolutePath,
            relativePath = relativePath,
            startLine = startLine,
            endLine = endLine,
            workingDir = workingDir
        )

        EditorContextSender.send(project, workingDir, payload)
    }

    override fun update(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR)
        val vFile = e.getData(CommonDataKeys.VIRTUAL_FILE)
        // Disable inside the Claude Code JCEF panel itself.
        e.presentation.isEnabledAndVisible =
            editor != null && vFile != null && vFile !is ClaudeCodeVirtualFile
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT
}
