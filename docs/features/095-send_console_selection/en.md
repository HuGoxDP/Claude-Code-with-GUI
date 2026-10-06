# Send console output to Claude

> Language: **English** · [한국어](./ko.md)

Select text in a Run or Debug console — a stack trace, a failing test's message, a log line — right-click it and choose **Send Selection to Claude Code**. The text goes into the chat input as it is, on lines of its own, and the caret waits on the line below it for you to say what you want. Nothing is sent until you send it. Ported from the CC GUI plugin.

![The chat input after Send Selection to Claude Code: "Why does the test fail?", then the selected stack trace "org.opentest4j.AssertionFailedError: expected: <42> but was: <41>" with three "at …" lines, then "It started after I changed the rounding." typed on the line below.](./assets/composer.png)

## Where it is

The console's right-click menu, in every console that shows a program's output: Run, Debug, and test runs. The item appears only when text is selected.

## What goes into the chat input

- **The text exactly as selected**, tabs and all, so a stack trace keeps its shape. Windows line ends become plain ones.
- **On its own lines.** If the caret is in the middle of a line, the text starts on the next one; the caret ends up on the line after the text.
- **At the caret**, in the chat that last had focus, like Alt+K. If no chat is open, one opens.
- **Up to 200,000 characters.** A longer selection keeps its end, where the error usually is, and starts with "…" where it was cut.

The text is your words to Claude, so it is sent like anything you type: Claude Code sees it in your message, not as an attached file.

## How this differs from Alt+K

Alt+K, in a code editor, inserts a reference (`@src/file.ts#L10-12`) that Claude Code reads the file from. A console has no file behind it, so the text itself goes in.

## Fixed along the way

After **Fix with Claude** ([093](../093-fix_with_claude/en.md)) put the IDE's problems into an empty chat input, the first word you typed landed at the end of the last problem instead of on a new line. Both now leave the caret on an empty line.

## Limits

- **Not in the Terminal tool window yet.** The terminal keeps its selection in a way that differs between IDE versions and is not part of the platform's public API; that part is tracked separately.
- **Only in a JetBrains IDE.** The browser has no Run console.
- Console output can hold secrets (tokens in a log line, environment dumps). What you send goes to Claude like any message; look at the selection before you send it.
