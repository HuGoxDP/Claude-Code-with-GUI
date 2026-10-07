# 세션 템플릿

> Language: [English](./en.md) · **한국어**

어떤 채팅은 한 모델에 Plan mode와 높은 effort로, 어떤 채팅은 편집을 허용하고 낮은 effort로 시작한다면, 템플릿이 그 세 가지를 매번 손으로 맞추는 수고를 덜어 줍니다. 채팅의 **모델, 모드, effort**를 이름을 붙여 저장해 두고, 한 번 골라서 그대로 새 채팅을 시작합니다. CC GUI 플러그인의 "Save as Template"와 "Create from Template"에서 가져왔습니다.

![템플릿 두 개가 각각 삭제 버튼과 함께 나열된 "New chat from template" 대화상자: "Deep review"(Sonnet · Plan mode · Extra high)와 "Quick fix"(Default · Edit automatically · Medium).](./assets/picker.png)

## 템플릿 저장하기

1. 새 채팅이 시작했으면 하는 대로 채팅을 맞춥니다. 모델은 모델 메뉴에서, 모드와 effort는 모드 메뉴에서 고릅니다.
2. `/`를 치고 Context 구역의 **Save as template...**을 고릅니다(`/template`로 찾을 수 있습니다).
3. 대화상자에 저장될 내용이 보입니다. 이름을 적고 **Save**나 Enter를 누릅니다.

!["Save as template" 대화상자. Model Sonnet, Mode Plan mode, Effort Extra high가 보이고, 이름 칸에 "Deep review"가 입력되어 있으며 Save 버튼이 있다.](./assets/save.png)

이미 쓴 이름을 적으면 그 템플릿을 바꿉니다. 저장하기 전에 대화상자가 그렇다고 알려 주고, 버튼이 **Replace**로 바뀝니다.

![같은 대화상자에 이미 있는 이름 "Plan review"를 적은 모습. 이름 아래에 "Replaces the template "Plan review"."가 뜨고 버튼이 Replace로 바뀌었다.](./assets/replace.png)

선택은 채팅이 들고 있는 그대로 저장됩니다. "Default"는 모델 메뉴의 **Default (recommended)**이고, 오늘 그것이 어떤 모델이든 그 모델이 아니라 기본값으로 남습니다. **Ultracode**를 켜 둔 상태라면 템플릿은 그것이 돌아가는 Extra high가 아니라 Ultracode를 기억합니다.

## 템플릿으로 채팅 시작하기

`/`를 치고 **New chat from template...**(역시 `/template`로 찾을 수 있습니다)을 고른 뒤 템플릿을 누릅니다.

- **이미 시작된 채팅에서는** 템플릿을 고르면 `/clear`처럼 같은 탭에서 새 채팅으로 넘어갑니다. [새 대화 전에 묻기](../099-ask_before_new_conversation/ko.md)가 켜져 있으면 먼저 묻고, 아니라고 하면 아무것도 바뀌지 않습니다.
- **새 채팅에서는** 선택만 맞춥니다. 떠날 대화가 없으니까요.

템플릿의 모델을 먼저 고르고, 그다음 모드와 effort를 고릅니다. 각각 입력창에서 직접 고르는 것과 똑같습니다. 그래서 모델과 effort는 내 Claude Code 설정(`~/.claude/settings.json`의 `model`과 `effortLevel`)이고, 손으로 고를 때와 똑같이 이 채팅 뒤의 채팅에도 남습니다. 모드는 이 채팅의 것입니다.

이 채팅이 제공하지 않는 모드는 억지로 켜지 않고 건너뜁니다. **Bypass permissions**로 저장한 템플릿도 바이패스를 쓸 수 없는 곳에서는 그것을 켜지 않습니다. 나머지는 그대로 적용됩니다.

## 템플릿 지우기

**New chat from template...**을 열고 템플릿 옆의 휴지통을 누릅니다. 지우기 전에 한 번 묻습니다. 둘러보거나 지우려고 대화상자를 연 것만으로는 아무것도 시작되지 않습니다. **Cancel**이나 Escape로 닫힙니다.

## 템플릿이 저장되는 곳

GUI 데이터 폴더(`~/.claude-code-gui`, 테이블 `session_templates`)에 다른 GUI 데이터와 함께 저장됩니다. 템플릿은 이 GUI의 프리셋이지 Claude Code의 것이 아니라서, CLI에는 이것을 다루는 명령이 없고 CLI가 보지도 않습니다. 템플릿은 모든 프로젝트에서 같습니다.

## CC GUI와 다른 점

- **작업 디렉토리와 프로바이더를 저장하지 않습니다.** CC GUI의 템플릿은 세션이 도는 폴더와 AI 프로바이더도 기억합니다. 여기의 채팅은 항상 연 프로젝트에서 돌고, 프로바이더는 Claude뿐입니다.
- **IDE 메뉴가 아니라 슬래시 패널에 있습니다.** CC GUI는 두 기능을 IDE 액션으로 제공하지만, 여기서는 슬래시 패널에 있어서 브라우저와 IDE에서 똑같이 동작합니다.
