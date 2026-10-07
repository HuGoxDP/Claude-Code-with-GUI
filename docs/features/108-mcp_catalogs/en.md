# More places to find MCP servers

> Language: **English** · [한국어](./ko.md)

The MCP registry browser in the MCP servers window (the search icon in its header, see [MCP server management](../003-mcp_server_management/en.md)) used to search one catalog, the official MCP Registry. It can now search **GitHub's MCP Registry**, a short **built-in** list of well-known servers, or **all of them at once**. Ported from the CC GUI plugin's MCP marketplace sources.

## Choosing a catalog

The dropdown next to the search box picks where to look:

![The registry browser with its catalog dropdown open on Official MCP Registry, GitHub MCP Registry, Built-in (checked) and All sources. Behind it, the built-in list: fetch, time, memory, sequential-thinking and context7, each with an Add button.](./assets/catalogs.png)

| Catalog | What it is | How it searches |
|---|---|---|
| **Official MCP Registry** (the default) | The community registry at registry.modelcontextprotocol.io, as before. | The registry searches by name as you type. |
| **GitHub MCP Registry** | GitHub's registry, the same kind of catalog run by GitHub. | The plugin reads up to 500 of its servers, keeps them for an hour, and searches their names and descriptions itself. |
| **Built-in** | Five well-known servers listed by the plugin: fetch, time, memory, sequential-thinking and context7. | Listed as soon as you choose it; typing narrows the list. |
| **All sources** | The three above together. | Each server appears once: built-in first, then the official registry, then GitHub's. A tag on each card names its catalog. |

The choice is remembered for the next time you open the browser.

## The built-in servers

![The Built-in catalog: fetch (modelcontextprotocol/fetch, "Fetch web pages and convert them into model-friendly content."), time, memory, sequential-thinking and context7 (upstash/context7), each with its description and an Add button.](./assets/builtin.png)

| Server | Runs with | What it does |
|---|---|---|
| fetch | `uvx mcp-server-fetch` | Fetches web pages and turns them into text Claude can read. |
| time | `uvx mcp-server-time` | Tells the current time and converts between time zones. |
| memory | `npx -y @modelcontextprotocol/server-memory` | Keeps a knowledge graph on your machine that lasts across chats. |
| sequential-thinking | `npx -y @modelcontextprotocol/server-sequential-thinking` | Gives Claude a tool for working through a problem in revisable steps. |
| context7 | `npx -y @upstash/context7-mcp` | Looks up current documentation and code examples for libraries. |

fetch and time are Python packages and run with **`uvx`**, which comes with [uv](https://docs.astral.sh/uv/). If uv is not installed, those two servers fail to start; the others need Node.js, which Claude Code already uses.

**Add** works as for any registry server: the add form opens with the server's name and configuration filled in, and you choose the scope before adding it.

![The add form after Add on fetch: Name "fetch", Scope "User (all projects)", and the configuration {"type": "stdio", "command": "uvx", "args": ["mcp-server-fetch"]}.](./assets/prefill.png)

## When a catalog cannot be reached

Searching a single catalog that cannot be reached shows the error in place of the results, as before. **All sources** shows what the others found, with a line saying which catalog is missing:

![All sources searched for "memory": a yellow line "Not reachable right now: GitHub MCP Registry. Showing the rest.", then the built-in memory server tagged Built-in, followed by servers from the official registry tagged Official MCP Registry.](./assets/all.png)

The plugin connects to the catalogs from the computer it runs on, through your proxy settings like its other requests ([usage behind a proxy](../063-usage_behind_a_proxy/en.md)). A company network that blocks one of the hosts (`registry.modelcontextprotocol.io`, `api.mcp.github.com`) leaves that catalog out.

## What it does not do

- **No catalog of the `modelcontextprotocol` GitHub organisation.** CC GUI lists that organisation's repositories too. They are mostly SDKs, the specification and tools rather than servers, and none says how to run it, so each would be a card that cannot be added. The servers among them are in the registries.
- **GitHub's registry is searched by name and description only**, in the servers the plugin read; a server past the first 500 does not appear. The official registry does its own searching and has no such limit.
- **Adding still goes through `claude mcp add-json`**, exactly as for a server you paste yourself. The catalogs only fill in the form.
