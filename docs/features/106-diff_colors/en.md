# Diff colors

> Language: **English** · [한국어](./ko.md)

The edit cards in the chat show each change as red and green lines in the chat theme's own colors. If those are hard on your eyes, or you would rather your diffs look the same whatever the chat theme, pick their colors yourself. Ported from the CC GUI plugin's "Diff Theme".

## Choosing the colors

**Settings → Appearance → Chat → Diff colors**:

![The Diff colors setting under Appearance → Chat, with its description "Colors of the changes in the chat's edit cards." and the dropdown open on Follow chat theme, Light and Soft dark.](./assets/setting.png)

| Choice | What the diffs look like |
|---|---|
| **Follow chat theme** (the default) | The chat theme's own diff colors, exactly as before this setting existed. |
| **Follow IDE theme** | Light when the IDE theme is light, dark when it is dark, whatever the chat theme. Offered only inside the IDE. |
| **Light** | Always a light background with green and red lines. |
| **Soft dark** | Always a dark blue-grey background, softer than black, with gentler green and red. |

Follow chat theme, in the dark theme:

![An edit card in the dark theme: two red removed lines (retries = 3, timeout = 20), two green added lines (retries = 5, timeout = 30) and an unchanged line, on the chat's dark background.](./assets/follow.png)

Light, in the same dark chat:

![The same edit card with a pale background, dark red removed lines on light red and dark green added lines on light green.](./assets/light.png)

Soft dark:

![The same edit card on a dark blue-grey background, with muted red and green lines.](./assets/soft-dark.png)

The change applies at once, to every edit card already in the chat. The rest of the chat keeps its theme.

## Details

- **Follow IDE theme** reads only whether the IDE theme is light or dark, and changes with it when you switch IDE themes. It is useful when the chat theme is set to Light or Dark on its own and you want the diffs to match the editor next to it. In a browser there is no IDE theme to follow, so the choice is not offered; one made in the IDE shows there as Follow chat theme, and acts like it.
- Like the other Appearance settings, it can be set for one project in the project settings.
- It changes only colors. Whether a card starts open is [Expand diffs](../100-expand_diffs_switch/en.md), and folding long lines is [Soft wrap](../036-soft_wrap/en.md).

## What it does not cover

- **The diff review before an edit is applied** (the IDE's diff viewer, or the review page in a browser) keeps its own colors: the IDE's are set by the IDE theme, and the browser page by its syntax highlighting.
- **Code blocks in replies** are not diffs and keep the chat theme.
