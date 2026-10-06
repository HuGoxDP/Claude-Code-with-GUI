# Edit cards that start closed

> Language: **English** · [한국어](./ko.md)

Each time Claude edits a file, the chat shows an edit card with the change as a diff. In a long session those diffs fill the screen. Turn **Expand diffs** off and every edit card starts closed, showing only how much changed (`Modified +2 −2`); click it to see the diff. Ported from the CC GUI plugin's "Expand diffs by default".

![An edit card with its diff open: "Edit config.toml", the line "Modified +2 −2" with a down arrow, and under it the removed lines retries = 3 and timeout = 20 in red and the added retries = 5 and timeout = 30 in green.](./assets/open.png)

## Where it is

**Settings → Appearance → Chat → Expand diffs**. It is on unless you turn it off, which is how the chat has always shown edits.

![The Chat section of Settings → Appearance with "Expand diffs" switched off: "Show the changes in each edit card; off, a card shows +N −M and opens on click."](./assets/setting.png)

## Opening and closing one card

The **Modified** line of every edit card is a button, whichever way the setting is:

- The arrow points right while the card is closed and down while it is open.
- After **Modified** come the numbers of added (green) and removed (red) lines, so a closed card still tells you how big the change was.
- Click it to open or close that card alone.

![The same edit card closed: only "Edit config.toml" and "Modified +2 −2" with a right arrow, and Claude's reply right under it.](./assets/closed.png)

A card you open or close by hand stays that way while you change the setting; the others follow it.

## Common questions

**Does it change what Claude writes to the file?** No. It only decides how the card looks in the chat. The approval question before an edit ([030](../030-ide_diff_review/en.md)) works as before.

**Why does a card show no diff, open or not?** When the chat is narrower than about 400 pixels the card shows only **Modified**, as it did before, because a diff does not fit. Widen the panel to see it.

**Can I set it per project?** Yes, from the **Project** tab of Settings, like other settings.
