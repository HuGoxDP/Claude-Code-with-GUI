# Claude's environment variables, in Settings

> Language: **English** · [한국어](./ko.md)

Claude Code reads an `env` block from its settings.json and sets those variables for every session: a proxy, a request timeout, the address and key of an API gateway, a feature switch. Changing them used to mean opening the file in an editor. **Settings → General → Environment variables** now lists them and lets you add, change and remove them, writing the same file the CLI reads. Ported from the CC GUI plugin's environment variable editor.

## The editor

![The Environment variables row: ANTHROPIC_AUTH_TOKEN with its value hidden as dots and an eye button, API_TIMEOUT_MS 600000 and HTTPS_PROXY http://proxy.internal:8080, each with a bin button, and below them empty NAME and value fields with an Add button.](./assets/env-vars.png)

- **Add**: type a name and a value and press **Add**, or Enter in the value field.
- **Change**: edit a value; it is saved when you leave the field.
- **Remove**: the bin button next to the variable.

Values are saved as you write them, as text. An empty value is a value: the variable is set, to nothing, which is what the CLI does with `""` too.

Names are letters, digits and `_`, not starting with a digit, since that is what a process can carry. Anything else is refused under the fields, and nothing is saved.

**Keys stay hidden.** A variable whose name ends in `API_KEY`, `TOKEN`, `SECRET` or `PASSWORD` shows dots; the eye button shows it until you leave the page.

## Which file

| Tab | File |
|---|---|
| **User Settings (Global)** | `~/.claude/settings.json`, used by every project (or the folder `CLAUDE_CONFIG_DIR` points to). |
| **Project Settings (Local)** | The project's `.claude/settings.json`. |

Claude Code also reads a `settings.local.json` next to each of them, and the editor shows the two together. A variable that is already in `settings.local.json` is changed there; a new one goes to `settings.json`. Removing a variable removes it from both. Nothing else in either file is touched: other settings and other variables stay exactly as they were, and a file that cannot be read is left alone with an error instead of being overwritten.

A project's `.claude/settings.json` is usually committed, so the project tab says so under the list: keep API keys and tokens in the User Settings tab, or in the project's `settings.local.json`, which is meant to stay on your machine.

## When it takes effect

Claude Code reads the file when it starts, so a change applies from the next message in a new session, or after the running one restarts. Every open chat tab and the settings page update at once, as for any setting.

## What it does not do

- **It shows only text, number and true/false values.** A value that is an object or a list (which the CLI does not use) is left in the file and not listed.
- **It is not the plugin's own CLAUDE_CONFIG_DIR.** That one decides where these files are, so it cannot live in them; it has [its own row](../069-settings_that_reach_everything/en.md) under General.
- **Variables set in your shell** are not listed: they are not in the file. A variable in `env` wins over the same one exported in your shell, as in the terminal.
