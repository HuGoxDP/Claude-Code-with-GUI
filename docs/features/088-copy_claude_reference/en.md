# Copy a file and its selected lines as a Claude Code reference

> Language: **English** · [한국어](./ko.md)

Right-click in the editor and pick **Copy Claude Code Reference**. The clipboard now holds the file, and the lines you selected, written the way Claude Code reads a file reference:

```
@src/auth/login.ts#L42-57
```

Paste it wherever the chat input is not: a Claude Code session in a terminal, a note to yourself, a message to a teammate who runs Claude Code. Claude then reads exactly those lines. Inside the chat, **Send to Claude Code** (Alt+K) inserts the same text directly, so you need this item only for somewhere else. Ported from the CC GUI plugin, which has a "Copy AI Reference" item.

The status bar at the bottom of the IDE window confirms what was copied ("Copied @src/auth/login.ts#L42-57").

## What gets copied

| In the editor | Copied |
|---------------|--------|
| No selection | `@src/a.ts`, the whole file |
| Lines 10 to 12 selected | `@src/a.ts#L10-12` |
| Part of one line selected | `@src/a.ts#L10` |
| Whole lines selected (triple-click, Shift+Down) | only the lines you selected, not the empty start of the next one |
| A file whose path has a space | `@"My Notes.md#L3-5"`, the quoted form the CLI reads |
| A file outside the project | its absolute path |

The path is relative to the project folder, the same as Alt+K writes it, so the reference works in a Claude Code session started in the project. A session started elsewhere needs the absolute path, which you can get from the IDE's own **Copy Path/Reference** menu.

The line range is written as `#L10-12`, the one form the Claude Code CLI reads as a range. `#L10-L12`, with a second `L`, makes the CLI attach the whole file (see [Send files and folders](../087-send_files_from_project_view/en.md#the-line-range-fix)).

## Also fixed: Alt+K counted one line too many after a whole-line selection

When you select whole lines, by triple-clicking or with Shift+Down, the selection ends at the very start of the next line. **Send to Claude Code** counted that line, so selecting lines 3 to 5 wrote `#L3-6`. It now writes `#L3-5`, and so does the new item.

## Limits

- **The IDE only.** The editor's context menu exists only in the IDE. In standalone mode, type `@` in the chat input to pick a file.
- **Not in the Claude Code panel itself.** The item is hidden there, since the panel is not a file Claude can read.
- **Nothing is sent.** The item only fills the clipboard.

## Common questions

**I pasted the reference into a terminal session and Claude read the whole file.** Check that the reference has no second `L` in the range. A reference copied by this item never has one; one typed by hand might.

**Can I copy several files at once?** Not with this item. To put several files in the chat input, select them in the project view and use **Send to Claude Code** there.
