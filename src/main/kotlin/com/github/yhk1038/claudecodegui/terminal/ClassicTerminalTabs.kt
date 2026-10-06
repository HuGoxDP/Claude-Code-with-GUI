package com.github.yhk1038.claudecodegui.terminal

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.terminal.JBTerminalWidget
import com.intellij.terminal.ui.TerminalWidget
import org.jetbrains.plugins.terminal.TerminalToolWindowManager

/**
 * Hands the classic terminals of this project's Terminal tool window to
 * [TerminalMenus]: the ones already open, and each new tab as the tool window
 * sets it up. Tabs of the other terminals are skipped here; their menus are
 * action groups, which [TerminalMenus.join] takes care of.
 *
 * Uses the terminal plugin's own manager, so it is registered only from
 * claudecode-terminal.xml, which loads where that plugin is installed.
 */
@Service(Service.Level.PROJECT)
class ClassicTerminalTabs(private val project: Project) : Disposable {

    /** Called once per project, on the EDT. The setup handler goes away with this service. */
    fun start() {
        // Null where the terminal plugin is present without its tool window
        // service, as on a remote development client.
        val manager: TerminalToolWindowManager = TerminalToolWindowManager.getInstance(project) ?: return
        val menus = service<TerminalMenus>()
        manager.addNewTerminalSetupHandler({ widget -> hook(menus, widget) }, this)
        manager.terminalWidgets.forEach { hook(menus, it) }
    }

    private fun hook(menus: TerminalMenus, widget: TerminalWidget) {
        // Null for a widget of the block or reworked terminal.
        JBTerminalWidget.asJediTermWidget(widget)?.let(menus::hook)
    }

    override fun dispose() = Unit
}

/** Puts "Send Selection to Claude Code" into the terminal menus once a project opens. */
class TerminalMenusActivity : ProjectActivity {

    override suspend fun execute(project: Project) {
        // Menus and focus are Swing's, so the joining happens on the EDT.
        ApplicationManager.getApplication().invokeLater({
            service<TerminalMenus>().join()
            project.service<ClassicTerminalTabs>().start()
        }, project.disposed)
    }
}
