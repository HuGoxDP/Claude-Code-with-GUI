# Delete several sessions at once, copy a session's ID, and see where a session was started

> Language: **English** · [한국어](./ko.md)

Three additions to the session list, in both the session dropdown and the side session panel. Ported from the CC GUI plugin, which has all three.

- **Select** chooses several sessions and deletes them after one confirmation.
- A **copy** button on each row puts the session's ID on the clipboard.
- A small label on a row says where a session was started when it was not started here: **Terminal**, **VS Code**, **Desktop**, **Remote** or **GitHub**.

![The session dropdown in the English interface. Two rows, "Why does the login form reject valid passwords?" and one under "Past week", carry a grey "Terminal" label before their age. "Select" sits at the right end of the filter row.](./assets/origin-badges.png)

## Delete several sessions

1. Open the session list and click **Select**, at the right end of the row with the filters.
2. Click the sessions to delete. While choosing, a click ticks a row instead of opening it, and the filter row turns into a bar that counts the ticked rows.
3. Click **Delete** in that bar, and confirm.

![The session list while choosing. Each row has a checkbox; "Rename the config loader" and "Draft a changelog entry for the cache fix" are ticked. The bar above reads "2 selected", "All", "Delete" in red, and "Cancel".](./assets/select-sessions.png)

![A confirmation over the list: "Delete 2 sessions?", "Their transcripts are deleted from disk. This cannot be undone.", with "Cancel" and a red "Delete".](./assets/delete-confirm.png)

| | |
|---|---|
| **All** | Ticks every session the list is showing. With a search or a filter on, that is the sessions that match, not every session there is. |
| **Delete** | Asks once for all the ticked sessions, then deletes them one after another. It is greyed out while nothing is ticked. |
| **Cancel** in the bar | Leaves choosing without deleting anything. |
| **Cancel** in the confirmation | Deletes nothing and keeps your ticks, so you can untick one and try again. |

After the deletion the list goes back to normal.

Deleting here is the same as the trash-can button on a single row: each session's transcript (`~/.claude/projects/<project>/<session id>.jsonl`) is deleted from disk, together with the name you gave it, its generated title, its star, and any message scheduled to be sent into it. A deleted session can no longer be resumed, here or with `claude --resume`. If the session open in the chat is among them, the chat moves to a new session.

## Copy a session's ID

Hover a row and click the first of its buttons, the two overlapping squares. The session's ID is copied, and a notice says **Session ID copied**.

![A hovered row, "Why does the login form reject valid passwords?", showing its "Terminal" label and the row's buttons: copy, star, export, rename and delete. A notice at the top reads "Session ID copied".](./assets/copy-session-id.png)

The ID is what the CLI uses to find the conversation, so you can continue it in a terminal with `claude --resume <id>`, or name it in a bug report. It is also the file name of the session's transcript.

## Where a session was started

Claude Code records in every transcript where the conversation was started. The list reads that and labels the sessions that were started somewhere else:

| Label | Started in |
|---|---|
| **Terminal** | `claude` in a terminal |
| **VS Code** | The Claude Code extension for VS Code, also when it runs in Cursor |
| **Desktop** | The Claude desktop app |
| **Remote** | A Claude Code session that ran remotely |
| **GitHub** | The Claude Code GitHub Action |

Hover a label for a longer description.

Sessions started here carry no label, since every session started here would carry the same one. Neither do sessions older than the CLI's record of where they were started, nor those started by a program of your own through the CLI: these look the same as sessions started here, so the list cannot tell them apart.

## Limits

- **Select deletes only.** There is no bulk star, export or rename.
- **Sessions not loaded yet cannot be ticked.** The list loads older sessions as you scroll; **All** ticks the ones loaded so far. Scroll to the end first, or search, to reach the rest.
- **The label shows where a session started, not where it was last used.** A session started in a terminal and continued here keeps the **Terminal** label.
- **Copy needs clipboard access.** If the browser refuses it, a notice says **Could not copy**.

## Common questions

**Can I undo a deletion?** No. The transcripts are deleted from disk, the same as deleting a single session. If you keep backups of `~/.claude/projects`, restoring the file brings the session back.

**One of the sessions was not deleted. Why?** A session whose file could not be deleted (for example, because another program holds it) stays in the list; the others are still deleted. Try deleting it again on its own.

**Why does a session I started here have no label?** Because only sessions started somewhere else are labelled. No label means "here, or not known".
