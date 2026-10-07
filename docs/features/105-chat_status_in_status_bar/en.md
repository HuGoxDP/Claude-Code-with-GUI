# The chat's status in the IDE status bar

> Language: **English** · [한국어](./ko.md)

While you work in the editor, the chat is often out of sight behind it. The IDE's status bar now keeps an eye on it for you: whether Claude is still writing, whether it is waiting for your answer, and how much of the context window the conversation has used. Click it to bring the chat back. Ported from the CC GUI plugin's status bar widget.

## What it shows

The status bar, at the bottom of the IDE window, gets a short line next to the Claude Code backend dot:

```
Claude: working · 34% context
Claude: waiting for you · 34% context
Claude: 34% context
Claude
```

- **working**: Claude is writing a reply.
- **waiting for you**: Claude asked you something (a permission, a plan to approve, a question) and is waiting for the answer.
- **34% context**: how much of the context window the conversation uses, the same figure as the gauge in the chat input (`34% used`). It appears after the first reply of a conversation, once Claude Code has said how big the window is; until then the line shows only what it knows.
- **Claude** on its own: the chat is idle and its context is not known yet, such as a new chat.

Hover over it for the rest:

```
Fix the login form
Model: Sonnet
Mode: Plan mode
Context: 34% used (68,000 tokens)
Click to show this chat
```

The first line is the conversation's title ("New chat" for one that has not started), so you can tell which chat the bar is talking about. The model is named as the chat input names it, and the line is left out until the chat has loaded its model list.

The words are in your interface language (**Settings → General → Interface Language**). The mode is named as the chat input names it.

## Which chat it speaks for

The bar has room for one chat, so it shows **the chat you were last in**. Click into a chat, or type in it, and the bar follows it. It keeps showing that chat while you work in the editor, since that is when the bar is useful.

- A chat that is working in another tab does not take the bar from the one you were in. Its own tab icon still turns while it works.
- When you leave a chat for the settings screen, or close its tab, the bar goes back to the chat you were in before it. When no chat is open, the line is empty.
- Each project window has its own status bar and speaks for the chats of that window.

**Click the line** to bring that chat to the front, in its editor tab or in the tool window, wherever it lives.

## Hiding it

Right-click the status bar and untick **Claude Code Chat Status**. That hides the line only; the backend dot next to it is a separate item (**Claude Code**).

## Where it is not

- **In a browser.** A browser has no status bar, and the chat page already shows everything this line repeats: the chat input has the model, the mode and the context gauge, and the tab's icon turns while Claude works and gets a badge when it waits ([066](../066-session_activity_markers/en.md)).
- **On the JetBrains Client of Remote Development.** The chats report to the host's IDE, so the line is on the host side.

## How it works

The chat page already knows all of this: it draws the context gauge, the model and the mode in the chat input, and the working and waiting states on the tab. It sends the line and the tooltip to the plugin's backend whenever any of them changes, and whenever you click into the chat. The backend passes on only what changes something and hands it to the IDE, which draws it in the status bar. Nothing is stored: after a restart the line fills again as the chats load.

## Limits

- **The context figure needs one reply first.** A conversation you reopen shows no figure until its next reply, the same as the gauge in the chat input, because Claude Code reports the size of the context window with each reply.
- **It does not show cost.** CC GUI's line carries tokens only as well; for what a reply used, see the line under it ([091](../091-reply_duration_and_tokens/en.md)), and for your plan's limits, the usage panel.
