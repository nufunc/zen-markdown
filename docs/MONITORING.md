# 모니터링

Zen Markdown은 편집 중에 일어난 일을 로컬 파일에 기록한다. 결함이 났을 때
거꾸로 추적하기 위한 것이고, 네트워크로 나가는 것은 없다.

## 무엇이 기록되는가

기록되는 것은 이벤트 코드와 수치, 그리고 변경의 **종류**뿐이다.
문서 내용은 어떤 경우에도 기록되지 않고, 파일 경로도 되돌릴 수 없는 해시로 바뀐다.

한 줄이 이렇게 생겼다.

```json
{"ts":"2026-09-06T09:12:03.114Z","ev":"roundtrip_drift","doc":"k3f9x1","removed":1,"added":1,"kinds":{"fence_lang":2},"lines":142}
```

`doc`은 파일 경로의 해시다. 같은 파일은 같은 값이 나오므로 "특정 문서에서만 나는
문제"를 추적할 수 있으면서 경로 자체는 남지 않는다.

## 어디에 쌓이는가

VS Code 전역 저장소 아래다.

| 플랫폼 | 경로 |
|---|---|
| Windows | `%APPDATA%\Code\User\globalStorage\nufunc.zen-markdown\diagnostics` |
| macOS | `~/Library/Application Support/Code/User/globalStorage/nufunc.zen-markdown/diagnostics` |
| Linux | `~/.config/Code/User/globalStorage/nufunc.zen-markdown/diagnostics` |

하루에 한 파일씩 `zen-YYYY-MM-DD.jsonl`로 쌓인다. 보존 기간은 **90일**이고
하루 상한은 **2MB**다. 상한을 넘으면 그날은 더 기록하지 않는다.

명령 팔레트의 **Zen Markdown: Open Diagnostics Log Folder**로 바로 열 수 있다.

## 어떻게 보는가

**에디터 안에서**: 명령 팔레트에서 **Zen Markdown: Show Diagnostics Report**를
실행하면 집계 보고서가 새 문서로 열린다.

**터미널에서**: 저장소에서 아래를 실행한다. `out/`이 필요하므로 컴파일이 선행돼야 한다.

```bash
npm run compile
node tools/Get-ZenDiagnostics.mjs                 # 마크다운 보고서
node tools/Get-ZenDiagnostics.mjs --json          # 기계 판독용
node tools/Get-ZenDiagnostics.mjs --since 30      # 최근 30일만
node tools/Get-ZenDiagnostics.mjs --dir <경로>    # 로그 위치 지정
```

보고서는 일별 30일, 주별 12주, 월별 12개월 추세와 이상 이벤트 순위, 왕복 손실 종류,
반복해서 문제가 나는 문서를 담는다.

## 끄는 방법

설정에서 `zenMarkdown.diagnostics`를 `false`로 두면 더 기록하지 않는다.
이미 쌓인 파일은 위 폴더에서 지우면 된다.

## 이벤트

이상 신호로 분류되는 것은 `src/diagnosticsAggregate.ts`의 `PROBLEM_EVENTS`가 정한다.
새 이벤트를 계측하면 그 집합과 이 표를 함께 갱신한다.

| 이벤트 | 이상 | 뜻 |
|---|:---:|---|
| `open` | | 문서를 열었다. 바이트 수와 줄 수를 함께 남긴다 |
| `external_update` | | 외부에서 파일이 바뀌어 웹뷰에 알렸다 |
| `roundtrip_drift` | O | 문서를 연 직후 검증에서 왕복 손실을 찾았다. **가장 강한 신호다** |
| `roundtrip_check_failed` | O | 왕복 검증 자체가 실패했다 |
| `edit_failed` | O | 문서에 편집을 적용하지 못했다 |
| `flush_timeout` | O | 저장 직전 웹뷰가 1초 안에 응답하지 않았다. 낡은 내용이 저장될 수 있다 |
| `serialize_failed` | O | 에디터 내용을 마크다운으로 만들지 못했다 |
| `autofix_failed` | O | 포커스를 잃을 때의 자동 포맷이 실패했다 |
| `mode_toggle_serialize_failed` | O | 모드 전환 중 직렬화가 실패했다 |
| `block_type_apply_failed` | O | 블록 타입 변경이 실패했다 |
| `table_paste_failed` | O | 표 붙여넣기 변환이 실패했다 |
| `search_plugin_register_failed` | O | 검색 플러그인 등록이 실패했다 |
| `search_highlight_failed` | O | 검색 하이라이트 갱신이 실패했다 |
| `copy_markdown_failed` | O | 마크다운 복사가 실패했다 |

## 왕복 자가검증

`roundtrip_drift`가 다른 이벤트와 다른 이유는 **오탐이 없다**는 데 있다.

문서를 연 직후, 사용자가 아직 아무것도 편집하지 않은 상태에서 파싱 결과를 다시
직렬화해 원문과 견준다. 이 시점의 차이는 전부 왕복 변환 손실이다. 사용자 편집이
섞이지 않으므로 "사용자가 바꾼 것"과 헷갈릴 여지가 없다.

v0.6.0에서 고친 결함 두 개가 정확히 이 부류였다.

- ` ```mermaid ` 펜스가 저장할 때 ` ```text `로 바뀌던 것 → `fence_lang`
- `[README](README.md)`가 `[[README]]`로 바뀌던 것 → `link_form`

같은 부류가 다시 생기면 사용자가 알아채기 전에 로그에 남는다.

변경의 종류는 `webview/src/roundtripCheck.ts`의 `DriftKind`가 정의한다.
종류별로 어느 코드를 의심할지는 `.claude/skills/zen-diagnostics/SKILL.md` 3절에 있다.
