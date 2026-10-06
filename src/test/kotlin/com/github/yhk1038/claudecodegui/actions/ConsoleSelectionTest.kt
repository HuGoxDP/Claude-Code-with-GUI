package com.github.yhk1038.claudecodegui.actions

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ConsoleSelectionTest {

    @Test
    fun `nothing is sent for an empty or blank selection`() {
        assertNull(ConsoleSelection.sendableText(null))
        assertNull(ConsoleSelection.sendableText(""))
        assertNull(ConsoleSelection.sendableText(" \n\t"))
    }

    @Test
    fun `a selection goes as it is, with line ends made plain`() {
        assertEquals("boom\n\tat Main.main(Main.java:3)", ConsoleSelection.sendableText("boom\n\tat Main.main(Main.java:3)"))
        assertEquals("a\nb\nc", ConsoleSelection.sendableText("a\r\nb\rc"))
    }

    @Test
    fun `an over-long selection keeps its end, marked where it was cut`() {
        val text = "start-" + "x".repeat(ConsoleSelection.MAX_TEXT_CHARS) + "-the error"
        val sent = ConsoleSelection.sendableText(text)!!
        assertEquals(ConsoleSelection.MAX_TEXT_CHARS, sent.length)
        assertTrue(sent.startsWith(ConsoleSelection.CUT_MARK))
        assertTrue(sent.endsWith("-the error"))
    }

    @Test
    fun `the payload carries the text and the project, and no path`() {
        val payload = ConsoleSelection.buildPayload("boom", "/work")
        assertEquals("boom", payload["text"]!!.jsonPrimitive.content)
        assertEquals("/work", payload["workingDir"]!!.jsonPrimitive.content)
        assertEquals(setOf("text", "workingDir"), payload.keys)
        assertEquals(JsonNull, ConsoleSelection.buildPayload("boom", null)["workingDir"])
    }
}
