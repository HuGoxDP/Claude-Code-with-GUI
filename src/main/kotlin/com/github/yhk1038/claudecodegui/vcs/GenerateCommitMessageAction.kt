package com.github.yhk1038.claudecodegui.vcs

import com.github.yhk1038.claudecodegui.bridge.NoopRpcHandler
import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.vcs.CheckinProjectPanel
import com.intellij.openapi.vcs.CommitMessageI
import com.intellij.openapi.vcs.FilePath
import com.intellij.openapi.vcs.VcsDataKeys
import com.intellij.openapi.vcs.changes.Change
import com.intellij.openapi.vcs.changes.ChangeListManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonObject
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.atomic.AtomicLong

/**
 * "Generate Commit Message with Claude" in the commit message box's toolbar.
 *
 * Collects the files included in the commit and the draft already typed, asks
 * the backend to write the message (`POST /internal/commit-message`: git diff +
 * one `claude -p`), and puts the answer in the box. Nothing is committed.
 *
 * Registered from claudecode-vcs.xml, which loads only where the IDE has VCS
 * support, so the VCS classes below are never touched in an IDE without it.
 *
 * The newer commit UI exposes the included changes and the draft only through
 * its workflow objects. Those are reached by data key NAME and by reflection —
 * as the commit-message plugins before this one do — so no experimental or
 * internal class is referenced at compile time and the Plugin Verifier has
 * nothing to flag. When they are not there (an older or different commit UI),
 * the stable keys below take over.
 */
class GenerateCommitMessageAction : AnAction(), DumbAware {

    private val logger = Logger.getInstance(GenerateCommitMessageAction::class.java)

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null && messageControl(e) != null
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val control = messageControl(e) ?: return
        val workingDir = project.basePath ?: return

        val paths = includedPaths(e, project)
        if (paths.isEmpty()) {
            notify(project, "Include some changes in the commit first.", NotificationType.WARNING)
            return
        }

        val draft = currentDraft(e, control)
        val payload = CommitMessageRequest.buildPayload(workingDir, paths, draft)
        val ticket = nextTicket(project)
        // Only cover the box when its text could be read and so can be put back.
        // An unreadable draft stays on screen instead of being lost to a failure.
        if (draft != null) control.setCommitMessage(CommitMessageRequest.PLACEHOLDER)

        // Same per-project backend as the chat panels; a transient panel id keeps it
        // alive for the length of this request only.
        val backend = NodeBackendService.getInstance()
        val transientPanelId = "action-transient-" + System.currentTimeMillis()
        backend.ensureStarted(workingDir, transientPanelId, NoopRpcHandler)

