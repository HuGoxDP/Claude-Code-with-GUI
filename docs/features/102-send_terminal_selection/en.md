# Send terminal output to Claude

> Language: **English** · [한국어](./ko.md)

Select text in the IDE's Terminal — a command's output, a build error, a log line — right-click it and choose **Send Selection to Claude Code**. The text goes into the chat input as it is, on lines of its own, and the caret waits on the line below it for you to say what you want. Nothing is sent until you send it. It is [Send console output to Claude](../095-send_console_selection/en.md), for the terminal. Ported from the CC GUI plugin.

![The chat input after Send Selection to Claude Code from the terminal: "This is what I get when I build:", then the selected terminal output "$ npm run build", "> tsc -p .", "src/total.ts:3:10 - error TS2304: Cannot find name 'itemz'." and "Found 1 error in src/total.ts:3", then "Fix it without renaming the parameter." typed on the line below.](./assets/composer.png)

## Where it is

The right-click menu of the Terminal tool window. The JetBrains IDEs this plugin supports have had three terminals, and the item is in the menu of each:

| Terminal | Used by default in | Where the item is |
|---|---|---|
| **Reworked 2025** | 2025.2 and later; selectable in 2025.1 | Next to Copy and Paste |
| **Classic** | 2024.2 to 2025.1; selectable in every version | In a group of its own, apart from the terminal's tab and split items |
| **Experimental 2024** (the beta "new terminal" of 2024.2 and 2024.3, deprecated since) | Never; it had to be turned on | After Paste, in both the output and the command line menus |

To see which one you have, open **Settings | Tools | Terminal**: from 2025.1 the **Terminal engine** setting names it.

The item is always in these menus and is enabled only while text is selected, like the terminal's own Copy beside it. It is also in **Find Action** (Ctrl+Shift+A, Cmd+Shift+A on macOS) under the same name, where it takes the selection of the terminal you were in.

## What goes into the chat input

The same as from a Run console:

- **The text exactly as selected**, so the output keeps its shape. Windows line ends become plain ones.
- **On its own lines.** If the caret is in the middle of a line, the text starts on the next one; the caret ends up on the line after the text.
- **At the caret**, in the chat that last had focus, like Alt+K. If no chat is open, one opens.
- **Up to 200,000 characters.** A longer selection keeps its end, where the error usually is, and starts with "…" where it was cut.

The text is your words to Claude, so it is sent like anything you type: Claude Code sees it in your message, not as an attached file.

## How it finds your selection

Each terminal hands its selection to the IDE in its own way, and the item reads it through the platform's public interfaces only, so it keeps working as the IDE updates:

- **Reworked 2025** in 2025.3 and later offers its selection the way it offers it to Find in Files and Search Everywhere, as their starting text.
- **Reworked 2025** in 2025.1 and 2025.2, and **Experimental 2024**, show their output in an editor; the item takes that editor's selection. Only a console editor counts, so in Find Action over your code the item stays disabled rather than sending the code as text (for code, Alt+K sends a reference instead).
- **Classic** reports what is selected in its own way, and its menu is not one the IDE lets other plugins join by name, so the item is added to each classic terminal as it opens, and to any other classic terminal (a split, a terminal moved to an editor tab) when you click into it.

## Limits

- **A classic terminal you have not clicked into yet may not have the item.** That covers a split you just made and have not touched; tabs that are already open when the IDE starts, and new tabs, have it from the start. Click into the terminal once and the item is there.
- **Only in a JetBrains IDE.** The browser has no IDE terminal; to bring terminal output into a chat there, copy and paste it.
- Terminal output can hold secrets (tokens in a log line, environment dumps). What you send goes to Claude like any message; look at the selection before you send it.
- The item needs the IDE's Terminal plugin, which ships with every JetBrains IDE. If you turned that plugin off, the item is gone with it; the rest of this plugin works as before.
