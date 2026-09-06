---
name: zen-diagnostics
description: Zen Markdown 확장의 진단 로그를 일별·주별·월별로 분석해 결함을 거꾸로 추적하고, 확인된 결함을 계측에 반영해 갱신한다. "로그 분석해줘", "진단 확인", "문제 없나 봐줘", "모니터링 결과", "이상 신호" 같은 요청에 쓴다.
---

# Zen Markdown 진단 분석

이 저장소의 확장이 로컬에 쌓은 진단 로그를 읽어 문제를 거꾸로 추적한다.
계측 코드는 `src/diagnosticsLog.ts`, 집계 규칙은 `src/diagnosticsAggregate.ts`,
왕복 검증은 `webview/src/roundtripCheck.ts`가 담는다.

## 1. 분석 요청을 받으면

먼저 이것부터 실행한다. 로그는 사용자 컴퓨터에만 있고 네트워크로 나가지 않는다.

```bash
npm run compile                              # out/diagnosticsAggregate.js가 필요하다
node tools/Get-ZenDiagnostics.mjs            # 마크다운 보고서
node tools/Get-ZenDiagnostics.mjs --json     # 기계 판독용
node tools/Get-ZenDiagnostics.mjs --since 30 # 최근 30일만
```

`--dir <경로>`로 로그 위치를 직접 줄 수 있다. 기본 경로를 못 찾으면 스크립트가
확인한 후보를 출력하므로 그것을 사용자에게 그대로 보여준다.

**로그가 없다고 해서 문제가 없다는 뜻이 아니다.** 확장을 쓰지 않았거나
`zenMarkdown.diagnostics`가 꺼져 있을 수 있다. 둘을 구분해서 보고한다.

## 2. 무엇을 보는가

판정 순서는 이렇다. 위에서부터 걸리는 것이 있으면 거기서 멈추고 파고든다.

1. **`roundtrip_drift`가 0보다 큰가.** 이것이 가장 강한 신호다. 문서를 연 직후
   편집이 0인 상태에서 검증하므로 오탐이 없다. 건수가 있으면 그 부류의 마크다운이
   저장할 때 변형된다는 뜻이고, 사용자가 알아채기 전이다. 왕복 손실 종류 표에서
   어떤 부류인지 확인한다.
2. **`edit_failed`나 `flush_timeout`이 있는가.** 저장이 낡은 내용을 쓸 수 있는
   상태였다는 뜻이다. 데이터 유실과 직결된다.
3. **이상률이 주별·월별로 오르는가.** 절대 건수보다 추세가 중요하다. 사용량이
   늘면 이상 건수도 자연히 늘기 때문이다.
4. **새 이벤트 코드가 나타났는가.** 이전 분석에 없던 코드가 보이면 새 결함이거나
   계측을 더한 뒤 처음 잡힌 것이다.
5. **같은 문서 해시가 반복되는가.** 특정 문서의 내용이 원인이라는 뜻이다.
   해시는 되돌릴 수 없으므로 사용자에게 "이런 특징의 문서가 있는가"를 물어 좁힌다.

## 3. 왕복 손실 종류 읽는 법

`DriftKind`는 `webview/src/roundtripCheck.ts`가 정의한다. 종류마다 의심할 코드가 다르다.

| 종류 | 의미 | 먼저 볼 곳 |
|---|---|---|
| `fence_lang` | 코드펜스 언어 태그가 바뀜 | 직렬화 경로에 언어 정제가 다시 들어갔는지 (v0.6.0에서 제거한 결함) |
| `link_form` | 링크 표기가 바뀜 | `serializeWikilinks`의 표식 Set이 비었거나 새는지 |
| `blank_line` | 빈 줄 개수가 바뀜 | `preserveBlankLines`/`restoreBlankLines`의 표식 대칭 |
| `trailing_space` | 줄 끝 공백만 다름 | `preserveMarkdownLineBreaks`의 하드브레이크 처리 |
| `list_marker` | 목록 기호나 번호가 바뀜 | `normalizeOrderedListNumbers`, `normalizeUnorderedListBullets` |
| `heading` | 헤딩 표기가 바뀜 | BlockNote 파싱과 `blocksToMarkdownLossy` |
| `html` | HTML 태그나 주석이 바뀜 | `protectHtml`/`restoreHtml`의 ZWSP 보호 |
| `other` | 위 어디에도 안 들어감 | 재현부터 만든다 |

**파싱 체인과 직렬화 체인은 `webview/src/markdownPipeline.ts`에 나란히 있다.**
왕복 손실은 거의 언제나 두 체인의 대칭이 깨진 것이므로 이 파일을 먼저 연다.

## 4. 결함을 확인한 뒤

재현이 되면 이 순서로 처리한다.

1. **회귀 테스트부터 쓴다.** `webview/test-roundtrip.mts`(실제 BlockNote 왕복) 또는
   `webview/test-transforms.mts`(순수 함수)에 실패하는 케이스를 더한다.
   `webview/test-roundtripcheck.mts`는 검증 로직 자체를 본다.
2. 고친다. 파이프라인이면 두 체인의 대칭을 맞춘다.
3. `cd webview && npm test`로 전부 통과하는지 본다.
4. 확장과 웹뷰를 빌드해 에러 0건을 확인한다.

## 5. 계측을 갱신할 때

새 실패 지점을 잡고 싶으면 세 곳을 함께 고친다. 하나라도 빠지면 보고서에 안 나온다.

1. **기록**: 웹뷰는 `diag('이벤트명', { 수치 })`, 확장은 `this.log.record({ ev, doc })`.
2. **분류**: 이상 신호면 `src/diagnosticsAggregate.ts`의 `PROBLEM_EVENTS`에 더한다.
3. **문서**: `docs/MONITORING.md`의 이벤트 표에 더한다.

새 `DriftKind`를 더하려면 `webview/src/roundtripCheck.ts`의 `classify`와 위 3절 표를
함께 고친다.

## 6. 절대 어기지 않을 것

**문서 내용을 로그에 남기지 않는다.** 남기는 것은 이벤트 코드와 수치, 변경의 종류뿐이다.
파일 경로도 남기지 않고 `docHash`로 대체한다. 이 원칙이 깨지면 사용자의 원고가
로그로 새어 나간다. 계측을 더할 때마다 필드 하나하나가 이 규칙을 지키는지 확인한다.

로그는 로컬에만 쌓이고 어디로도 전송하지 않는다. 보존 기간은 90일이고 하루 상한은 2MB다.

## 7. 보고 형식

사용자에게는 이 순서로 낸다.

1. 이상 신호가 있는가 없는가를 첫 문장에서 말한다.
2. 있으면 어떤 부류이고 어느 코드를 의심하는지 짚는다.
3. 추세는 표로 낸다. 판단이 필요한 것만 넣고 전부 나열하지 않는다.
4. 다음에 할 행동 하나로 맺는다.

기록이 없으면 없다고 말한다. 없는 데이터로 추정하지 않는다.
