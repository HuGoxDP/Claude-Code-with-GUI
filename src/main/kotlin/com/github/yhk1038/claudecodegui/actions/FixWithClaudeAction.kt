package com.github.yhk1038.claudecodegui.actions

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.ex.EditorEx
import com.intellij.openapi.project.DumbAware
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** One problem the IDE reports, as the chat input names it. */
data class IdeProblem(val line: Int, val severity: String, val message: String)

/** A highlight in the editor, before it is known to be worth naming. */
data class ProblemCandidate(val line: Int, val severity: HighlightSeverity?, val message: String?)

object FixWithClaude {
    /** The most problems one request names; past it the reference is enough. */
    const val MAX_PROBLEMS = 20

    /**
     * The problems worth handing to Claude: errors and warnings (not the weak
     * warnings and hints the IDE also paints) on lines [startLine]..[endLine],
     * each once, in line order.
     */
    fun selectProblems(candidates: List<ProblemCandidate>, startLine: Int, endLine: Int): List<IdeProblem> =
        candidates
            .asSequence()
            .filter { it.line in startLine..endLine }
            .filter { it.severity != null && it.severity >= HighlightSeverity.WARNING }
            .mapNotNull { candidate ->
                val message = candidate.message?.trim()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                IdeProblem(candidate.line, severityName(candidate.severity!!), message)
            }
            .distinct()
            .sortedBy { it.line }
            .take(MAX_PROBLEMS)
            .toList()

    /** `error` for ERROR, `warning` for WARNING and anything between. */
    fun severityName(severity: HighlightSeverity): String =
        if (severity >= HighlightSeverity.ERROR) "error" else "warning"

    /** The editor-context payload with the problems the chat input lists. */
    fun buildPayload(
        absolutePath: String,
        relativePath: String,
        startLine: Int,
        endLine: Int,
        workingDir: String?,
        problems: List<IdeProblem>,
    ): JsonObject {
        val base = EditorContextPayload.buildPayload(absolutePath, relativePath, startLine, endLine, workingDir)
        val list = JsonArray(problems.map { problem ->
            JsonObject(
                mapOf(
                    "line" to JsonPrimitive(problem.line),
                    "severity" to JsonPrimitive(problem.severity),
                    "message" to JsonPrimitive(problem.message),
                )
            )
        })
        return JsonObject(base + ("problems" to list))
    }
}

/**
 * "Fix with Claude": puts the selection, or the caret's line, into the chat
 * input together with the errors and warnings the IDE reports there, ready for
 * the user to add what they want and send. Ported from CC GUI's Quick Fix.
 *
 * CC GUI asks for the request in a popup and pastes the code block of the reply
 * back over the selection. Here the request is typed in the chat input (the
 * chat is the only UI this plugin draws), and the change comes back the way
 * every change does: Claude edits the file and the edit is reviewed in a diff.
 */
class FixWithClaudeAction : AnAction(), DumbAware {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val vFile = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return

        val (startLine, endLine) = selectedLineRange(editor)
            ?: (editor.caretModel.logicalPosition.line + 1).let { it to it }
        val problems = FixWithClaude.selectProblems(problemCandidates(editor), startLine, endLine)

        val workingDir = project.basePath
        val payload = FixWithClaude.buildPayload(
            absolutePath = vFile.path,
            relativePath = EditorContextPayload.computeRelativePath(vFile.path, workingDir),
            startLine = startLine,
            endLine = endLine,
            workingDir = workingDir,
            problems = problems,
        )
        EditorContextSender.send(project, workingDir, payload)
    }

    override fun update(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR)
        val vFile = e.getData(CommonDataKeys.VIRTUAL_FILE)
        e.presentation.isEnabledAndVisible =
            e.project != null && editor != null && vFile != null && vFile !is ClaudeCodeVirtualFile
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    companion object {
        private val LOG = Logger.getInstance(FixWithClaudeAction::class.java)

        /**
         * What the IDE has highlighted in the document. The highlights live in
         * the document's markup model, reached through [EditorEx]; the object
         * behind a highlight's tooltip carries its severity and message but is
         * an implementation class, so it is read by method name rather than
         * referenced. Anything unexpected yields no candidates, and the action
         * still sends the reference.
         */
        private fun problemCandidates(editor: Editor): List<ProblemCandidate> {
            val markup = (editor as? EditorEx)?.filteredDocumentMarkupModel ?: return emptyList()
            val document = editor.document
            return try {
                markup.allHighlighters.mapNotNull { highlighter ->
                    val info = highlighter.errorStripeTooltip ?: return@mapNotNull null
                    if (!highlighter.isValid || highlighter.startOffset > document.textLength) return@mapNotNull null
                    val severity = call(info, "getSeverity") as? HighlightSeverity
                    val message = call(info, "getDescription") as? String
                    ProblemCandidate(document.getLineNumber(highlighter.startOffset) + 1, severity, message)
                }
            } catch (t: Throwable) {
                LOG.warn("Could not read the editor's problems", t)
                emptyList()
            }
        }

        private fun call(target: Any, method: String): Any? =
            try {
                target.javaClass.getMethod(method).invoke(target)
            } catch (_: ReflectiveOperationException) {
                null
            }
    }
}
