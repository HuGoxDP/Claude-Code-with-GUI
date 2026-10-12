# Claude가 일하는 동안 작업 목록 보기

> Language: [English](./en.md) · **한국어**

요청이 여러 단계로 이뤄지면 Claude Code는 작업 목록을 씁니다. 단계를 적어 두고, 지금 하는 것을 표시하고, 끝날 때마다 체크합니다. 터미널은 이 목록을 프롬프트 아래에 보여 줍니다. 채팅에서는 대화 곳곳에 흩어진 TaskCreate·TaskUpdate 카드뿐이라, "어디까지 했지?"를 알려면 스크롤하며 세어야 했습니다. **Task list** 패널은 지금 이 순간의 목록을 보여 줍니다. 무엇이 끝났고, Claude가 무엇을 하고 있고, 무엇이 남았는지. CC GUI 플러그인 상태 패널의 Tasks 탭을 가져왔습니다.

## 여는 곳

![채팅 상단바의 ⋮ 메뉴: Usage, Scheduled messages, Background tasks, Remote Tunnel (Unofficial), Settings, Assets, Open New Tab, Changed files, 그리고 맨 아래에 오른쪽에 "4/4 done"이 붙은 Task list.](./assets/menu.png)

**Task list**는 채팅 오른쪽 위 ⋮ 메뉴에 있고, 전체 중 몇 개가 끝났는지 보여 줍니다.

![채팅 상단바: ⋮ 메뉴와 계정 아이콘 옆에 파란 클립보드 아이콘과 "1/4".](./assets/dock.png)

패널의 **Pin to dock**(또는 메뉴의 눈 아이콘)을 누르면 메뉴 옆에 아이콘이 나옵니다. 같은 수를 보여 주고, Claude가 목록의 작업을 하는 동안 파랗게 되며, 세션에 목록이 없으면 숨습니다.

## 목록

![Task list 패널, "1/4 done"에 진행 막대가 4분의 1 찬 모습. #1 Read config.toml은 체크되고 취소선. #2 List the keys in config.toml은 강조되어 파란 회전 링과 그 아래 "Listing config.toml keys". #3 Read src/total.ts와 #4 Summarize both files는 빈 링과 설명, #4에는 "Waiting on #2, #3"도 있다. 아래에 "Claude Code's task list for this session, as Claude last updated it."](./assets/running.png)

작업은 Claude가 만든 순서대로, 번호와 함께 나옵니다.

- **초록 체크**는 끝난 작업이고 취소선이 그어집니다.
- **파란 링**은 Claude가 지금 하는 작업입니다. 답변이 진행 중이면 돌고, 그 아래에 Claude가 하는 일("Listing config.toml keys")이 나옵니다.
- **빈 링**은 아직 시작하지 않은 작업입니다. Claude가 설명을 붙였다면 아래에 나옵니다.
- **Waiting on #2, #3**은 그 작업들이 끝나야 시작할 수 있는데 아직 안 끝났다는 뜻입니다. 끝난 작업은 이 줄에서 빠집니다.
- 여러 에이전트가 목록을 함께 쓸 때는 작업을 맡은 에이전트 이름이 아래에 나옵니다.

제목 아래 막대는 작업이 끝날수록 찹니다.

![같은 패널이 "4/4 done"이 되어 초록 막대가 꽉 차고 네 작업 모두 체크·취소선인 모습.](./assets/done.png)

패널은 열 때, Claude의 작업 도구가 결과를 돌려줄 때마다, 답변이 끝날 때 목록을 다시 읽으므로 Claude가 일하는 대로 따라갑니다. **Escape**는 패널을 닫기만 하고 답변을 멈추지 않습니다.

## 목록이 없을 때

![Task list 패널에 "Claude has no task list in this session."과 그 아래 "Claude makes one when a request takes several steps, and updates it as it works."](./assets/empty.png)

Claude는 모든 요청에 목록을 만들지 않고, 일이 여러 단계일 때만 만듭니다. 목록이 없는 세션은 이렇게 보이고, 도크 아이콘은 숨어 있습니다.

## 어디서 오는가

플러그인은 아무것도 따로 저장하지 않습니다. 패널은 Claude Code가 목록을 두는 곳에서 그대로 읽습니다.

- **Claude Code의 작업 목록.** 지금의 Claude Code는 작업 하나를 파일 하나로 `~/.claude/tasks/<세션 ID>/`에 저장합니다(`CLAUDE_CONFIG_DIR`을 정했다면 그 폴더 아래). 환경이나 [Claude의 환경 변수](../109-env_vars/ko.md)에 `CLAUDE_CODE_TASK_LIST_ID`가 있으면 Claude Code는 그 공유 목록을 쓰고, 패널도 따라갑니다. 터미널이 보여 주는 것과 같은 목록입니다. Claude Code가 끝난 목록을 비우면 패널도 비어 보입니다.
- **TodoWrite.** 옛 Claude Code와 작업 목록을 끈 Claude Code는 목록을 대화 안에 남겼습니다. TodoWrite를 부를 때마다 목록 전체가 들어 있으므로 패널은 마지막 것을 보여 줍니다. 이 목록에는 번호가 없습니다.

![TodoWrite 목록의 패널, "2/3 done": Read config.toml과 Read src/total.ts는 체크, Summarize both files는 파란 링과 그 아래 "Summarizing both files". 아래에 "Claude's last to-do list in this conversation (TodoWrite)."](./assets/todowrite.png)

패널 맨 아래 줄이 지금 어느 쪽을 보고 있는지 알려 줍니다.

## 하지 않는 것

- **읽기 전용입니다.** 목록은 Claude가 쓰고 패널은 보여 줍니다. 작업을 더하거나 바꾸거나 빼려면 Claude에게 말하세요.
- **진행 중으로 남은 작업은 진행 중으로 보입니다.** Claude가 작업하던 중에 답변이 끝나면(또는 멈추면) 그 작업은 더 돌지 않는 링과 함께 진행 중으로 보입니다. Claude가 마지막으로 쓴 것이 그렇기 때문이고, 끝났으리라 짐작하지 않습니다.
- **Claude Code가 작업 도구를 줄 때만 목록이 생깁니다.** 주는지는 Claude Code 버전과 모델에 달렸습니다. 우리가 확인한 버전(Claude Code 2.1.296)에서는 가장 새로운 모델들이 Claude의 환경에 `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`이 없으면 이 도구를 받지 못했습니다([설정 → 일반 → Environment variables](../109-env_vars/ko.md)에서 넣을 수 있습니다). Claude Code 자체의 선택이라 터미널에서도 같습니다. Claude에게 작업 도구가 없으면 보여 줄 목록도 없습니다.
- **에이전트 팀.** 에이전트들이 팀으로 일하면 Claude Code는 목록을 팀 이름 아래에 둡니다. 패널은 아직 그쪽을 따라가지 않고 세션 자신의 목록을 보여 줍니다.
- 서브에이전트가 목록을 바꾸면 답변이 끝날 때 패널이 따라잡습니다. 서브에이전트의 도구 호출은 채팅에 없기 때문입니다.
