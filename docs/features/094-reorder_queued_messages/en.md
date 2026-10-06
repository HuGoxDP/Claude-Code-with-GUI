# Change the order of queued messages

> Language: **English** · [한국어](./ko.md)

While Claude is answering, the messages you send wait above the chat input and go out one per finished reply, oldest first. You can now drag them into a different order: the message on top is the one sent next. Ported from the CC GUI plugin's message queue.

![Three queued messages above the chat input, opened by hovering: "Reply with exactly the word: one", "two" and "three". The bottom one shows a round drag handle with six dots at its top-left corner and the × that removes it at its top-right corner.](./assets/handle.png)

## How to use it

1. **Hover the stack** of waiting messages (or move keyboard focus into it). It opens into a list, top one first.
2. **Hover a message.** A round handle with six dots appears at its top-left corner, opposite the × that removes it.
3. **Drag the handle** up or down. The other messages slide out of the way; let go where you want it.

![The same list after dragging "three" to the top: "three", "one", "two".](./assets/reordered.png)

The new order is kept by the backend, so every tab showing this conversation shows it too, and it is the order the messages are sent in:

![The conversation after the reply ended: "Reply with exactly the word: three" was answered first, then "one", then "two", each followed by its own reply.](./assets/sent-order.png)

### With the keyboard

Tab to a message's handle, press **Space** to pick it up, **↑ / ↓** to move it, and **Space** again to drop it. **Esc** puts it back where it was.

## Details

- **Esc during a drag cancels only the drag.** The message goes back to its place, and Claude's reply keeps running; the Esc that stops a reply is not triggered.
- **A message that is sent while you drag** is simply no longer in the list when you drop; the rest keep the order you gave them. A message queued from another tab meanwhile goes after the ones you arranged. Nothing is dropped or sent twice.
- **There is nothing to drag with one message.** The handle appears only when two or more are waiting.
- **Removing a message** still works the same way, with its × button.

## Fixed along the way

The "Took 0:07 · 17.7K in · 514 out" line under a reply ([091](../091-reply_duration_and_tokens/en.md)) appeared under the *next* queued message instead of under the reply it describes: when a reply ends, the next queued message is sent and shown before the reply's figures arrive. The line now goes above any message sent after that reply started.

## Limits

- Only messages waiting in this app's queue can be reordered. A message typed while Claude is working when the composer is set to send it straight away goes to Claude Code's own buffer, which cannot be shown or reordered.
- The order is kept in memory by the backend, like the queue itself: if Claude Code stops, the waiting messages are dropped.
