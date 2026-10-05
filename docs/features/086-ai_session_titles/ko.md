# 세션마다 짧은 제목이 붙습니다

> 언어: [English](./en.md) · **한국어**

지금까지 세션은 첫 프롬프트 전체로 목록에 올라갔습니다. "hey so the signup page lets people register with an empty email and the error text…"처럼 줄이 끝나는 곳에서 잘린 채로요. 이런 줄이 열 개 모이면 다 비슷하게 시작하고, 그 안에서 무슨 일이 있었는지는 거의 알려 주지 않습니다.

이제 새 세션은 첫 응답이 끝나면 짧은 제목을 받습니다. Claude가 첫 메시지를 읽고, 쓴 언어 그대로 몇 단어로 세션 이름을 지어 줍니다.

![영어 인터페이스에서 첫 응답이 끝난 채팅 화면. 왼쪽 위 세션 드롭다운 토글 버튼에 첫 프롬프트 대신 "Signup email validation and mobile error pl…"이 보이고, 첫 프롬프트 "hey so the signup page lets people register with an empty email and the error text also shows up in the wrong place on mobile, where would you put the validation? answer in two sentences, do not touch any files"는 그 아래 대화의 첫 메시지로 남아 있습니다.](./assets/title-in-header.png)

![세션 드롭다운을 연 모습. "Today" 아래 가장 최근 줄은 "Signup email validation and mobile error placement"이고 오른쪽에 "now"가 있습니다. 이전 세션들은 여전히 첫 프롬프트로 불립니다. "Today"의 "Why does the login form reject valid passwords?", "Yesterday"의 "Write a release checklist for v2.0", "Favorites"의 별표 붙은 "Explain the database migration plan".](./assets/title-in-list.png)

CC GUI 플러그인이 세션 이름을 짓는 방식을 그대로 가져왔습니다.

## 언제 제목이 붙나

- **새 세션의 첫 응답이 끝난 뒤.** 응답이 끝나고 몇 초 뒤 제목이 도착해 상단바와 세션 드롭다운의 첫 프롬프트를 대신합니다. 아무것도 다시 불러올 필요가 없습니다.
- **한 번만.** 세션 이름은 한 번만 짓습니다. 이후 메시지는 제목을 바꾸지 않습니다.
- **새 세션만.** 이번 버전 이전에 시작한 세션이나, 목록에서 열어 이어 가는 세션은 지금 이름을 그대로 둡니다. 지난 기록의 이름을 거슬러 바꾸지 않습니다.
- **첫 응답이 성공했을 때만.** 첫 턴이 오류로 끝나면 기다렸다가 처음으로 성공한 응답 뒤에 이름을 짓습니다.
- **첫 메시지가 슬래시 명령이면 짓지 않습니다.** `/init`으로 시작한 세션은 "/init"으로 불리고, 그것으로 이미 무엇인지 드러납니다.
- **포크한 대화**는 같은 메시지로 시작하므로 원래 세션의 제목을 이어받습니다.

## 직접 고른 이름이 항상 이깁니다

생성된 제목은 누군가 고른 이름을 절대 덮지 않습니다.

| 이름 | 출처 | 순위 |
|------|------|------|
| 세션 드롭다운에서 바꾼 이름 | 이 앱 | 1 |
| `--name` | 세션 이름을 주고 `claude`를 시작 | 2 |
| `/rename` | CLI 명령(여기서든 터미널에서든) | 3 |
| Claude Code가 직접 지은 제목 | CLI가 자기가 돌린 일부 세션에 붙임 | 4 |
| **생성된 제목** | 이 기능 | 위와 같은 자리, 위의 것이 없을 때 사용 |
| 요약 | 긴 대화를 압축할 때 CLI가 씀 | 그다음 |
| 첫 프롬프트 | 직접 입력한 것 | 마지막 |

제목을 짓는 동안 세션 이름을 바꾸면, 바꾼 이름을 남기고 생성된 제목은 버립니다.

터미널의 `claude --resume`이 세션 이름을 정하는 순서와 같습니다. 목록은 이제 CLI가 직접 지은 제목(자기가 돌린 일부 세션에 쓰는 `ai-title` 항목)도 보여 줍니다. 이전에는 무시되고 첫 프롬프트가 대신 보였습니다.

## 끄기

**설정 → 일반 → AI session titles.** 기본으로 켜져 있습니다. 끄면 새 세션에 이름을 짓지 않고, 이미 지은 제목은 남습니다. 이 페이지의 다른 설정처럼 프로젝트 하나에만 따로 정할 수 있습니다.

