# 새 대화로 넘어가기 전에 묻기

> Language: [English](./en.md) · **한국어**

`/clear`, **Cmd/Ctrl+Shift+C**, 명령 패널의 **Clear conversation**은 터미널의 `/clear`처럼 같은 탭에서 바로 새 대화를 시작합니다. 단축키를 실수로, 또는 답변 도중에 누른 적이 있다면 **Ask before a new conversation**을 켜세요. 채팅이 먼저 묻습니다. CC GUI 플러그인의 새 세션 확인에서 가져왔습니다.

![설정 → 일반의 Composer 섹션에서 "Ask before a new conversation"이 켜져 있습니다: "Confirm before /clear or Cmd/Ctrl+Shift+C leaves a conversation that has started."](./assets/setting.png)

## 어디에 있나

**설정 → 일반 → Composer → Ask before a new conversation**입니다. 켜지 않으면 꺼져 있으므로, 건드리지 않는 사람에게는 아무것도 바뀌지 않습니다.

## 무엇을 묻나

![대화 위에 뜬 질문: "Start a new conversation?", "This conversation stays in your session list.", 버튼 Cancel과 New conversation.](./assets/dialog.png)

- **New conversation**을 누르면 전처럼 새 대화가 시작됩니다.
- **Cancel**, Esc, 바깥 클릭은 있던 자리에 그대로 둡니다. 쓰던 글도 그대로입니다.
- Claude가 아직 답하고 있으면, 새 대화를 시작하면 답변이 멈춘다는 말이 덧붙습니다. Cancel을 누르면 답변이 끝까지 이어집니다.

어느 쪽이든 떠나는 대화는 지워지지 않습니다. 세션 목록에 남아 있고 거기서 다시 열 수 있습니다.

## 묻지 않을 때

- **비어 있는 새 채팅**: 두고 갈 것이 없으므로 바로 새 대화가 시작됩니다.
- **새 탭 버튼**은 다른 탭을 열고 이 탭은 그대로 두므로 묻지 않습니다.
- **세션 목록에서 다른 세션을 여는 것**은 새 대화로 넘어가는 것이 아니므로 묻지 않습니다.

## 자주 묻는 질문

**왜 기본으로 꺼져 있나요?** Claude Code의 `/clear`는 묻지 않고, 채팅은 직접 고르지 않는 한 CLI를 따릅니다. (CC GUI는 기본으로 묻습니다. 선택지는 같고 시작점만 다릅니다.)

**프로젝트마다 정할 수 있나요?** 네. 다른 설정처럼 설정의 **Project** 탭에서 정합니다.
