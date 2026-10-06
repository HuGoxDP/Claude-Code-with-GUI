# Replies that appear whole instead of streaming in

> Language: **English** · [한국어](./ko.md)

By default a reply streams into the chat as Claude writes it. If you would rather read it once it is finished, turn **Stream replies** off: each message then appears whole. Ported from the CC GUI plugin's Streaming switch.

![The Chat section of Settings → Appearance, with "Hide tool calls" off and "Stream replies" off: "Show a reply as it is written; off, each message appears once finished. Applies from your next message."](./assets/setting-off.png)

## Where it is

**Settings → Appearance → Chat → Stream replies**. It is on unless you turn it off, which is how the chat has always behaved.

## What changes when it is off

- **Each message appears in one piece** once Claude has finished it. A turn that uses tools still shows each step as it completes: the tool card appears when the call is made, its result when it returns, and the text after it.
- **While Claude is still writing**, the chat shows its usual working indicator under your message, without the growing text.

![A chat with streaming off while Claude works: the user's message and, under it, "Computing..." with the stop button in the input box.](./assets/waiting.png)

- **Everything else is the same.** The conversation that is saved, what you see when you reopen it, the reply duration and token line ([091](../091-reply_duration_and_tokens/en.md)), permissions and questions all work as before.

![A chat with streaming off after two replies: each reply is a finished paragraph, with "Took 0:08 · 18.5K in · 239 out" under the last one.](./assets/reply-whole.png)

## When it takes effect

From your **next message**. Claude Code decides whether to stream when it starts, so the chat starts it again for your next message after you flip the switch. The conversation carries on where it was. A reply that is already being written finishes the way it started.

## How it works

It is Claude Code's own choice, not something the chat imitates. On, the chat starts Claude Code with `--include-partial-messages`, which sends the text as it is written. Off, the flag is left out, and Claude Code sends each message whole: the same as running `claude -p --output-format stream-json` in a terminal without that flag.

## Common questions

**Is it faster?** No. Claude takes the same time either way; you only see the text later. Off sends fewer updates to the chat, which can help on a slow remote connection.

**Can I set it per project?** Yes, from the **Project** tab of Settings, like other settings.

**Does it affect thinking?** A thinking summary (Claude Code's `showThinkingSummaries`) appears whole too, once that thinking is finished.