        CoroutineScope(Dispatchers.IO).launch {
            val outcome: CommitMessageRequest.Outcome = try {
                val port = withTimeout(BACKEND_START_TIMEOUT_MS) { backend.awaitPort(workingDir) }
                val (status, body) = post(port, payload, backend.authToken(workingDir))
                CommitMessageRequest.parseResponse(status, body)
            } catch (ex: Exception) {
                logger.warn("Failed to generate a commit message", ex)
                CommitMessageRequest.Outcome.Failure(ex.message ?: ex.javaClass.simpleName)
            } finally {
                backend.releasePanel(workingDir, transientPanelId)
            }

            ApplicationManager.getApplication().invokeLater({
                // A second click started a newer request, or the project closed:
                // this answer is for a box that has moved on.
                if (project.isDisposed || !isCurrent(project, ticket)) return@invokeLater
                when (outcome) {
                    is CommitMessageRequest.Outcome.Message -> control.setCommitMessage(outcome.text)
                    is CommitMessageRequest.Outcome.Failure -> {
                        if (draft != null) control.setCommitMessage(draft)
                        notify(project, "Could not write a commit message: ${outcome.reason}", NotificationType.ERROR)
                    }
                }
            }, ModalityState.any())
        }
    }

    /** The message box: the workflow handler when it is one, otherwise the classic control. */
    private fun messageControl(e: AnActionEvent): CommitMessageI? =
        (e.getData(WORKFLOW_HANDLER) as? CommitMessageI) ?: e.getData(VcsDataKeys.COMMIT_MESSAGE_CONTROL)

    private fun workflowUi(e: AnActionEvent): Any? =
        e.getData(WORKFLOW_UI) ?: e.getData(WORKFLOW_HANDLER)?.let { call(it, "getUi") }

    /**
     * Absolute paths of the files in the commit, both sides of a rename, plus
     * included unversioned files. Prefers the ticked set in the commit UI and
     * falls back to the classic panel, the selection, and finally every change.
     */
    private fun includedPaths(e: AnActionEvent, project: Project): List<String> {
        val ui = workflowUi(e)
        val changes: Collection<Change> =
            (ui?.let { call(it, "getIncludedChanges") } as? Collection<*>)?.filterIsInstance<Change>()?.takeIf { it.isNotEmpty() }
                ?: (e.getData(VcsDataKeys.COMMIT_MESSAGE_CONTROL) as? CheckinProjectPanel)?.selectedChanges?.takeIf { it.isNotEmpty() }
                ?: e.getData(VcsDataKeys.CHANGES)?.toList()?.takeIf { it.isNotEmpty() }
                ?: ChangeListManager.getInstance(project).allChanges
        val unversioned = (ui?.let { call(it, "getIncludedUnversionedFiles") } as? Collection<*>)
            ?.filterIsInstance<FilePath>()
            .orEmpty()

        val paths = LinkedHashSet<String>()
        for (change in changes) {
            change.beforeRevision?.file?.path?.let { paths.add(it) }
            change.afterRevision?.file?.path?.let { paths.add(it) }
        }
        unversioned.forEach { paths.add(it.path) }
        return paths.toList()
    }

    /** What the author already typed, or null when the box cannot be read. */
    private fun currentDraft(e: AnActionEvent, control: CommitMessageI): String? {
        workflowUi(e)?.let { ui ->
            (call(ui, "getCommitMessageUi")?.let { call(it, "getText") } as? String)?.let { return it }
        }
        (control as? CheckinProjectPanel)?.commitMessage?.let { return it }
        for (getter in listOf("getComment", "getCommitMessage", "getText")) {
            (call(control, getter) as? String)?.let { return it }
        }
        return null
    }

    private fun post(port: Int, payload: JsonObject, authToken: String?): Pair<Int, String?> {
        val conn = URI("http://127.0.0.1:$port/internal/commit-message").toURL().openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 2_000
            // The backend gives the model two minutes; wait a little longer so its
            // own timeout message is what the user reads.
            conn.readTimeout = READ_TIMEOUT_MS
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            // Per-launch token the /internal routes require. Never logged.
            if (!authToken.isNullOrEmpty()) conn.setRequestProperty("x-ccg-token", authToken)
            conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
            logger.info("POST /internal/commit-message returned HTTP $code")
            return code to body
        } finally {
            conn.disconnect()
        }
    }

    private fun notify(project: Project, content: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup(NOTIFICATION_GROUP)
            .createNotification(content, type)
            .notify(project)
    }

    companion object {
        private const val NOTIFICATION_GROUP = "claude-code-gui.commit-message"
        private const val BACKEND_START_TIMEOUT_MS = 30_000L
        private const val READ_TIMEOUT_MS = 150_000

        // Looked up by name; see the class comment.
        private val WORKFLOW_HANDLER: DataKey<Any> = DataKey.create("Vcs.CommitWorkflowHandler")
        private val WORKFLOW_UI: DataKey<Any> = DataKey.create("Vcs.CommitWorkflowUi")

        /** Requests per project, so only the newest answer reaches the box. EDT only. */
        private val TICKET: Key<AtomicLong> = Key.create("ClaudeCode.CommitMessageTicket")

        private fun nextTicket(project: Project): Long {
            val counter = project.getUserData(TICKET) ?: AtomicLong().also { project.putUserData(TICKET, it) }
            return counter.incrementAndGet()
        }

        private fun isCurrent(project: Project, ticket: Long): Boolean = project.getUserData(TICKET)?.get() == ticket

        /** A public no-argument method by name, or null when there is none or it throws. */
        private fun call(target: Any, name: String): Any? = try {
            target.javaClass.getMethod(name).invoke(target)
        } catch (_: Throwable) {
            null
        }
    }
}
