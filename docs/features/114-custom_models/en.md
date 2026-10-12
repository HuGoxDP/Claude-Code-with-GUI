# Pick models Claude Code does not list, and give them a price

> Language: **English** · [한국어](./ko.md)

In the terminal, `claude --model <name>` and `/model <name>` take any model name the endpoint knows, not only the ones Claude Code lists. The chat's model picker shows Claude Code's list, so a model behind another endpoint (a gateway set up with [API providers](../110-api_providers/en.md), for example) could not be picked from it. **Custom models** puts such names in the picker, under a name of your own. Ported from the CC GUI plugin's custom models.

## Adding one

**Settings → Model → Custom models**, then **Add model**.

![The custom model form: Model name "glm-4.6" with the hint "as in claude --model <name>", Display name "GLM 4.6", Description "Through the company gateway", and under "Prices, US dollars per million tokens" the note "Only used by the usage history, for models Claude Code cannot price. An empty price counts as zero." with Input 0.6, Output 2.2, Cache write empty and Cache read 0.11, then Cancel and Save.](./assets/form.png)

- **Model name** is what Claude Code is handed, exactly as you type it: one word, as you would write it after `claude --model`. It must be unique in the list.
- **Display name** (optional) is what the picker calls it. Without one, the picker shows the model name.
- **Description** (optional) is the line under it in the picker.
- **Prices** (optional) are explained [below](#prices).

**Save** keeps it; a name that is missing, has a space in it or is already in the list is refused with the reason, and nothing is saved.

![The Custom models section with two cards: "GLM 4.6" with glm-4.6, "Through the company gateway" and "Per million tokens: $0.60 input · $2.20 output · $0.11 cache read"; and "qwen3-coder" with "No prices". Each card has a pencil and a bin, and Add model is below.](./assets/list.png)

The pencil changes a model, and the bin takes it out of the list after asking. Custom models are yours, not a project's: every project and both settings tabs show the same list.

## Picking one

![The model picker with "GLM 4.6" marked Custom and ticked, "Through the company gateway" under it, and "qwen3-coder" marked Custom below it.](./assets/picker.png)

Custom models come first in the model picker, each marked **Custom**. Choosing one does exactly what `/model <name>` does in the terminal; typing `/model glm-4.6` in the chat works too. The model chip under the input shows the name you gave it:

![The chat input with "Ask before edits" on the left and "GLM 4.6" as the model on the right.](./assets/chip.png)

Custom models are also in the command palette's **Switch model** and in **Settings → Model → Default Model**. With **Sync model changes to default** on, picking one also makes it the default for new sessions, as `/model` does in the terminal.

When Claude Code itself lists the same model (it adds a row for the model a session runs on, and you can add one of its own models too), the two become one row: your name, at the top, with what Claude Code knows about the model.

## Prices

Claude Code works out what each session costs, and the [usage history](../113-usage_history/en.md) shows that figure. For a model Claude Code does not know the price of, it records the tokens but no cost, and the history then says the cost shown is too low.

The prices you give a custom model fill in exactly that gap, and nothing else: they are used only by the usage history, only for that model, and only where Claude Code recorded tokens with no cost. A model Claude Code can price keeps Claude Code's price, whatever you enter. Prices are in US dollars per million tokens, from 0 to 10,000; an empty price counts as zero once you have given any price for the model. When some of the history's cost comes from your prices, it says so under the chart.

## What it does not do

- **It does not make a model reachable.** Claude Code still sends the name to whatever endpoint it uses; a name that endpoint does not know fails on the first message with the endpoint's own error, just as `claude --model` would.
- **It does not tell Claude Code what the model can do.** Context size, effort levels and the like are whatever Claude Code assumes for a name it does not know.
- **Taking a model out of the list does not change a chat already on it**, nor the default model if you made it the default; change those in the picker or in Settings.
- **The list is kept on this machine**, in `~/.claude-code-gui/entities/provider/custom_models.entity.jsonl`.
