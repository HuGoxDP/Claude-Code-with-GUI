# 커밋 메시지는 Claude에게

> 언어: [English](./en.md) · **한국어**

방금 끝낸 변경에 좋은 커밋 메시지를 쓰는 일은 번거롭고, 긴 하루 끝에는 "fix stuff"가 되기 쉽습니다. 이제 Claude가 변경을 읽고 메시지를 대신 씁니다. JetBrains IDE에서는 커밋 창의 버튼으로, 어디서든(standalone 모드의 브라우저 포함) 명령 팔레트로 쓸 수 있습니다. Claude는 쓰기만 하고, 커밋은 여전히 직접 합니다.

## JetBrains IDE: 커밋 창에서

1. 평소처럼 커밋 도구 창(또는 커밋 대화상자)을 열고 커밋할 변경에 체크합니다.
2. 커밋 메시지 칸의 도구 모음에서 **Generate Commit Message with Claude**(Claude Code 아이콘)를 누릅니다.
3. Claude가 쓰는 동안 칸에는 "Writing a commit message with Claude…"가 보이고, 끝나면 메시지로 바뀝니다.
4. 읽어 보고 원하는 대로 고친 뒤 평소처럼 커밋합니다.

Claude가 설명하는 것은 체크한 것 그대로입니다. 커밋에 포함된 파일, 이름이 바뀐 파일의 양쪽 경로, 체크한 버전 관리 밖 파일입니다. 칸에 이미 몇 단어를 써 두었다면 초안으로 함께 보내고, Claude는 그 내용을 살려 메시지를 씁니다.

실패하면 초안을 칸에 되돌려 놓고 알림으로 이유를 알려 줍니다(메시지는 CLI가 낸 그대로입니다. 예: "Not logged in · Please run /login"). IDE 버전에 따라 칸의 글을 읽을 수 없으면 쓰는 동안에도 칸을 건드리지 않으므로, 실패해도 써 둔 글은 사라지지 않습니다.

Claude가 쓰는 도중에 버튼을 다시 누르면 처음부터 다시 쓰며, 가장 최근 답만 칸에 들어갑니다.

## 어디서든: 명령 팔레트

standalone 모드에는 커밋 창이 없으므로, 같은 기능을 명령 팔레트에 두었습니다.

1. 입력창에 `/commit`을 치고(또는 `/` 버튼으로 팔레트를 열고) **Write a commit message...**를 고릅니다.
2. 대화상자가 지금 채팅의 프로젝트에 대한 메시지를 씁니다.
3. 원하면 고친 뒤 **Copy**(또는 **Cmd/Ctrl+Enter**)로 클립보드에 복사합니다. **Write again**은 새로 씁니다.

![영어 인터페이스에서 입력창 위에 열린 명령 팔레트. 입력창에는 "/commit"이 있고, "Context" 아래 강조된 행에 "commit"이 굵게 표시된 "Write a commit message..."가 있습니다. 그 아래 "Slash Commands"에는 "/verify"가 있습니다.](./assets/commit-palette.png)

![작업 중인 "Commit message" 대화상자. "Reading your changes and writing a message…"가 보이고, 아래에 "Cancel"과 꺼진 "Copy"가 있습니다.](./assets/commit-loading.png)

![답이 도착한 "Commit message" 대화상자. 제목 아래에 "For all uncommitted changes (nothing is staged), untracked files included."가 있고, 편집할 수 있는 칸에 "fix: compare passwords in constant time", 빈 줄, src/auth.ts와 src/auth.test.ts에 대한 글머리표 두 개가 있습니다. 아래에 "Write again", "Close", "Copy"가 있습니다.](./assets/commit-ready.png)

팔레트가 설명하는 범위는 지금 `git commit`이 커밋할 범위와 같습니다.

- **스테이징한 것이 있으면** 스테이징한 변경만입니다("For the staged changes, as git commit would commit them.").
- **스테이징한 것이 없으면** 커밋하지 않은 모든 변경이며, 추적하지 않는 파일도 포함합니다("For all uncommitted changes (nothing is staged), untracked files included.").

대화상자는 커밋하거나 스테이징하거나 무엇을 바꾸지 않습니다. 커밋은 늘 하던 대로 터미널, Git 클라이언트, 또는 채팅에서 Claude에게 부탁해서 하세요.

## 어떤 메시지가 나오나

