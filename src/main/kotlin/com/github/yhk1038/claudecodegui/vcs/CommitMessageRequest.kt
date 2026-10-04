package com.github.yhk1038.claudecodegui.vcs

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull

/**
 * The plain part of "Generate Commit Message with Claude": what is sent to the
 * backend's `/internal/commit-message` route and how its answer is read.
 *
 * Kept apart from [GenerateCommitMessageAction] so it can be tested without the
 * IntelliJ platform. The message itself is written by the backend (git diff +
 * one `claude -p` call); the IDE only says which files are in the commit and
 * puts the answer in the message box.
 */
object CommitMessageRequest {

    /**
     * The backend refuses `/internal` bodies over 64 KB. Past this many characters
     * of paths the list is left out, and the backend describes what `git commit`
     * would commit instead (the staged changes, or all of them).
     */
    const val MAX_PATH_CHARS = 48_000

    /** Shown in the message box while Claude writes, then replaced by the answer or the draft. */
    const val PLACEHOLDER = "Writing a commit message with Claude…"

    /** What the backend answered, already turned into something to show. */
    sealed interface Outcome {
        data class Message(val text: String) : Outcome
        data class Failure(val reason: String) : Outcome
    }

    /**
     * The request body: the project, the files in the commit (absolute paths, both
     * sides of a rename), and the draft when the author already typed one.
     */
    fun buildPayload(workingDir: String, paths: Collection<String>, draft: String?): JsonObject {
        val unique = paths.filter { it.isNotBlank() }.distinct()
        val fits = unique.sumOf { it.length + 3 } <= MAX_PATH_CHARS
        return buildJsonObject {
            put("workingDir", JsonPrimitive(workingDir))
            if (fits) put("paths", JsonArray(unique.map { JsonPrimitive(it) }))
            // Our own placeholder is not the author's words: a second click while
            // the first one is still writing must not send it as a draft.
            if (!draft.isNullOrBlank() && draft != PLACEHOLDER) put("draft", JsonPrimitive(draft))
        }
    }

    /** Read the route's answer: `{ message }` on success, `{ error }` otherwise. */
    fun parseResponse(status: Int, body: String?): Outcome {
        val json = try {
            body?.let { Json.parseToJsonElement(it) as? JsonObject }
        } catch (_: Exception) {
            null
        }
        val message = (json?.get("message") as? JsonPrimitive)?.contentOrNull
        if (status in 200..299 && !message.isNullOrBlank()) return Outcome.Message(message)
        val error = (json?.get("error") as? JsonPrimitive)?.contentOrNull
        return Outcome.Failure(describeError(error, status))
    }

    /**
     * The backend's codes in words; anything else is the CLI's own message (a
     * login or quota problem), which reads best as it is.
     */
    fun describeError(error: String?, status: Int): String = when (error) {
        "no-changes" -> "There are no changes to describe in the files included in this commit."
        "not-a-repository" -> "The files included in this commit are not in a Git repository."
        "empty-result" -> "Claude returned an empty message. Try again."
        null, "" -> "The Claude Code backend answered with HTTP $status."
        else -> error
    }
}
