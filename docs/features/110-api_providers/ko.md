# Claude Code의 API 프로바이더를 바꿔 가며 쓰기

> Language: [English](./en.md) · **한국어**

Claude 로그인이 아닌 다른 길로 Claude에 닿는 사람들이 있습니다. 회사 게이트웨이, 로그를 남기는 프록시, 다른 계정으로 청구되는 API 키 같은 것들입니다. Claude Code는 `~/.claude/settings.json`의 `env` 블록에 문서화된 변수 몇 개를 두는 것으로 이 모두를 지원합니다. 주소는 `ANTHROPIC_BASE_URL`, 키는 `ANTHROPIC_AUTH_TOKEN`이나 `ANTHROPIC_API_KEY`, 모델은 `ANTHROPIC_MODEL`과 `ANTHROPIC_DEFAULT_*_MODEL` 슬롯입니다. 그런데 둘 사이를 오가려면 매번 그 변수들을 손으로 고쳐야 했고, 로그인으로 돌아가려면 다시 지워야 했습니다.

**설정 → Model → API providers**가 각각을 이름 붙은 프로바이더로 보관합니다. **Use**는 그 변수들을 손으로 적듯이 파일에 쓰고, **Claude login**은 다시 걷어냅니다. CC GUI 플러그인의 API 프로바이더 관리자를 가져왔습니다.

## 목록

