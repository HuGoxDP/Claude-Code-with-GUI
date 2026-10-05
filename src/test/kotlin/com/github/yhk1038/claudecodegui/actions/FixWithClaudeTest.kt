package com.github.yhk1038.claudecodegui.actions

import com.intellij.lang.annotation.HighlightSeverity
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class FixWithClaudeTest {

    @Test
    fun `names the errors and warnings in the lines, once each, in line order`() {
        val candidates = listOf(
            ProblemCandidate(12, HighlightSeverity.WARNING, "Unused variable 'x'"),
            ProblemCandidate(11, HighlightSeverity.ERROR, "  Cannot resolve symbol 'bar'  "),
            ProblemCandidate(11, HighlightSeverity.ERROR, "Cannot resolve symbol 'bar'"),
            ProblemCandidate(9, HighlightSeverity.ERROR, "Outside the lines"),
            ProblemCandidate(10, HighlightSeverity.WEAK_WARNING, "Typo in word"),
            ProblemCandidate(10, null, "Not a problem, only a highlight"),
            ProblemCandidate(10, HighlightSeverity.ERROR, "   "),
        )
        assertEquals(
            listOf(
                IdeProblem(11, "error", "Cannot resolve symbol 'bar'"),
                IdeProblem(12, "warning", "Unused variable 'x'"),
            ),
            FixWithClaude.selectProblems(candidates, startLine = 10, endLine = 12),
        )
    }

    @Test
    fun `stops at the cap`() {
        val many = (1..50).map { ProblemCandidate(it, HighlightSeverity.ERROR, "p$it") }
        assertEquals(FixWithClaude.MAX_PROBLEMS, FixWithClaude.selectProblems(many, 1, 50).size)
    }

    @Test
    fun `sends the problems with the reference, and an empty list when there are none`() {
        val payload = FixWithClaude.buildPayload(
            absolutePath = "/work/src/a.kt",
            relativePath = "src/a.kt",
            startLine = 10,
            endLine = 12,
            workingDir = "/work",
            problems = listOf(IdeProblem(11, "error", "Cannot resolve symbol 'bar'")),
        )
        assertEquals("src/a.kt", payload["relativePath"]!!.jsonPrimitive.content)
        assertEquals(10, payload["startLine"]!!.jsonPrimitive.int)
        val problem = payload["problems"]!!.jsonArray.single().jsonObject
        assertEquals(11, problem["line"]!!.jsonPrimitive.int)
        assertEquals("error", problem["severity"]!!.jsonPrimitive.content)

        val none = FixWithClaude.buildPayload("/work/a.kt", "a.kt", 4, 4, "/work", emptyList())
        assertTrue(none["problems"]!!.jsonArray.isEmpty())
    }
}
