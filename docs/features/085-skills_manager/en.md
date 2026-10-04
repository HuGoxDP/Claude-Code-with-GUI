# Choose which skills Claude sees

> Language: **English** · [한국어](./ko.md)

Skills are folders of instructions Claude loads when a task calls for them. Every skill you install is listed to the model, and a long list costs context and can pull Claude toward the wrong one. In the terminal, `/skills` lets you dial each skill down. The GUI had no way to do that: `/skills` is a terminal screen. **Settings → Skills** now does the same job, with the same setting.

![Settings → Skills in the English interface. Under the title "Skills" with an orange "C" badge, a short line reads "Choose how much of each skill Claude and the slash menu see. Same as /skills in the terminal." A box explains the four states On, Name only, Slash command only and Off. Below, "This project" (.claude/skills/) lists /deploy-preview, struck through and set to "Off" with "Set in .claude/settings.local.json", and /release-notes set to "On". "Personal" (~/.claude/skills/) lists /explain-code set to "On" and /write-tests set to "Slash command only" with "Set in ~/.claude/settings.json".](./assets/skills-page.png)

## Using it

1. Open **Settings → Skills**.
2. Each skill shows as `/name` with its description, grouped by where it lives:
   - **This project**: `.claude/skills/<name>/SKILL.md` in the project you are in.
   - **Personal**: `~/.claude/skills/<name>/SKILL.md`, available in every project.
3. Pick a state from the drop-down next to a skill. It is saved straight away; there is no Save button.

![The same screen with the drop-down of /release-notes open, listing On (checked), Name only, Slash command only and Off.](./assets/skills-menu.png)

**Open SKILL.md** next to a name opens the skill's file in your editor (in the IDE), so you can read or change what it says. With more than six skills, a filter box narrows the list by name or description.

## The four states

| State | What Claude sees | Can you run `/name`? |
|-------|------------------|----------------------|
| **On** | The name and the description; Claude can use it on its own | Yes |
| **Name only** | The name without the description, which saves context | Yes |
| **Slash command only** | Nothing; Claude will not reach for it | Yes |
| **Off** | Nothing | No, and it leaves the slash menu |

These are the CLI's own four values of the `skillOverrides` setting (`on`, `name-only`, `user-invocable-only`, `off`), so a skill set to Off here is off in the terminal too, and the other way round. Running an Off skill by name gets the CLI's own answer: *"Skill "…" is disabled via skillOverrides."*

## Where the choice is saved

Nothing in the skill folder changes. The state goes into the same settings files `/skills` writes:

- a **project** skill: the project's `.claude/settings.local.json` (your own, not committed);
- a **personal** skill: `~/.claude/settings.json`.

Only the `skillOverrides` entry for that skill is touched; everything else in the file stays as it is. Setting a skill back to **On** removes its entry rather than writing "on", because no entry already means on.

A row says **Set in …** whenever a settings file decides its state, so you know where it comes from. If your team's shared `.claude/settings.json` turns a skill off, changing it here writes to your `.claude/settings.local.json`, which overrules the shared file for you alone. The shared file is never edited.

When the decision lives in a file other than the default, for example a personal skill switched off in this project's `.claude/settings.local.json`, the change goes to that file, so it takes effect.

## When it takes effect

The next time Claude reads its settings, which is the next message you send. The slash menu re-reads the command list each time it opens, so an Off skill disappears from it (and comes back when it is turned on) without a restart.

## Limits

- Only your personal and project skills are listed. Skills that come with plugins and the ones built into Claude Code are not shown here; manage those in the terminal with `/skills`.
- Skills are not created, renamed or deleted here. Add a folder with a `SKILL.md` under one of the two locations (or remove it) and press the reload button at the top right.
- The name is the `name:` in the skill's frontmatter, or the folder name when there is none, the same rule the CLI uses.

## Common questions

**My skill is not in the list.** Check that it is a folder with a file named exactly `SKILL.md` inside, under `.claude/skills/` in this project or `~/.claude/skills/`. Then press the reload button.

**I set it to Off but Claude still used it.** The change applies from your next message. A message that was already being answered keeps the list it started with.

**It shows "Set in .claude/settings.json" and I never wrote that.** Someone on your team did: that file is shared with the project. Your choice here is saved in `.claude/settings.local.json` and wins for you, without changing theirs.

**Does this need a project?** Personal skills can be managed from anywhere. Project skills need the project to be open.