![영어 인터페이스의 설정 → General. "AI session titles" 줄과 설명 "Name new sessions with a short title Claude writes after the first reply."가 있고 스위치가 켜져 있습니다.](./assets/setting.png)

## 동작 방식

프롬프트 다듬기와 커밋 메시지 작성처럼, 공식 CLI를 짧게 한 번 호출해 제목을 씁니다.

```
claude -p --model haiku --no-session-persistence --tools "" …
```

- **모델:** 작고 빠른 Haiku를 씁니다. 그래서 이름 짓기는 앞선 응답의 일부 비용밖에 들지 않습니다. 제공자가 Haiku를 다른 모델에 연결해 두었다면(`ANTHROPIC_DEFAULT_HAIKU_MODEL`) CLI와 마찬가지로 그 모델을 씁니다.
- **Claude가 읽는 것:** 첫 메시지의 앞 1,000자뿐입니다. 호출은 프로젝트 밖에서 실행되므로 프로젝트의 `CLAUDE.md`도 읽지 않습니다. 이름 짓기에는 필요 없고, 큰 `CLAUDE.md`라면 새 세션마다 그만큼 비용을 내게 되기 때문입니다.
- **계정:** 채팅과 같은 계정을 씁니다. `claude /login`으로 로그인한 경우도 됩니다. API 키는 필요 없습니다.
- 이름 짓기 호출은 **세션으로 기록되지 않습니다**(`--no-session-persistence`). 세션 목록에도 `claude --resume`에도 나오지 않습니다.

## 제목을 어디에 두나

사용자 데이터 폴더 안, 이 앱의 데이터 파일에 둡니다.

```
~/.claude-code-gui/entities/session/session_ai_titles.entity.jsonl
```

한 줄이 제목 하나입니다. 세션 id, 제목, 저장한 시각, 그 세션이 도는 프로젝트의 번호가 들어 있습니다. `CCG_HOME`을 설정했다면 폴더도 그쪽을 따릅니다. **트랜스크립트는 바뀌지 않습니다.** 제목은 세션의 `.jsonl` 파일에 쓰이지 않습니다. 그래서 여기서 생성한 제목은 이 앱에서는 보이지만 `claude --resume`에서는 보이지 않습니다. 어디서나 보이는 이름이 필요하면 `/rename`으로 지어 주세요. (세션 드롭다운에서 바꾼 이름은 이것과 따로, 세션 옆의 `.claude-code-gui-session-titles.json`에 있습니다.)

목록에서 세션을 지우면 그 제목도 지워집니다.

**이전 버전에서 생성한 제목은 그대로 남습니다.** 이전 빌드는 제목을 `~/.claude/projects/<project>/.claude-code-gui-ai-titles.json`에 두었습니다. 이 버전을 처음 실행할 때 제목을 위 파일로 옮기고, 옛 파일은 손대지 않고 남겨 둡니다. 옮기다가 읽지 못한 제목은 알리지 않고 건너뜁니다. 그 세션은 제목이 생기기 전처럼 첫 프롬프트로 보입니다.

## 한계

- **새 세션마다 사용량이 조금 듭니다.** 첫 메시지로 Haiku를 한 번 호출합니다. 쓰고 싶지 않다면 설정을 끄세요.
- **모델이 답해야 합니다.** 호출이 실패하면(네트워크 없음, 로그인 만료, Haiku가 없는 제공자) 세션은 첫 프롬프트를 이름으로 그대로 씁니다. 잃는 것이 없으므로 실패는 로그에만 남고 화면에는 알리지 않습니다.
- **제목은 첫 메시지만큼만 좋습니다.** "hi"로 시작한 세션은 인사에 관한 제목을 받습니다. 언제든 세션 드롭다운에서 이름을 바꾸세요.

## 자주 묻는 질문

**예전 세션은 여전히 첫 프롬프트로 보여요.** 지금부터 시작하는 세션만 이름을 짓습니다. 더 나은 이름을 원하면 세션 드롭다운에서 바꾸세요.

**제목 언어가 달라요.** 첫 메시지의 언어를 따릅니다. 다른 언어로 쓰고 싶다면 이름을 바꾸세요.

**터미널에서도 그 제목을 볼 수 있나요?** 이 기능으로는 안 됩니다. 트랜스크립트를 고치지 않기 때문입니다. 채팅에서 `/rename <이름>`을 쓰면 CLI도 읽는 이름이 붙습니다.

**`/rename`으로 이름 지은 세션에는 왜 제목이 생성되지 않았나요?** 이미 이름을 지으셨기 때문입니다. 직접 고른 이름은 절대 바뀌지 않습니다.
