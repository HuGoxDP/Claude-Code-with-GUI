# Decline a waiting prompt automatically

> Language: **English** · [한국어](./ko.md)

When Claude asks for permission, for approval of a plan, or asks you a question, the chat waits for your answer. If you step away, it waits until you come back. You can now set a limit instead: after it, the prompt is declined for you, Claude is told nobody answered, and it carries on with the rest of the task. Ported from the CC GUI plugin, which has the same timeout.

It is **off by default**, so nothing changes until you set it.

![Settings, Permissions page: a section "Waiting for your answer" with the setting "Decline automatically after", its description, and the value "30 seconds".](./assets/timeout-setting.png)

## Setting it

**Settings → Permissions → Waiting for your answer → Decline automatically after.** Choose **Off** (the default), 30 seconds, 1, 2, 5, 10 or 30 minutes, or 1 hour.

Like other settings, it can be set for all projects or, on the **Project Settings** tab, for one project only.

## What you see

While a prompt waits, a line above it counts down. It turns orange in the last 30 seconds.

![A permission prompt "Write to timeout-probe.txt?" with Yes, "Yes, allow all edits this session", No and a text field. Above it, in orange: "Declined automatically in 0:28 if you do not answer".](./assets/countdown.png)

Answer at any time to stop the countdown; your answer goes through as usual. Each new prompt starts with the full time again. Collapsing a panel does not pause it.

When the time runs out:

| Prompt | What happens |
|---|---|
| **Permission** (run a command, edit a file, …) | Declined. Nothing is run or written. |
| **Plan approval** | Not approved; Claude does not start on the plan. |
| **Question** | Left unanswered. |

In every case Claude receives this message in place of your answer, and continues: *"No answer came within 5:00, so this was declined automatically. The user may be away; continue without it if you can, or ask again later."*

![The chat after a timeout: the Write call shows, in red, "User declined to run this tool. Asked Claude instead: No answer came within 0:30, so this was declined automatically…", followed by Claude's reply "declined".](./assets/declined.png)

## How this differs from pressing Esc

**Esc to cancel** stops Claude's whole turn: you are there and you want it to stop. A timeout only declines the one prompt, because the point is to let Claude keep going while you are away. It tells Claude that nobody answered, not that you said no, so Claude can choose to ask again later.

## Limits

- **Only while the chat is open.** The countdown runs in the chat window. If no chat window shows the session, nothing counts down and the prompt waits, as before.
- **The time starts when the prompt appears on screen**, not when Claude asked. Opening a session that has been waiting for an hour starts a fresh countdown.
- **A question Claude Code asked without a request id cannot be declined this way**, so no countdown appears for it. This is rare; such a question waits as before.
- **Claude decides what "continue" means.** It may try another way, skip the step, or stop and explain. If the step was essential, it may simply end the turn.

## Common questions

**Can I make it wait forever again?** Choose **Off**.

**Will this run commands for me while I am away?** No. A timeout always declines; it never approves anything.
