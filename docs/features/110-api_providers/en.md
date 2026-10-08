# Switch Claude Code between API providers

> Language: **English** · [한국어](./ko.md)

Some people reach Claude through something other than their Claude login: a company gateway, a proxy that adds logging, an API key billed to a different account. Claude Code supports all of these with a few documented variables in the `env` block of `~/.claude/settings.json`: `ANTHROPIC_BASE_URL` for the address, `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` for the key, and `ANTHROPIC_MODEL` with the `ANTHROPIC_DEFAULT_*_MODEL` slots for the models. Moving between two of them meant editing those variables by hand every time, and putting them back to go home to your login.

**Settings → Model → API providers** keeps each one as a named provider. **Use** writes its variables into the file, as you would by hand, and **Claude login** takes them out again. Ported from the CC GUI plugin's API provider manager.

## The list

![The API providers section in dark mode. At the top, "Claude login" with the text "Your Claude account, the way claude signs in. None of the provider variables are set." and a Use button. Below it, "Company gateway" is outlined and marked "In use", with its address https://llm-gateway.example.com/anthropic, the line "claude-via-gateway · Sonnet → gateway-medium · Haiku → gateway-small" and "Key in ANTHROPIC_AUTH_TOKEN", and pencil and bin buttons. Then "Personal API key", showing "Claude's own address" and "Key in ANTHROPIC_API_KEY", with a Use button. An "Add provider" button at the bottom.](./assets/list.png)

- **Claude login** is always first. It means none of the provider variables are set, so claude signs in with your Claude account, as it does out of the box.
- Each provider shows its address (or **Claude's own address** when it has none), the models it sets, and which variable its key goes in, or **No key**. The key itself is never shown.
- The one your settings match is outlined and says **In use**. Every other one has **Use**.
- The pencil changes a provider and the bin deletes it, after asking.

Using one shows "Now using …. New sessions start with it."

## Adding a provider

![The provider form filled in: Name "Company gateway", Address (ANTHROPIC_BASE_URL) https://llm-gateway.example.com/anthropic, Key with a variable picker set to ANTHROPIC_AUTH_TOKEN and the key hidden as dots, Model (ANTHROPIC_MODEL) claude-via-gateway, an empty Opus slot, Sonnet slot gateway-medium, Haiku slot gateway-small, an empty Fable slot, and Cancel and Save buttons.](./assets/form.png)

**Add provider** opens the form. Every field is labelled with the variable it fills:

| Field | Variable | Notes |
|---|---|---|
| **Name** | (none) | How you know it; up to 80 characters, one provider per name. |
| **Address** | `ANTHROPIC_BASE_URL` | An `http://` or `https://` URL. Leave it empty for a key used on Claude's own address. |
| **Key** | `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` | Pick the variable on the left. Gateways usually want `ANTHROPIC_AUTH_TOKEN` (sent as a bearer token); a key from the Claude Console goes in `ANTHROPIC_API_KEY`. |
| **Model** | `ANTHROPIC_MODEL` | The model Claude Code starts with. |
| **Opus / Sonnet / Haiku / Fable slot** | `ANTHROPIC_DEFAULT_OPUS_MODEL`, `…_SONNET_…`, `…_HAIKU_…`, `…_FABLE_…` | What each choice in the model picker sends. How these appear in the picker is in [Models you connect yourself](../021-custom_model_catalog_display/en.md). |

Only the name is required. An empty field sets nothing.

**Changing a provider** opens the same form. The key field says "Saved; type to replace it": leave it empty to keep the saved key, type to replace it, or tick **Remove the saved key**. If the provider is in use, saving it writes the new values to your settings straight away.

A refusal (a name already taken, an address that is not a URL) is shown under the form, and nothing is saved.

## What Use writes

**Use** writes the provider's variables into the `env` block of your user settings and **removes the provider variables it does not set**. Switching from a gateway to a plain API key therefore takes the gateway's address and models out too, instead of leaving them to point the key at the wrong place.

**Claude login** removes all eight provider variables:

`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_FABLE_MODEL`

Nothing else is touched: your other variables (a proxy, a timeout) and every other setting stay as they are. The writing follows the same rules as the [environment variable editor](../109-env_vars/en.md): a variable already in `settings.local.json` is changed there, and a file that cannot be read is left alone with an error instead of being overwritten. Since this is the file the CLI reads, `claude` in your terminal uses the same provider.

## How "in use" is decided

Nothing remembers which provider you picked. The section reads your settings each time and compares the eight variables with each provider's. So an edit made in the terminal, in the environment variable editor or in a text editor is seen as it is:

- None of the eight set: **Claude login** is in use.
- They match a provider exactly: that provider is in use.
- They match none: nothing is outlined, and the section says "The ANTHROPIC_* variables in your user settings match none of these. Using one replaces them."

## Where the keys are kept

The providers are stored in the plugin's entity files (`~/.claude-code-gui/entities/provider/`), **without their keys**. Those files only ever grow, so a key written there would stay after you changed or deleted it. Keys go in `~/.claude-code-gui/api-provider-keys.json` instead, which is rewritten whole each time and kept readable only by you (mode 600, as for the saved account credentials; on Windows your user folder's permissions decide). Deleting a provider deletes its key. The key never reaches the settings screen, which learns only whether there is one.

**Using a provider puts its key in `settings.json`**, in plain text, because that is where Claude Code reads it. This is the same as setting it by hand. The environment variable editor hides it behind dots, but the file itself is as private as your home folder. Going back to Claude login removes it.

## When it takes effect

Claude Code reads the variables when it starts. A new session uses the new provider from its first message; a chat that is already running keeps the one it started with until it restarts.

## What it does not do

- **It is User Settings only.** Providers are written to `~/.claude/settings.json`, which every project reads; in the Project Settings tab the section is shown greyed out with "Providers live in User Settings, which every project reads." If a project's own settings set one of these variables, the project wins, as it does in the terminal.
- **Deleting the provider in use does not change your settings.** Its variables stay, and the section then says they match none of the providers. Use **Claude login** or another provider to change them.
- **It does not check the address or the key.** A wrong one shows up as an error on the next message. If it is an authentication error, the chat says which credential was used ([Know which credential failed](../068-know_which_credential_failed/en.md)).
- **No prices.** CC GUI can also keep custom models with their prices for its cost figures; that part is not here yet.
- **Variables exported in your shell are not changed.** A variable in `settings.json` wins over the same one in your shell, as in the terminal, so using a provider still takes effect.
