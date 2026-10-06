# GitHub Copilot·VS Code 설정에서 MCP 서버 추가하기

> Language: [English](./en.md) · **한국어**

MCP 서버를 이미 GitHub Copilot이나 VS Code에 설정해 두었다면, 그 `mcp.json`을 **Add MCP Server**에 그대로 붙여넣으면 됩니다. 들어 있는 서버가 모두 Claude Code가 읽는 형태로 바뀌어 추가됩니다. CC GUI 플러그인의 Copilot 가져오기에서 가져왔습니다.

![GitHub Copilot 설정을 붙여넣은 Add MCP Server 양식: "servers" 아래 "github"(type http, url https://api.githubcopilot.com/mcp/, requestInit.headers.Authorization "Bearer ${env:GITHUB_PAT}")와 "filesystem"(command npx와 args).](./assets/form.png)

## 쓰는 법

1. MCP 서버 패널을 열고 **+**(Add MCP server)를 누릅니다.
2. 파일을 통째로 붙여넣습니다. Copilot과 VS Code가 쓰는 대로 맨 위에 `"servers"`가 있는 JSON입니다. **Name**은 비워 두세요. 서버마다 파일에 적힌 이름을 씁니다.
3. 다른 서버처럼 **Scope**(user, project, local)를 고르고 **Add server**를 누릅니다.

![추가한 뒤의 MCP 서버 패널: User (2) 아래 "filesystem"(Connected)과 "github", ~/.claude.json에 저장됨.](./assets/added.png)

이 그림의 "github"가 Failed인 것은 테스트 기기에 `GITHUB_PAT`이 없어서일 뿐입니다. 변수가 있으면 다른 서버처럼 연결됩니다.

## 무엇이 바뀌나

Claude Code는 Copilot 항목을 대부분 그대로 받지만, 일부는 **아무 말 없이 버립니다**(Claude Code 2.1.291로 확인). 그래서 먼저 바꿉니다.

| Copilot / VS Code 설정에서 | Claude Code에 추가되는 것 |
|---|---|
| `command`, `args`, `env`, `url`, `type`, `headers` | 그대로 |
| `requestInit.headers` | `headers`(양쪽에 같은 헤더가 있으면 직접 적은 쪽) |
| `type` 없음 | 명령이면 `stdio`, `/sse`로 끝나는 URL이면 `sse`, 그 밖의 URL이면 `http`(Claude Code는 `type` 없는 원격 서버를 거부합니다) |
| `${env:NAME}` | `${NAME}`. Claude Code가 같은 환경 변수를 읽는 방식 |
| 그 밖의 것(`dev`, `gallery`, 맨 위의 `inputs` 등) | 빠짐 |

## 무엇을 거절하고, 왜

Claude Code에 대응하는 것이 없는 설정도 있습니다. 동작하지 않을 서버를 추가하는 대신, 양식이 어느 서버의 무엇을 바꾸면 되는지 알려 줍니다.

![설정을 거절한 양식: Server "github" uses ${input:github_token}, which only VS Code fills in. Replace it with the value, or with ${NAME} to read an environment variable.](./assets/refused.png)

- **`${input:…}`**: 서버가 시작할 때 VS Code가 물어보는 값입니다. Claude Code에는 그런 질문이 없으니 값을 직접 넣거나, 환경 변수에 두고 `${NAME}`으로 쓰세요.
- **`${workspaceFolder}`, `${userHome}` 등 VS Code 변수**: Claude Code는 채워 주지 않습니다. 경로를 직접 쓰세요.
- **`envFile`**: Claude Code는 환경 파일을 읽지 않습니다. 변수를 `env` 아래에 넣으세요.

붙여넣은 서버를 모두 추가할 수 있을 때까지 아무것도 추가하지 않습니다.

## 자주 묻는 질문

**Copilot 설정은 어디 있나요?** VS Code에서는 프로젝트의 `.vscode/mcp.json` 또는 사용자 `mcp.json`(명령 팔레트 → "MCP: Open User Configuration")입니다. JetBrains용 GitHub Copilot에서는 Copilot 플러그인의 MCP 설정 화면이 같은 종류의 파일을 엽니다.

**Copilot 설정이 바뀌나요?** 아니요. 붙여넣은 내용을 읽기만 합니다.

**Claude 설정을 붙여넣어도 되나요?** 네. `"mcpServers"`가 있는 내용은 예전처럼 바꾸지 않고 그대로 추가합니다. 두 키가 다 있으면 `mcpServers`를 씁니다.
