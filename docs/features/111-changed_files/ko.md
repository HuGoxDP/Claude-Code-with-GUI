# 세션에서 Claude가 바꾼 파일을 한눈에 보고, 원하는 파일만 되돌리기

> Language: [English](./en.md) · **한국어**

긴 턴이 끝나면 Claude가 실제로 무엇을 건드렸는지 말하기 어려웠습니다. 편집은 채팅에 카드로 남아 있지만 대화 곳곳에 편집 하나당 카드 하나씩 흩어져 있었고, 되돌리려면 손으로 고치거나 대화 전체를 되감는 수밖에 없었습니다. **Changed files** 패널은 이 세션이 바꾼 파일을 모아, 파일마다 얼마나 바뀌었는지와 diff, 그리고 그 파일 하나만 Claude가 손대기 전으로 되돌리는 **Revert** 버튼을 보여 줍니다. CC GUI 플러그인의 상태 패널을 가져왔습니다.

## 여는 곳

![채팅 상단바의 ⋮ 메뉴: 배터리 49%의 Usage, Scheduled messages, Background tasks, Remote Tunnel (Unofficial), Settings, Assets, Open New Tab, 그리고 파란 배지 2가 붙은 Changed files.](./assets/menu.png)

**Changed files**는 채팅 오른쪽 위 ⋮ 메뉴에 있고, 파일 수를 배지로 보여 줍니다. 패널의 **Pin to dock**(또는 메뉴의 눈 아이콘)을 누르면 메뉴 옆에 아이콘이 나오며, 같은 수를 보여 주고 세션이 아무것도 바꾸지 않은 동안에는 숨습니다.

## 목록

![Changed files 패널에 파일 셋: src/lib의 clamp.ts는 A와 +3 −0, config.toml은 M과 +1 −1, src의 total.ts는 M과 +1 −2, 각각 되돌리기 화살표가 있고, 아래에 Keep all과 Revert all.](./assets/list.png)

한 줄이 파일 하나이고, 가장 최근에 바뀐 것이 위에 옵니다.

- **A**는 Claude가 만든 파일, **M**은 Claude가 바꾼 파일입니다.
- 이름(누르면 에디터에서 열림)과 그 아래 프로젝트 안의 폴더.
- **+N −M**: 세션에서 Claude가 처음 바꾸기 전의 파일과 지금 파일 사이에 더해지고 빠진 줄 수입니다. 어떤 방법으로든 원래대로 돌아간 파일은 목록에서 빠집니다.
- 오른쪽 화살표가 **Revert**입니다.

서브에이전트의 편집도 세션의 일부라 함께 셉니다.

## diff

![total.ts 줄을 펼친 모습: 3번째 줄이 "for (const item of itemz)"에서 "for (const item of items)"로 바뀌고, 6번째 줄 "const unused = 1;"이 지워진 diff.](./assets/diff.png)

줄 왼쪽의 화살표가 diff를 보여 줍니다. 한쪽은 Claude가 바꾸기 전의 파일, 다른 쪽은 지금 파일입니다. 매번 디스크에서 읽으므로 그 뒤에 바뀐 것도 들어 있습니다.

## 되돌리기

**Revert**는 먼저 묻고, 파일을 이 세션에서 Claude가 처음 바꾸기 전으로 되돌립니다. Claude가 만든 파일은 지워지며, 질문에도 그렇게 적힙니다. 열려 있는 에디터는 파일을 다시 읽습니다. **Escape**는 패널을 닫기만 하고 진행 중인 답변을 멈추지 않습니다.

![clamp.ts와 total.ts가 있는 Changed files 패널. total.ts 아래에 노란 글씨로 "Changed after Claude's last edit".](./assets/changed-since.png)

Claude의 마지막 편집 뒤에 파일이 또 바뀌었다면(직접 고쳤거나 다른 도구가 바꿨다면) 그 줄에 **Changed after Claude's last edit**가 뜨고, Revert가 한 번 더 묻습니다.

![제목이 "Changed after Claude's last edit"인 대화상자: "config.toml changed after Claude's last edit. Reverting also throws away those changes."와 Cancel, Revert anyway 버튼.](./assets/force.png)

**Revert anyway**는 그래도 되돌리고, **Cancel**은 그대로 둡니다.

**Revert all**은 한 번 물은 뒤 목록에서 되돌릴 수 있는 파일을 모두 되돌립니다. Claude의 마지막 편집 뒤에 바뀐 파일은 그대로 두고(몇 개인지 알려 줍니다), 그런 파일은 의도한 경우 하나씩 되돌리면 됩니다.

## Keep all

**Keep all**은 목록의 변경을 받아들입니다. 그 뒤로 패널은 Claude가 그다음에 바꾼 것만, 유지한 시점의 파일을 기준으로 보여 줍니다.

![Keep all 뒤의 패널: "Showing changes since you kept the earlier ones. Show all"과 "Nothing changed since you kept the earlier changes."](./assets/kept.png)

**Show all**을 누르면 세션의 모든 변경이 다시 보입니다. Keep all은 세션마다 이 브라우저(또는 이 IDE의 채팅)에 기억되며 서버에 저장되지 않습니다. 다른 브라우저에서는 전체 목록이 보입니다.

## 어디서 오는가

플러그인은 아무것도 따로 기록하지 않습니다. Claude Code가 성공한 Edit·MultiEdit·Write마다 직전의 파일(`originalFile`)과 쓴 내용을 세션 트랜스크립트에 남기고, 패널은 열 때와 턴이 끝날 때마다 그것과 디스크의 파일을 읽습니다. 그래서 목록은 언제나 지금의 트랜스크립트와 디스크 그대로입니다.

## 하지 않는 것

- **Edit·MultiEdit·Write만 다룹니다.** 셸 명령(`sed`, 포매터, `git checkout`)이나 NotebookEdit가 바꾼 파일은 트랜스크립트가 이전 내용을 말해 주지 않아 목록에 없습니다. 그런 경우는 Claude Code 자체 체크포인트를 쓰는 [되감기](../056-fork_and_rewind/ko.md)가 다룹니다.
- **실행 취소 기록이 아닙니다.** Revert는 편집 하나씩이 아니라 세션에서(또는 Keep all 뒤로) Claude가 처음 바꾸기 전으로 돌아갑니다. 대화의 특정 지점으로 돌아가려면 [되감기](../056-fork_and_rewind/ko.md)를 쓰세요.
- **2MB가 넘는 파일**은 목록에는 나오지만 여기서 비교하거나 되돌리지 않습니다.
- **이전 내용이 트랜스크립트에 없는 파일**(옛 Claude Code가 쓴 기록)은 "Earlier version not recorded"로 표시되고 여기서 되돌릴 수 없습니다.
- 포크나 되감기로 **떠난 가지**의 편집은 세지 않습니다. 지금 있는 대화만 봅니다.
- 터미널에는 이런 패널이 없습니다. 같은 트랜스크립트 위에 GUI가 더하는 기능입니다.
