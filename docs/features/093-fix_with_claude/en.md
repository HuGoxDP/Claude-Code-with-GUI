# Fix with Claude

> Language: **English** · [한국어](./ko.md)

Right-click in the editor and choose **Fix with Claude**. The selected lines, or the line the caret is on, go into the chat input together with the errors and warnings the IDE reports in them. Add anything you want Claude to know, and send. Ported from the CC GUI plugin's Quick Fix.

![The chat input after Fix with Claude: "Fix the problems the IDE reports in @src/total.ts#L2-7:", then "- Line 3 (error): Cannot find name 'itemz'. Did you mean 'items'?" and "- Line 6 (warning): 'unused' is declared but its value is never read.". The file reference is highlighted as a chip.](./assets/composer.png)

## What goes into the chat input

| In the editor | In the chat input |
|---|---|
| Lines selected, and the IDE reports problems in them | `Fix the problems the IDE reports in @path#L2-7:` followed by one line per problem: its line number, whether it is an error or a warning, and the IDE's own message |
| Lines selected, no problems there | `Fix @path#L2-7: `, with the caret after it for you to say what to fix |
| Nothing selected | The same, for the line the caret is on |

- **Errors and warnings only.** The IDE also paints weak warnings, typos and hints; they are left out so the request stays about what is broken.
- **At most 20 problems**, each once, in line order.
- The text goes **where the caret is** in the chat input, like Alt+K, and the chat input gets focus. **Nothing is sent** until you send it.
- The words around the reference are in your interface language: you send them as your own.

## What happens next

Claude reads the lines (the `@path#L…` reference attaches them) and fixes them the way it changes any file: with its edit tool, which you review in the diff before anything is written. To let it edit without asking, use the permission mode as usual.

## How this differs from CC GUI

CC GUI opens a small input box over the editor, sends your request in a new chat tab, and pastes the code block from Claude's reply over your selection. Here the request is written in the chat input, the conversation is the one you are in, and the change arrives as a reviewed edit. Two reasons: this plugin draws its interface only inside the chat, and an edit Claude makes through its own tool is one Claude knows it made, so the rest of the conversation stays consistent with the file.

## Limits

- **Only in a JetBrains IDE.** The action belongs to the editor's context menu; the browser has no editor to right-click.
- **Only what the IDE has found.** Problems appear after the IDE has analysed the file. Right after opening a large file, or while indexing, the list may be short or empty; wait for the analysis to finish, or send the reference as is.
- **No keyboard shortcut** by default. Assign one in **Settings → Keymap**, under the action's name.

## Common questions

**How is this different from Alt+K?** Alt+K inserts only the reference. Fix with Claude adds the words "Fix …" and the problems the IDE reports, so Claude knows what is wrong without you copying error messages.

**Can I edit the text before sending?** Yes. It is ordinary text in the chat input.
