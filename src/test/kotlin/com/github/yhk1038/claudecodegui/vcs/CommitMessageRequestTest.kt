package com.github.yhk1038.claudecodegui.vcs

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class CommitMessageRequestTest {

    @Test
    fun `sends the project, each path once, and the draft`() {
        val payload = CommitMessageRequest.buildPayload("/p", listOf("/p/a.kt", "/p/b.kt", "/p/a.kt", ""), "wip")
        assertEquals(JsonPrimitive("/p"), payload["workingDir"])
        assertEquals(JsonArray(listOf(JsonPrimitive("/p/a.kt"), JsonPrimitive("/p/b.kt"))), payload["paths"])
        assertEquals(JsonPrimitive("wip"), payload["draft"])
    }

    @Test
    fun `leaves out a blank draft and our own placeholder`() {
        assertFalse(CommitMessageRequest.buildPayload("/p", listOf("/p/a"), "  ").containsKey("draft"))
        assertFalse(CommitMessageRequest.buildPayload("/p", listOf("/p/a"), CommitMessageRequest.PLACEHOLDER).containsKey("draft"))
        assertFalse(CommitMessageRequest.buildPayload("/p", listOf("/p/a"), null).containsKey("draft"))
    }

    @Test
    fun `drops a path list too long for the backend to accept`() {
        val many = (1..2_000).map { "/project/src/main/kotlin/some/deep/package/File$it.kt" }
        val payload = CommitMessageRequest.buildPayload("/project", many, null)
        assertFalse(payload.containsKey("paths"))
        assertTrue(payload.toString().length < 64 * 1024)
    }

    @Test
    fun `reads the message on success`() {
        assertEquals(
            CommitMessageRequest.Outcome.Message("fix: x\n\n- y"),
            CommitMessageRequest.parseResponse(200, """{"message":"fix: x\n\n- y","scope":"selected"}"""),
        )
    }

    @Test
    fun `puts the backend's codes into words and passes the CLI's text through`() {
        assertEquals(
            CommitMessageRequest.Outcome.Failure("There are no changes to describe in the files included in this commit."),
            CommitMessageRequest.parseResponse(422, """{"error":"no-changes"}"""),
        )
        assertEquals(
            CommitMessageRequest.Outcome.Failure("Not logged in · Please run /login"),
            CommitMessageRequest.parseResponse(500, """{"error":"Not logged in · Please run /login"}"""),
        )
    }

    @Test
    fun `survives a body that is not JSON, or no body at all`() {
        assertEquals(
            CommitMessageRequest.Outcome.Failure("The Claude Code backend answered with HTTP 401."),
            CommitMessageRequest.parseResponse(401, "Unauthorized"),
        )
        assertEquals(
            CommitMessageRequest.Outcome.Failure("The Claude Code backend answered with HTTP 500."),
            CommitMessageRequest.parseResponse(500, null),
        )
    }

    @Test
    fun `does not take an empty message as an answer`() {
        assertTrue(CommitMessageRequest.parseResponse(200, """{"message":"  "}""") is CommitMessageRequest.Outcome.Failure)
    }
}