![다크 모드의 API providers 섹션. 맨 위에 "Claude login"과 "Your Claude account, the way claude signs in. None of the provider variables are set." 문구, Use 버튼. 그 아래 "Company gateway"가 테두리로 강조되고 "In use" 표시가 있으며, 주소 https://llm-gateway.example.com/anthropic, "claude-via-gateway · Sonnet → gateway-medium · Haiku → gateway-small" 줄, "Key in ANTHROPIC_AUTH_TOKEN", 연필·휴지통 버튼. 이어서 "Claude's own address"와 "Key in ANTHROPIC_API_KEY"를 보이는 "Personal API key"와 Use 버튼. 맨 아래 "Add provider" 버튼.](./assets/list.png)

- **Claude login**은 항상 맨 위에 있습니다. 프로바이더 변수가 하나도 설정되지 않은 상태, 즉 claude가 처음 설치했을 때처럼 Claude 계정으로 로그인하는 상태입니다.
- 프로바이더마다 주소(없으면 **Claude's own address**), 설정하는 모델, 키가 들어가는 변수(없으면 **No key**)를 보여 줍니다. 키 자체는 보이지 않습니다.
- 지금 설정과 일치하는 것은 테두리가 쳐지고 **In use**라고 적힙니다. 나머지에는 **Use**가 있습니다.
- 연필은 프로바이더를 고치고, 휴지통은 확인을 거쳐 지웁니다.

사용하면 "Now using …. New sessions start with it."이 뜹니다.

## 프로바이더 추가

![채워진 프로바이더 양식: Name "Company gateway", Address(ANTHROPIC_BASE_URL) https://llm-gateway.example.com/anthropic, 변수 선택기가 ANTHROPIC_AUTH_TOKEN이고 키가 점으로 가려진 Key, Model(ANTHROPIC_MODEL) claude-via-gateway, 빈 Opus slot, Sonnet slot gateway-medium, Haiku slot gateway-small, 빈 Fable slot, Cancel과 Save 버튼.](./assets/form.png)

**Add provider**가 양식을 엽니다. 칸마다 채우는 변수 이름이 붙어 있습니다.

| 칸 | 변수 | 비고 |
|---|---|---|
| **Name** | (없음) | 알아보기 위한 이름. 80자까지, 이름 하나에 프로바이더 하나. |
| **Address** | `ANTHROPIC_BASE_URL` | `http://`나 `https://` URL. Claude 자체 주소에 키만 쓸 때는 비워 둡니다. |
| **Key** | `ANTHROPIC_AUTH_TOKEN` 또는 `ANTHROPIC_API_KEY` | 왼쪽에서 변수를 고릅니다. 게이트웨이는 보통 `ANTHROPIC_AUTH_TOKEN`(bearer 토큰으로 보냄)을 원하고, Claude Console에서 받은 키는 `ANTHROPIC_API_KEY`에 넣습니다. |
| **Model** | `ANTHROPIC_MODEL` | Claude Code가 시작할 때 쓰는 모델. |
| **Opus / Sonnet / Haiku / Fable slot** | `ANTHROPIC_DEFAULT_OPUS_MODEL`, `…_SONNET_…`, `…_HAIKU_…`, `…_FABLE_…` | 모델 선택기의 각 항목이 보내는 모델. 선택기에 어떻게 보이는지는 [직접 연결한 모델](../021-custom_model_catalog_display/ko.md)에 있습니다. |

필수는 이름뿐입니다. 빈 칸은 아무것도 설정하지 않습니다.

**프로바이더를 고칠 때**도 같은 양식이 열립니다. 키 칸에는 "Saved; type to replace it"이라고 적혀 있습니다. 비워 두면 저장된 키를 유지하고, 입력하면 바꾸며, **Remove the saved key**를 체크하면 지웁니다. 사용 중인 프로바이더라면 저장하는 즉시 새 값이 설정에 쓰입니다.

거절(이미 있는 이름, URL이 아닌 주소)은 양식 아래에 보이고 아무것도 저장되지 않습니다.

## Use가 쓰는 것

**Use**는 프로바이더의 변수를 사용자 설정의 `env` 블록에 쓰고, **그 프로바이더가 설정하지 않는 프로바이더 변수는 지웁니다**. 그래서 게이트웨이에서 평범한 API 키로 바꾸면 게이트웨이의 주소와 모델도 함께 빠집니다. 남겨 두면 키가 엉뚱한 곳을 향하게 되기 때문입니다.

**Claude login**은 프로바이더 변수 여덟 개를 모두 지웁니다.

`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_FABLE_MODEL`

그 밖의 것은 건드리지 않습니다. 다른 변수(프록시, 시간 제한)와 다른 설정은 그대로입니다. 쓰는 규칙은 [환경 변수 편집기](../109-env_vars/ko.md)와 같습니다. 이미 `settings.local.json`에 있는 변수는 거기서 바뀌고, 읽을 수 없는 파일은 덮어쓰지 않고 오류로 남깁니다. CLI가 읽는 바로 그 파일이므로 터미널의 `claude`도 같은 프로바이더를 씁니다.

## "사용 중"은 어떻게 정하나

어떤 프로바이더를 골랐는지 기억해 두는 곳은 없습니다. 섹션은 매번 설정을 읽어 여덟 변수를 각 프로바이더의 것과 비교합니다. 그래서 터미널, 환경 변수 편집기, 텍스트 편집기에서 고친 것도 있는 그대로 보입니다.

- 여덟 개 중 아무것도 없음: **Claude login**이 사용 중입니다.
- 한 프로바이더와 정확히 일치: 그 프로바이더가 사용 중입니다.
- 어느 것과도 일치하지 않음: 아무것도 강조되지 않고 "The ANTHROPIC_* variables in your user settings match none of these. Using one replaces them."이 뜹니다.

## 키를 보관하는 곳

프로바이더는 플러그인의 엔티티 파일(`~/.claude-code-gui/entities/provider/`)에 **키 없이** 저장됩니다. 그 파일은 늘어나기만 해서, 키를 거기 쓰면 바꾸거나 지운 뒤에도 남아 있게 됩니다. 그래서 키는 `~/.claude-code-gui/api-provider-keys.json`에 따로 두고, 매번 통째로 다시 쓰며, 본인만 읽을 수 있게 둡니다(저장된 계정 자격증명과 같은 600 권한. Windows에서는 사용자 폴더의 권한을 따릅니다). 프로바이더를 지우면 그 키도 지워집니다. 키는 설정 화면에 전달되지 않고, 화면은 키가 있는지만 압니다.

**프로바이더를 사용하면 그 키가 `settings.json`에 평문으로 들어갑니다.** Claude Code가 거기서 읽기 때문이며, 손으로 설정할 때와 같습니다. 환경 변수 편집기는 점으로 가리지만, 파일 자체는 홈 폴더만큼만 비공개입니다. Claude login으로 돌아가면 지워집니다.

## 언제 적용되나

Claude Code는 시작할 때 변수를 읽습니다. 새 세션은 첫 메시지부터 새 프로바이더를 쓰고, 이미 돌고 있는 채팅은 다시 시작할 때까지 시작할 때의 것을 씁니다.

## 하지 않는 것

- **User Settings 전용입니다.** 프로바이더는 모든 프로젝트가 읽는 `~/.claude/settings.json`에 쓰입니다. Project Settings 탭에서는 섹션이 흐리게 보이고 "Providers live in User Settings, which every project reads."라고 적힙니다. 프로젝트 자체 설정에 이 변수 중 하나가 있으면 터미널에서와 마찬가지로 프로젝트가 이깁니다.
- **사용 중인 프로바이더를 지워도 설정은 바뀌지 않습니다.** 변수는 그대로 남고, 섹션은 어느 프로바이더와도 일치하지 않는다고 알립니다. 바꾸려면 **Claude login**이나 다른 프로바이더를 사용하세요.
- **주소와 키를 확인하지 않습니다.** 잘못된 값은 다음 메시지에서 오류로 드러납니다. 인증 오류라면 채팅이 어느 자격증명이 쓰였는지 알려 줍니다([어느 자격증명이 실패했는지](../068-know_which_credential_failed/ko.md)).
- **가격은 없습니다.** CC GUI는 비용 계산용으로 사용자 모델과 가격도 보관하는데, 그 부분은 아직 가져오지 않았습니다.
- **셸에서 export한 변수는 바꾸지 않습니다.** 터미널과 마찬가지로 `settings.json`의 변수가 셸의 같은 변수를 이기므로, 프로바이더 사용은 그래도 적용됩니다.
