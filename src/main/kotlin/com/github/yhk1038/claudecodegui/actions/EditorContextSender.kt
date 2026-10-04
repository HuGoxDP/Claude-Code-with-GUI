package com.github.yhk1038.claudecodegui.actions

import com.github.yhk1038.claudecodegui.bridge.NoopRpcHandler
import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.net.HttpURLConnection
import java.net.URI

/**
 * Sends an editor-context payload to the backend's /internal/editor-context
 * endpoint and reveals the chat it landed in.
 *
 * Shared by every "Send to Claude Code" entry point (the editor's Alt+K and the
 * project view / editor tab menus), so they all reach the same panel the same way.
 */
object EditorContextSender {

    private val logger = Logger.getInstance(EditorContextSender::class.java)

    /**
     * Fire-and-forget: starts the backend if needed, posts [payload] on a
     * background coroutine, then reveals the panel the backend names.
     */
    fun send(project: Project, workingDir: String?, payload: JsonObject) {
        // Ensure the backend is running. A transient panel id keeps a no-op handler
        // registered only for the lifetime of this request, then is released in finally.
        val backend = NodeBackendService.getInstance()
        val transientPanelId = "action-transient-" + System.currentTimeMillis()
        // Key the backend by IDE project root (not workingDir) so this action shares
        // the same per-root backend as the project's Claude Code panels (#57).
        val backendKey = project.basePath ?: workingDir ?: ""
        backend.ensureStarted(backendKey, transientPanelId, NoopRpcHandler)

        // Send the mention, THEN reveal based on the backend's answer. The mention
        // routes to the last-focused panel (browser or JCEF); the response's
        // revealTarget tells us what to reveal in the IDE — focus that JCEF tab, do
        // nothing for a browser tab, or open a fresh tab when nothing is focused
        // (ConnectionManager.getRevealTarget). Reveal used to be unconditional,
        // which popped an IDE tab even when the active Claude was a browser tab.
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val port = backend.awaitPort(backendKey)
                // /internal routes require the stable token (Phase 1 defense-in-depth).
                val response = postJson(port, "/internal/editor-context", payload, backend.authToken(backendKey))
                revealFromResponse(project, response)
            } catch (ex: Exception) {
                logger.warn("Failed to send editor context to backend", ex)
            } finally {
                backend.releasePanel(backendKey, transientPanelId)
            }
        }
    }

    /**
     * Reveal in the IDE according to the backend's revealTarget, on the EDT:
     *   - jcef    → focus/open that exact panel (panelId == tabId after unification);
     *               host-aware, so a hidden tool-window panel is reopened and focused.
     *   - browser → do nothing; the active Claude is a browser tab (the mention
     *               already routed there via routeToFocusedOrBroadcast).
     *   - none    → nothing was focused/alive, so open a fresh tab (host-aware).
     */
    private fun revealFromResponse(project: Project, response: String?) {
        var kind = "none"
        var panelId: String? = null
        if (response != null) {
            try {
                val revealTarget = Json.parseToJsonElement(response).jsonObject["revealTarget"]?.jsonObject
                if (revealTarget != null) {
                    kind = revealTarget["kind"]?.jsonPrimitive?.content ?: "none"
                    panelId = revealTarget["panelId"]?.jsonPrimitive?.contentOrNull
                }
            } catch (ex: Exception) {
                logger.warn("Failed to parse editor-context revealTarget; opening host default", ex)
            }
        }
        val targetPanelId = panelId
        ApplicationManager.getApplication().invokeLater {
            when {
                kind == "jcef" && targetPanelId != null -> OpenClaudeCodeAction.openTab(project, targetPanelId)
                kind == "browser" -> Unit // active Claude is a browser tab — leave the IDE alone
                else -> OpenClaudeCodeAction.openOrFocus(project)
            }
        }
    }

    private fun postJson(port: Int, path: String, payload: JsonObject, authToken: String?): String? {
        val url = URI("http://127.0.0.1:$port$path").toURL()
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 2000
            conn.readTimeout = 2000
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            // Stable control-channel token in the custom header the backend requires
            // on the /internal routes (mirrors backend HTTP_AUTH_HEADER). Never logged.
            if (!authToken.isNullOrEmpty()) conn.setRequestProperty("x-ccg-token", authToken)
            conn.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            logger.info("POST $path returned HTTP $code")
            // Return the JSON body on success so the caller can act on revealTarget.
            return if (code in 200..299) conn.inputStream.bufferedReader().use { it.readText() } else null
        } finally {
            conn.disconnect()
        }
    }

}
