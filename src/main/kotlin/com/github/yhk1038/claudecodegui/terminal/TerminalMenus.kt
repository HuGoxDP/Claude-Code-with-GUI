package com.github.yhk1038.claudecodegui.terminal

import com.github.yhk1038.claudecodegui.actions.ConsoleSelection
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.Anchor
import com.intellij.openapi.actionSystem.Constraints
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.components.Service
import com.intellij.terminal.JBTerminalWidget
import com.intellij.terminal.actions.TerminalActionUtil
import com.jediterm.terminal.ui.TerminalAction
import com.jediterm.terminal.ui.TerminalActionProvider
import java.awt.Component
import java.awt.KeyboardFocusManager
import java.beans.PropertyChangeListener
import java.util.Collections
import java.util.WeakHashMap

/**
 * Puts [SendTerminalSelectionAction] into the terminals' context menus.
 *
 * The menus that are action groups (the reworked terminal's, and the block
 * terminal's output and prompt menus) are joined at run time rather than with
 * `<add-to-group>`: which of them exist depends on the IDE version (the reworked
 * terminal's arrives in 2025.1), from 2025.1 they live in a module of the
 * terminal plugin that loads on its own, and an `<add-to-group>` naming a group
 * that is not there is reported as a plugin error at startup.
 *
 * The classic terminal's menu is no action group: JediTerm builds it from the
 * chain of [TerminalActionProvider]s that starts at each terminal widget, so the
 * action is hung on each classic widget's chain instead. A widget is hooked when
 * the Terminal tool window shows it ([ClassicTerminalTabs]) and, to catch the
 * ones that never pass through there (a split, a terminal moved to an editor
 * tab), when it gets focus, which it does on the press before a right click.
 *
 * Everything joined is taken out again in [dispose], when the plugin unloads.
 * Used on the EDT only.
 */
@Service(Service.Level.APP)
class TerminalMenus : Disposable {

    private val joinedGroups = mutableListOf<Pair<DefaultActionGroup, AnAction>>()

    // Weak, so a closed terminal is not kept alive for the sake of the unhook.
    private val hookedWidgets: MutableSet<JBTerminalWidget> =
        Collections.newSetFromMap(WeakHashMap())

    private var focusListener: PropertyChangeListener? = null

    /** Join the action-group menus and start hooking classic widgets as they get focus. Safe to call again. */
    fun join() {
        val actionManager = ActionManager.getInstance()
        val action = actionManager.getAction(SendTerminalSelectionAction.ID) ?: return
        for (groupId in GROUP_IDS) {
            val group = actionManager.getAction(groupId) as? DefaultActionGroup ?: continue
            if (group.containsAction(action)) continue
            group.add(action, placementIn(group, actionManager), actionManager)
            joinedGroups += group to action
        }
        if (focusListener == null) {
            val listener = PropertyChangeListener { event ->
                classicWidgetAround(event.newValue as? Component)?.let(::hook)
            }
            KeyboardFocusManager.getCurrentKeyboardFocusManager()
                .addPropertyChangeListener(FOCUS_OWNER, listener)
            focusListener = listener
        }
    }

    /** Add the action to [widget]'s menu, once. */
    fun hook(widget: JBTerminalWidget) {
        if (widget in hookedWidgets) return
        val action = ActionManager.getInstance().getAction(SendTerminalSelectionAction.ID) ?: return
        val item = TerminalActionUtil.createTerminalAction(widget, action)
            .withEnabledSupplier { ConsoleSelection.sendableText(widget.selectedText) != null }
        widget.nextProvider = SendSelectionProvider(item, widget.nextProvider)
        hookedWidgets += widget
    }

    override fun dispose() {
        focusListener?.let {
            KeyboardFocusManager.getCurrentKeyboardFocusManager().removePropertyChangeListener(FOCUS_OWNER, it)
        }
        focusListener = null
        val actionManager = ActionManager.getInstance()
        joinedGroups.forEach { (group, action) -> group.remove(action, actionManager) }
        joinedGroups.clear()
        hookedWidgets.toList().forEach(::unhook)
        hookedWidgets.clear()
    }

    /** Take this plugin's provider out of [widget]'s chain, wherever it sits now. */
    private fun unhook(widget: JBTerminalWidget) {
        var previous: TerminalActionProvider = widget
        var current = widget.nextProvider
        while (current != null) {
            if (current is SendSelectionProvider) {
                previous.nextProvider = current.nextProvider
                return
            }
            previous = current
            current = current.nextProvider
        }
    }

    /**
     * Right after the terminal's Paste where the menu has one (the three action
     * groups all do), so it sits with Copy and Paste; at the end otherwise. A
     * relative place whose neighbour is missing would leave the action out of
     * the menu altogether.
     */
    private fun placementIn(group: DefaultActionGroup, actionManager: ActionManager): Constraints =
        if (group.childActionsOrStubs.any { actionManager.getId(it) == PASTE_ACTION_ID }) {
            Constraints(Anchor.AFTER, PASTE_ACTION_ID)
        } else {
            Constraints.LAST
        }

    /** One link in a classic terminal's menu chain, holding just this plugin's item. */
    private class SendSelectionProvider(
        private val item: TerminalAction,
        private var next: TerminalActionProvider?,
    ) : TerminalActionProvider {
        override fun getActions(): List<TerminalAction> = listOf(item)
        override fun getNextProvider(): TerminalActionProvider? = next
        override fun setNextProvider(provider: TerminalActionProvider?) {
            next = provider
        }
    }

    companion object {
        /** The action-group menus of the reworked terminal (2025.1+) and the block terminal. */
        val GROUP_IDS = listOf(
            "Terminal.ReworkedTerminalContextMenu",
            "Terminal.OutputContextMenu",
            "Terminal.PromptContextMenu",
        )

        private const val PASTE_ACTION_ID = "Terminal.Paste"
        private const val FOCUS_OWNER = "focusOwner"

        /** The classic terminal widget [component] is part of, if any. */
        fun classicWidgetAround(component: Component?): JBTerminalWidget? =
            generateSequence(component) { it.parent }.filterIsInstance<JBTerminalWidget>().firstOrNull()
    }
}
