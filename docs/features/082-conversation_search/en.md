# Find in the conversation with Cmd/Ctrl+F

> Language: **English** · [한국어](./ko.md)

Long sessions are hard to search by scrolling: was the port number mentioned before or after the refactor? Press **Cmd+F** (macOS) or **Ctrl+F** (Windows, Linux) in the chat and a search bar opens over the top of the conversation. Every match is highlighted, and you can jump from one to the next.

![A chat about a login bug, in the English interface. A search bar at the top right reads "password" and "2 of 8", with "Aa", "ab" and ".*" toggles, up and down arrows and a close button. Every "password" in the conversation is highlighted in a light colour, and the second one, in "Let me look at the password check in the login handler.", is highlighted more strongly.](./assets/conversation-search.png)

## Using it

1. Press **Cmd/Ctrl+F** while the chat is in front (or pick **Search in conversation** in the command palette).
2. Type. Matches are highlighted as you type, the first one is scrolled into view, and the counter shows where you are (`2 of 8`).
3. **Enter** (or the down arrow) goes to the next match, **Shift+Enter** (or the up arrow) to the previous one; both wrap around at the ends. **F3** / **Shift+F3** work too.
4. **Esc** or the **×** closes the bar and removes the highlights.

Pressing Cmd/Ctrl+F again while the bar is open puts the cursor back in it and selects the query, so you can type a new one straight away.

## Options

| Toggle | Key | What it does |
|--------|-----|--------------|
| **Aa** | Alt+C | Match case: `Login` no longer finds `login` |
| **ab** | Alt+W | Whole word: `cat` no longer finds `concat` |
| **.\*** | Alt+R | Regular expression: the query is a JavaScript regex (`port \d+`) |

The toggles are remembered for next time. A regular expression that does not compile shows **Invalid regex** instead of a count.

## What is searched

- The **conversation you see**: your messages, Claude's replies and the text of tool cards.
- **Not** the composer, buttons or menus.
- **Only what is loaded and showing.** A long session loads older messages as you scroll up, and folded replies or collapsed tool cards are hidden; text in those is not found until it is on screen. Load older messages or unfold a reply, and the search picks it up by itself.
- The search keeps up with a reply that is still streaming: new text is searched as it arrives, without moving you away from the match you are on.

A match cannot span formatting: in `**foo**bar`, searching `foobar` finds nothing, because the two halves are drawn separately.

## Where it works

Everywhere the chat runs: in a JetBrains IDE (while the chat has focus, Cmd/Ctrl+F belongs to the chat rather than to the IDE's Find for the editor behind it; Cmd/Ctrl+Shift+F, Find in Files, is untouched) and in the browser in standalone mode (where it replaces the browser's own find bar for the chat page).

On macOS, Ctrl+F stays the Emacs-style "forward one character" key in text fields; search is Cmd+F.

## Common questions

**Nothing is highlighted, but the counter shows matches.** Highlighting needs a recent browser engine (Chrome/Edge 105+, Safari 17.2+, Firefox 140+). JetBrains IDEs ship one. On an older browser the search still counts and jumps to matches; only the colouring is missing.

**It does not find something I know is in the session.** It is probably in an older page that is not loaded yet, in a folded reply, or in a collapsed tool card. Scroll up to load older messages or expand the card, then search again.

**Cmd/Ctrl+F opens the IDE's Find instead.** Click into the chat first so it has focus.