- 명령형 제목 한 줄("Fixed"가 아니라 "Fix"), 최대 72자.
- 변경이 여러 부분이면 빈 줄 다음에 무엇을 왜 바꿨는지 주요 파일을 짚는 짧은 글머리표.
- **저장소의 스타일.** 최근 커밋 제목 10개를 보여 주고 그 언어, 접두사(`feat:`, `fix(api):`), 대소문자, 어조를 따르게 합니다. 한국어 제목을 쓰는 저장소는 한국어로, Conventional Commits를 쓰는 저장소는 그 형식으로 씁니다. 아직 커밋이 없으면 평범한 영어 제목입니다.
- **프로젝트의 규칙.** 다른 모든 `claude` 명령처럼 프로젝트의 `CLAUDE.md`를 읽습니다. 커밋 메시지 규칙("제목은 한국어로", "티켓 번호를 꼭 넣을 것")이 있으면 위의 모든 것보다 그 규칙을 따릅니다.
- "Generated with"나 "Co-Authored-By" 줄은 붙이지 않습니다.

## Claude가 보는 것

- 설명할 변경의 diff(마지막 커밋 대비)와 바뀐 모든 파일의 짧은 요약(`git diff --stat`).
- 추적하지 않는 새 파일의 내용, 파일마다 최대 4,000자. 바이너리 파일은 내용 없이 이름만 보냅니다.
- 최근 커밋 제목 10개.

큰 변경은 보내기 전에 약 60,000자로 줄입니다. 파일마다 몫을 나누므로 커다란 락파일 하나가 나머지를 밀어내지 않고, 요약에는 모든 파일이 그대로 남습니다. 채팅 내용은 보지 않고, 도구가 없어 아무것도 실행할 수 없습니다.

## 저장소가 여러 개인 프로젝트

IntelliJ 프로젝트에는 Git 저장소가 여러 개 있을 수 있습니다(한 커밋 창에 VCS 루트가 여럿 나옵니다). 버튼은 체크한 파일을 저장소별로 나눠 함께 설명하고, 각 부분 앞에 저장소 이름을 붙입니다. 스타일은 커밋에 가장 많은 파일이 들어간 저장소의 것을 따릅니다. 파일을 체크할 창이 없는 팔레트는 채팅의 프로젝트 폴더가 속한 저장소를 씁니다.

## 어떻게 동작하나

diff는 `git`이 직접 만들고, 메시지는 `claude -p` 호출 한 번이 씁니다. 터미널 사용자가 `git diff`를 `claude -p`에 파이프로 넘기는 것과 같습니다. [프롬프트 다듬기](../083-prompt_enhancer/ko.md)처럼 질문 하나와 답 하나이며, 도구·MCP 서버·스킬·훅이 없고 세션 목록에도 남지 않습니다. 이 프로젝트의 Claude 로그인과 입력창에 표시된 모델을 씁니다(IDE 버튼은 기본 모델을 씁니다). IDE 버튼과 팔레트는 같은 백엔드 코드로 이어지므로 같은 종류의 메시지를 씁니다.

## 한계

- Git만 지원합니다.
- 2분이 지나면 포기합니다. 네트워크가 끊겨 있으면 CLI가 그때까지 재시도합니다.
- IDE에서 파일이 너무 많아 경로가 요청 하나에 들어가지 않는 커밋(경로만 수만 자)은 팔레트와 같은 방식으로 설명합니다. 스테이징한 변경, 없으면 전부입니다.

## 자주 묻는 질문

**"There is nothing to commit in this project."가 나와요.** 팔레트가 스테이징한 변경도, 커밋하지 않은 변경도 찾지 못했습니다. IDE에서 같은 문구가 나오면 체크한 파일 중 마지막 커밋과 다른 것이 없다는 뜻입니다.

**"This project is not a Git repository."가 나와요.** 프로젝트 폴더(IDE에서는 체크한 파일)가 Git 저장소 안에 있지 않습니다.

**"Co-Authored-By" 줄이 붙어요.** 붙이지 말라고 지시하므로 원래는 붙지 않습니다. 계속 그렇다면 프로젝트의 `CLAUDE.md`가 그 줄을 요구하는지 확인해 보세요. 그 파일이 우선합니다.

**엉뚱한 언어로 썼어요.** 최근 커밋 제목의 언어를 따릅니다. 커밋이 아직 없으면 영어로 씁니다. `CLAUDE.md`에 원하는 것을 적어 두면("Write commit messages in Korean.") 그대로 따릅니다.

**비용이 드나요?** 모델에 보내는 요청 하나이며, 다른 메시지처럼 계정 사용량에 들어갑니다. diff가 크면 요청도 커지므로 줄여서 보냅니다.

**커밋까지 해 주나요?** 아니요. 메시지를 쓰고 멈춥니다. 커밋까지 맡기려면 채팅에서 Claude에게 부탁하세요.
