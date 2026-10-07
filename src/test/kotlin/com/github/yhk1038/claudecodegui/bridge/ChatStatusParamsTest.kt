package com.github.yhk1038.claudecodegui.bridge

import com.github.yhk1038.claudecodegui.statusbar.tooltipHtml
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Unit tests for [parseChatStatusParams], the param parsing of SET_CHAT_STATUS,
 * and for the tooltip markup the status bar draws from it.
 */
class ChatStatusParamsTest {

    private fun params(jsonText: String) = Json.parseToJsonElement(jsonText).jsonObject

    @Test
    fun `reads a status`() {
        assertEquals(
            ChatStatusParams("p1", true, "Claude: 34% context", "Fix the login\nModel: Sonnet"),
            parseChatStatusParams(
                params("""{"panelId":"p1","focused":true,"text":"Claude: 34% context","tooltip":"Fix the login\nModel: Sonnet"}"""),
            ),
        )
    }

    @Test
    fun `a missing or blank text clears the panel's status`() {
        assertEquals(ChatStatusParams("p1", false, null, null), parseChatStatusParams(params("""{"panelId":"p1"}""")))
        assertEquals(
            ChatStatusParams("p1", true, null, null),
            parseChatStatusParams(params("""{"panelId":"p1","focused":true,"text":"  ","tooltip":"x"}""")),
        )
        assertEquals(
            ChatStatusParams("p1", false, null, null),
            parseChatStatusParams(params("""{"panelId":"p1","text":null}""")),
        )
    }

    @Test
    fun `focused is only a real true`() {
        assertEquals(false, parseChatStatusParams(params("""{"panelId":"p","focused":"true","text":"t"}"""))?.focused)
        assertEquals(false, parseChatStatusParams(params("""{"panelId":"p","focused":1,"text":"t"}"""))?.focused)
    }

    @Test
    fun `a missing tooltip is an empty one`() {
        assertEquals("", parseChatStatusParams(params("""{"panelId":"p","text":"t"}"""))?.tooltip)
    }

    @Test
    fun `nothing to file it under without a panel`() {
        assertNull(parseChatStatusParams(params("""{"text":"t"}""")))
        assertNull(parseChatStatusParams(params("""{"panelId":"","text":"t"}""")))
        assertNull(parseChatStatusParams(params("""{"panelId":7,"text":"t"}""")))
    }

    @Test
    fun `the tooltip becomes escaped HTML lines`() {
        assertEquals("<html>Fix &lt;b&gt; &amp; c<br>Model: Sonnet</html>", tooltipHtml("Fix <b> & c\nModel: Sonnet"))
    }
}
