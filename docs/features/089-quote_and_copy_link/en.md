# Quote a reply, and copy a link's address

> Language: **English** · [한국어](./ko.md)

Select part of a reply and right-click it. A small menu offers **Quote** and **Copy**. **Quote** puts the passage in the chat input as a Markdown quote, with an empty line below it for your question:

![The chat in the English interface. A sentence of Claude's reply is selected, and a small menu next to it lists "Quote" and "Copy".](./assets/quote-menu.png)

![The chat input after Quote: the selected sentence starts with "> ", followed by an empty line and the question typed below it, "Is server-side enough on its own?".](./assets/quote-in-input.png)

Right-click a link in a reply and the menu offers **Copy link address** instead, which copies where the link points even when its text says something else:

![A reply with the link "RFC 6585" right-clicked, and a menu with one item: "Copy link address".](./assets/copy-link-menu.png)

Ported from the CC GUI plugin, which has the same menu.

## How the quote is written

| | |
|---|---|
| **Form** | Each line starts with `> `, the Markdown quote Claude reads as "this is what I am answering about". A blank line inside the passage stays inside the quote. |
| **Where it goes** | At the end of what you have already written, one empty line apart. By the time you pick Quote the cursor has left the input for the reply, so its last position says nothing about where you want the quote. |
| **After it** | An empty line, and the cursor below it, so you can type your question straight away. Nothing is sent. |
| **What is copied** | The text as it reads on screen. Formatting that is not text, such as the grey box around `inline code`, is not carried into the quote. |

The quote is plain text in the input, so you can edit it, shorten it, or quote several passages one after another before sending.

## When the menu appears

The menu opens only when it has something to offer: on a link, or with text selected in the conversation. A right-click anywhere else shows your browser's own menu, or the IDE's, as before. To reach that menu over a link or a selection too, hold **Shift** while you right-click.

The menu closes when you pick an item, press Esc, click elsewhere, or scroll.

## Limits

- **Only in the conversation.** Text in the input, settings or dialogs is not covered.
- **Links inside the page are not offered.** A link that only jumps within the page has no address worth copying.
- **Copy needs clipboard access.** If the browser refuses it, a notice says the copy failed.

## Common questions

**Can I quote a whole reply?** Select it all, by dragging from its first word to its last, and pick Quote. To copy a message you sent, use **Copy message** in its ⋮ menu.

**Why does Quote add the text at the end and not where I was typing?** Because the cursor leaves the input when you select text in a reply. Put the quote where you want it by cutting and pasting, or quote first and type after.
