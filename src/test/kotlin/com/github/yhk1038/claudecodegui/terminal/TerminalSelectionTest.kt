package com.github.yhk1038.claudecodegui.terminal

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import javax.swing.JPanel

class TerminalSelectionTest {

    @Test
    fun `the first source with text answers, in order`() {
        assertEquals("classic", TerminalSelection.first({ "classic" }, { "reworked" }, { "editor" }))
        assertEquals("reworked", TerminalSelection.first({ null }, { "reworked" }, { "editor" }))
        assertEquals("editor", TerminalSelection.first({ null }, { null }, { "editor" }))
    }

    @Test
    fun `a blank source does not hide a later one`() {
        assertEquals("editor", TerminalSelection.first({ "" }, { " \n\t" }, { "editor" }))
    }

    @Test
    fun `nothing selected anywhere is nothing`() {
        assertNull(TerminalSelection.first({ null }, { "" }, { null }))
        assertNull(TerminalSelection.first())
    }

    @Test
    fun `later sources are not asked once one answers`() {
        var asked = 0
        TerminalSelection.first({ "classic" }, { asked++; "editor" })
        assertEquals(0, asked)
    }

    @Test
    fun `a component outside any classic terminal has no widget around it`() {
        val outer = JPanel()
        val inner = JPanel()
        outer.add(inner)
        assertNull(TerminalMenus.classicWidgetAround(inner))
        assertNull(TerminalMenus.classicWidgetAround(null))
    }
}
