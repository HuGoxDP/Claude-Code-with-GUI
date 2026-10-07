package com.github.yhk1038.claudecodegui.statusbar

import com.github.yhk1038.claudecodegui.statusbar.ChatStatusBoard.ChatStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The status bar speaks for the chat the user was last in, keeps doing so while
 * they work elsewhere in the IDE, and never goes on showing a status that no
 * chat is reporting any more.
 */
class ChatStatusBoardTest {

    private val a = ChatStatus("Claude: 10% context", "Chat A")
    private val b = ChatStatus("Claude: 70% context", "Chat B")

    @Test
    fun `shows nothing until a chat reports`() {
        val board = ChatStatusBoard()
        assertNull(board.shown())
        assertNull(board.shownPanelId)
    }

    @Test
    fun `the focused chat takes the bar`() {
        val board = ChatStatusBoard()
        board.report("a", focused = true, a)
        board.report("b", focused = true, b)
        assertEquals("b", board.shownPanelId)
        assertEquals(b, board.shown())
    }

    @Test
    fun `a chat reporting in the background does not take the bar`() {
        val board = ChatStatusBoard()
        board.report("a", focused = true, a)
        board.report("b", focused = false, b)
        assertEquals(a, board.shown())
    }

    @Test
    fun `the shown chat keeps updating after the user leaves it for the editor`() {
        val board = ChatStatusBoard()
        board.report("a", focused = true, a)
        val later = ChatStatus("Claude: working · 12% context", "Chat A")
        assertTrue(board.report("a", focused = false, later))
        assertEquals(later, board.shown())
    }

    @Test
    fun `a chat that never took focus is shown when it is the only one`() {
        val board = ChatStatusBoard()
        board.report("a", focused = false, a)
        assertEquals(a, board.shown())
    }

    @Test
    fun `a chat with nothing to say gives the bar back to the one before it`() {
        val board = ChatStatusBoard()
        board.report("a", focused = true, a)
        board.report("b", focused = true, b)
        board.report("b", focused = true, null)
        assertEquals(a, board.shown())
        board.report("b", focused = true, b)
        assertEquals(b, board.shown())
    }

    @Test
    fun `a closed chat is forgotten`() {
        val board = ChatStatusBoard()
        board.report("a", focused = true, a)
        board.report("b", focused = true, b)
        assertTrue(board.remove("b"))
        assertEquals(a, board.shown())
        assertTrue(board.remove("a"))
        assertNull(board.shown())
        assertNull(board.shownPanelId)
    }

    @Test
    fun `reports whether what the bar shows changed`() {
        val board = ChatStatusBoard()
        assertTrue(board.report("a", focused = true, a))
        assertFalse(board.report("a", focused = true, a))
        assertFalse(board.report("b", focused = false, b))
        assertFalse(board.remove("b"))
        assertFalse(board.remove("never-reported"))
    }
}
