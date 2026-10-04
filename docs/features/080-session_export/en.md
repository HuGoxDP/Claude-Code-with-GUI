# Export a session with /export

> Language: **English** · [한국어](./ko.md)

In the terminal, `/export` writes the conversation to a file. In the GUI the same command used to answer *"/export isn't available in this environment"*, because the GUI runs the CLI non-interactively and the CLI refuses terminal-only commands there. Now the GUI does the export itself, and you can also export any past session straight from the session list.

There are two formats:

| Format | What you get | When to pick it |
|--------|--------------|-----------------|
| **Markdown** (`.md`) | A readable transcript: your prompts and slash commands, Claude's replies, and every tool call with its result folded underneath | Sharing a conversation, pasting it into an issue or a doc, keeping notes |
| **JSONL** (`.jsonl`) | The session file **exactly as the Claude Code CLI wrote it**, byte for byte | Backups, moving a session to another machine, feeding it to your own tools |

## Export the conversation you are in

Type `/export` in the chat and press Enter. A save dialog opens with a file name made from the session's title (`Fix-the-login-bug.md`). Pick a place and save; a notice in the corner tells you where the file went.

You can name the file right in the command:

- `/export notes.md` — Markdown, offered as `notes.md`
- `/export backup.jsonl` (or `.json`) — the raw JSONL, offered as `backup.jsonl`
- `/export notes` — no extension, so Markdown is used and `.md` is added

Only the file name is taken from what you type. A path such as `/export ../../somewhere/file.md` is offered as `file.md` in the save dialog, and you choose the folder there.

`/export` also appears in the slash command list and in the command palette, with the same behaviour.

## Export any session from the session list

Open the session dropdown (or the session panel) and hover a session. Next to rename and delete there is an **export** icon (an arrow pointing into a tray). Click it and the row shows the two formats; click **Markdown** or **JSONL**.

![The session dropdown in the English interface. Under "Today" the row "Why does the login form reject valid…" is hovered and shows two small buttons, "Markdown" and "JSONL", in place of its usual actions. Above it, under "Favorites", is "Explain the database migration plan" with a star and "3mo".](./assets/session-export-choice.png)

Moving the pointer off the row puts the usual icons back without exporting anything. Exporting does not open the session.

## What the Markdown contains

- A heading with the session's title (your own name for it if you renamed it), then the session id, the project folder and the time of the export.
- One section per speaker change: **User** for what you sent, **Claude** for the replies.
- Slash commands appear as the command you ran, for example `` `/model opus` ``.
- Each tool call is a line such as **⏺ Bash(npm test)**, with the input and the result in collapsible blocks. Long inputs and results are cut, with a note saying how many characters were left out.
- Images and documents you attached appear as *[image]* and *[document]*.

It follows the conversation you see — the current branch after a rewind or fork. The JSONL export keeps every branch, because it is the whole file.

Left out on purpose: Claude's thinking (its scratch work, not part of the conversation), and text the CLI adds by itself, such as command output wrappers, reminders and "Request interrupted" notes.

## Where it works

The save dialog comes from wherever the GUI runs: the IDE's own dialog in a JetBrains IDE, the operating system's dialog in standalone mode (Finder on macOS, the Windows dialog, `zenity` on Linux).

## Common questions

**Nothing happened after I typed `/export`.** The save dialog may have opened behind another window, or you cancelled it. A cancelled dialog shows no message, because nothing went wrong.

**It says "Start a conversation before exporting it."** You are in a new, empty chat; there is no session file yet. Send a message first, or export an older session from the list.

**It says "This conversation has nothing to export yet."** The session file exists but holds no messages the transcript can show.

**On Linux the dialog never appears.** Standalone mode on Linux uses `zenity` for save dialogs. Install it with your package manager (`sudo apt install zenity`, `sudo dnf install zenity`).

**Can I export to the clipboard like the terminal does?** Not yet; the GUI always writes a file.
