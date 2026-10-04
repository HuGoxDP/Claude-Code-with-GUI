# Star the sessions you keep coming back to

> Language: **English** · [한국어](./ko.md)

Some conversations you return to for weeks: the one where the architecture was worked out, the release checklist, the debugging session you keep extending. In a long session list they sink under everything newer. Now you can **star** them, and starred sessions stay in a **Favorites** group at the top of the list.

## Star a session

Open the session dropdown (or the session panel) and hover a session. The first of the row's icons is a **star**; click it. The session moves into **Favorites** at the top of the list, and its row keeps a small filled star next to the time.

![The session dropdown in the English interface. "Favorites" is the first group, holding "Explain the database migration plan" with a filled star and "3mo". Below, under "Yesterday", the hovered row "Write a release checklist for v2.0" shows four icons: an outlined star, a download arrow, a pencil and a trash can.](./assets/session-favorites.png)

To unstar, hover the session again and click the filled star (its tooltip says **Remove from favorites**). The session goes back to its date group.

Starring does not open the session, and it does not change anything in the session itself.

## How the Favorites group behaves

- **It is always first**, above Today, Yesterday and the rest. Inside it, sessions keep the usual newest-first order.
- **Old sessions show up too.** The list loads a page of recent sessions at a time, but starred sessions are fetched on their own, so a session you starred months ago is in Favorites as soon as the list opens. You do not have to scroll down to it first.
- **Search and the filters still apply.** Typing in the search box narrows Favorites like every other group, and the Active / status / tab filters hide starred rows that do not match.
- **Stars follow the project you are looking at.** A starred session from another project is not added to this project's list. With **Include sessions from subprojects** on, starred sessions from nested folders are included, just like their unstarred neighbours.
- **Keyboard navigation** in the list walks Favorites first, in the same order you see.

## Every window agrees

Stars are shared across all your tabs and windows: star a session in one tab and the session panel and the other tabs update straight away.

## Where stars are kept

Stars live in your user data folder, in `~/.claude-code-gui/session-favorites.json`, next to your other GUI settings. They are not written into the Claude Code CLI's session files, so the CLI is unaffected, and nothing about a session changes when you star it.

Deleting a session also removes its star.

## Common questions

**I starred a session and it disappeared from where it was.** It moved to the Favorites group at the top. Scroll up.

**My star is gone after I deleted and re-created the session.** A star belongs to one session; deleting the session removes it.

**Can I star sessions in the terminal?** No. The Claude Code CLI has no favorites; this is a GUI convenience on top of the sessions the CLI writes.
