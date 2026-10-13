# The interface in Hindi

> Language: **English** · [한국어](./ko.md)

**Settings → General → Interface Language** now offers **हिन्दी** (Hindi). Pick it and the whole interface is drawn in Hindi: the settings, the chat screen, tool cards, dialogs, the session list, notifications and the loading message shown before the app starts. Hindi joins the twelve languages already there ([Interface language](../009-interface_language_i18n/en.md), [right-to-left languages](../010-rtl_support/en.md)). The CC GUI plugin ships a Hindi interface, and this brings the same choice here.

## Switching to Hindi

Open **Settings → General**, find **Interface Language** and choose **हिन्दी** at the bottom of the list. Each language is listed under its own name.

![The Interface Language row in Settings → General, with the description "Language for the app interface, independent of Claude's response language." and the dropdown open below "English": Español, Français, Deutsch, Português, Русский, فارسی, العربية and, highlighted at the bottom, हिन्दी.](./assets/picker.png)

The change takes effect at once, with no restart and no reload. The next time the app opens, it starts in Hindi again, including the "loading" line that appears before the rest of the screen.

![Settings → General in Hindi: the sidebar reads सामान्य, दिखावट, मॉडल, अनुमतियाँ, स्किल, गोपनीयता, CLI, ब्राउज़र, IDE, खाता और पूल, उपयोग, टनल, रिलीज़, परिचय, प्रायोजक; the tabs read उपयोगकर्ता सेटिंग्स (वैश्विक) and प्रोजेक्ट सेटिंग्स (लोकल); the rows read भाषा with "Claude की पसंदीदा जवाब भाषा", इंटरफ़ेस भाषा with the dropdown set to हिन्दी, and RTL (दाएँ से बाएँ) चालू करें.](./assets/settings-in-hindi.png)

To go back, choose another language in the same dropdown; in Hindi the row is called **इंटरफ़ेस भाषा**.

## The interface language is not Claude's language

The row just above, **Language** (**भाषा** in Hindi), is the language Claude answers in. The two are separate on purpose: switching the interface to Hindi does not make Claude reply in Hindi, and you can read the interface in Hindi while asking Claude for answers in English, or the other way round. To have Claude answer in Hindi, type `hindi` (or any wording Claude understands) into **Language**, as you would in Claude Code's own settings file.

## What stays in English

Some words are not translated, in Hindi or in any other language:

- **Names and code**: Claude Code, Claude, CLI, IDE, MCP, file names such as `CLAUDE.md`, settings keys, environment variables, commands and paths appear as written, because that is how you type them and how they appear in Claude Code's documentation.
- **Words Claude Code itself shows**, such as the permission mode names (Ask before edits and so on) and model names, appear as Claude Code writes them.
- **The four buttons over each change in the diff review** (Accept, Deny, Reset, Back) stay in English in every language, so the same kind of control never mixes two languages on one row. The tooltips that explain them are translated.
- **The letters on setting badges** (S, C, P) stay as they are; hovering a badge shows its explanation in Hindi.

## Things to know

- **Numbers and dates** use the same digits as the rest of the app (0–9), the form most Hindi-language software uses.
- **Hindi reads left to right**, so choosing it turns right-to-left layout off if it was on because of Persian or Arabic. The **RTL** switch below stays yours to change.
- **The setting is per machine**, stored with the app's other settings in `~/.claude-code-gui/settings.js` as `uiLanguage: "hindi"`. A project can set its own value on the **Project Settings** tab.
- **Something reads badly?** Translation fixes are welcome as an issue or a pull request against `webview/src/i18n/locales/hi/`.
